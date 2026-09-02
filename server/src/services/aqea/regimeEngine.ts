/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — First-Class 8-State Institutional Regime Detector (Phase 2)
 * ═══════════════════════════════════════════════════════════════════
 */

import { weatherIntelligenceEngine } from "../weatherIntelligenceEngine.js";

export type LegacyRegimeState =
  | "TRENDING_BULL"
  | "TRENDING_BEAR"
  | "RANGING"
  | "TRANSITION"
  | "HIGH_VOLATILITY"
  | "WEATHER_STRESS";

export type InstitutionalRegime =
  | "TRENDING_UP"
  | "TRENDING_DOWN"
  | "SIDEWAYS"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "BREAKOUT"
  | "MEAN_REVERSION"
  | "CRISIS";

export type RegimeState = LegacyRegimeState;
export type AnyRegime = RegimeState | InstitutionalRegime;

export interface RegimeResponse {
  state: RegimeState;
  primaryRegime: InstitutionalRegime;
  score: number;
  confidence: number;
  volatilityIndex: number;
  trendStrength: number;
  recommendedExperts: string[];
  reasons: string[];
}

export interface RegimeContext {
  adx: number;
  atr: number;
  atrTrailing: number; // Previous ATR for slope
  ema200: number;
  close: number;
  volume: number;
  volumeAvg: number;
  btcDominance?: number;
  fundingRate?: number;
  marketBreadthRatio?: number;
  hasTier1Event?: boolean;
  bollingerBandwidth?: number;
  rsi?: number;
}

export class RegimeEngine {
  /**
   * Classifies the current market regime based on institutional rules.
   */
  public static analyze(ctx: RegimeContext): RegimeResponse {
    const reasons: string[] = [];
    const adx = Number(ctx.adx || 0);
    const atr = Number(ctx.atr || 0.01);
    const atrTrailing = Number(ctx.atrTrailing || (atr * 0.95));
    const close = Number(ctx.close || 1);
    const ema200 = Number(ctx.ema200 || close);
    const volume = Number(ctx.volume || 0);
    const volumeAvg = Math.max(1, Number(ctx.volumeAvg || volume || 1));
    const fundingRate = Number(ctx.fundingRate || 0);
    const btcDom = Number(ctx.btcDominance || 50);
    const bandwidth = Number(ctx.bollingerBandwidth || (atr * 4 / close));
    const rsi = Number(ctx.rsi || 50);
    const hasTier1 = Boolean(ctx.hasTier1Event);

    const isTrending = adx > 25;
    const isRanging = adx < 20;
    const isVolatile = atr > atrTrailing * 1.1; // 10% increase in ATR
    const isMomentum = volume > volumeAvg * 1.5;
    const priceAboveEma200 = close > ema200;
    const highFunding = Math.abs(fundingRate) > 0.0005;

    const weatherAlpha = weatherIntelligenceEngine.getWeatherAlpha();

    let state: RegimeState = "RANGING";
    let primaryRegime: InstitutionalRegime = "SIDEWAYS";
    let score = 50;
    let confidence = 50;
    let recommendedExperts: string[] = [];

    // 1. Determine State
    if (weatherAlpha > 85 || hasTier1) {
      state = "WEATHER_STRESS";
      primaryRegime = "CRISIS";
      recommendedExperts = ["FINANCIAL_NLP", "BAYESIAN_GATE", "TORTOISE", "DOG", "RISK_CONTROLLER"];
      reasons.push("CRISIS: Weather stress or Tier-1 macro event active");
    } else if (isVolatile && highFunding) {
      state = "HIGH_VOLATILITY";
      primaryRegime = "HIGH_VOLATILITY";
      recommendedExperts = ["MAMBA", "BI_LSTM", "ORDER_FLOW", "FOX", "DOG"];
      reasons.push("HIGH_VOLATILITY: Elevated volatility and funding pressure");
    } else if (isTrending) {
      state = priceAboveEma200 ? "TRENDING_BULL" : "TRENDING_BEAR";
      primaryRegime = priceAboveEma200 ? "TRENDING_UP" : "TRENDING_DOWN";
      recommendedExperts = ["MAMBA", "MODERN_TCN", "AARYAN", "EAGLE", "LION"];
      reasons.push(priceAboveEma200 ? "TRENDING_UP: Bullish trend" : "TRENDING_DOWN: Bearish trend");
    } else if (isRanging) {
      state = "RANGING";
      if (bandwidth < 0.02) {
        primaryRegime = "LOW_VOLATILITY";
        recommendedExperts = ["OHMKARA", "COW", "TORTOISE"];
      } else if (rsi < 35 || rsi > 65) {
        primaryRegime = "MEAN_REVERSION";
        recommendedExperts = ["AAYUSH", "OHMKARA", "OWL"];
      } else {
        primaryRegime = "SIDEWAYS";
        recommendedExperts = ["ORDER_FLOW", "SMC", "AAYUSH", "COW"];
      }
      reasons.push("RANGING: Sideways consolidation");
    } else {
      state = "TRANSITION";
      primaryRegime = isMomentum ? "BREAKOUT" : "MEAN_REVERSION";
      recommendedExperts = ["MODERN_TCN", "PATCH_TST", "SMC", "LIQUIDITY_SWEEP"];
      reasons.push("TRANSITION: Structural transition regime");
    }

    // 2. Calculate Scoring (0-100)
    if (state === "TRENDING_BULL") {
       score = 70 + (adx - 25) + (isMomentum ? 10 : 0);
    } else if (state === "TRENDING_BEAR") {
       score = 30 - (adx - 25) - (isMomentum ? 10 : 0);
    } else if (state === "RANGING") {
       score = 50 + (priceAboveEma200 ? 5 : -5);
    } else if (state === "HIGH_VOLATILITY") {
       score = priceAboveEma200 ? 60 : 40;
    } else if (state === "WEATHER_STRESS") {
       score = 50;
    } else if (state === "TRANSITION") {
       score = priceAboveEma200 ? 55 : 45;
    }

    // 3. Confidence Calculation
    let conf = 40;
    if (isTrending && isMomentum) conf += 30;
    if (Math.abs(fundingRate) < 0.0002) conf += 20;
    if (btcDom > 50) conf += 10;

    return {
      state,
      primaryRegime,
      score: Math.min(100, Math.max(0, Math.round(score))),
      confidence: Math.min(100, Math.max(0, Math.round(conf))),
      volatilityIndex: Number(((atr / close) * 100).toFixed(2)),
      trendStrength: Math.round(adx),
      recommendedExperts,
      reasons
    };
  }
}
