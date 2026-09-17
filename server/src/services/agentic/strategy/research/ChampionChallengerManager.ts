/**
 * ═══════════════════════════════════════════════════════════════════
 *  CHAMPION / CHALLENGER STRATEGY EVALUATION FRAMEWORK
 * ═══════════════════════════════════════════════════════════════════
 *  Objectively pits challenger strategies against production champions
 *  under identical market regimes and statutory cost assumptions.
 */

import { IChampionChallengerDuel, IBacktestMetrics } from "../types.js";
import { AutonomousStrategyRegistry, IStrategyRecord } from "../registry/AutonomousStrategyRegistry.js";

export class ChampionChallengerManager {
  /**
   * Evaluates whether a Challenger is statistically superior to the incumbent Champion.
   */
  public static evaluateDuel(
    champion: { id: string; version: string; metrics: IBacktestMetrics },
    challenger: { id: string; version: string; metrics: IBacktestMetrics; name: string }
  ): IChampionChallengerDuel {
    const reasons: string[] = [];

    const deltaSharpe = Number((challenger.metrics.sharpeRatio - champion.metrics.sharpeRatio).toFixed(2));
    const deltaDrawdown = Number((challenger.metrics.maxDrawdownPct - champion.metrics.maxDrawdownPct).toFixed(2));
    const deltaProfitFactor = Number((challenger.metrics.profitFactor - champion.metrics.profitFactor).toFixed(2));

    if (challenger.metrics.totalTrades < 25) {
      reasons.push(
        `INSUFFICIENT_SAMPLE: Challenger has only ${challenger.metrics.totalTrades} trades (minimum 25 required).`
      );
    }

    if (deltaSharpe < 0.10) {
      reasons.push(`SHARPE_IMPROVEMENT_INSUFFICIENT: ΔSharpe=${deltaSharpe} < +0.10 required.`);
    }

    if (deltaProfitFactor < 0.10) {
      reasons.push(`PF_IMPROVEMENT_INSUFFICIENT: ΔPF=${deltaProfitFactor} < +0.10 required.`);
    }

    if (challenger.metrics.maxDrawdownPct > champion.metrics.maxDrawdownPct) {
      reasons.push(
        `DRAWDOWN_REGRESSION: Challenger MaxDD (${challenger.metrics.maxDrawdownPct}%) is worse than Champion (${champion.metrics.maxDrawdownPct}%).`
      );
    }

    const eligible = reasons.length === 0;

    return {
      strategyName: challenger.name,
      championId: champion.id,
      championVersion: champion.version,
      challengerId: challenger.id,
      challengerVersion: challenger.version,
      championSharpe: champion.metrics.sharpeRatio,
      challengerSharpe: challenger.metrics.sharpeRatio,
      championDrawdownPct: champion.metrics.maxDrawdownPct,
      challengerDrawdownPct: challenger.metrics.maxDrawdownPct,
      deltaSharpe,
      deltaDrawdown,
      evaluatedTrades: challenger.metrics.totalTrades,
      isEligibleForPromotion: eligible,
      rejectionReasons: reasons,
    };
  }

  /**
   * Promotes the Challenger to active Champion if duel evaluation succeeds.
   */
  public static async promoteChallenger(
    championId: string,
    challengerId: string
  ): Promise<{ success: boolean; duel: IChampionChallengerDuel }> {
    const registry = AutonomousStrategyRegistry.getInstance();
    const champ = registry.getStrategy(championId);
    const chal = registry.getStrategy(challengerId);

    if (!champ || !chal || !champ.metrics || !chal.metrics) {
      throw new Error("Champion or Challenger strategy record or metrics missing in registry.");
    }

    const duel = this.evaluateDuel(
      { id: champ.strategyId, version: champ.version, metrics: champ.metrics },
      { id: chal.strategyId, version: chal.version, metrics: chal.metrics, name: chal.name }
    );

    if (!duel.isEligibleForPromotion) {
      return { success: false, duel };
    }

    // Demote Champion to RETIRED or PAUSED
    await registry.updateStatus(champ.strategyId, "RETIRED", 70);

    // Promote Challenger to LIVE
    await registry.updateStatus(chal.strategyId, "LIVE", 95);

    return { success: true, duel };
  }
}
