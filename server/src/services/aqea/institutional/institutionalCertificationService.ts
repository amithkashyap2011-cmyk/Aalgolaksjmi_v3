/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Institutional Certification Engine (V10.4)
 * ═══════════════════════════════════════════════════════════════════
 */

import { Trade } from "../../../models/Trade.js";
import { AqeaTradeAnalytics } from "../../../models/AqeaTradeAnalytics.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../../utils/mongoUtils.js";

export interface CertificationReport {
  userId: string;
  timestamp: Date;
  status: "PASS" | "REMAIN_PAPER";
  metrics: {
    tradeCount: number;
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
    expectancy: number;
  };
  regimePerformance: {
    bullPF: number;
    bearPF: number;
    sidewaysPF: number;
  };
  reasons: string[];
}

export class InstitutionalCertificationService {
  /**
   * Evaluates if a user's AQEA instance is ready for LIVE trading.
   */
  public static async runCertification(userId: string): Promise<CertificationReport> {
    const trades = await Trade.find({ 
      userId: toValidObjectId(userId),
      mode: "PAPER",
      status: "CLOSED",
      strategy: /AQEA/
    }).lean();

    const reasons: string[] = [];
    const metrics = this.calculateMetrics(trades);
    const regimePerf = await this.calculateRegimePerformance(userId);

    // Certification Rules
    if (metrics.tradeCount < 100) reasons.push(`Insufficient trades: ${metrics.tradeCount}/100`);
    if (metrics.profitFactor < 1.30) reasons.push(`Profit Factor below threshold: ${metrics.profitFactor.toFixed(2)} < 1.30`);
    if (metrics.winRate < 52) reasons.push(`Win Rate below threshold: ${metrics.winRate.toFixed(1)}% < 52%`);
    if (metrics.maxDrawdown > 10) reasons.push(`Drawdown exceeds limit: ${metrics.maxDrawdown.toFixed(1)}% > 10%`);

    const status = reasons.length === 0 ? "PASS" : "REMAIN_PAPER";

    return {
      userId,
      timestamp: new Date(),
      status,
      metrics,
      regimePerformance: regimePerf,
      reasons
    };
  }

  private static calculateMetrics(trades: any[]) {
    if (trades.length === 0) {
      return { tradeCount: 0, winRate: 0, profitFactor: 0, maxDrawdown: 0, expectancy: 0 };
    }

    const wins = trades.filter(t => (t.pnl || 0) > 0);
    const losses = trades.filter(t => (t.pnl || 0) < 0);
    
    const winRate = (wins.length / trades.length) * 100;
    
    const grossProfit = wins.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((acc, t) => acc + (t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0);

    // Expectancy = (Win% * AvgWin) - (Loss% * AvgLoss)
    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const expectancy = (winRate / 100 * avgWin) - ((1 - winRate / 100) * avgLoss);

    return {
      tradeCount: trades.length,
      winRate,
      profitFactor,
      maxDrawdown: 0, // Simplified for now
      expectancy
    };
  }

  private static async calculateRegimePerformance(userId: string) {
    const fetchPF = async (regimeMatch: RegExp) => {
        const trades = await Trade.find({
            userId: toValidObjectId(userId),
            mode: "PAPER",
            status: "CLOSED",
            "meta.regime": regimeMatch
        }).lean();
        
        const wins = trades.filter(t => (t.pnl || 0) > 0).reduce((s, t) => s + (t.pnl || 0), 0);
        const losses = Math.abs(trades.filter(t => (t.pnl || 0) < 0).reduce((s, t) => s + (t.pnl || 0), 0));
        return losses > 0 ? wins / losses : (wins > 0 ? 99 : 0);
    };

    return {
      bullPF: await fetchPF(/BULL/),
      bearPF: await fetchPF(/BEAR/),
      sidewaysPF: await fetchPF(/RANGING|SIDEWAYS/)
    };
  }
}
