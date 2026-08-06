/*
 * ─── Model Registry Service ────────────────────────────────────
 *
 * Maintains model metadata, versioning, deployment status, and states
 * across all 10 core AI models.
 */

import { ModelRegistry, ModelState } from "../../models/ModelRegistry.js";

export const CORE_MODELS = [
  { modelName: "FinMamba-SSM", category: "DEEP_LEARNING", version: "v3.2.0" },
  { modelName: "Liquid-Neural-Net", category: "DIFFERENTIAL_NET", version: "v3.1.0" },
  { modelName: "Transformer-Attention", category: "ATTENTION", version: "v3.3.0" },
  { modelName: "CNN-Pattern-Vision", category: "PATTERN_RECOGNITION", version: "v3.0.0" },
  { modelName: "PPO-Reinforcement", category: "REINFORCEMENT", version: "v3.2.5" },
  { modelName: "OrderFlow-Engine", category: "MICROSTRUCTURE", version: "v3.4.0" },
  { modelName: "SmartMoney-Flow", category: "INSTITUTIONAL", version: "v3.1.2" },
  { modelName: "Lakshmi-Quant-Trend", category: "QUANT_TREND", version: "v4.0.0" },
  { modelName: "Gayatri-24Signal", category: "HARMONIC", version: "v3.0.1" },
  { modelName: "Ohmkara-Resonance", category: "FREQUENCY", version: "v3.0.0" },
];

export class ModelRegistryService {
  /**
   * Initializes or fetches all 10 models in the registry.
   */
  public static async ensureRegistryInitialized(): Promise<any[]> {
    const list = [];
    for (const m of CORE_MODELS) {
      let reg = await ModelRegistry.findOne({ modelName: m.modelName });
      if (!reg) {
        const isStandby = m.modelName === "Ohmkara-Resonance";
        reg = await ModelRegistry.create({
          modelName: m.modelName,
          category: m.category,
          version: m.version,
          currentWeight: isStandby ? 0.0 : 0.10,
          currentState: isStandby ? "STANDBY" : "ACTIVE",
          deployedAt: new Date(),
        });
      }
      list.push(reg);
    }
    return list;
  }

  public static async updateModelState(modelName: string, newState: ModelState): Promise<void> {
    await ModelRegistry.updateOne(
      { modelName },
      { $set: { currentState: newState, updatedAt: new Date() } }
    );
  }

  public static async updateModelWeight(modelName: string, weight: number): Promise<void> {
    await ModelRegistry.updateOne(
      { modelName },
      { $set: { currentWeight: weight, updatedAt: new Date() } }
    );
  }
}
