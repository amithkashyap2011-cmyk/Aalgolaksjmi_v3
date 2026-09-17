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
    // BUGFIX(regime-vol-scale): `volatility` is a FRACTIONAL ATR/price ratio (ATR ÷ close),
    // not a percent. Typical crypto: ~0.005 (0.5%) calm · ~0.02 (2%) elevated · ~0.04+ (4%+)
    // spike. The old thresholds (0.05/0.3/0.4/0.5) belonged to a different, larger domain
    // that this input never reaches, so every reading collapsed to LOW and VOLATILITY_SPIKE
    // (needed vol>0.4) was unreachable. Bands are re-scaled to the ATR/price domain so all
    // four states are reachable:
    //   LOW     : < 0.8%     (very calm)
    //   NORMAL  : 0.8% – 2%  (typical)
    //   HIGH    : 2% – 3.5%
    //   EXTREME : >= 3.5%
    const vol = marketData.volatility || 0.01;

    let regime: MarketRegime = "SIDEWAYS_ACCUMULATION";
    let volatility: RegimeStatus["volatility"] = "NORMAL";

    if (vol >= 0.035) volatility = "EXTREME";
    else if (vol >= 0.02) volatility = "HIGH";
    else if (vol < 0.008) volatility = "LOW";

    if (trend > 75) regime = "BULL_EXPANSION";
    else if (trend < 25) regime = "BEAR_CAPITULATION";
    else if (vol > 0.03) regime = "VOLATILITY_SPIKE"; // 3%+ ATR/price with no clear directional trend

    return {
      regime,
      confidence: 0.82,
      trendStrength: trend,
      volatility
    };
  }
}
