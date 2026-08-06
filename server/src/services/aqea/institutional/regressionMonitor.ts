/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Performance Regression Monitor (Phase 7A)
 * ═══════════════════════════════════════════════════════════════════
 */

import { Trade } from "../../../models/Trade.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../../utils/mongoUtils.js";

export interface RegressionAlert {
  type: "PF_DROP" | "SHARPE_DROP" | "DD_SPIKE";
  severity: "WARNING" | "CRITICAL";
  message: string;
}

export class RegressionMonitor {
  /**
   * Compares the last 500 trades against the previous 500 trades.
   */
  public static async analyzeRegression(userId: string, mode: string): Promise<RegressionAlert[]> {
    const objId = toValidObjectId(userId);
    
    // 1. Fetch Data
    const last500 = await Trade.find({ userId: objId, mode, status: "CLOSED" }).sort({ closedAt: -1 }).limit(500).lean();
    const prev500 = await Trade.find({ userId: objId, mode, status: "CLOSED" }).sort({ closedAt: -1 }).skip(500).limit(500).lean();

    if (last500.length < 200 || prev500.length < 200) return [];

    const alerts: RegressionAlert[] = [];

    // 2. PF Comparison
    const lastPF = this.calculatePF(last500);
    const prevPF = this.calculatePF(prev500);
    const pfDrop = (prevPF - lastPF) / (prevPF || 1);

    if (pfDrop > 0.15) {
      alerts.push({
        type: "PF_DROP",
        severity: pfDrop > 0.25 ? "CRITICAL" : "WARNING",
        message: `Profit Factor regression detected: -${(pfDrop * 100).toFixed(1)}%`
      });
    }

    // 3. Drawdown Comparison
    const lastDD = this.calculateMaxDD(last500);
    const prevDD = this.calculateMaxDD(prev500);
    const ddIncrease = (lastDD - prevDD) / (prevDD || 1);

    if (ddIncrease > 0.25) {
      alerts.push({
        type: "DD_SPIKE",
        severity: ddIncrease > 0.50 ? "CRITICAL" : "WARNING",
        message: `Drawdown intensity increasing: +${(ddIncrease * 100).toFixed(1)}%`
      });
    }

    return alerts;
  }

  private static calculatePF(trades: any[]): number {
    const wins = trades.filter(t => (t.pnl || 0) > 0).reduce((a, b) => a + b.pnl, 0);
    const losses = Math.abs(trades.filter(t => (t.pnl || 0) < 0).reduce((a, b) => a + b.pnl, 0));
    return losses > 0 ? wins / losses : wins > 0 ? 9.99 : 0;
  }

  private static calculateMaxDD(trades: any[]): number {
    let peak = 0;
    let maxDD = 0;
    let balance = 10000; // Mock base
    for (const t of trades) {
      balance += (t.pnl || 0);
      if (balance > peak) peak = balance;
      const dd = (peak - balance) / peak;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }
}
