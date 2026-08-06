/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Trade Analytics Service
 * ═══════════════════════════════════════════════════════════════════
 */

import { AqeaTradeAnalytics } from "../../models/AqeaTradeAnalytics.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../utils/mongoUtils.js";

export interface AnalyticsEntry {
  userId: string;
  symbol: string;
  decision: "LONG" | "SHORT" | "HOLD" | "EXIT";
  regimeState: string;
  regimeScore: number;
  multiTfScore: number;
  atr: number;
  adx: number;
  btcDominance: number;
  fundingRate: number;
  riskScore: number;
  positionSize: number;
  exitReason?: string;
  pnl?: number;
  meta?: any;
}

export class AqeaAnalyticsService {
  /**
   * Logs a complete AQEA feature vector for future model training.
   */
  public static async record(data: AnalyticsEntry): Promise<void> {
    try {
      if (mongoose.connection.readyState !== 1) return;

      await AqeaTradeAnalytics.create({
        ...data,
        userId: toValidObjectId(data.userId),
        timestamp: new Date()
      });
    } catch (err) {
      console.error("[AQEA_ANALYTICS_ERROR]", err);
    }
  }

  /**
   * Updates an existing entry with exit results (PnL, Exit Reason).
   */
  public static async updateResult(tradeId: string, exitReason: string, pnl: number): Promise<void> {
    try {
      if (mongoose.connection.readyState !== 1) return;
      
      await AqeaTradeAnalytics.updateOne(
        { meta: { tradeId } }, // Assuming meta contains the reference tradeId
        { $set: { exitReason, pnl } }
      );
    } catch (err) {
      console.error("[AQEA_ANALYTICS_UPDATE_ERROR]", err);
    }
  }
}
