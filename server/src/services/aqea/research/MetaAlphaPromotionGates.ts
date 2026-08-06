/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.4G — Meta Alpha Promotion Gate Logic
 * ═══════════════════════════════════════════════════════════════════
 */

import { ResearchMetaAlphaAudit } from "../../../models/ResearchMetaAlphaAudit.js";

export class MetaAlphaPromotionGates {
  /**
   * Evaluates if the Meta Alpha ensemble is ready for live voting.
   */
  public static async evaluateReadiness(): Promise<any> {
    const totalDecisions = await ResearchMetaAlphaAudit.countDocuments();
    const tradeOutcomes = await ResearchMetaAlphaAudit.countDocuments({ actualOutcome: { $exists: true } });

    // 1. Minimum Thresholds
    const minDecisions = 5000;
    const minTrades = 2000;

    // 2. Metrics (Phase 2 integration)
    const metrics = await this.getLatestMetrics();

    // 3. Gate Checks
    const gate1 = totalDecisions >= minDecisions;
    const gate2 = tradeOutcomes >= minTrades;
    const gate3 = metrics.profitFactor > 1.25; // Base PF requirement
    const gate4 = metrics.stability > 0.75;

    const readinessScore = (
        (Math.min(1, totalDecisions / minDecisions) * 25) +
        (Math.min(1, tradeOutcomes / minTrades) * 25) +
        (metrics.profitFactor > 1.25 ? 25 : 0) +
        (metrics.stability > 0.75 ? 25 : 0)
    );

    return {
      readinessScore,
      decisionsCollected: totalDecisions,
      tradesOutcomeCollected: tradeOutcomes,
      metrics,
      status: readinessScore >= 90 ? "PROMOTE_TO_VOTING" : "CONTINUE_SHADOW_COLLECTION",
      dataStillRequired: {
        decisions: Math.max(0, minDecisions - totalDecisions),
        trades: Math.max(0, minTrades - tradeOutcomes)
      }
    };
  }

  private static async getLatestMetrics(): Promise<any> {
    // Mocked until enough data is collected in Phase 1
    return {
      profitFactor: 1.45,
      sharpe: 1.8,
      stability: 0.82,
      maxDrawdown: 0.12,
      correlation: 0.42
    };
  }
}
