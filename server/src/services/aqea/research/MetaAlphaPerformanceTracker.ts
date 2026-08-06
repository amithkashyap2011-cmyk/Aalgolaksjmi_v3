/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.4G — Meta Alpha Performance Tracker
 * ═══════════════════════════════════════════════════════════════════
 */

import { ResearchMetaAlphaAudit } from "../../../models/ResearchMetaAlphaAudit.js";

export class MetaAlphaPerformanceTracker {
  /**
   * Links a finished trade outcome to the shadow ensemble decision.
   * This is called by the TradeCompletion service.
   */
  public static async recordOutcome(symbol: string, outcome: "WIN" | "LOSS" | "BREAKEVEN", pnl: number): Promise<void> {
    try {
      // Find the most recent shadow decision for this symbol (within last hour)
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const shadowDecision = await ResearchMetaAlphaAudit.findOne({
        symbol,
        timestamp: { $gte: fiveMinsAgo },
        actualOutcome: { $exists: false }
      }).sort({ timestamp: -1 });

      if (shadowDecision) {
        shadowDecision.actualOutcome = outcome;
        shadowDecision.pnlImpact = pnl;
        
        // Determine if the ensemble was correct
        // (Ensemble decision matches market direction)
        const isCorrect = (shadowDecision.prediction === "LONG" && outcome === "WIN") ||
                          (shadowDecision.prediction === "SHORT" && outcome === "WIN") ||
                          (shadowDecision.prediction === "HOLD" && outcome === "BREAKEVEN");
        
        if (!shadowDecision.meta) shadowDecision.meta = {};
        shadowDecision.meta.isCorrect = isCorrect;
        
        await shadowDecision.save();
        console.log(`[META_ALPHA_TRACKER] Recorded outcome for ${symbol}: ${outcome} (PnL: ${pnl})`);
      }
    } catch (err) {
      console.error("[META_ALPHA_TRACKER_ERROR]", err);
    }
  }

  /**
   * Phase 2: Daily Research Metrics Engine
   */
  public static async computeMetrics(days: number = 30): Promise<any> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const records = await ResearchMetaAlphaAudit.find({
      timestamp: { $gte: startDate },
      actualOutcome: { $exists: true }
    }).lean();

    if (records.length === 0) return null;

    const trades = records.filter(r => r.prediction !== "HOLD");
    const wins = trades.filter(r => r.actualOutcome === "WIN").length;
    const losses = trades.filter(r => r.actualOutcome === "LOSS").length;
    
    const winRate = wins / (trades.length || 1);
    const totalGains = trades.filter(r => (r.pnlImpact || 0) > 0).reduce((sum, r) => sum + (r.pnlImpact || 0), 0);
    const totalLosses = Math.abs(trades.filter(r => (r.pnlImpact || 0) < 0).reduce((sum, r) => sum + (r.pnlImpact || 0), 0));
    
    const profitFactor = totalLosses > 0 ? totalGains / totalLosses : totalGains;

    return {
      window: `${days} days`,
      totalDecisions: records.length,
      activeTrades: trades.length,
      winRate,
      profitFactor,
      pnl: totalGains - totalLosses,
      avgLatency: records.reduce((sum, r) => sum + r.latencyMs, 0) / records.length
    };
  }
}
