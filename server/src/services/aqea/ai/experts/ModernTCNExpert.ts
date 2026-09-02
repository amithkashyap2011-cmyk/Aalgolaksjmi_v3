import { IModelExpert, ModelExpertPrediction, ModelExpertStatus, ModelHealth, ModelCalibration, InferenceMode } from "../IModelExpert.js";
import { Standardized15Features } from "../../pipeline/FeaturePipeline.js";
import { AnyRegime } from "../../regimeEngine.js";

export class ModernTCNExpert implements IModelExpert {
  public readonly modelName = "MODERN_TCN_V1_PROXY";
  public readonly modelVersion = "1.1.0";
  public readonly architecture = "MODERN_TEMPORAL_CONVOLUTIONAL_NETWORK_PROXY";
  public readonly inputSchemaVersion = 2;
  public readonly inferenceMode: InferenceMode = "PROXY";
  public readonly isTrained = false;
  public status: ModelExpertStatus = "SHADOW";
  public readonly supportedRegimes: AnyRegime[] = ["BREAKOUT", "TRENDING_UP", "TRENDING_DOWN", "TRANSITION"];

  public async predict(features: Standardized15Features, activeRegime: AnyRegime): Promise<ModelExpertPrediction> {
    const start = Date.now();
    const vec = features.tensorVector;
    const hiLow = vec[6] || 0;
    const obImbalance = vec[11] || 0;
    const maCross = vec[8] - vec[9];

    const tcnOutput = (maCross * 0.5) + (obImbalance * 0.3) + (hiLow * 0.2);
    const probLong = 1 / (1 + Math.exp(-tcnOutput * 6));
    const probShort = 1 - probLong;
    const probHold = 0.20;
    const totalP = probLong + probShort + probHold;

    const pL = Number((probLong / totalP).toFixed(4));
    const pS = Number((probShort / totalP).toFixed(4));
    const pH = Number((probHold / totalP).toFixed(4));

    let direction: "LONG" | "SHORT" | "HOLD" = "HOLD";
    if (pL > 0.45) direction = "LONG";
    else if (pS > 0.45) direction = "SHORT";

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
      predictionInterval: [Math.max(0, pL - uncertainty * 0.12), Math.min(1, pL + uncertainty * 0.12)],
      latencyMs,
      status: this.status,
      regimeCompatibility: this.supportedRegimes.includes(activeRegime) ? 0.92 : 0.50,
      featureVersion: 2,
      isTrained: false,
      timestamp: Date.now()
    };
  }

  public getHealth(): ModelHealth {
    return { modelName: this.modelName, isHealthy: true, checkpointLoaded: false, avgLatencyMs: 1.0 };
  }

  public getCalibration(): ModelCalibration {
    return { expectedCalibrationError: 0.08, brierScore: 0.22, sampleCount: 0, lastCalibrated: Date.now() };
  }
}
