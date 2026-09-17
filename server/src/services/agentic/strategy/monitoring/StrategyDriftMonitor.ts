/**
 * ═══════════════════════════════════════════════════════════════════
 *  LIVE STRATEGY MONITORING & DRIFT DETECTION ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Continuously compares live execution telemetry against expected
 *  backtest/shadow distributions.
 *  Triggers automatic safety pauses upon statistical degradation.
 */

import { IStrategyDriftMetrics } from "../types.js";
import { AutonomousStrategyRegistry } from "../registry/AutonomousStrategyRegistry.js";

export interface ILiveExecutionMetrics {
  totalTrades: number;
  winningTrades: number;
  actualDrawdownPct: number;
  averageSlippageBps: number;
  averageLatencyMs: number;
}

export class StrategyDriftMonitor {
  /**
   * Evaluates live execution performance against expected backtest baseline.
   */
  public static evaluateDrift(
    strategyId: string,
    version: string,
    expectedWinRate: number,
    expectedMaxDrawdownPct: number,
    liveMetrics: ILiveExecutionMetrics
  ): IStrategyDriftMetrics {
    const reasons: string[] = [];
    const actualWinRate =
      liveMetrics.totalTrades > 0
        ? Number(((liveMetrics.winningTrades / liveMetrics.totalTrades) * 100).toFixed(1))
        : expectedWinRate;

    // 1. Calculate Binomial Win-Rate Z-Score if enough trades
    let winRateZScore = 0;
    if (liveMetrics.totalTrades >= 10) {
      const p = expectedWinRate / 100;
      const n = liveMetrics.totalTrades;
      const expectedWins = n * p;
      const stdDev = Math.sqrt(n * p * (1 - p));
      if (stdDev > 0) {
        winRateZScore = Number(((liveMetrics.winningTrades - expectedWins) / stdDev).toFixed(2));
      }
    }

    // 2. Classify status based on statistical bounds
    let status: "NORMAL" | "WARNING" | "DEGRADED" | "CRITICAL" = "NORMAL";
    let recommendation: "CONTINUE" | "ALERT" | "PAUSE_NEW_ENTRIES" | "RETIRE" = "CONTINUE";

    // Drawdown breach
    if (liveMetrics.actualDrawdownPct > expectedMaxDrawdownPct * 1.5) {
      status = "CRITICAL";
      recommendation = "PAUSE_NEW_ENTRIES";
      reasons.push(
        `DRAWDOWN_LIMIT_BREACH: Live drawdown of ${liveMetrics.actualDrawdownPct}% exceeds 1.5x expected threshold (${expectedMaxDrawdownPct}%).`
      );
    } else if (liveMetrics.actualDrawdownPct > expectedMaxDrawdownPct) {
      status = "DEGRADED";
      recommendation = "PAUSE_NEW_ENTRIES";
      reasons.push(
        `DRAWDOWN_WARNING: Live drawdown of ${liveMetrics.actualDrawdownPct}% has breached expected baseline (${expectedMaxDrawdownPct}%).`
      );
    }

    // Win rate degradation (Z-score < -2.0 means p < 0.025)
    if (winRateZScore < -2.0) {
      if (status !== "CRITICAL") status = "DEGRADED";
      recommendation = "PAUSE_NEW_ENTRIES";
      reasons.push(
        `STATISTICAL_WINRATE_COLLAPSE: Win rate Z-Score is ${winRateZScore} (actual ${actualWinRate}% vs expected ${expectedWinRate}%).`
      );
    } else if (winRateZScore < -1.5) {
      if (status === "NORMAL") status = "WARNING";
      reasons.push(`WINRATE_DECAY_WARNING: Win rate is trailing expected distribution (Z=${winRateZScore}).`);
    }

    // Slippage drift
    const slippageDriftBps = liveMetrics.averageSlippageBps;
    if (slippageDriftBps > 8.0) {
      if (status === "NORMAL") status = "WARNING";
      reasons.push(`HIGH_SLIPPAGE_DRIFT: Average slippage is ${slippageDriftBps} bps (expected <= 3.0 bps).`);
    }

    const latencyDriftMs = liveMetrics.averageLatencyMs;

    return {
      strategyId,
      version,
      status,
      expectedWinRate,
      actualWinRate,
      expectedDrawdownPct: expectedMaxDrawdownPct,
      actualDrawdownPct: liveMetrics.actualDrawdownPct,
      slippageDriftBps,
      winRateZScore,
      latencyDriftMs,
      recommendation,
      reasons,
    };
  }

  /**
   * Evaluates drift and triggers an automatic safety pause if status is DEGRADED or CRITICAL.
   */
  public static async checkAndApplySafetyAction(
    strategyId: string,
    version: string,
    expectedWinRate: number,
    expectedMaxDrawdownPct: number,
    liveMetrics: ILiveExecutionMetrics
  ): Promise<IStrategyDriftMetrics> {
    const drift = this.evaluateDrift(strategyId, version, expectedWinRate, expectedMaxDrawdownPct, liveMetrics);

    if (drift.status === "DEGRADED" || drift.status === "CRITICAL") {
      const registry = AutonomousStrategyRegistry.getInstance();
      const strat = registry.getStrategy(strategyId);
      if (strat && (strat.status === "LIVE" || strat.status === "LIVE_STAGE_1" || strat.status === "LIVE_STAGE_2")) {
        console.warn(
          `[STRATEGY_DRIFT_MONITOR] ⚠️ AUTO-PAUSING strategy ${strategyId} due to ${drift.status} drift: ${drift.reasons.join(
            " | "
          )}`
        );
        await registry.updateStatus(strategyId, "PAUSED", 35);
      }
    }

    return drift;
  }
}
