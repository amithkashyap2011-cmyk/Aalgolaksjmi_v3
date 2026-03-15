/*
 * ═══════════════════════════════════════════════════════════════════
 *  AAYUSH STRATEGY — "The Patient Accumulator"
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Philosophy:  Mean-reversion with patience.
 *               Waits for oversold / undervalued conditions,
 *               accumulates at key Fibonacci levels, scales out
 *               at resistance. Ideal for range-bound markets.
 *
 *  Signal Logic:
 *    BUY  — RSI < 35, price near lower Bollinger, MACD histogram
 *           turning positive (divergence), EMA21 acting as support.
 *    SELL — RSI > 65, price at upper Bollinger, take profit at
 *           Fibonacci 0.618 retracement of previous swing.
 *    HOLD — Mid-range RSI (35–65) with no Bollinger extremes.
 *
 *  Stop-Loss:  2.0 × ATR (wider — patient positions need room)
 *  Take-Profit: 2.5 × ATR (moderate)
 *  Trailing SL: 1.0 × ATR (relaxed trailing)
 *
 *  Position Scaling:
 *    Enters 40% at first signal, adds 30% if price drops further
 *    towards lower Bollinger, final 30% at RSI < 25 extreme.
 *
 *  Named after: Aayush — patient, nurturing, steady accumulation.
 * ═══════════════════════════════════════════════════════════════════
 */

import type { IndicatorSnapshot } from "../indicatorService.js";

export type StrategySignal = "BUY" | "SELL" | "HOLD";

export interface StrategyResult {
  strategy: "AAYUSH";
  signal: StrategySignal;
  confidence: number;
  slPct: number;
  tpPct: number;
  trailPct: number;
  scaleIn: number;          // 0.4, 0.7, or 1.0 (progressive entry)
  reasons: string[];
}

export function evaluateAayush(ind: IndicatorSnapshot): StrategyResult {
  const reasons: string[] = [];
  let buyScore = 0;
  let sellScore = 0;
  let scaleIn = 0.4; // default first entry = 40%

  /* ── RSI Oversold Detection ───────────────────────── */
  if (ind.rsi14 !== null) {
    if (ind.rsi14 < 25) {
      buyScore += 0.35;
      scaleIn = 1.0; // full allocation at extreme oversold
      reasons.push(`RSI extreme oversold: ${ind.rsi14.toFixed(1)} → full accumulation`);
    } else if (ind.rsi14 < 35) {
      buyScore += 0.25;
      scaleIn = 0.7; // 70% allocation
      reasons.push(`RSI oversold zone: ${ind.rsi14.toFixed(1)} → accumulation signal`);
    } else if (ind.rsi14 > 65) {
      sellScore += 0.3;
      reasons.push(`RSI elevated: ${ind.rsi14.toFixed(1)} → mean-reversion sell`);
    } else if (ind.rsi14 > 55) {
      sellScore += 0.1;
      reasons.push(`RSI approaching overbought: ${ind.rsi14.toFixed(1)}`);
    }
  }

  /* ── Bollinger Band Mean-Reversion ────────────────── */
  if (ind.bollinger) {
    const range = ind.bollinger.upper - ind.bollinger.lower;
    const position = range > 0
      ? (ind.close - ind.bollinger.lower) / range
      : 0.5;

    if (position < 0.2) {
      buyScore += 0.25;
      reasons.push(`Price near lower Bollinger (${(position * 100).toFixed(0)}% band position) — accumulate`);
    } else if (position < 0.35) {
      buyScore += 0.15;
      reasons.push(`Price in lower Bollinger zone (${(position * 100).toFixed(0)}%)`);
    } else if (position > 0.8) {
      sellScore += 0.25;
      reasons.push(`Price at upper Bollinger (${(position * 100).toFixed(0)}%) — distribute`);
    } else if (position > 0.65) {
      sellScore += 0.1;
      reasons.push(`Price in upper Bollinger zone (${(position * 100).toFixed(0)}%)`);
    }
  }

  /* ── MACD Divergence (Histogram Turning) ──────────── */
  if (ind.macd) {
    // Histogram turning positive from negative = bullish divergence
    if (ind.macd.histogram > 0 && ind.macd.histogram < 0.001) {
      buyScore += 0.15;
      reasons.push("MACD histogram just turned positive — bullish divergence");
    } else if (ind.macd.histogram > 0) {
      buyScore += 0.05;
      reasons.push("MACD histogram positive");
    }
    // Histogram turning negative from positive = distribution
    if (ind.macd.histogram < 0 && ind.macd.histogram > -0.001) {
      sellScore += 0.15;
      reasons.push("MACD histogram just turned negative — distribution signal");
    }
  }

  /* ── EMA21 Support/Resistance ─────────────────────── */
  if (ind.ema21 !== null) {
    const distFromEma = (ind.close - ind.ema21) / ind.ema21;
    if (distFromEma < -0.02) {
      buyScore += 0.15;
      reasons.push(`Price ${(distFromEma * 100).toFixed(2)}% below EMA21 — support bounce zone`);
    } else if (distFromEma > 0.03) {
      sellScore += 0.1;
      reasons.push(`Price ${(distFromEma * 100).toFixed(2)}% above EMA21 — extended from mean`);
    } else {
      reasons.push(`Price near EMA21 (${(distFromEma * 100).toFixed(2)}%) — neutral zone`);
    }
  }

  /* ── Low Volatility Preference (calm accumulation) ── */
  if (ind.stdDev20 !== null && ind.close > 0) {
    const volRatio = ind.stdDev20 / ind.close;
    if (volRatio < 0.015) {
      buyScore += 0.05;
      reasons.push("Low volatility environment — ideal for patient accumulation");
    } else if (volRatio > 0.04) {
      // Too volatile for mean-reversion
      buyScore -= 0.1;
      sellScore += 0.05;
      reasons.push("High volatility — caution for mean-reversion strategy");
    }
  }

  /* ── Decision ─────────────────────────────────────── */
  const confidence = Math.abs(buyScore - sellScore);
  let signal: StrategySignal;

  if (buyScore >= 0.35 && buyScore > sellScore + 0.05) {
    signal = "BUY";
  } else if (sellScore >= 0.3 && sellScore > buyScore) {
    signal = "SELL";
  } else {
    signal = "HOLD";
  }

  /* ── ATR-Based Risk (wider for patient positions) ─── */
  const atrPct = ind.atr14 !== null && ind.close > 0
    ? (ind.atr14 / ind.close) * 100
    : 2.5;

  return {
    strategy: "AAYUSH",
    signal,
    confidence: Math.min(1, confidence),
    slPct: +(atrPct * 2.0).toFixed(2),
    tpPct: +(atrPct * 2.5).toFixed(2),
    trailPct: +(atrPct * 1.0).toFixed(2),
    scaleIn,
    reasons,
  };
}
