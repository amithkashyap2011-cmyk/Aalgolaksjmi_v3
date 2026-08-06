/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Market Regime Engine
 * ═══════════════════════════════════════════════════════════════════
 */

import { weatherIntelligenceEngine } from "../weatherIntelligenceEngine.js";

export type RegimeState =
  | "TRENDING_BULL"
  | "TRENDING_BEAR"
  | "RANGING"
  | "HIGH_VOLATILITY"
  | "TRANSITION"
  | "WEATHER_STRESS";

export interface RegimeResponse {
  state: RegimeState;
  score: number;
  confidence: number;
}

export interface RegimeContext {
  adx: number;
  atr: number;
  atrTrailing: number; // Previous ATR for slope
  ema200: number;
  close: number;
  volume: number;
  volumeAvg: number;
  btcDominance: number;
  fundingRate: number;
}

export class RegimeEngine {
  /**
   * Classifies the current market regime based on institutional rules.
   */
  public static analyze(ctx: RegimeContext): RegimeResponse {
    let state: RegimeState = "RANGING";
    let score = 50;
    let confidence = 50;

    const isTrending = ctx.adx > 25;
    const isRanging = ctx.adx < 20;
    const isVolatile = ctx.atr > ctx.atrTrailing * 1.1; // 10% increase in ATR
    const isMomentum = ctx.volume > ctx.volumeAvg * 1.5;
    
    const priceAboveEma200 = ctx.close > ctx.ema200;
    const highFunding = Math.abs(ctx.fundingRate) > 0.0005;

    // 🛡️ Weather Influence (V1.0)
    const weatherAlpha = weatherIntelligenceEngine.getWeatherAlpha();

    // 1. Determine State
    if (weatherAlpha > 85) {
      state = "WEATHER_STRESS";
    } else if (isVolatile && highFunding) {
      state = "HIGH_VOLATILITY";
    } else if (isTrending) {
      state = priceAboveEma200 ? "TRENDING_BULL" : "TRENDING_BEAR";
    } else if (isRanging) {
      state = "RANGING";
    } else {
      state = "TRANSITION";
    }

    // 2. Calculate Scoring (0-100)
    // 0-30 Bear, 31-50 Weak, 51-70 Neutral, 71-85 Bull, 86-100 Strong Bull
    if (state === "TRENDING_BULL") {
       score = 70 + (ctx.adx - 25) + (isMomentum ? 10 : 0);
    } else if (state === "TRENDING_BEAR") {
       score = 30 - (ctx.adx - 25) - (isMomentum ? 10 : 0);
    } else if (state === "RANGING") {
       score = 50 + (priceAboveEma200 ? 5 : -5);
    } else if (state === "HIGH_VOLATILITY") {
       score = priceAboveEma200 ? 60 : 40;
    } else if (state === "WEATHER_STRESS") {
       score = 50; // Neutral but constrained
    }

    // 3. Confidence Calculation
    let conf = 40;
    if (isTrending && isMomentum) conf += 30;
    if (Math.abs(ctx.fundingRate) < 0.0002) conf += 20; // Stable funding = more confidence in trend
    if (ctx.btcDominance > 50) conf += 10; // High dominance = cleaner signals

    return {
      state,
      score: Math.min(100, Math.max(0, score)),
      confidence: Math.min(100, Math.max(0, conf))
    };
  }
}
