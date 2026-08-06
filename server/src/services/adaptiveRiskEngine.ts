/*
 * ─── Adaptive Risk Engine (V8.0) ──────────────────────
 *
 * Generates dynamic SL/TP and position sizes based on:
 * - ATR / Volatility
 * - Market Regime
 * - Portfolio Heat
 * - Trade Quality
 */

import { TradeQualityScore } from "./tradeQualityEngine.js";
import { RegimeStatus } from "./regimeDetectionEngine.js";
import { weatherIntelligenceEngine } from "./weatherIntelligenceEngine.js";

export interface AdaptiveRiskProfile {
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  runner: boolean;
  positionSize: number;
  leverage: number;
  reason: string;
}

export class AdaptiveRiskEngine {
  public static calculate(
    side: "BUY" | "SELL",
    quality: TradeQualityScore, 
    regime: RegimeStatus, 
    heat: number,
    baseParams: { entry: number; atr: number; balance?: number },
    settings?: any
  ): AdaptiveRiskProfile {
    
    let slMultiplier = 1.2;
    let tpMultiplier = 2.4;
    let sizeScale = 1.0;

    // Regime Influence
    if (regime.regime === "BULL_EXPANSION") {
      slMultiplier = 1.5; // Controlled stops
      tpMultiplier = 3.6; // Extended high-reward targets
    } else if (regime.regime === "BEAR_CAPITULATION") {
      slMultiplier = 1.0; // Very tight stops
      tpMultiplier = 2.0; // Fast 2:1 TP
    }

    // Quality Influence
    if (quality.rating === "REJECT") sizeScale = 0;
    else if (quality.rating === "SMALL") sizeScale = 0.5;
    else if (quality.rating === "AGGRESSIVE") sizeScale = 1.5;

    // Heat Influence (Hard-block)
    if (heat > 40) sizeScale = 0; // No new trades
    else if (heat > 30) sizeScale *= 0.5; // Reduce size

    const direction = side === "BUY" ? 1 : -1;
    const atr = baseParams.atr || baseParams.entry * 0.01;

    // Retrieve threshold percentage and dynamic flag from settings
    const slThresholdPct = settings?.riskConfig?.defaultSL ?? 1.5;
    const tpThresholdPct = settings?.riskConfig?.defaultTP ?? 4.0;
    const isDynamic = settings?.riskConfig?.dynamicSLTP ?? true;

    // 🛡️ Absolute floor, independent of whatever slThresholdPct/atr resolve
    // to: a real ADAUSDT trade was found with sl === entry exactly (zero
    // stop distance, guaranteed instant stop-out on the next tick) — traced
    // to riskConfig.defaultSL having been 0 at entry time, which zeroes out
    // minSlDistance below with nothing to catch it. 0.2% keeps this from
    // ever being reproducible regardless of what Settings holds.
    const ABSOLUTE_MIN_SL_PCT = 0.2;

    let sl: number;
    let tp1: number;
    let tp2: number;
    let tp3: number;

    if (isDynamic) {
      // 🛡️ Volatility / ATR based stop loss with floor threshold
      const minSlDistance = Math.max(
        baseParams.entry * (slThresholdPct / 100),
        baseParams.entry * (ABSOLUTE_MIN_SL_PCT / 100),
      );
      const slDistance = Math.max(atr * slMultiplier, minSlDistance);
      // TP must scale with the SL distance actually used, not raw ATR: when
      // the SL floor kicks in on a low-ATR symbol, a raw-ATR TP1 leaves
      // reward:risk far below 1 (observed 0.26% TP vs 2% SL on BTC — needs
      // ~88% win rate to break even). Enforce TP1 ≥ minRR × SL distance.
      const minRR = settings?.riskConfig?.minRiskReward ?? 1.8;
      const tpDistance = Math.max(atr * tpMultiplier, slDistance * minRR);
      sl = baseParams.entry - (direction * slDistance);
      tp1 = baseParams.entry + (direction * tpDistance * 1);
      tp2 = baseParams.entry + (direction * tpDistance * 2);
      tp3 = baseParams.entry + (direction * tpDistance * 3);
    } else {
      // Static stop loss & take profits — same absolute floor as the
      // dynamic branch above.
      const effectiveSlPct = Math.max(slThresholdPct, ABSOLUTE_MIN_SL_PCT);
      sl = baseParams.entry * (1 - direction * (effectiveSlPct / 100));
      tp1 = baseParams.entry * (1 + direction * (tpThresholdPct / 100));
      tp2 = baseParams.entry * (1 + direction * (tpThresholdPct * 1.5 / 100));
      tp3 = baseParams.entry * (1 + direction * (tpThresholdPct * 2.0 / 100));
    }
    
    // Weather Risk Adjustment (V1.0)
    const weatherRisk = weatherIntelligenceEngine.getRiskAdjustment();
    sizeScale *= weatherRisk.sizeMultiplier;
    const finalLeverage = Math.min(3, Math.max(1, Math.round(10 * weatherRisk.leverageMultiplier)));

    return {
      sl,
      tp1,
      tp2,
      tp3,
      runner: true,
      positionSize: Math.max(10, (baseParams.balance ?? 1000) * 0.01 * sizeScale),
      leverage: finalLeverage,
      reason: isDynamic
        ? `Adaptive SL at ${slMultiplier}x ATR (Min: ${slThresholdPct}%, R:R≥${settings?.riskConfig?.minRiskReward ?? 1.0}). Regime: ${regime.regime}. Quality: ${quality.score}. Weather Adj: ${weatherRisk.sizeMultiplier.toFixed(2)}x`
        : `Static SL at ${slThresholdPct}% / TP at ${tpThresholdPct}%. Quality: ${quality.score}. Weather Adj: ${weatherRisk.sizeMultiplier.toFixed(2)}x`
    };
  }
}
