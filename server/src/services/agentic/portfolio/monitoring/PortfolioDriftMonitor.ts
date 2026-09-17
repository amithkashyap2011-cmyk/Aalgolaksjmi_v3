/**
 * ═══════════════════════════════════════════════════════════════════
 *  PORTFOLIO DRIFT & REBALANCING MONITOR
 * ═══════════════════════════════════════════════════════════════════
 *  Tracks deviation between Target Allocation vs Actual Allocation.
 *  Triggers rebalancing proposals when drift threshold is breached,
 *  enforcing hysteresis and cooldown periods to prevent over-trading.
 */

import { IStrategyAllocation, IPortfolioProposal } from "../types.js";
import { roundTo2 } from "../capital/AuthoritativeCapitalManager.js";

export interface IPortfolioDriftReport {
  overallDriftPct: number;
  strategyDrifts: Array<{
    strategyId: string;
    strategyName: string;
    targetWeightPct: number;
    actualWeightPct: number;
    driftPct: number;
    isBreached: boolean;
  }>;
  rebalanceRequired: boolean;
  cooldownActive: boolean;
  rebalanceProposal?: IPortfolioProposal;
  warnings: string[];
}

export class PortfolioDriftMonitor {
  private static readonly REBALANCE_DRIFT_THRESHOLD_PCT = 15.0; // Trigger rebalance if drift > 15%
  private static readonly REBALANCE_COOLDOWN_MS = 15 * 60 * 1000; // 15-minute cooldown
  private static lastRebalanceTimestamp: number = 0;

  /**
   * Evaluates allocation drift across active strategies.
   */
  public static evaluateDrift(allocations: IStrategyAllocation[]): IPortfolioDriftReport {
    const warnings: string[] = [];
    const strategyDrifts: Array<{
      strategyId: string;
      strategyName: string;
      targetWeightPct: number;
      actualWeightPct: number;
      driftPct: number;
      isBreached: boolean;
    }> = [];

    let sumAbsDrift = 0;
    let anyBreached = false;

    for (const alloc of allocations) {
      const drift = roundTo2(alloc.actualWeightPct - alloc.targetWeightPct);
      const absDrift = Math.abs(drift);
      sumAbsDrift += absDrift;

      const isBreached = absDrift >= this.REBALANCE_DRIFT_THRESHOLD_PCT;
      if (isBreached) {
        anyBreached = true;
        warnings.push(
          `ALLOCATION_DRIFT_BREACH: Strategy ${alloc.strategyName} actual (${alloc.actualWeightPct}%) deviates from target (${alloc.targetWeightPct}%) by ${absDrift}%.`
        );
      }

      strategyDrifts.push({
        strategyId: alloc.strategyId,
        strategyName: alloc.strategyName,
        targetWeightPct: alloc.targetWeightPct,
        actualWeightPct: alloc.actualWeightPct,
        driftPct: drift,
        isBreached,
      });
    }

    const overallDriftPct = allocations.length > 0 ? roundTo2(sumAbsDrift / allocations.length) : 0;
    const now = Date.now();
    const cooldownActive = now - this.lastRebalanceTimestamp < this.REBALANCE_COOLDOWN_MS;

    let rebalanceRequired = anyBreached && !cooldownActive;
    let rebalanceProposal: IPortfolioProposal | undefined;

    if (rebalanceRequired) {
      rebalanceProposal = {
        proposalId: "PROP_REBAL_" + now,
        action: "REBALANCE",
        reason: `Allocation drift of ${overallDriftPct}% exceeds ${this.REBALANCE_DRIFT_THRESHOLD_PCT}% threshold.`,
        urgency: overallDriftPct > 25.0 ? "HIGH" : "NORMAL",
        confidence: 0.92,
        agentId: "PORTFOLIO_AGENT",
        timestamp: new Date().toISOString(),
      };
    } else if (anyBreached && cooldownActive) {
      warnings.push(`REBALANCE_COOLDOWN: Drift threshold breached but rebalance is cooling down.`);
    }

    return {
      overallDriftPct,
      strategyDrifts,
      rebalanceRequired,
      cooldownActive,
      rebalanceProposal,
      warnings,
    };
  }

  /**
   * Records a completed rebalance event, initiating cooldown.
   */
  public static markRebalanceExecuted(): void {
    this.lastRebalanceTimestamp = Date.now();
  }

  /**
   * Resets monitor state.
   */
  public static reset(): void {
    this.lastRebalanceTimestamp = 0;
  }
}
