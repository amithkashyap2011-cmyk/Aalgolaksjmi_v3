/*
 * ─── Trade Quality Engine (V8.0) ──────────────────────
 *
 * Scores trades from 0-100 based on multi-factor analysis.
 * - Trend Strength
 * - RSI / VWAP / Volume
 * - Funding / Open Interest
 * - Sentiment / Whale Activity
 * - ATR / Liquidity
 * - AI Confidence
 */

import { weatherIntelligenceEngine } from "./weatherIntelligenceEngine.js";

export interface TradeQualityScore {
  score: number; // 0-100
  rating: "REJECT" | "SMALL" | "NORMAL" | "AGGRESSIVE";
  factors: Record<string, number | string>;
}

export class TradeQualityEngine {
  public static calculateScore(context: any): TradeQualityScore {
    let score = 0;
    const factors: any = {};

    // 1. Trend Factor (0-20)
    const trendStrength = context.trendStrength || 50;
    factors.trend = trendStrength;
    score += (trendStrength / 100) * 20;

    // 2. AI Confidence Factor (0-30)
    const confidence = context.confidence || 0.5;
    factors.confidence = confidence;
    score += confidence * 30;

    // 3. Volatility/ATR Factor (0-10)
    const atrStatus = context.atrStatus || "STABLE";
    factors.volatility = atrStatus;
    score += atrStatus === "STABLE" ? 10 : 5;

    // 4. Sentiment/Whale Factor (0-20)
    const whaleScore = context.whaleScore || 0.5;
    factors.whale = whaleScore;
    score += whaleScore * 20;

    // 5. Technical Factor (RSI/VWAP) (0-20)
    const rsi = context.rsi || 50;
    factors.rsi = rsi;
    const rsiScore = (rsi > 40 && rsi < 60) ? 20 : 10;
    score += rsiScore;

    // 6. Weather Intelligence Adjustment (V1.0)
    const weatherAlpha = weatherIntelligenceEngine.getWeatherAlpha();
    if (weatherAlpha > 70) {
      const penalty = (weatherAlpha - 70) * 0.5;
      score -= penalty;
      factors.weatherPenalty = penalty.toFixed(1);
    }

    // Final Normalization
    score = Math.min(100, Math.max(0, score));

    let rating: any = "REJECT";
    if (score >= 85) rating = "AGGRESSIVE";
    else if (score >= 70) rating = "NORMAL";
    else if (score >= 50) rating = "SMALL";

    return { score: Math.round(score), rating, factors };
  }
}
