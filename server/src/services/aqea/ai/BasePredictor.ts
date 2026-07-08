/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Base AI Predictor (Abstract)
 * ═══════════════════════════════════════════════════════════════════
 */

import { IAIPredictor } from "./IAIPredictor.js";
import { AIPrediction, PredictorHealth, AIDirection } from "./types.js";
import { FeatureVector } from "../featureStore.js";
import { AIPredictionTelemetry } from "../../../models/AIPredictionTelemetry.js";

export abstract class BasePredictor implements IAIPredictor {
  protected abstract modelName: string;
  protected predictionCount = 0;
  protected errorCount = 0;
  protected lastLatencyMs = 0;
  protected totalLatencyMs = 0;
  protected startTime = Date.now();
  protected lastPredictionTime: Date | null = null;
  protected checkpointLoaded = true; // Default to true, updated by health checks

  /**
   * Orchestrates the prediction lifecycle.
   */
  public async predict(features: FeatureVector): Promise<AIPrediction> {
    const start = Date.now();
    this.predictionCount++;
    this.lastPredictionTime = new Date();
    
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
      if (result.direction && result.confidence > 0 && entryPrice > 0) {
        AIPredictionTelemetry.create({
          prediction_id,
          model_name: this.modelName,
          symbol: features.symbol,
          direction: result.direction,
          confidence: result.confidence,
          timestamp: new Date(),
          priceAtPrediction: entryPrice
        }).catch(err => console.error(`[TELEMETRY_ERROR] ${err.message}`));
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
      return {
        direction: "HOLD",
        confidence: 0,
        probability: 0.5,
        predictor: this.modelName,
        meta: {
          recommendedAction: "UNAVAILABLE",
          reason: "SERVICE_OFFLINE",
          error: err instanceof Error ? err.message : String(err)
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
