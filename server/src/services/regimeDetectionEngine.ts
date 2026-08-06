/*
 * ─── Market Regime Engine (V8.0) ──────────────────────
 *
 * Detects market states: Bull, Bear, Sideways, Breakout, etc.
 */

import { weatherIntelligenceEngine } from "./weatherIntelligenceEngine.js";

export type MarketRegime = 
  | "BULL_EXPANSION" 
  | "BEAR_CAPITULATION" 
  | "SIDEWAYS_ACCUMULATION" 
  | "BREAKOUT_IMMINENT" 
  | "TREND_EXHAUSTION" 
  | "VOLATILITY_SPIKE"
  | "WEATHER_STRESS_CRISIS";

export interface RegimeStatus {
  regime: MarketRegime;
  confidence: number;
  trendStrength: number;
  volatility: "LOW" | "NORMAL" | "HIGH" | "EXTREME";
}

export class RegimeDetectionEngine {
  public static detect(marketData: any): RegimeStatus {
    // 1. Weather Influence (V1.0)
    const weatherAlpha = weatherIntelligenceEngine.getWeatherAlpha();
    if (weatherAlpha > 90) {
      return {
        regime: "WEATHER_STRESS_CRISIS",
        confidence: 0.95,
        trendStrength: 0,
        volatility: "EXTREME"
      };
    }

    // Mock logic for V8.0 implementation
    const trend = marketData.trendStrength || 65;
    const vol = marketData.volatility || 0.12;

    let regime: MarketRegime = "SIDEWAYS_ACCUMULATION";
    let volatility: any = "NORMAL";

    if (vol > 0.5) volatility = "EXTREME";
    else if (vol > 0.3) volatility = "HIGH";
    else if (vol < 0.05) volatility = "LOW";

    if (trend > 75) regime = "BULL_EXPANSION";
    else if (trend < 25) regime = "BEAR_CAPITULATION";
    else if (vol > 0.4) regime = "VOLATILITY_SPIKE";

    return {
      regime,
      confidence: 0.82,
      trendStrength: trend,
      volatility
    };
  }
}
