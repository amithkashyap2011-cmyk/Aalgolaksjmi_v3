/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Not Available Predictor (Fallback Stub)
 * ═══════════════════════════════════════════════════════════════════
 */

import { BasePredictor } from "./BasePredictor.js";
import { AIDirection } from "./types.js";
import { FeatureVector } from "../featureStore.js";

export class NotAvailablePredictor extends BasePredictor {
  constructor(protected modelName: string) {
    super();
  }

  protected async runInference(features: FeatureVector): Promise<{ direction: AIDirection, confidence: number, probability: number }> {
    // Standard NOT_AVAILABLE response
    return {
      direction: "HOLD",
      confidence: 0,
      probability: 0.5
    };
  }

  protected isAvailable(): boolean {
    return false;
  }
}
