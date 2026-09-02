/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — MODEL AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Orchestrates Deep Learning & Reinforcement Learning models:
 * CNN, LSTM, Transformer, Mamba, PPO.
 */

import { BaseAgent } from "./BaseAgent.js";
import { ToolCapability, IAgentObservation, IAgentObservationResult } from "../types.js";
import { ModernModelRegistry } from "../../services/aqea/ai/ModernModelRegistry.js";

export class ModelAgent extends BaseAgent {
  public readonly id = "ModelAgent";
  public readonly name = "AI/ML Model Specialist Agent";
  public readonly version = "3.0.0";
  public readonly capabilities: ToolCapability[] = ["RUN_MODEL"];

  protected override async onObserve(input: IAgentObservation): Promise<IAgentObservationResult> {
    const symbol = input.symbol || "BTCUSDT";
    const experts = ModernModelRegistry.getAllExperts();

    return {
      valid: experts.length > 0,
      metrics: {
        activeModelCount: experts.length,
        models: experts.map((m) => ({ name: m.modelName, status: m.status })),
      },
    };
  }
}
