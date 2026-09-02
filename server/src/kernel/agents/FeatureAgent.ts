/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — FEATURE AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Computes, normalizes, and validates canonical 15-feature standard vectors.
 */

import { BaseAgent } from "./BaseAgent.js";
import { ToolCapability, IAgentObservation, IAgentObservationResult } from "../types.js";

export class FeatureAgent extends BaseAgent {
  public readonly id = "FeatureAgent";
  public readonly name = "Feature Pipeline Specialist Agent";
  public readonly version = "3.0.0";
  public readonly capabilities: ToolCapability[] = ["COMPUTE_FEATURES"];

  protected override async onObserve(input: IAgentObservation): Promise<IAgentObservationResult> {
    const data = input.data || {};
    const features = data.features;
    const isValid = Boolean(features && typeof features === "object" && typeof features.rsi14 === "number");

    return {
      valid: isValid,
      metrics: {
        featureCount: features ? Object.keys(features).length : 0,
        rsi: features?.rsi14,
        adx: features?.adx14,
      },
    };
  }
}
