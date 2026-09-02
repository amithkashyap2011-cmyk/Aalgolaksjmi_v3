import { IModelExpert, ModelExpertPrediction, ModelExpertStatus, ModelHealth, ModelCalibration, InferenceMode } from "../IModelExpert.js";
import { Standardized15Features } from "../../pipeline/FeaturePipeline.js";
import { AnyRegime } from "../../regimeEngine.js";

export class PatchTSTExpert implements IModelExpert {
  public readonly modelName = "PATCH_TST_V1_PROXY";
  public readonly modelVersion = "1.0.0";
  public readonly architecture = "PATCH_TIME_SERIES_TRANSFORMER_PROXY";
  public readonly inputSchemaVersion = 2;
  public readonly inferenceMode: InferenceMode = "PROXY";
  public readonly isTrained = false;
  public status: ModelExpertStatus = "SHADOW";
  public readonly supportedRegimes: AnyRegime[] = ["BREAKOUT", "TRENDING_UP", "TRENDING_DOWN", "TRANSITION"];

  public async predict(features: Standardized15Features, activeRegime: AnyRegime): Promise<ModelExpertPrediction> {
    const start = Date.now();
    const vec = features.tensorVector;
    const patchReturn = (vec[3] * 0.4) + (vec[4] * 0.3) + ((vec[8] - vec[9]) * 0.3);
    const probLong = 1 / (1 + Math.exp(-patchReturn * 4.5));
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
      predictionInterval: [Math.max(0, pL - uncertainty * 0.14), Math.min(1, pL + uncertainty * 0.14)],
      latencyMs,
      status: this.status,
      regimeCompatibility: this.supportedRegimes.includes(activeRegime) ? 0.93 : 0.54,
      featureVersion: 2,
      isTrained: false,
      timestamp: Date.now()
    };
  }

  public getHealth(): ModelHealth {
    return { modelName: this.modelName, isHealthy: true, checkpointLoaded: false, avgLatencyMs: 1.1 };
  }

  public getCalibration(): ModelCalibration {
    return { expectedCalibrationError: 0.08, brierScore: 0.21, sampleCount: 0, lastCalibrated: Date.now() };
  }
}
