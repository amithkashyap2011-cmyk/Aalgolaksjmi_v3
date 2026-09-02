/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Central Modern Model Registry (Phase 3)
 * ═══════════════════════════════════════════════════════════════════
 */

import { IModelExpert, ModelExpertPrediction } from "./IModelExpert.js";
import { MambaExpert } from "./experts/MambaExpert.js";
import { ModernTCNExpert } from "./experts/ModernTCNExpert.js";
import { iTransformerExpert } from "./experts/iTransformerExpert.js";
import { TimesNetExpert } from "./experts/TimesNetExpert.js";
import { PatchTSTExpert } from "./experts/PatchTSTExpert.js";
import { TSFMExpertAdapter } from "./experts/TSFMExpertAdapter.js";
import { BenchmarkCNNExpert } from "./experts/BenchmarkCNNExpert.js";
import { BenchmarkLSTMExpert } from "./experts/BenchmarkLSTMExpert.js";
import { Standardized15Features } from "../pipeline/FeaturePipeline.js";
import { AnyRegime } from "../regimeEngine.js";

export class ModernModelRegistry {
  private static experts = new Map<string, IModelExpert>();

  public static initialize(): void {
    if (this.experts.size > 0) return;

    // Production Experts
    this.register(new MambaExpert());
    this.register(new ModernTCNExpert());

    // Shadow / Next-Gen Experts
    this.register(new iTransformerExpert());
    this.register(new TimesNetExpert());
    this.register(new PatchTSTExpert());
    this.register(new TSFMExpertAdapter());

    // Benchmark / Legacy Reference Models
    this.register(new BenchmarkCNNExpert());
    this.register(new BenchmarkLSTMExpert());
  }

  public static register(expert: IModelExpert): void {
    this.experts.set(expert.modelName, expert);
  }

  public static getExpert(modelName: string): IModelExpert | undefined {
    this.initialize();
    return this.experts.get(modelName);
  }

  public static getAllExperts(): IModelExpert[] {
    this.initialize();
    return Array.from(this.experts.values());
  }

  public static getProductionExperts(): IModelExpert[] {
    this.initialize();
    return Array.from(this.experts.values()).filter(e => e.status === "PRODUCTION");
  }

  public static getShadowExperts(): IModelExpert[] {
    this.initialize();
    return Array.from(this.experts.values()).filter(e => e.status === "SHADOW");
  }

  /**
   * Runs inference across all active and shadow models in parallel.
   */
  public static async evaluateAll(features: Standardized15Features, activeRegime: AnyRegime): Promise<ModelExpertPrediction[]> {
    this.initialize();
    const experts = Array.from(this.experts.values()).filter(e => e.status !== "DISABLED");
    const settled = await Promise.allSettled(experts.map(e => e.predict(features, activeRegime)));

    const predictions: ModelExpertPrediction[] = [];
    settled.forEach((res, idx) => {
      if (res.status === "fulfilled") {
        predictions.push(res.value);
      } else {
        console.warn(`[ModernModelRegistry] Inference failed for ${experts[idx].modelName}:`, res.reason);
      }
    });

    return predictions;
  }
}
