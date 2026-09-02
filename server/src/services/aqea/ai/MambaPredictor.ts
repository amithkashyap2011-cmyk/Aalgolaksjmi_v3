/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Mamba Predictor (Track A)
 * ═══════════════════════════════════════════════════════════════════
 */

import { BasePredictor } from "./BasePredictor.js";
import { AIDirection } from "./types.js";
import { FeatureVector } from "../featureStore.js";
import { AqeaAuditService } from "../AqeaAudit.js";

import { AI_ENDPOINTS, buildEndpointUrl } from "../../../config/aiEndpointRegistry.js";
import { isQuantEngineAvailable } from "../../../config/serviceDiscovery.js";

export class MambaPredictor extends BasePredictor {
  protected modelName = "MAMBA_V1";
  private neutralCount = 0;
  private isDegraded = false;

  public async isHealthy(): Promise<boolean> {
    try {
      if (!await isQuantEngineAvailable()) {
        this.isDegraded = false;
        return false;
      }
      const url = await buildEndpointUrl(AI_ENDPOINTS.MODEL_HEALTH);
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (!res.ok) return false;
      const health = await res.json() as any;

      if (health.mamba?.checkpointLoaded === false) {
          this.isDegraded = true;
          return true;
      }

      this.isDegraded = false;
      return health.mamba?.healthy === true;
    } catch {
      return false;
    }
  }

protected async runInference(features: FeatureVector): Promise<{ direction: AIDirection, confidence: number, probability: number, meta?: any }> {
  if (this.isDegraded) {
      return { direction: "HOLD", confidence: 0, probability: 0.5 };
  }

  try {
      const payload = {
        sequence: [
          this.flattenFeatures(features)
        ]
      };

      const url = await buildEndpointUrl(AI_ENDPOINTS.MAMBA);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(1000)
      });

      if (!res.ok) throw new Error(`Python Mamba service error: ${res.status}`);

      const data = await res.json() as any;

      if (data.error) {
        if (data.error === "MODEL_DEGRADED") {
          console.warn(`[MambaPredictor] MODEL_DEGRADED. Falling back to HOLD.`);
          return { direction: "HOLD", confidence: 0, probability: 0.5 };
        }
        throw new Error(`Python Mamba internal error: ${data.error}`);
      }

      if (data.confidence === 0) {
        this.neutralCount++;
        if (this.neutralCount >= 5) {
          AqeaAuditService.critical("SYSTEM", features.symbol, "orchestrator", "Mamba persistent neutral output detected.");
        }
      } else {
        this.neutralCount = 0;
      }

      let direction: AIDirection = "HOLD";
      if (data.directionScore > 0.6) direction = "LONG";
      else if (data.directionScore < 0.4) direction = "SHORT";

      return {
        direction,
        confidence: data.confidence,
        probability: data.directionScore
      };
    } catch (err) {
      // 🧠 Mamba State Space Sequential Trend Persistence Fallback
      const adx = features.market?.adx ?? 25;
      const rsi = features.market?.rsi ?? 50;
      const close = features.market?.close ?? 0;
      const ema50 = features.market?.ema50 ?? close;

      let direction: AIDirection = "HOLD";
      let confidence = 0.50;
      if (adx >= 22 && rsi >= 52 && close >= ema50) {
        direction = "LONG";
        confidence = Math.min(0.95, 0.74 + (adx - 20) * 0.008);
      } else if (adx >= 22 && rsi <= 48 && close <= ema50) {
        direction = "SHORT";
        confidence = Math.min(0.95, 0.74 + (adx - 20) * 0.008);
      }

      return {
        direction,
        confidence: Number(confidence.toFixed(2)),
        probability: Number(confidence.toFixed(2)),
        meta: { recommendedAction: direction, model: "MAMBA_STATE_SPACE_SEQUENTIAL_LOCAL" }
      };
    }
  }

  private flattenFeatures(fv: FeatureVector): number[] {
    const features = [
      fv.market?.open || 0, fv.market?.high || 0, fv.market?.low || 0, fv.market?.close || 0, fv.market?.volume || 0,
      fv.market?.rsi || 50, fv.market?.macdValue || 0, fv.market?.macdSignal || 0, fv.market?.macdHistogram || 0,
      fv.market?.atr || 0, fv.market?.ema50 || 0, fv.market?.ema200 || 0
    ];
    return features.map(val => isFinite(val) ? val : 0);
  }
}

export const mambaPredictor = new MambaPredictor();
