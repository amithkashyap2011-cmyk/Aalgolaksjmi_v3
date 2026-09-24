import { IModelExpert, ModelExpertPrediction, ModelExpertStatus, ModelHealth, ModelCalibration, InferenceMode } from "../IModelExpert.js";
import { Standardized15Features } from "../../pipeline/FeaturePipeline.js";
import { AnyRegime } from "../../regimeEngine.js";
import { ModelInferenceBridge } from "../ModelInferenceBridge.js";
import { AI_ENDPOINTS } from "../../../../config/aiEndpointRegistry.js";
import mongoose from "mongoose";
import { AIPredictionTelemetry } from "../../../../models/AIPredictionTelemetry.js";

// Gradient-boosted trees on the CNN's stationarized candle features, 5-bar
// horizon (quant_engine/train_gbm.py). Offline 2026-09-24 it beat the CNN on
// the same data (val macro F1 0.384 vs random 0.331; walk-forward 0.37–0.42).
// SHADOW ONLY: votes are recorded for forward grading but carry zero weight —
// UnifiedEnsembleFusion only weights REAL_MODEL + PRODUCTION. Promote to a live
// voter only after its graded shadow record shows an edge after fees.
export class GBMTreesExpert implements IModelExpert {
  public readonly modelName = "GBM_TREES_V1";
  public readonly modelVersion = "1.0.0";
  public readonly architecture = "GRADIENT_BOOSTED_TREES";
  public readonly inputSchemaVersion = 2;
  public readonly inferenceMode: InferenceMode = "REAL_MODEL";
  public readonly isTrained = true;
  public status: ModelExpertStatus = "SHADOW";
  public readonly supportedRegimes: AnyRegime[] = ["TRENDING_UP", "TRENDING_DOWN", "TRENDING_BULL", "TRENDING_BEAR", "RANGING"];

  public async predict(features: Standardized15Features, activeRegime: AnyRegime): Promise<ModelExpertPrediction> {
    const prediction = await ModelInferenceBridge.executeRemoteInference({
      endpoint: AI_ENDPOINTS.GBM,
      payload: { symbol: features.symbol || "BTCUSDT" },
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      architecture: this.architecture,
      isTrained: this.isTrained,
      timeoutMs: 2000,
    });
    // The bridge stamps successful inferences PRODUCTION; a shadow model must
    // never inherit that, or it would start voting on live trades.
    if (prediction.inferenceMode === "REAL_MODEL") prediction.status = this.status;
    prediction.regimeCompatibility = this.supportedRegimes.includes(activeRegime) ? 0.70 : 0.40;
    this.recordTelemetry(features, prediction);
    return prediction;
  }

  // Same graded-telemetry record the BasePredictor models write (outcomes at
  // 15/25/30/60m), so the shadow record can justify — or refuse — promotion.
  // One record per symbol per 5-minute bar: the model only changes per bar.
  private lastBar = new Map<string, number>();
  private recordTelemetry(features: Standardized15Features, pred: ModelExpertPrediction): void {
    const symbol = features.symbol;
    const price = Number(features.ohlcv?.close);
    if (process.env.NODE_ENV === "test" || !symbol || !(price > 0) || pred.inferenceMode !== "REAL_MODEL" || !(pred.confidence > 0)) return;
    if (mongoose.connection.readyState !== 1) return;
    const bar = Math.floor(Date.now() / 300_000);
    if (this.lastBar.get(symbol) === bar) return;
    this.lastBar.set(symbol, bar);
    AIPredictionTelemetry.create({
      prediction_id: `PRED_${this.modelName}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      model_name: this.modelName,
      symbol,
      direction: pred.direction,
      confidence: pred.confidence,
      timestamp: new Date(),
      priceAtPrediction: price,
      isFallback: false,
      sourceModel: this.modelName,
    }).catch(() => { /* telemetry is best-effort */ });
  }

  public getHealth(): ModelHealth {
    return { modelName: this.modelName, isHealthy: true, checkpointLoaded: true, avgLatencyMs: 2 };
  }

  public getCalibration(): ModelCalibration {
    return { expectedCalibrationError: 0, brierScore: 0, sampleCount: 0, lastCalibrated: 0 };
  }
}
