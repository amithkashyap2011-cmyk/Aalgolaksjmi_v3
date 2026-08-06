/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Shadow Validation Service (V8.1)
 * ═══════════════════════════════════════════════════════════════════
 */

import { AqeaTradeAnalytics } from "../../models/AqeaTradeAnalytics.js";
import { getTickerPriceSync, getKlines } from "../binanceService.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../utils/mongoUtils.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ShadowOutcome {
  price15m?: number;
  price30m?: number;
  price60m?: number;
  return15m?: number;
  return30m?: number;
  return60m?: number;
  isCorrect15m?: boolean;
  isCorrect30m?: boolean;
  isCorrect60m?: boolean;
}

export interface ShadowMetrics {
  totalSignals: number;
  accuracy: {
    overall: number;
    long: number;
    short: number;
    hold: number;
  };
  distribution: Record<string, number>;
  performance: {
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
  };
  alerts: string[];
}

export class ShadowValidationService {
  private static REPORT_DIR = path.resolve((process.env.PROJECT_ROOT || path.resolve(__dirname, "../../../")), "docs", "shadow_validation");

  /**
   * Tracks outcomes for unresolved shadow signals.
   * Runs outcome checks for signals that are 15m, 30m, and 60m old.
   */
  public static async trackOutcomes(): Promise<void> {
    const now = Date.now();
    
    // Find signals without full outcomes within the last 2 hours
    const signals = await AqeaTradeAnalytics.find({
      "meta.virtual": true,
      decision: { $in: ["LONG", "SHORT", "HOLD"] },
      timestamp: { $gte: new Date(now - 120 * 60 * 1000) },
      $or: [
        { "meta.outcome15m": { $exists: false } },
        { "meta.outcome30m": { $exists: false } },
        { "meta.outcome60m": { $exists: false } }
      ]
    }).limit(20);

    for (const s of signals) {
      const entryPrice = s.marketFeatures?.close || s.meta?.entryPrice;
      if (!entryPrice) continue;

      const ageMinutes = (now - s.timestamp.getTime()) / 60000;
      const updates: any = {};

      if (ageMinutes >= 15 && !s.meta.outcome15m) {
        updates["meta.outcome15m"] = await this.fetchOutcome(s.symbol, s.timestamp, 15, entryPrice, s.decision as any);
      }
      if (ageMinutes >= 30 && !s.meta.outcome30m) {
        updates["meta.outcome30m"] = await this.fetchOutcome(s.symbol, s.timestamp, 30, entryPrice, s.decision as any);
      }
      if (ageMinutes >= 60 && !s.meta.outcome60m) {
        updates["meta.outcome60m"] = await this.fetchOutcome(s.symbol, s.timestamp, 60, entryPrice, s.decision as any);
      }

      if (Object.keys(updates).length > 0) {
        await AqeaTradeAnalytics.updateOne({ _id: s._id }, { $set: updates });
      }
    }
  }

  private static async fetchOutcome(symbol: string, timestamp: Date, offsetMinutes: number, entryPrice: number, decision: "LONG" | "SHORT" | "HOLD"): Promise<any> {
    try {
      const targetTime = timestamp.getTime() + offsetMinutes * 60 * 1000;
      const klines = await getKlines(symbol, "1m", 1, targetTime);
      
      if (!klines || klines.length === 0) return null;
      
      const price = parseFloat(klines[0].close); // Close price
      const ret = (price / entryPrice) - 1;
      
      let isCorrect = false;
      if (decision === "LONG") isCorrect = ret > 0.001; // > 0.1% move
      else if (decision === "SHORT") isCorrect = ret < -0.001;
      else if (decision === "HOLD") isCorrect = Math.abs(ret) <= 0.001;

      return { price, return: ret, isCorrect };
    } catch (err) {
      return null;
    }
  }

  /**
   * Returns a shadow validation report for the specified user and time window.
   */
  public static async getShadowReport(userId: string, days = 14): Promise<ShadowMetrics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const signals = await AqeaTradeAnalytics.find({
      userId: toValidObjectId(userId),
      "meta.virtual": true,
      timestamp: { $gte: startDate }
    }).lean();

