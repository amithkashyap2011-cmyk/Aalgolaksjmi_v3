/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Standard Model Expert Contract (Phase 2)
 * ═══════════════════════════════════════════════════════════════════
 */

import { Standardized15Features } from "../pipeline/FeaturePipeline.js";
import { AnyRegime } from "../regimeEngine.js";

export type ModelExpertStatus = "PRODUCTION" | "SHADOW" | "BENCHMARK" | "STANDBY" | "DISABLED";

export type InferenceMode = 
  | "REAL_MODEL"       // Genuine trained neural network execution (PyTorch / ONNX / FastAPI)
  | "SHADOW_MODEL"     // Shadow model evaluating live data without order execution authority
  | "BENCHMARK"        // Baseline reference benchmark model
  | "PROXY"            // Algorithmic / mathematical proxy (NOT a trained neural network)
  | "UNAVAILABLE";     // Model offline, checkpoint missing, or inference timed out

export interface ProbabilityDistribution {
  LONG: number;
  SHORT: number;
  HOLD: number;
}

export interface ModelExpertPrediction {
  modelName: string;
  modelVersion: string;
  architecture: string;
  inferenceMode: InferenceMode;
  direction: "LONG" | "SHORT" | "HOLD";
  probabilities: ProbabilityDistribution;
  confidence: number;            // 0.0 to 1.0
  probability: number;           // Probability of predicted direction
  uncertainty: number;          // 0.0 to 1.0 (epistemic/aleatoric combined)
  predictionInterval: [number, number]; // [lower, upper]
  expectedMovePercent?: number;  // Expected move magnitude
  latencyMs: number;
  status: ModelExpertStatus;
  regimeCompatibility: number;  // 0.0 to 1.0
  featureVersion: number;
  checkpointVersion?: string;
  isTrained: boolean;
  timestamp: number;
  error?: string;
}

export interface ModelHealth {
  modelName: string;
  isHealthy: boolean;
  checkpointLoaded: boolean;
  avgLatencyMs: number;
  lastInferenceTime?: number;
  errorMessage?: string;
}

export interface ModelCalibration {
  expectedCalibrationError: number;
  brierScore: number;
  sampleCount: number;
  lastCalibrated: number;
}

export interface IModelExpert {
  readonly modelName: string;
  readonly modelVersion: string;
  readonly architecture: string;
  readonly inputSchemaVersion: number;
  readonly inferenceMode: InferenceMode;
  readonly isTrained: boolean;
  status: ModelExpertStatus;
  readonly supportedRegimes: AnyRegime[];

  predict(features: Standardized15Features, activeRegime: AnyRegime): Promise<ModelExpertPrediction>;
  getHealth(): ModelHealth;
  getCalibration(): ModelCalibration;
}

export class ModelContractValidator {
  public static validate(pred: ModelExpertPrediction): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!pred.modelName) errors.push("Missing modelName");
    if (!pred.inferenceMode) errors.push("Missing inferenceMode");
    if (!["LONG", "SHORT", "HOLD"].includes(pred.direction)) errors.push(`Invalid direction: ${pred.direction}`);

    const probs = pred.probabilities;
    if (!probs || typeof probs.LONG !== "number" || typeof probs.SHORT !== "number" || typeof probs.HOLD !== "number") {
      errors.push("Invalid probabilities structure");
    } else {
      if (isNaN(probs.LONG) || isNaN(probs.SHORT) || isNaN(probs.HOLD)) errors.push("Probabilities contain NaN");
      if (!isFinite(probs.LONG) || !isFinite(probs.SHORT) || !isFinite(probs.HOLD)) errors.push("Probabilities contain Infinity");
      if (probs.LONG < 0 || probs.LONG > 1 || probs.SHORT < 0 || probs.SHORT > 1 || probs.HOLD < 0 || probs.HOLD > 1) {
        errors.push("Probabilities outside [0, 1] range");
      }
      const sum = probs.LONG + probs.SHORT + probs.HOLD;
      if (Math.abs(sum - 1.0) > 0.05) {
        errors.push(`Probabilities sum to ${sum.toFixed(4)}, expected ~1.0`);
      }
    }

    if (isNaN(pred.confidence) || pred.confidence < 0 || pred.confidence > 1) {
      errors.push(`Invalid confidence: ${pred.confidence}`);
    }

    if (isNaN(pred.uncertainty) || pred.uncertainty < 0 || pred.uncertainty > 1) {
      errors.push(`Invalid uncertainty: ${pred.uncertainty}`);
    }

    return { valid: errors.length === 0, errors };
  }
}
