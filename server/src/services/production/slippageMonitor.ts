/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Real Slippage Engine
 * ═══════════════════════════════════════════════════════════════════
 */

import { AqeaProductionAudit } from "../../models/AqeaProductionAudit.js";

export interface SlippageRecord {
  symbol: string;
  expectedPrice: number;
  actualPrice: number;
  quantity: number;
  timestamp: Date;
}

export class SlippageMonitor {
  private static slippageHistory: Map<string, number[]> = new Map();

  /**
   * Tracks and records real-money execution slippage.
   */
  public static async recordSlippage(record: SlippageRecord): Promise<void> {
    const slippagePct = (Math.abs(record.actualPrice - record.expectedPrice) / record.expectedPrice) * 100;
    
    // Store in-memory for rolling averages
    const history = this.slippageHistory.get(record.symbol) || [];
    history.push(slippagePct);
    if (history.length > 100) history.shift();
    this.slippageHistory.set(record.symbol, history);

    // Institutional Audit
    await AqeaProductionAudit.create({
      level: slippagePct > 0.5 ? "WARNING" : "INFO",
      event: "EXECUTION_SLIPPAGE",
      symbol: record.symbol,
      message: `Executed @ ${record.actualPrice} (Expected: ${record.expectedPrice}). Slippage: ${slippagePct.toFixed(4)}%`,
      data: { ...record, slippagePct }
    });

    if (slippagePct > 1.0) {
       console.warn(`🚨 HIGH SLIPPAGE DETECTED: ${record.symbol} ${slippagePct.toFixed(2)}%`);
    }
  }

  /**
   * Returns average slippage for a symbol.
   */
  public static getAverageSlippage(symbol: string): number {
    const history = this.slippageHistory.get(symbol);
    if (!history || history.length === 0) return 0;
    return history.reduce((a, b) => a + b, 0) / history.length;
  }
}
