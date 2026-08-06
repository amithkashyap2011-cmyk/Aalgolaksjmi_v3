/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — AI Predictor Interface
 * ═══════════════════════════════════════════════════════════════════
 */

import { AIPrediction, PredictorHealth } from "./types.js";
import { FeatureVector } from "../featureStore.js";

export interface IAIPredictor {
  /**
   * Generates a direction prediction based on input features.
   */
  predict(features: FeatureVector): Promise<AIPrediction>;

  /**
   * Returns a confidence score for the prediction logic.
   */
  confidence(features: FeatureVector): number;

  /**
   * Returns real-time health and telemetry for this predictor.
   */
  getHealth(): PredictorHealth;

  /**
   * Optional deep health check (network round-trip to quant engine).
   */
  isHealthy?(): Promise<boolean>;
}
