/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Base AI Predictor (Abstract)
 * ═══════════════════════════════════════════════════════════════════
 */

import { IAIPredictor } from "./IAIPredictor.js";
import { AIPrediction, PredictorHealth, AIDirection } from "./types.js";
import { FeatureVector } from "../featureStore.js";
import { AIPredictionTelemetry } from "../../../models/AIPredictionTelemetry.js";
import mongoose from "mongoose";
import { isQuantEngineAvailable } from "../../../config/serviceDiscovery.js";

export abstract class BasePredictor implements IAIPredictor {
  protected abstract modelName: string;
  protected predictionCount = 0;
  protected errorCount = 0;
  protected lastLatencyMs = 0;
  protected totalLatencyMs = 0;
  protected startTime = Date.now();
  protected lastPredictionTime: Date | null = null;
  protected checkpointLoaded = true; // Default to true, updated by health checks
  private static lastTelemetryErrorLog = 0;

  private static logTelemetryError(err: any): void {
    const now = Date.now();
    if (now - BasePredictor.lastTelemetryErrorLog > 30000) {
      BasePredictor.lastTelemetryErrorLog = now;
      console.warn(`[TELEMETRY_WARNING] Non-blocking prediction telemetry write failed: ${err.message || err}`);
    }
  }

  /**
   * Orchestrates the prediction lifecycle.
   */
  public async predict(features: FeatureVector): Promise<AIPrediction> {
    const start = Date.now();
    this.predictionCount++;
    this.lastPredictionTime = new Date();

    // ⚡ Fast-fail: skip all network calls if quant engine is unreachable.
    // This prevents per-symbol 800–1000ms fetch hangs that cascade into
    // 25 s SYMBOL_TERMINAL timeouts on the auto-trade scheduler.
    // Skipped in test mode so predictor unit tests can exercise runInference()
    // with their own mocks without needing a live quant engine.
    if (process.env.NODE_ENV !== "test" && !await isQuantEngineAvailable()) {
      return {
        direction: "HOLD",
        confidence: 0,
        probability: 0,
        predictor: this.modelName,
        meta: { recommendedAction: "UNAVAILABLE", reason: "SERVICE_OFFLINE" }
      };
    }

    try {
      const result = await this.runInference(features);
      const latency = Date.now() - start;
      this.lastLatencyMs = latency;
      this.totalLatencyMs += latency;
      
      const prediction_id = `PRED_${this.modelName}_${start}_${Math.floor(Math.random()*1000)}`;

      // 🛡️ Telemetry logging — REAL predictions only. Degraded-model stub
      // responses (confidence-0 neutral fallbacks, e.g. Mamba while its
      // checkpoint is offline) are not predictions and only pollute the
      // rolling-accuracy windows; records without an entry price can never
      // be outcome-graded and would sit pending forever.
      const entryPrice = features.market?.close || 0;
      // 🛡️ Telemetry logging — non-blocking, fail-safe, and active only in production/development with active MongoDB
      if (process.env.NODE_ENV !== "test" && result.direction && result.confidence > 0 && entryPrice > 0 && mongoose.connection.readyState === 1) {
        AIPredictionTelemetry.create({
          prediction_id,
          model_name: this.modelName,
          symbol: features.symbol,
          direction: result.direction,
          confidence: result.confidence,
          timestamp: new Date(),
          priceAtPrediction: entryPrice
        }).catch((err: any) => {
          BasePredictor.logTelemetryError(err);
        });
      }

      return {
        direction: result.direction,
        confidence: result.confidence,
        probability: result.probability,
        predictor: this.modelName,
        meta: { ...result.meta, prediction_id }
      };
    } catch (err) {
      this.errorCount++;
      const latency = Date.now() - start;
      this.lastLatencyMs = latency;
      this.totalLatencyMs += latency;

      // 🧠 Mathematical Technical Indicator Fallback when Python AI service is offline
      const rsi = features.market?.rsi ?? 50;
      const adx = features.market?.adx ?? 25;
      const ema20 = features.market?.ema20 ?? features.market?.close;
      const ema50 = features.market?.ema50 ?? features.market?.close;
      const close = features.market?.close ?? 0;

      let fallbackDir: AIDirection = "HOLD";
      let fallbackConf = 0.50;
      if (rsi >= 54 && close >= ema20) {
        fallbackDir = "LONG";
        fallbackConf = Math.min(0.85, 0.65 + (rsi - 50) * 0.008);
      } else if (rsi <= 46 && close <= ema20) {
        fallbackDir = "SHORT";
        fallbackConf = Math.min(0.85, 0.65 + (50 - rsi) * 0.008);
      }

      const isOfflineErr = err instanceof Error && (
        err.message.includes("Connection") ||
        err.message.includes("OFFLINE") ||
        err.message.includes("Failed") ||
        err.message.includes("ECONNREFUSED") ||
        err.message.includes("connection reset") ||
        err.message.includes("MODEL_SERVICE_UNAVAILABLE")
      );

      return {
        direction: fallbackDir,
        confidence: isOfflineErr ? 0 : parseFloat(fallbackConf.toFixed(2)),
        probability: isOfflineErr ? 0 : parseFloat(fallbackConf.toFixed(2)),
        predictor: this.modelName,
        meta: {
          recommendedAction: isOfflineErr ? "UNAVAILABLE" : fallbackDir,
          reason: isOfflineErr ? "SERVICE_OFFLINE" : "MATHEMATICAL_INDICATOR_FALLBACK",
          fallbackNote: err instanceof Error ? err.message : String(err)
        }
      };
    }
  }

  /**
   * Individual models must implement their inference logic here.
   */
  protected abstract runInference(features: FeatureVector): Promise<{ 
    direction: AIDirection, 
    confidence: number, 
    probability: number,
    meta?: any 
  }>;

  /**
   * Default confidence logic (can be overridden).
   */
  public confidence(features: FeatureVector): number {
    return 0.5;
  }

  /**
   * Returns standardized health telemetry.
   */
  public getHealth(): PredictorHealth {
    return {
      name: this.modelName,
      available: this.isAvailable(),
      checkpointLoaded: this.checkpointLoaded,
      inferenceLatencyMs: this.lastLatencyMs,
      predictionCount: this.predictionCount,
      errorCount: this.errorCount,
      uptime: (Date.now() - this.startTime) / 1000,
      lastUpdated: new Date(),
      meta: {
        lastPredictionTime: this.lastPredictionTime,
        avgLatencyMs: this.predictionCount > 0 ? this.totalLatencyMs / this.predictionCount : 0
      }
    };
  }

  protected isAvailable(): boolean {
    return true;
  }

  /**
   * Status check for the predictor service.
   */
  public async isHealthy(): Promise<boolean> {
    return this.isAvailable();
  }
}
