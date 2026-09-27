/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Bi-Directional LSTM Predictor
 * ═══════════════════════════════════════════════════════════════════
 *  Bi-Directional LSTM sequence predictor for continuous price/volume
 *  momentum memory and trend breakout validation.
 */

import { BasePredictor } from "./BasePredictor.js";
import { AIDirection } from "./types.js";
import { FeatureVector } from "../featureStore.js";
import { AQEA_CONFIG } from "../config.js";
import { AI_ENDPOINTS, buildEndpointUrl } from "../../../config/aiEndpointRegistry.js";
import { isQuantEngineAvailable } from "../../../config/serviceDiscovery.js";

export class LSTMPredictor extends BasePredictor {
  protected modelName = "LSTM_SEQUENCE_V1";
  private neutralCount = 0;

  public async isHealthy(): Promise<boolean> {
    try {
      if (!await isQuantEngineAvailable()) {
        this.checkpointLoaded = false;
        return false;
      }
      const url = await buildEndpointUrl(AI_ENDPOINTS.MODEL_HEALTH);
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (!res.ok) {
        this.checkpointLoaded = false;
        return false;
      }
      const health = (await res.json()) as any;
      this.checkpointLoaded = health.lstm === "HEALTHY" || health.lstm === "DEGRADED" || health.cnn === "HEALTHY";
      return true;
    } catch {
      this.checkpointLoaded = false;
      return false;
    }
  }

  private static lstmCache = new Map<string, { expiresAt: number; result: { direction: AIDirection; confidence: number; probability: number; meta?: any } }>();

  protected async runInference(features: FeatureVector): Promise<{ direction: AIDirection; confidence: number; probability: number; meta?: any }> {
    const startTime = Date.now();
    if (!AQEA_CONFIG.AI_ENABLED) {
      return { direction: "HOLD", confidence: 0, probability: 0.5 };
    }

    const cacheKey = `${features.symbol}:${features.market?.close || 0}`;
    const cached = LSTMPredictor.lstmCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt && process.env.NODE_ENV !== "test") {
      return cached.result;
    }

    try {
      if (!features.market || typeof features.market.close !== "number") {
        throw new Error("INVALID_FEATURES: Missing market data");
      }

      const bars = features.market.bars || [];
      const close = features.market.close;
      const prevClose = (bars as any[]).length > 0 ? (bars as any[])[(bars as any[]).length - 1].close : close;
      const ret1 = close / prevClose - 1;
      const vol = features.market.volume || 1;
      const prevVol = (bars as any[]).length > 0 ? (bars as any[])[(bars as any[]).length - 1].volume : vol;
      const vol1 = vol / prevVol - 1;

      const last21 = (bars as any[]).slice(-21).map((b: any) => b.close);
      if (last21.length < 21) last21.push(...Array(21 - last21.length).fill(close));
      const ma21 = last21.reduce((a: number, b: number) => a + b, 0) / 21;

      const last9 = (bars as any[]).slice(-9).map((b: any) => b.close);
      if (last9.length < 9) last9.push(...Array(9 - last9.length).fill(close));
      const ma9 = last9.reduce((a: number, b: number) => a + b, 0) / 9;

      const distMa = close / ma21 - 1;
      const hiLow = features.market.high / (features.market.low || 1) - 1;

      const last14 = (bars as any[]).slice(-14).map((b: any) => b.close);
      if (last14.length < 14) last14.push(...Array(14 - last14.length).fill(close));
      const m14 = last14.reduce((a: number, b: number) => a + b, 0) / 14;
      const s14 = Math.sqrt(last14.map((x: number) => Math.pow(x - m14, 2)).reduce((a: number, b: number) => a + b, 0) / 14);
      const std14 = s14 / (m14 || 1);

      const vector = [
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
        ma21,
      ];

      const payload = {
        symbol: features.symbol,
        features: vector,
      };

      const url = await buildEndpointUrl(AI_ENDPOINTS.LSTM);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        throw new Error(`Python LSTM service error: ${res.status}`);
      }

      const data = (await res.json()) as { direction: AIDirection; confidence: number; probability: number; error?: string };
      if (data.error) throw new Error(data.error);

      const latency = Date.now() - startTime;
      console.log(`[LSTM_V1] EXIT runInference() - latency=${latency}ms direction=${data.direction}`);

      if (LSTMPredictor.lstmCache.size > 200) LSTMPredictor.lstmCache.clear();
      LSTMPredictor.lstmCache.set(cacheKey, { expiresAt: Date.now() + 30_000, result: data });

      return data;
    } catch (err) {
      // No fabricated vote (see TransformerPredictor): the old fallback
      // synthesized an RSI-momentum LONG/SHORT at 0.68–0.90 "confidence" and
      // reported it as the LSTM's. Also covers the v2 model's
      // "LSTM_V2_NOT_TRAINED" / window-fetch errors from the quant engine.
      return {
        direction: "HOLD" as AIDirection,
        confidence: 0,
        probability: 0.5,
        meta: { fallback: true, reason: (err as Error)?.message, model: "LSTM_SEQUENCE_V1_UNAVAILABLE" },
      };
    }
  }

  protected isAvailable(): boolean {
    return AQEA_CONFIG.AI_ENABLED;
  }
}
