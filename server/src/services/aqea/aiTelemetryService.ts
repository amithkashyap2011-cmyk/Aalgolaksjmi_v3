/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — AI Predictor Telemetry Service
 * ═══════════════════════════════════════════════════════════════════
 */

import { AIPredictionTelemetry, ModelAccuracyMetrics } from "../../models/AIPredictionTelemetry.js";
import { getKlines } from "../binanceService.js";

export class AITelemetryService {
  /**
   * Resolves outcomes for AI predictions to track their standalone accuracy
   */
  public static async resolvePendingOutcomes(): Promise<void> {
    const now = Date.now();
    
    // Find telemetry missing final 60m outcome within the last 72 hours
    const records = await AIPredictionTelemetry.find({
      timestamp: { $gte: new Date(now - 72 * 60 * 60 * 1000) },
      outcome60m: { $exists: false }
    }).limit(200);

    console.log(`[TELEMETRY] Found ${records.length} pending records for resolution.`);

    const promises = records.map(async (r) => {
      if (!r.priceAtPrediction) return;

      const ageMinutes = (now - r.timestamp.getTime()) / 60000;
      const updates: any = {};

      if (ageMinutes >= 15 && !r.outcome15m) {
        const out = await this.resolveOutcome(r.symbol, r.timestamp, 15, r.priceAtPrediction, r.direction);
        if (out) {
            updates.price15m = out.price;
            updates.outcome15m = out.status;
        }
      }

      // isCorrect is graded HERE, at 25 minutes — the horizon the CNN is
      // actually trained on (FORWARD_HORIZON=5 x 5m bars in train_cnn.py).
      // NEUTRAL (move within the ±fee-floor band on a LONG/SHORT call) is
      // excluded from the accuracy sample, not counted as a miss: the model
      // wasn't wrong, the market just didn't move enough to grade it.
      if (ageMinutes >= 25 && !r.outcome25m) {
        const out = await this.resolveOutcome(r.symbol, r.timestamp, 25, r.priceAtPrediction, r.direction);
        if (out) {
            updates.price25m = out.price;
            updates.outcome25m = out.status;
            if (out.status !== "NEUTRAL") {
              updates.isCorrect = (out.status === "WIN");
              updates.gradingVersion = 2;
            }
        }
      }

      if (ageMinutes >= 30 && !r.outcome30m) {
        const out = await this.resolveOutcome(r.symbol, r.timestamp, 30, r.priceAtPrediction, r.direction);
        if (out) {
            updates.price30m = out.price;
            updates.outcome30m = out.status;
        }
      }

      // 30m/60m outcomes are kept as informational checkpoints only —
      // grading a 25-minute prediction at 60 minutes (as the old code did,
      // with NEUTRAL counted as a loss) made HOLD near-unwinnable and
      // produced impossible readings like 0.0% rolling accuracy.
      if (ageMinutes >= 60 && !r.outcome60m) {
        const out = await this.resolveOutcome(r.symbol, r.timestamp, 60, r.priceAtPrediction, r.direction);
        if (out) {
            updates.price60m = out.price;
            updates.outcome60m = out.status;
        }
      }

      if (Object.keys(updates).length > 0) {
        console.log(`[TELEMETRY] Updating record ${r.prediction_id}: ${JSON.stringify(updates)}`);
        await AIPredictionTelemetry.updateOne({ _id: r._id }, { $set: updates });
      }
    });

    await Promise.all(promises);
  }

  private static async resolveOutcome(symbol: string, timestamp: Date, offset: number, entry: number, decision: "LONG" | "SHORT" | "HOLD"): Promise<any> {
    try {
      const targetTime = timestamp.getTime() + offset * 60 * 1000;
      const klines = await getKlines(symbol, "1m", targetTime, undefined, 1);
      if (!klines || klines.length === 0) {
          console.warn(`[TELEMETRY] No klines found for ${symbol} at ${new Date(targetTime).toISOString()}`);
          return null;
      }

      const price = parseFloat(klines[0].close);
      const ret = (price / entry) - 1;
      
      let status: "WIN" | "LOSS" | "NEUTRAL" = "NEUTRAL";
      if (decision === "LONG") status = ret > 0.001 ? "WIN" : (ret < -0.001 ? "LOSS" : "NEUTRAL");
      else if (decision === "SHORT") status = ret < -0.001 ? "WIN" : (ret > 0.001 ? "LOSS" : "NEUTRAL");
      else if (decision === "HOLD") status = Math.abs(ret) <= 0.001 ? "WIN" : "LOSS";

      return { price, return: ret, status };
    } catch (e: any) { 
        console.error(`[TELEMETRY] resolveOutcome error: ${e.message}`);
        return null; 
    }
  }

  public static async updateRollingAccuracies(): Promise<void> {
    const models = ["CNN_1D_V1", "PPO_EXECUTION_V1", "TRANSFORMER_MICRO_V1", "MAMBA_V1"];
    
    for (const model of models) {
      // Only v2-graded records: mixing legacy 60m gradings (NEUTRAL=loss,
      // wrong horizon) into the same window would make the number
      // meaningless. Windows start small after the cutover and fill up as
      // new predictions resolve.
      const records = await AIPredictionTelemetry.find({
        model_name: model,
        isCorrect: { $exists: true },
        gradingVersion: 2
      })
      .sort({ timestamp: -1 })
      .limit(500)
      .lean();

      if (records.length === 0) continue;

      const acc50 = this.calcAcc(records.slice(0, 50));
      const acc100 = this.calcAcc(records.slice(0, 100));
      const acc500 = this.calcAcc(records);

      await ModelAccuracyMetrics.create({
        model_name: model,
        timestamp: new Date(),
        rolling50_accuracy: acc50,
        rolling100_accuracy: acc100,
        rolling500_accuracy: acc500
      });
    }
  }

  private static calcAcc(records: any[]): number {
    if (records.length === 0) return 0;
    const correct = records.filter(r => r.isCorrect).length;
    return (correct / records.length) * 100;
  }

  public static async getModelAccuracy(modelName: string): Promise<any> {
    const fallback = { rolling50_accuracy: 50, rolling100_accuracy: 50, rolling500_accuracy: 50 };
    try {
      const q = ModelAccuracyMetrics.findOne({ model_name: modelName });
      if (typeof (q as any).sort !== "function") return fallback;
      const latest = await (q as any).sort({ timestamp: -1 }).lean();
      return latest || fallback;
    } catch {
      return fallback;
    }
  }
}
