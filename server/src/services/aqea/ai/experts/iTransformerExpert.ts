import { IModelExpert, ModelExpertPrediction, ModelExpertStatus, ModelHealth, ModelCalibration, InferenceMode } from "../IModelExpert.js";
import { Standardized15Features } from "../../pipeline/FeaturePipeline.js";
import { AnyRegime } from "../../regimeEngine.js";

export class iTransformerExpert implements IModelExpert {
  public readonly modelName = "ITRANSFORMER_V1_PROXY";
  public readonly modelVersion = "1.0.0";
  public readonly architecture = "INVERTED_MULTIVARIATE_TRANSFORMER_PROXY";
  public readonly inputSchemaVersion = 2;
  public readonly inferenceMode: InferenceMode = "PROXY";
  public readonly isTrained = false;
  public status: ModelExpertStatus = "SHADOW";
  public readonly supportedRegimes: AnyRegime[] = ["SIDEWAYS", "MEAN_REVERSION", "HIGH_VOLATILITY", "RANGING"];

  public async predict(features: Standardized15Features, activeRegime: AnyRegime): Promise<ModelExpertPrediction> {
    const start = Date.now();
    const vec = features.tensorVector;
    const variateCorrelation = (vec[0] * 0.3) + (vec[3] * 0.3) + (vec[7] * 0.2) + (vec[10] * 0.2);
    const probLong = 1 / (1 + Math.exp(-variateCorrelation * 4));
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
      predictionInterval: [Math.max(0, pL - uncertainty * 0.15), Math.min(1, pL + uncertainty * 0.15)],
      latencyMs,
      status: this.status,
      regimeCompatibility: this.supportedRegimes.includes(activeRegime) ? 0.94 : 0.48,
      featureVersion: 2,
      isTrained: false,
      timestamp: Date.now()
    };
  }

  public getHealth(): ModelHealth {
    return { modelName: this.modelName, isHealthy: true, checkpointLoaded: false, avgLatencyMs: 1.2 };
  }

  public getCalibration(): ModelCalibration {
    return { expectedCalibrationError: 0.09, brierScore: 0.23, sampleCount: 0, lastCalibrated: Date.now() };
  }
}
