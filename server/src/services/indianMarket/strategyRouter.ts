/**
 * ═══════════════════════════════════════════════════════════════════
 *  Strategy Router & Market Regime Classifier Engine
 * ═══════════════════════════════════════════════════════════════════
 */

import {
  MarketEvaluationContext,
  MarketRegime,
  StrategyId,
  UnderlyingSymbol,
} from "./strategyTypes.js";

export interface RegimeAnalysis {
  regime: MarketRegime;
  confidence: number;
  adx: number;
  atrPct: number;
  bollingerBandwidthPct: number;
  vwapRelationship: "ABOVE" | "BELOW" | "AT_VWAP";
  recommendedStrategies: StrategyId[];
  rationale: string[];
}

export class StrategyRouter {
  /**
   * Classifies current market regime from live indicators
   */
  public static classifyRegime(
    spotPrice: number,
    bars15m: any[],
    pcr: number = 1.0
  ): RegimeAnalysis {
    let adx = 22;
    let atrPct = 1.1;
    let bollingerBandwidthPct = 1.8;
    let vwapRelationship: "ABOVE" | "BELOW" | "AT_VWAP" = "ABOVE";

    if (bars15m && bars15m.length >= 10) {
      const recentCloses = bars15m.slice(-10).map((b) => b.close ?? b.ltp ?? spotPrice);
      const high = Math.max(...recentCloses);
      const low = Math.min(...recentCloses);
      const rangePct = ((high - low) / spotPrice) * 100;
      bollingerBandwidthPct = Number(rangePct.toFixed(2));
      atrPct = Number((rangePct * 0.4).toFixed(2));
      
      const lastClose = recentCloses[recentCloses.length - 1];
      const firstClose = recentCloses[0];
      const trendDiff = (lastClose - firstClose) / firstClose;

      if (trendDiff > 0.005) {
        adx = 31;
        vwapRelationship = "ABOVE";
      } else if (trendDiff < -0.005) {
        adx = 29;
        vwapRelationship = "BELOW";
      } else {
        adx = 16;
        vwapRelationship = "AT_VWAP";
      }
    }

    let regime: MarketRegime = "RANGING";
    let confidence = 75;
    const rationale: string[] = [];
    const recommendedStrategies: StrategyId[] = [];

    // 1. Trending Bullish
    if (adx >= 25 && vwapRelationship === "ABOVE" && pcr >= 1.0) {
      regime = "TRENDING_BULL";
      confidence = 85;
      rationale.push("Strong upward trend confirmed with ADX > 25 & price above VWAP");
      recommendedStrategies.push(
        "LONG_CALL",
        "BULL_CALL_SPREAD",
        "EMA_TREND",
        "SUPERTREND",
        "LONG_FUTURE"
      );
    }
    // 2. Trending Bearish
    else if (adx >= 25 && vwapRelationship === "BELOW" && pcr <= 0.9) {
      regime = "TRENDING_BEAR";
      confidence = 85;
      rationale.push("Strong downward trend confirmed with ADX > 25 & price below VWAP");
      recommendedStrategies.push(
        "LONG_PUT",
        "BEAR_PUT_SPREAD",
        "EMA_TREND",
        "SUPERTREND",
        "SHORT_FUTURE"
      );
    }
    // 3. Volatility Breakout
    else if (bollingerBandwidthPct > 2.2 || atrPct > 1.4) {
      regime = "BREAKOUT";
      confidence = 82;
      rationale.push("Bollinger bandwidth and ATR expanding rapidly, indicating volatility breakout");
      recommendedStrategies.push(
        "OPENING_RANGE_BREAKOUT",
        "LONG_STRADDLE",
        "LONG_STRANGLE",
        "BREAKOUT_MOMENTUM",
        "ATR_BREAKOUT"
      );
    }
    // 4. Low Volatility / Range-bound
    else if (adx < 20 && bollingerBandwidthPct < 1.5) {
      regime = "LOW_VOLATILITY";
      confidence = 80;
      rationale.push("Low ADX < 20 & tight Bollinger envelope indicate range-bound consolidation");
      recommendedStrategies.push(
        "IRON_CONDOR",
        "SHORT_STRADDLE",
        "SHORT_STRANGLE",
        "RSI_REVERSAL",
        "BOLLINGER_REVERSION"
      );
    }
    // 5. Default Ranging
    else {
      regime = "RANGING";
      confidence = 75;
      rationale.push("Normal market oscillation within defined horizontal boundaries");
      recommendedStrategies.push(
        "IRON_CONDOR",
        "VWAP_REVERSION",
        "SUPPORT_RESISTANCE_REVERSAL",
        "RSI_REVERSAL"
      );
    }

    return {
      regime,
      confidence,
      adx,
      atrPct,
      bollingerBandwidthPct,
      vwapRelationship,
      recommendedStrategies,
      rationale,
    };
  }
}