    return this.calculateMetrics(signals);
  }

  /**
   * Generates Day X report and checks for alerts.
   */
  public static async generateDailyReport(dayNumber: number): Promise<string> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const signals = await AqeaTradeAnalytics.find({
      "meta.virtual": true,
      timestamp: { $gte: startOfDay }
    }).lean();

    const metrics = await this.calculateMetrics(signals);
    const reportPath = path.join((process.env.PROJECT_ROOT || path.resolve(__dirname, "../../../")), `AQEA_SHADOW_DAY_${dayNumber}.md`);
    
    let content = `# AQEA Shadow Validation — Day ${dayNumber}\n\n`;
    content += `**Timestamp:** ${new Date().toISOString()}\n`;
    content += `**Total Signals:** ${metrics.totalSignals}\n\n`;
    
    content += `## 1. Prediction Distribution\n`;
    content += `| Class | Count | Percentage |\n| :--- | :--- | :--- |\n`;
    for (const [cls, count] of Object.entries(metrics.distribution)) {
      const pct = (count / metrics.totalSignals) * 100;
      content += `| ${cls} | ${count} | ${pct.toFixed(1)}% |\n`;
    }
    
    content += `\n## 2. Accuracy (60m window)\n`;
    content += `- **LONG Accuracy:** ${metrics.accuracy.long.toFixed(1)}%\n`;
    content += `- **SHORT Accuracy:** ${metrics.accuracy.short.toFixed(1)}%\n`;
    content += `- **HOLD Accuracy:** ${metrics.accuracy.hold.toFixed(1)}%\n`;
    content += `- **Overall Accuracy:** ${metrics.accuracy.overall.toFixed(1)}%\n\n`;
    
    content += `## 3. Performance Metrics\n`;
    content += `- **Win Rate:** ${metrics.performance.winRate.toFixed(1)}%\n`;
    content += `- **Profit Factor:** ${metrics.performance.profitFactor.toFixed(2)}\n`;
    content += `- **Max Drawdown:** ${metrics.performance.maxDrawdown.toFixed(2)}%\n\n`;
    
    if (metrics.alerts.length > 0) {
      content += `## ⚠️ ALERTS\n`;
      metrics.alerts.forEach(a => content += `- ${a}\n`);
    }

    fs.writeFileSync(reportPath, content);
    return reportPath;
  }

  private static async calculateMetrics(signals: any[]): Promise<ShadowMetrics> {
    const totalSignals = signals.filter(s => ["LONG", "SHORT", "HOLD"].includes(s.decision)).length;
    const dist: Record<string, number> = { LONG: 0, SHORT: 0, HOLD: 0 };
    
    let longCorrect = 0, longTotal = 0;
    let shortCorrect = 0, shortTotal = 0;
    let holdCorrect = 0, holdTotal = 0;
    let wins = 0, losses = 0, grossProfit = 0, grossLoss = 0;

    signals.forEach(s => {
      if (dist[s.decision] !== undefined) dist[s.decision]++;
      
      const outcome = s.meta?.outcome60m;
      if (outcome) {
        if (s.decision === "LONG") {
          longTotal++;
          if (outcome.isCorrect) longCorrect++;
        } else if (s.decision === "SHORT") {
          shortTotal++;
          if (outcome.isCorrect) shortCorrect++;
        } else if (s.decision === "HOLD") {
          holdTotal++;
          if (outcome.isCorrect) holdCorrect++;
        }

        if (s.decision !== "HOLD") {
          const pnl = outcome.return;
          if (pnl > 0) {
            wins++;
            grossProfit += pnl;
          } else {
            losses++;
            grossLoss += Math.abs(pnl);
          }
        }
      }
    });

    const alerts: string[] = [];
    if (totalSignals > 0) {
      if ((dist.LONG / totalSignals) > 0.7) alerts.push("LONG bias > 70%");
      if ((dist.SHORT / totalSignals) > 0.7) alerts.push("SHORT bias > 70%");
      if ((dist.HOLD / totalSignals) < 0.05) alerts.push("HOLD frequency < 5%");
    }

    // Check for confidence saturation
    const highConfCount = signals.filter(s => s.meta?.confidence > 0.99).length;
    if (highConfCount >= 100) alerts.push("Confidence saturation detected (> 0.99 for 100+ signals)");

    return {
      totalSignals,
      distribution: dist,
      accuracy: {
        long: longTotal > 0 ? (longCorrect / longTotal) * 100 : 0,
        short: shortTotal > 0 ? (shortCorrect / shortTotal) * 100 : 0,
        hold: holdTotal > 0 ? (holdCorrect / holdTotal) * 100 : 0,
        overall: (longTotal + shortTotal + holdTotal) > 0 ? ((longCorrect + shortCorrect + holdCorrect) / (longTotal + shortTotal + holdTotal)) * 100 : 0
      },
      performance: {
        winRate: (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0),
        maxDrawdown: 0 // Requires time-series equity tracking
      },
      alerts
    };
  }
}
