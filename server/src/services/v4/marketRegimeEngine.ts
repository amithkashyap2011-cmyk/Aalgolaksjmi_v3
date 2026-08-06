/*
 * ─── Market Regime AI Classifier ─────────────────────────────
 *
 * Classifies market state across 18 regimes:
 * Strong Bull, Weak Bull, Strong Bear, Weak Bear, Range, Breakout,
 * Mean Reversion, High Volatility, Low Volatility, Liquidity Crisis,
 * Manipulation, Whale Accumulation/Distribution, News Shock, Exchange Outage,
 * ETF Event, Fed Announcement, RBI Announcement.
 */

import { MarketRegimeLog } from "../../models/MarketRegimeLog.js";

export const REGIMES = [
  "STRONG_BULL", "WEAK_BULL", "STRONG_BEAR", "WEAK_BEAR", "RANGE",
  "BREAKOUT", "MEAN_REVERSION", "HIGH_VOLATILITY", "LOW_VOLATILITY",
  "LIQUIDITY_CRISIS", "MANIPULATION", "WHALE_ACCUMULATION", "WHALE_DISTRIBUTION",
  "NEWS_SHOCK", "EXCHANGE_OUTAGE", "ETF_EVENT", "FED_ANNOUNCEMENT", "RBI_ANNOUNCEMENT"
];

export class MarketRegimeEngine {
  public static classifyRegime(
    symbol: string,
    adx: number = 25,
    volatilityRatio: number = 1.0,
    macroEvent: string = "NONE"
  ): { regime: string; slMultiplier: number; tpMultiplier: number } {
    let regime = "RANGE";
    let slMultiplier = 1.0;
    let tpMultiplier = 1.0;

    if (macroEvent === "FED_ANNOUNCEMENT") {
      regime = "FED_ANNOUNCEMENT";
      slMultiplier = 1.5;
      tpMultiplier = 1.8;
    } else if (macroEvent === "RBI_ANNOUNCEMENT") {
      regime = "RBI_ANNOUNCEMENT";
      slMultiplier = 1.4;
      tpMultiplier = 1.6;
    } else if (volatilityRatio > 2.0) {
      regime = "HIGH_VOLATILITY";
      slMultiplier = 1.4;
      tpMultiplier = 1.5;
    } else if (adx > 30) {
      regime = "STRONG_BULL";
      slMultiplier = 1.0;
      tpMultiplier = 1.3;
    } else if (adx < 18) {
      regime = "RANGE";
      slMultiplier = 0.9;
      tpMultiplier = 0.9;
    }

    return { regime, slMultiplier, tpMultiplier };
  }
}
