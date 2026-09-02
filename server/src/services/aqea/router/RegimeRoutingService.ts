/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.2B — Regime Routing Service (Shadow)
 * ═══════════════════════════════════════════════════════════════════
 */

import { RegimeState } from "../regimeEngine.js";
import { PredictorRegistry } from "../ai/PredictorRegistry.js";
import { AIPrediction, PredictorType } from "../ai/types.js";
import { FeatureVector } from "../featureStore.js";

export interface RoutingResult {
  activeModel: PredictorType | "NOT_AVAILABLE";
  reason: string;
  confidence: number;
  prediction: string;
  meta?: any;
}

export class RegimeRoutingService {
  /**
   * Routes using already-evaluated predictions in 0ms.
   */
  public static routeFromPredictions(regime: RegimeState, predictions: AIPrediction[]): RoutingResult {
    const preferredModel = this.getModelForRegime(regime);
    const activeModel = this.selectHealthyModel(preferredModel);

    if (activeModel === "NOT_AVAILABLE") {
      return {
        activeModel: "NOT_AVAILABLE",
        reason: "ALL_MODELS_UNAVAILABLE",
        confidence: 0,
        prediction: "HOLD",
        meta: { regime }
      };
    }

    const result = predictions.find(p => p.predictor === activeModel || p.predictor.startsWith(activeModel));
    if (!result) {
      return {
        activeModel,
        reason: "PREDICTOR_RESULT_NOT_FOUND",
        confidence: 0,
        prediction: "HOLD",
        meta: { regime }
      };
    }

    if (result.confidence <= 0) {
      return {
        activeModel,
        reason: `CONFIDENCE_TOO_LOW_${result.confidence}`,
        confidence: result.confidence,
        prediction: "HOLD",
        meta: {
          latencyMs: (result as any).latencyMs || 0,
          regime,
          predictorName: result.predictor,
          gated: true
        }
      };
    }

    return {
      activeModel,
      reason: activeModel === preferredModel ? `REGIME_${regime}` : `FAILOVER_${preferredModel}_TO_${activeModel}`,
      confidence: result.confidence,
      prediction: result.direction,
      meta: {
        latencyMs: (result as any).latencyMs || 0,
        regime,
        predictorName: result.predictor
      }
    };
  }

  /**
   * Routes to the optimal model based on the current regime.
   */
  public static async route(regime: RegimeState, features: FeatureVector): Promise<RoutingResult> {
    const preferredModel = this.getModelForRegime(regime);
    const activeModel = this.selectHealthyModel(preferredModel);

    if (activeModel === "NOT_AVAILABLE") {
      return {
        activeModel: "NOT_AVAILABLE",
        reason: "ALL_MODELS_UNAVAILABLE",
        confidence: 0,
        prediction: "HOLD",
        meta: { regime }
      };
    }

    const predictor = PredictorRegistry.getPredictor(activeModel);
    if (!predictor) {
      return {
        activeModel: "NOT_AVAILABLE",
        reason: "PREDICTOR_NOT_FOUND",
        confidence: 0,
        prediction: "HOLD",
        meta: { regime }
      };
    }

    const startTime = Date.now();
    const result = await predictor.predict(features);
    const latencyMs = Date.now() - startTime;

    // Phase 4: Apply Confidence Gate
    if (result.confidence <= 0) {
      return {
        activeModel,
        reason: `CONFIDENCE_TOO_LOW_${result.confidence}`,
        confidence: result.confidence,
        prediction: "HOLD",
        meta: {
          latencyMs,
          regime,
          predictorName: result.predictor,
          gated: true
        }
      };
    }

    return {
      activeModel,
      reason: activeModel === preferredModel ? `REGIME_${regime}` : `FAILOVER_${preferredModel}_TO_${activeModel}`,
      confidence: result.confidence,
      prediction: result.direction,
      meta: {
        latencyMs,
        regime,
        predictorName: result.predictor
      }
    };
  }

  /**
   * Selection Logic (Phase 1 Requirements)
   */
  private static getModelForRegime(regime: RegimeState): PredictorType {
    switch (regime) {
      case "TRENDING_BULL":
      case "TRENDING_BEAR":
        return "CNN";

      case "RANGING":
        return "MAMBA";

      case "TRANSITION":
      case "HIGH_VOLATILITY":
        return "TRANSFORMER";

      default:
        return "CNN"; // Default fallback
    }
  }

  private static lastWarnKey: string | null = null;

  /**
   * Ensures the selected model is available and healthy.
   * Fallback order: CNN → PPO → Transformer
   */
  private static selectHealthyModel(preferred: PredictorType): PredictorType | "NOT_AVAILABLE" {
    const fallbackOrder: PredictorType[] = ["CNN", "PPO", "TRANSFORMER"];

    const isHealthy = (model: PredictorType) => {
      const predictor = PredictorRegistry.getPredictor(model);
      if (!predictor) return false;
      const health = predictor.getHealth();
      return health.available === true;
    };

    if (isHealthy(preferred)) {
      this.lastWarnKey = null;
      return preferred;
    }

    for (const model of fallbackOrder) {
      if (isHealthy(model)) {
        if (process.env.NODE_ENV !== "test") {
          const warnKey = `${preferred}->${model}`;
          if (this.lastWarnKey !== warnKey) {
            console.warn(`[ROUTER_FAILOVER] ${preferred} unhealthy. Routing to ${model}.`);
            this.lastWarnKey = warnKey;
          }
        }
        return model;
      }
    }

    return "NOT_AVAILABLE";
  }
}

