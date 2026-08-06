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

export class LSTMPredictor extends BasePredictor {
  protected modelName = "LSTM_SEQUENCE_V1";
  private neutralCount = 0;

  public async isHealthy(): Promise<boolean> {
    try {
      const url = await buildEndpointUrl(AI_ENDPOINTS.MODEL_HEALTH);
      const res = await fetch(url);
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

  protected async runInference(features: FeatureVector): Promise<{ direction: AIDirection; confidence: number; probability: number; meta?: any }> {
    const startTime = Date.now();
    if (!AQEA_CONFIG.AI_ENABLED) {
      return { direction: "HOLD", confidence: 0, probability: 0.5 };
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
      });

      if (!res.ok) {
        throw new Error(`Python LSTM service error: ${res.status}`);
      }

      const data = (await res.json()) as { direction: AIDirection; confidence: number; probability: number; error?: string };
      if (data.error) throw new Error(data.error);

      const latency = Date.now() - startTime;
      console.log(`[LSTM_V1] EXIT runInference() - latency=${latency}ms direction=${data.direction}`);
      return data;
    } catch (err) {
      // Local fallback calculation
      const rsi = features.market?.rsi ?? 50;
      const ema20 = features.market?.ema20 ?? features.market?.close;
      const close = features.market?.close ?? 0;

      let direction: AIDirection = "HOLD";
      let confidence = 0.5;
      if (close > ema20 && rsi >= 53) {
        direction = "LONG";
        confidence = Math.min(0.9, 0.68 + (rsi - 50) * 0.009);
      } else if (close < ema20 && rsi <= 47) {
        direction = "SHORT";
        confidence = Math.min(0.9, 0.68 + (50 - rsi) * 0.009);
      }

      return {
        direction,
        confidence: Number(confidence.toFixed(2)),
        probability: Number(confidence.toFixed(2)),
        meta: { recommendedAction: direction, model: "LSTM_SEQUENCE_LOCAL" },
      };
    }
  }

  protected isAvailable(): boolean {
    return AQEA_CONFIG.AI_ENABLED;
  }
}
