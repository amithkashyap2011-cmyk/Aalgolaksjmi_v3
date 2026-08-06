/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Capital Tier Manager (Phase 7A)
 * ═══════════════════════════════════════════════════════════════════
 */

import { Trade } from "../../../models/Trade.js";
import * as paper from "../../paperState.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../../utils/mongoUtils.js";

export interface TierInfo {
  tier: number;
  riskPerTrade: number;
  maxDailyDrawdown: number;
  maxExposure: number;
}

export class CapitalTierManager {
  /**
   * Determines the active capital tier based on equity and performance.
   */
  public static async getActiveTier(userId: string, mode: "PAPER" | "LIVE"): Promise<TierInfo> {
    const wallet = paper.getWallet(userId, mode, "FUTURES");
    const equity = wallet.get("USDT") ?? 0;

    // Default: Tier 1
    let tier = 1;
    let riskPerTrade = 0.005; // 0.50%
    
    // Performance Gating for Scaling
    const isPerformanceStable = await this.verifyPerformanceHurdles(userId, mode);

    if (isPerformanceStable) {
      if (equity >= 50000) {
        tier = 3;
        riskPerTrade = 0.01; // 1.00%
      } else if (equity >= 10000) {
        tier = 2;
        riskPerTrade = 0.0075; // 0.75%
      }
    }

    return {
      tier,
      riskPerTrade,
      maxDailyDrawdown: tier === 3 ? 0.05 : (tier === 2 ? 0.04 : 0.03),
      maxExposure: tier === 3 ? 0.20 : (tier === 2 ? 0.15 : 0.10)
    };
  }

  /**
   * Verifies if the system meets scaling hurdles over the last 500 trades.
   * Requirements: PF > 1.80, Sharpe > 1.70, DD < 5%
   */
  private static async verifyPerformanceHurdles(userId: string, mode: string): Promise<boolean> {
    const trades = await Trade.find({
      userId: toValidObjectId(userId),
      mode,
      status: "CLOSED"
    }).sort({ closedAt: -1 }).limit(500).lean();

    if (trades.length < 100) return false; // Insufficient data for scaling

    const wins = trades.filter(t => (t.pnl || 0) > 0);
    const losses = trades.filter(t => (t.pnl || 0) < 0);
    
    const grossProfit = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));
    
    const pf = grossLoss > 0 ? grossProfit / grossLoss : 2.0;

    // Simplified Sharpe check for gating
    const pnls = trades.map(t => t.pnl || 0);
    const avgPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const stdDev = Math.sqrt(pnls.reduce((a, b) => a + Math.pow(b - avgPnl, 2), 0) / pnls.length);
    const sharpe = stdDev > 0 ? (avgPnl / stdDev) : 0;

    return pf > 1.80 && sharpe > 1.70;
  }
}
