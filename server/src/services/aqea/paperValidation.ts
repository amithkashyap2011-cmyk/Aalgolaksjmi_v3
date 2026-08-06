/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Paper Validation Service (V8.1)
 * ═══════════════════════════════════════════════════════════════════
 */

import { Trade } from "../../models/Trade.js";
import { toValidObjectId } from "../../utils/mongoUtils.js";

export interface PaperMetrics {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  predictionDistribution: Record<string, number>;
  status: "FAIL" | "READY";
  reasons: string[];
}

export class PaperValidationService {
  /**
   * Promotes models to live if they pass strict institutional gates.
   */
  public static async getValidationSummary(userId: string): Promise<PaperMetrics> {
    const trades = await Trade.find({ userId: toValidObjectId(userId), mode: "PAPER", status: "CLOSED" }).lean();
    
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        predictionDistribution: { LONG: 0, SHORT: 0, HOLD: 0 },
        status: "FAIL",
        reasons: ["No paper trades found"]
      };
    }

    const wins = trades.filter(t => (t.pnl || 0) > 0);
    const losses = trades.filter(t => (t.pnl || 0) < 0);
    
    const winRate = (wins.length / trades.length) * 100;
    
    const grossProfit = wins.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((acc, t) => acc + (t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0);

    // Crude Sharpe Approximation
    const returns = trades.map(t => (t.pnl || 0));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / (returns.length || 1));
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(365) : 0;

    // Distribution
    const dist: Record<string, number> = { LONG: 0, SHORT: 0, HOLD: 0 };
    trades.forEach(t => {
      const signal = t.side === "BUY" ? "LONG" : (t.side === "SELL" ? "SHORT" : "HOLD");
      if (dist[signal] !== undefined) dist[signal]++;
    });

    const reasons: string[] = [];
    if (trades.length < 100) reasons.push(`Insufficient trade count: ${trades.length}/100`);
    if (winRate < 52) reasons.push(`Win Rate below threshold: ${winRate.toFixed(1)}% < 52%`);
    if (profitFactor < 1.3) reasons.push(`Profit Factor below threshold: ${profitFactor.toFixed(2)} < 1.3`);

    return {
      totalTrades: trades.length,
      winRate,
      profitFactor,
      sharpeRatio: sharpe,
      maxDrawdown: 0, // Requires time-series equity tracking
      predictionDistribution: dist,
      status: reasons.length === 0 ? "READY" : "FAIL",
      reasons
    };
  }
}
