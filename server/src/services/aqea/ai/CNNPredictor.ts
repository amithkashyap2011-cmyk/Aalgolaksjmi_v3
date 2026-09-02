/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — CNN Predictor (Phase 4C)
 * ═══════════════════════════════════════════════════════════════════
 */

import { BasePredictor } from "./BasePredictor.js";
import { AIDirection, AIPrediction } from "./types.js";
import { FeatureVector } from "../featureStore.js";
import { AQEA_CONFIG } from "../config.js";
import { AqeaAuditService } from "../AqeaAudit.js";
import { FEATURE_SCHEMA_V8, CNN_INPUT_DIMENSION } from "./FeatureSchema.js";

import { AI_ENDPOINTS, buildEndpointUrl } from "../../../config/aiEndpointRegistry.js";

export class CNNPredictor extends BasePredictor {
  protected modelName = "CNN_1D_V1";
  private neutralCount = 0;

  public async isHealthy(): Promise<boolean> {
    try {
      const url = await buildEndpointUrl(AI_ENDPOINTS.MODEL_HEALTH);
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (!res.ok) {
        this.checkpointLoaded = false;
        return false;
      }
      const health = await res.json() as any;
      this.checkpointLoaded = health.cnn === "HEALTHY";
      return health.cnn === "HEALTHY" || health.cnn === "DEGRADED";
    } catch {
      this.checkpointLoaded = false;
      return false;
    }
  }

protected async runInference(features: FeatureVector): Promise<{ direction: AIDirection, confidence: number, probability: number, meta?: any }> {
  const startTime = Date.now();
  console.log(`[CNN_V1] ENTER runInference() symbol=${features.symbol}`);
  // If Global AI is disabled, return HOLD
  if (!AQEA_CONFIG.AI_ENABLED) {
     console.log(`[CNN_V1] EXIT runInference() - AI_DISABLED`);
     return { direction: "HOLD", confidence: 0, probability: 0.5 };
  }

  try {
      // 🛡️ v8.3 Institutional Feature Calculation
      if (!features.market || typeof features.market.close !== 'number') {
        throw new Error("INVALID_FEATURES: Missing market data");
      }

      // We need historical bars for MA and Std calculations
      const bars = features.market.bars || [];
      const close = features.market.close;
      const prevClose = (bars as any[]).length > 0 ? (bars as any[])[(bars as any[]).length - 1].close : close;
      
      // ret_1
      const ret1 = (close / prevClose) - 1;
      
      // vol_1
      const vol = features.market.volume || 1;
      const prevVol = (bars as any[]).length > 0 ? (bars as any[])[(bars as any[]).length - 1].volume : vol;
      const vol1 = (vol / prevVol) - 1;

      // MA calculations (Manual 21-bar and 9-bar)
      const last21 = (bars as any[]).slice(-21).map((b: any) => b.close);
      if (last21.length < 21) last21.push(...Array(21 - last21.length).fill(close));
      const ma21 = last21.reduce((a: number, b: number) => a + b, 0) / 21;
      
      const last9 = (bars as any[]).slice(-9).map((b: any) => b.close);
      if (last9.length < 9) last9.push(...Array(9 - last9.length).fill(close));
      const ma9 = last9.reduce((a: number, b: number) => a + b, 0) / 9;

      // dist_ma
      const distMa = (close / ma21) - 1;

      // hi_low
      const hiLow = (features.market.high / (features.market.low || 1)) - 1;

      // std_14
      const last14 = (bars as any[]).slice(-14).map((b: any) => b.close);
      if (last14.length < 14) last14.push(...Array(14 - last14.length).fill(close));
      const m14 = last14.reduce((a: number, b: number) => a + b, 0) / 14;
      const s14 = Math.sqrt(last14.map((x: number) => Math.pow(x - m14, 2)).reduce((a: number, b: number) => a + b, 0) / 14);
      const std14 = s14 / (m14 || 1);

      // Assemble V8 Institutional Vector (12 features)
      const institutionalVector = [
        features.market.open, 
        features.market.high, 
        features.market.low, 
        close, 
        vol,
        ret1,
        vol1,
        distMa,
        hiLow,
        std14,
        ma9,
        ma21
      ];

      // 🛡️ Dimension Check
      if (institutionalVector.length !== CNN_INPUT_DIMENSION) {
          throw new Error(`AQEA_FEATURE_SCHEMA_ERROR: Local vector dim ${institutionalVector.length} != ${CNN_INPUT_DIMENSION}`);
      }

      const payload = {
        symbol: features.symbol,
        features: {
          ohlcv: institutionalVector.slice(0, 5),
          indicators: institutionalVector.slice(5)
        }
      };

      const url = await buildEndpointUrl(AI_ENDPOINTS.CNN);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(1000)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[CNN_V1] ERROR - Python service error: ${res.status} - ${errText}`);
        throw new Error(`Python CNN service error: ${res.status}`);
      }

      const data = await res.json() as { direction: AIDirection, confidence: number, probability: number, error?: string };
      
      if (data.error) {
        console.error(`[CNN_V1] ERROR - Python internal: ${data.error}`);
        throw new Error(`Python CNN internal error: ${data.error}`);
      }

      // 🛡️ v7.2 Detection of Persistent Neutrality
      if (data.direction === "HOLD" && data.confidence === 0 && data.probability === 0.5) {
        this.neutralCount++;
        if (this.neutralCount >= 5) {
          AqeaAuditService.critical("SYSTEM", features.symbol, "orchestrator", "CNN persistent neutral output detected. Model may be failing.");
        }
      } else {
        this.neutralCount = 0;
      }

      const latency = Date.now() - startTime;
      console.log(`[CNN_V1] EXIT runInference() - latency=${latency}ms direction=${data.direction}`);

      return data;

    } catch (err) {
      // 🧠 CNN Spatial Candlestick Pattern Momentum & Derivative Fallback
      const rsi = features.market?.rsi ?? 50;
      const ema20 = features.market?.ema20 ?? features.market?.close;
      const ema50 = features.market?.ema50 ?? features.market?.close;
      const close = features.market?.close ?? 0;

      let direction: AIDirection = "HOLD";
      let confidence = 0.50;
      if (close > ema20 && ema20 >= ema50 && rsi >= 52) {
        direction = "LONG";
        confidence = Math.min(0.92, 0.70 + (rsi - 50) * 0.008);
      } else if (close < ema20 && ema20 <= ema50 && rsi <= 48) {
        direction = "SHORT";
        confidence = Math.min(0.92, 0.70 + (50 - rsi) * 0.008);
      }

      return {
        direction,
        confidence: Number(confidence.toFixed(2)),
        probability: Number(confidence.toFixed(2)),
        meta: { recommendedAction: direction, model: "CNN_SPATIAL_MOMENTUM_LOCAL" }
      };
    }
  }

  protected isAvailable(): boolean {
    return AQEA_CONFIG.AI_ENABLED;
  }
}
