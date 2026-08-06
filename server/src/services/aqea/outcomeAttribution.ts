/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Outcome Attribution Service (V8.5.2)
 * ═══════════════════════════════════════════════════════════════════
 */

import { AqeaDecisionAttribution } from "../../models/AqeaDecisionAttribution.js";
import { getKlines } from "../binanceService.js";
import fs from "fs";
import path from "path";

export interface SubsystemPerformance {
  subsystem: string;
  totalSignals: number;
  correctSignals: number;
  winRate: number;
}

export class OutcomeAttributionService {
  /**
   * Tracks outcomes for unresolved attribution records.
   * Scans pending attributions and fetches historical Binance prices.
   */
  public static async resolvePendingOutcomes(): Promise<void> {
    const now = Date.now();
    
    // Find attributions missing final 60m outcome within the last 72 hours
    const records = await AqeaDecisionAttribution.find({
      timestamp: { $gte: new Date(now - 72 * 60 * 60 * 1000) },
      outcome60m: { $exists: false }
    }).limit(200);

    const promises = records.map(async (r) => {
      if (!r.entryPrice) return;

      const ageMinutes = (now - r.timestamp.getTime()) / 60000;
      const updates: any = {};

      if (ageMinutes >= 15 && !r.outcome15m) {
        const out = await this.resolveOutcome(r.symbol, r.timestamp, 15, r.entryPrice, r.finalDecision as any);
        if (out) {
            updates.price15m = out.price;
            updates.outcome15m = out.status;
        }
      }
      
      if (ageMinutes >= 30 && !r.outcome30m) {
        const out = await this.resolveOutcome(r.symbol, r.timestamp, 30, r.entryPrice, r.finalDecision as any);
        if (out) {
            updates.price30m = out.price;
            updates.outcome30m = out.status;
        }
      }

      if (ageMinutes >= 60 && !r.outcome60m) {
        const out = await this.resolveOutcome(r.symbol, r.timestamp, 60, r.entryPrice, r.finalDecision as any);
        if (out) {
            updates.price60m = out.price;
            updates.outcome60m = out.status;
            updates.pnlSimulated = out.return * r.positionSize;
            
            // Analyze subsystem correctness at 60m mark
            updates.cnnCorrect = this.isSubsystemCorrect(r.cnnPrediction as any, out.return);
            updates.transformerCorrect = this.isSubsystemCorrect(r.transformerPrediction as any, out.return);
            updates.ppoCorrect = this.isSubsystemCorrect(r.ppoPrediction as any, out.return);
            updates.mambaCorrect = this.isSubsystemCorrect(r.mambaPrediction as any, out.return);
            updates.orderFlowCorrect = this.isScoreCorrect(r.orderFlowScore, out.return);
            updates.smartMoneyCorrect = this.isScoreCorrect(r.smartMoneyScore, out.return);
            updates.regimeCorrect = this.isRegimeCorrect(r.regimeState, out.return);
            updates.riskApprovalCorrect = r.riskApproved ? (out.status !== "LOSS") : (out.status === "LOSS");
        }
      }

      if (Object.keys(updates).length > 0) {
        await AqeaDecisionAttribution.updateOne({ _id: r._id }, { $set: updates });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Legacy alias for resolvePendingOutcomes.
   */
  public static async trackOutcomes(): Promise<void> {
    return this.resolvePendingOutcomes();
  }

  private static async resolveOutcome(symbol: string, timestamp: Date, offset: number, entry: number, decision: "LONG" | "SHORT" | "HOLD"): Promise<any> {
    try {
      const targetTime = timestamp.getTime() + offset * 60 * 1000;
      const klines = await getKlines(symbol, "1m", targetTime, undefined, 1);
      if (!klines || klines.length === 0) return null;

      const price = parseFloat(klines[0].close);
      const ret = (price / entry) - 1;
      
      let status: "WIN" | "LOSS" | "NEUTRAL" = "NEUTRAL";
      if (decision === "LONG") status = ret > 0.001 ? "WIN" : (ret < -0.001 ? "LOSS" : "NEUTRAL");
      else if (decision === "SHORT") status = ret < -0.001 ? "WIN" : (ret > 0.001 ? "LOSS" : "NEUTRAL");
      else if (decision === "HOLD") status = Math.abs(ret) <= 0.001 ? "WIN" : "LOSS";

      return { price, return: ret, status };
    } catch { return null; }
  }

  private static isSubsystemCorrect(prediction: "LONG" | "SHORT" | "HOLD", ret: number): boolean {
    if (prediction === "LONG") return ret > 0.001;
    if (prediction === "SHORT") return ret < -0.001;
    if (prediction === "HOLD") return Math.abs(ret) <= 0.001;
    return false;
  }

  private static isScoreCorrect(score: number, ret: number): boolean {
    if (score > 60) return ret > 0.001;
    if (score < 40) return ret < -0.001;
    return Math.abs(ret) <= 0.001;
  }

  private static isRegimeCorrect(state: string, ret: number): boolean {
    if (state === "TRENDING_BULL") return ret > 0.001;
    if (state === "TRENDING_BEAR") return ret < -0.001;
    return Math.abs(ret) <= 0.001;
  }

  /**
   * Returns long-term and short-term accuracy for MetaAlpha weighting.
   */
  public static async getPerformanceHistory(): Promise<any> {
    const totalRecords = await AqeaDecisionAttribution.countDocuments({ outcome60m: { $exists: true } });
    
    // Default baseline if no data
    if (totalRecords < 10) {
      return {
        CNN: { longTerm: 50, shortTerm: 50 },
        TRANSFORMER: { longTerm: 50, shortTerm: 50 },
        PPO: { longTerm: 50, shortTerm: 50 },
        MAMBA: { longTerm: 50, shortTerm: 50 },
        ORDER_FLOW: { longTerm: 50, shortTerm: 50 },
        SMART_MONEY: { longTerm: 50, shortTerm: 50 },
        REGIME: { longTerm: 50, shortTerm: 50 }
      };
    }

    const subsystems = [
      { key: "cnnCorrect", name: "CNN" },
      { key: "transformerCorrect", name: "TRANSFORMER" },
      { key: "ppoCorrect", name: "PPO" },
      { key: "mambaCorrect", name: "MAMBA" },
      { key: "orderFlowCorrect", name: "ORDER_FLOW" },
      { key: "smartMoneyCorrect", name: "SMART_MONEY" },
      { key: "regimeCorrect", name: "REGIME" }
    ];

    const history: any = {};

    for (const sub of subsystems) {
      const longTermRecords = await AqeaDecisionAttribution.find({ outcome60m: { $exists: true } })
        .sort({ timestamp: -1 })
        .limit(500)
        .lean();
      
      const shortTermRecords = longTermRecords.slice(0, 50);

      const longAcc = longTermRecords.filter(r => (r as any)[sub.key] === true).length / longTermRecords.length;
      const shortAcc = shortTermRecords.filter(r => (r as any)[sub.key] === true).length / shortTermRecords.length;

      history[sub.name] = {
        longTerm: longAcc * 100,
        shortTerm: shortAcc * 100
      };
    }

    return history;
  }

  /**
   * Calculates win rate for every subsystem.
   */
  public static async getOutcomeStats(): Promise<SubsystemPerformance[]> {
    const records = await AqeaDecisionAttribution.find({ outcome60m: { $exists: true } }).lean();
    if (records.length === 0) return [];

    const subsystems = [
        { key: "cnnCorrect", name: "CNN" },
        { key: "transformerCorrect", name: "Transformer" },
        { key: "ppoCorrect", name: "PPO" },
        { key: "mambaCorrect", name: "Mamba" },
        { key: "orderFlowCorrect", name: "Order Flow" },
        { key: "smartMoneyCorrect", name: "Smart Money" },
        { key: "regimeCorrect", name: "Regime" },
        { key: "riskApprovalCorrect", name: "Risk Approval" }
    ];

    return subsystems.map(sub => {
        const total = records.length;
        const correct = records.filter(r => (r as any)[sub.key] === true).length;
        return {
            subsystem: sub.name,
            totalSignals: total,
            correctSignals: correct,
            winRate: (correct / total) * 100
        };
    });
  }

  /**
   * Generates daily outcome attribution report.
   */
  public static async generateDailyReport(dayNumber: number): Promise<string> {
    const stats = await this.getOutcomeStats();
    if (stats.length === 0) return "";

    const reportPath = path.join((process.env.PROJECT_ROOT || path.resolve(__dirname, "../../../")), `AQEA_OUTCOME_ATTRIBUTION_DAY_${dayNumber}.md`);
    
    let content = `# AQEA Outcome Attribution — Day ${dayNumber}\n\n`;
    content += `**Timestamp:** ${new Date().toISOString()}\n\n`;
    
    content += `## 1. Subsystem Alpha Contribution\n`;
    content += `| Subsystem | Total | Correct | Win Rate | Status |\n`;
    content += `| :--- | :--- | :--- | :--- | :--- |\n`;
    
    const sorted = [...stats].sort((a, b) => b.winRate - a.winRate);
    sorted.forEach(s => {
      const status = s.winRate > 55 ? "✅ ALPHA" : (s.winRate < 45 ? "❌ NOISE" : "⚠️ NEUTRAL");
      content += `| ${s.subsystem} | ${s.totalSignals} | ${s.correctSignals} | ${s.winRate.toFixed(1)}% | ${status} |\n`;
    });

    content += `\n## 2. Executive Insight\n`;
    content += `- **Highest Alpha Contributor:** ${sorted[0].subsystem} (${sorted[0].winRate.toFixed(1)}%)\n`;
    content += `- **Highest Noise Contributor:** ${sorted[sorted.length-1].subsystem} (${sorted[sorted.length-1].winRate.toFixed(1)}%)\n\n`;
    
    fs.writeFileSync(reportPath, content);
    return reportPath;
  }
}
