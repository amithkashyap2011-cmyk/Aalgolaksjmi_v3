/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Transformer Predictor (Track B)
 * ═══════════════════════════════════════════════════════════════════
 */

import { BasePredictor } from "./BasePredictor.js";
import { AIDirection } from "./types.js";
import { FeatureVector } from "../featureStore.js";
import { AqeaAuditService } from "../AqeaAudit.js";

import { AI_ENDPOINTS, buildEndpointUrl } from "../../../config/aiEndpointRegistry.js";
import { isQuantEngineAvailable } from "../../../config/serviceDiscovery.js";

export class TransformerPredictor extends BasePredictor {
  protected modelName = "TRANSFORMER_MICRO_V1";
  private neutralCount = 0;
  private static transformerCache = new Map<string, { expiresAt: number; result: any }>();

  public async isHealthy(): Promise<boolean> {
    try {
      if (!await isQuantEngineAvailable()) {
        return false;
      }
      const url = await buildEndpointUrl(AI_ENDPOINTS.MODEL_HEALTH);
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (!res.ok) return false;
      const health = await res.json() as any;
      return health.transformer?.healthy === true;
    } catch {
      return false;
    }
  }

protected async runInference(features: FeatureVector): Promise<{ direction: AIDirection, confidence: number, probability: number, meta?: any }> {
  const cacheKey = `${features.symbol}:${features.market?.close || 0}:${features.regime?.state || "UNKNOWN"}`;
  const cached = TransformerPredictor.transformerCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt && process.env.NODE_ENV !== "test") {
    return cached.result;
  }

  try {
      const payload = {
        data: [
          this.flattenFeatures(features)
        ],
        regime: features.regime?.state || "UNKNOWN",
        context: "microstructure_validation"
      };

      const url = await buildEndpointUrl(AI_ENDPOINTS.TRANSFORMER);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000)
      });

      if (!res.ok) throw new Error(`Python Transformer service error: ${res.status}`);

      const data = await res.json() as any;

      if (data.error) {
        if (data.error === "MODEL_DEGRADED") {
          console.warn(`[TransformerPredictor] MODEL_DEGRADED. Falling back to HOLD.`);
          return { direction: "HOLD", confidence: 0, probability: 0.5 };
        }
        throw new Error(`Python Transformer internal error: ${data.error}`);
      }

      const outcome = data.outcome || "UNKNOWN";
      let direction: AIDirection = "HOLD";
      if (outcome === "CONTINUATION") direction = "LONG";
      else if (outcome === "EXHAUSTION") direction = "SHORT";
      else if (outcome === "TRAP") {
        // TRAP (transformerPredictor.py:55,90) is a generic liquidity-trap
        // class with no directional sub-type of its own — the model never
        // says "bull trap" vs "bear trap". Previously this fell through to
        // the HOLD default, silently discarding every confident TRAP call
        // (observed live: outcome=TRAP, confidence=0.97 → HOLD). A trap
        // implies the CURRENT trend is a fake-out about to reverse, so the
        // regime this same request already reports (line 36, `regime`) is
        // what turns a generic TRAP into a direction: bullish regime → the
        // "up" move is the trap → expect a reversal down (SHORT), bearish
        // regime → expect a reversal up (LONG). RANGING/UNKNOWN regime has
        // no trend to be trapped out of, so there's nothing to reverse —
        // stays HOLD rather than guessing.
        const regime = features.regime?.state;
        if (regime === "TRENDING_BULL") direction = "SHORT";
        else if (regime === "TRENDING_BEAR") direction = "LONG";
      }

      const result = {
        direction,
        confidence: data.confidence || 0,
        probability: data.probabilities?.continuation || 0.5,
        meta: {
          outcome,
          probabilities: data.probabilities || {}
        }
      };

      if (TransformerPredictor.transformerCache.size > 200) TransformerPredictor.transformerCache.clear();
      TransformerPredictor.transformerCache.set(cacheKey, { expiresAt: Date.now() + 30_000, result });

      return result;
    } catch (err) {
      // No fabricated vote. This used to synthesize LONG/SHORT from RSI/MACD at
      // 0.74–0.94 "confidence" and report it as the Transformer's prediction —
      // a momentum-chasing signal (the pattern the RSI entry guard now blocks)
      // indistinguishable from the real model in votes and graded telemetry.
      return {
        direction: "HOLD" as AIDirection,
        confidence: 0,
        probability: 0.5,
        meta: { fallback: true, reason: (err as Error)?.message, model: "TRANSFORMER_MICRO_V1_UNAVAILABLE" },
      };
    }
  }

  private flattenFeatures(fv: FeatureVector): number[] {
    const features = [
      fv.market?.open || 0, fv.market?.high || 0, fv.market?.low || 0, fv.market?.close || 0, fv.market?.volume || 0,
      fv.orderFlow?.fundingRate || 0, fv.orderFlow?.liquidationScore || 0, fv.regime?.score || 0, fv.orderFlow?.oiExpansion || 0, fv.market?.close || 0,
      fv.orderFlow?.cvd || 0, fv.orderFlow?.delta || 0, 0, 0,
      0, 0, 0, 0, 1, 50 // Padding to 20
    ];
    return features.map(val => isFinite(val) ? val : 0);
  }
}

export const transformerPredictor = new TransformerPredictor();
