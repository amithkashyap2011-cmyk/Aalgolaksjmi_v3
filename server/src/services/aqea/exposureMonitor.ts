/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Institutional Exposure Monitor (v2.4I)
 * ═══════════════════════════════════════════════════════════════════
 */

import * as paper from "../paperState.js";
import { AQEA_CONFIG } from "./config.js";
import { Trade } from "../../models/Trade.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../utils/mongoUtils.js";

export interface ExposureReport {
  userId: string;
  equity: number;
  marginUsed: number;
  freeMargin: number;
  notionalExposure: number;
  riskExposure: number;
  violationDetected: boolean;
  reasons: string[];
}

export class ExposureMonitor {
  /**
   * Generates a real-time exposure report for a user.
   */
  public static async getReport(userId: string, mode: "PAPER" | "LIVE"): Promise<ExposureReport> {
    const stats = paper.getWalletStats(userId, mode, "FUTURES");
    
    // Recalculate from actual DB positions to avoid stale cache
    const openTrades = await Trade.find({
       userId: toValidObjectId(userId),
       mode,
       status: "OPEN"
    }).lean();
    
    let totalNotional = 0;
    let totalMargin = 0;
    openTrades.forEach(t => {
       const notional = (t.quantity * t.entryPrice);
       const lev = t.leverage || 1;
       totalNotional += notional;
       totalMargin += notional / lev;
    });

    const marginExposureRatio = totalMargin / (stats.equity || 1);
    const freeMarginRatio = stats.liquidUSDT / (stats.equity || 1);

    const reasons: string[] = [];
    if (marginExposureRatio > AQEA_CONFIG.MAX_PORTFOLIO_EXPOSURE) {
       reasons.push(`EXPOSURE_BREACH: ${(marginExposureRatio * 100).toFixed(2)}% > ${AQEA_CONFIG.MAX_PORTFOLIO_EXPOSURE * 100}%`);
    }
    if (freeMarginRatio < AQEA_CONFIG.MIN_FREE_MARGIN_PCT) {
       reasons.push(`MARGIN_CRITICAL: ${(freeMarginRatio * 100).toFixed(2)}% < ${AQEA_CONFIG.MIN_FREE_MARGIN_PCT * 100}%`);
    }

    return {
      userId,
      equity: parseFloat(stats.equity.toFixed(2)),
      marginUsed: parseFloat(totalMargin.toFixed(2)),
      freeMargin: parseFloat(stats.liquidUSDT.toFixed(2)),
      notionalExposure: parseFloat(totalNotional.toFixed(2)),
      riskExposure: parseFloat((totalNotional * 0.02).toFixed(2)), // Assuming 2% average SL
      violationDetected: reasons.length > 0,
      reasons
    };
  }
}
