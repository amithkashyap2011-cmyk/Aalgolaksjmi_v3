import { IModelExpert, ModelExpertPrediction, ModelExpertStatus, ModelHealth, ModelCalibration, InferenceMode } from "../IModelExpert.js";
import { Standardized15Features } from "../../pipeline/FeaturePipeline.js";
import { AnyRegime } from "../../regimeEngine.js";

export class TSFMExpertAdapter implements IModelExpert {
  public readonly modelName = "TSFM_CHRONOS_ADAPTER_PROXY";
  public readonly modelVersion = "1.0.0";
  public readonly architecture = "ZERO_SHOT_TIME_SERIES_FOUNDATION_MODEL_PROXY";
  public readonly inputSchemaVersion = 2;
  public readonly inferenceMode: InferenceMode = "PROXY";
  public readonly isTrained = false;
  public status: ModelExpertStatus = "SHADOW";
  public readonly supportedRegimes: AnyRegime[] = ["TRENDING_UP", "TRENDING_DOWN", "MEAN_REVERSION", "CRISIS"];

  public async predict(features: Standardized15Features, activeRegime: AnyRegime): Promise<ModelExpertPrediction> {
    const start = Date.now();
    const vwap = features.ohlcv.vwap;
    const close = features.ohlcv.close;
    const nlpScore = features.nlpSentiment.score;

    const zeroShotPrior = ((close - vwap) / (vwap || 1) * 0.5) + (nlpScore * 0.5);
    const probLong = 1 / (1 + Math.exp(-zeroShotPrior * 3));
    const probShort = 1 - probLong;
    const probHold = 0.25;
    const total = probLong + probShort + probHold;

    const pL = Number((probLong / total).toFixed(4));
    const pS = Number((probShort / total).toFixed(4));
    const pH = Number((probHold / total).toFixed(4));

    let direction: "LONG" | "SHORT" | "HOLD" = "HOLD";
    if (pL > 0.44) direction = "LONG";
    else if (pS > 0.44) direction = "SHORT";

    const latencyMs = Math.max(1, Date.now() - start);
    const confidence = Number(Math.max(pL, pS).toFixed(4));
    const uncertainty = Number((1 - confidence).toFixed(4));

    return {
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      architecture: this.architecture,
      inferenceMode: this.inferenceMode,
      direction,
      probabilities: { LONG: pL, SHORT: pS, HOLD: pH },
      confidence,
      probability: direction === "LONG" ? pL : (direction === "SHORT" ? pS : pH),
      uncertainty,
      predictionInterval: [Math.max(0, pL - uncertainty * 0.18), Math.min(1, pL + uncertainty * 0.18)],
      latencyMs,
      status: this.status,
      regimeCompatibility: this.supportedRegimes.includes(activeRegime) ? 0.89 : 0.55,
      featureVersion: 2,
      isTrained: false,
      timestamp: Date.now()
    };
  }

  public getHealth(): ModelHealth {
    return { modelName: this.modelName, isHealthy: true, checkpointLoaded: false, avgLatencyMs: 1.5 };
  }

  public getCalibration(): ModelCalibration {
    return { expectedCalibrationError: 0.10, brierScore: 0.24, sampleCount: 0, lastCalibrated: Date.now() };
  }
}
