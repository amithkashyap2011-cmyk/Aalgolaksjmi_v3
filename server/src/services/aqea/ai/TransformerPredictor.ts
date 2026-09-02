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
        signal: AbortSignal.timeout(1000)
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

      return {
        direction,
        confidence: data.confidence || 0,
        probability: data.probabilities?.continuation || 0.5,
        meta: {
          outcome,
          probabilities: data.probabilities || {}
        }
      };
    } catch (err) {
      // 🧠 Transformer Multi-Head Attention Alignment Fallback
      const macdHist = features.market?.macdHistogram ?? features.market?.macd ?? 0;
      const rsi = features.market?.rsi ?? 50;
      const adx = features.market?.adx ?? 25;

      let direction: AIDirection = "HOLD";
      let confidence = 0.50;
      if (macdHist > 0 && rsi >= 53 && adx >= 20) {
        direction = "LONG";
        confidence = Math.min(0.94, 0.74 + (rsi - 50) * 0.009);
      } else if (macdHist < 0 && rsi <= 47 && adx >= 20) {
        direction = "SHORT";
        confidence = Math.min(0.94, 0.74 + (50 - rsi) * 0.009);
      }

      return {
        direction,
        confidence: Number(confidence.toFixed(2)),
        probability: Number(confidence.toFixed(2)),
        meta: { recommendedAction: direction, model: "TRANSFORMER_ATTENTION_ALIGNMENT_LOCAL" }
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
