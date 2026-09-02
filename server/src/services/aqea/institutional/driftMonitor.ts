/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Model Drift Monitor (Phase 7A)
 * ═══════════════════════════════════════════════════════════════════
 */

import { AqeaTradeAnalytics } from "../../../models/AqeaTradeAnalytics.js";
import { AqeaPerformance } from "../../../models/AqeaPerformance.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../../utils/mongoUtils.js";

export interface DriftReport {
  score: number; // 0-100
  status: "HEALTHY" | "WARNING" | "CRITICAL";
  components: {
    cnnDrift: number;
    ppoDrift: number;
    mambaDrift: number;
    transformerDrift: number;
    ofDrift: number;
    smDrift: number;
  };
}

export class DriftMonitor {
  private static cache = new Map<string, { report: DriftReport; timestamp: number }>();

  /**
   * Tracks model decay by comparing recent vs historical accuracy.
   */
  public static async calculateDrift(userId: string): Promise<DriftReport> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.timestamp < 60000) {
      return cached.report;
    }

    if (mongoose.connection.readyState !== 1) {
      return {
        score: 0,
        status: "HEALTHY",
        components: { cnnDrift: 0, ppoDrift: 0, mambaDrift: 0, transformerDrift: 0, ofDrift: 0, smDrift: 0 }
      };
    }

    const objId = toValidObjectId(userId);
    
    // Exclude TA-fallback trades (AI engine was offline) — they must not score any model.
    const attributable = { "meta.aiAttributable": { $ne: false } };

    // 1. CNN Accuracy Drift
    const recentCNN = await AqeaTradeAnalytics.find({ userId: objId, "aiPredictions.predictor": "CNN_1D_V1", ...attributable }).sort({ timestamp: -1 }).limit(100).lean().catch(() => []);
    const histCNN = await AqeaTradeAnalytics.find({ userId: objId, "aiPredictions.predictor": "CNN_1D_V1", ...attributable }).sort({ timestamp: -1 }).skip(500).limit(500).lean().catch(() => []);
    const cnnDrift = this.compareAccuracy(recentCNN, histCNN);

    // 2. Mamba Accuracy Drift
    const mambaDrift = 10; // Mock until enough data collected

    // 3. Transformer Accuracy Drift
    const transformerDrift = 12; // Mock until enough data collected

    // 4. Order Flow / Smart Money Agreement Drift
    const recentPerf = await AqeaPerformance.find({ userId: objId }).sort({ timestamp: -1 }).limit(100).lean().catch(() => []);
    const histPerf = await AqeaPerformance.find({ userId: objId }).sort({ timestamp: -1 }).skip(500).limit(500).lean().catch(() => []);
    const agreementDrift = this.compareAgreement(recentPerf, histPerf);

    // 5. PPO Reward Drift
    const ppoDrift = 15; // Mock for foundation template

    // Final Weighted Drift Score
    const globalDrift = Math.round((cnnDrift * 0.3) + (mambaDrift * 0.2) + (transformerDrift * 0.2) + (agreementDrift * 0.2) + (ppoDrift * 0.1));

    let status: "HEALTHY" | "WARNING" | "CRITICAL" = "HEALTHY";
    if (globalDrift > 60) status = "CRITICAL";
    else if (globalDrift > 30) status = "WARNING";

    const report: DriftReport = {
      score: globalDrift,
      status,
      components: {
        cnnDrift,
        ppoDrift,
        mambaDrift,
        transformerDrift,
        ofDrift: agreementDrift,
        smDrift: agreementDrift
      }
    };

    this.cache.set(userId, { report, timestamp: Date.now() });
    return report;
  }

  private static compareAccuracy(recent: any[], hist: any[]): number {
    if (recent.length < 50 || hist.length < 100) return 0;
    const recentAcc = recent.filter(r => r.outcomeFeatures?.winLoss === 1).length / recent.length;
    const histAcc = hist.filter(h => h.outcomeFeatures?.winLoss === 1).length / hist.length;
    
    const drop = (histAcc - recentAcc) / (histAcc || 1);
    return Math.max(0, Math.min(100, drop * 200)); // Scale to 0-100
  }

  private static compareAgreement(recent: any[], hist: any[]): number {
    if (recent.length < 50 || hist.length < 100) return 0;
    const recentAgr = recent.filter(r => r.agreement).length / recent.length;
    const histAgr = hist.filter(h => h.agreement).length / hist.length;
    
    const drop = (histAgr - recentAgr) / (histAgr || 1);
    return Math.max(0, Math.min(100, drop * 200));
  }
}
