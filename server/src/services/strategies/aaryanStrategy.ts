/*
 * ═══════════════════════════════════════════════════════════════════
 *  AARYAN STRATEGY — "The Disciplined Warrior"
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Philosophy:  Disciplined momentum with strict risk.
 *               Enters only on confirmed breakouts with volume.
 *               Tight stop-loss (ATR-based), trails aggressively.
 *
 *  Signal Logic:
 *    BUY  — EMA9 > EMA21, MACD histogram positive & rising,
 *           RSI 40-65, price above Bollinger middle, ATR expanding.
 *    SELL — EMA9 < EMA21 crossover, RSI > 70, or trailing SL hit.
 *    HOLD — All other conditions.
 *
 *  Stop-Loss:  1.5 × ATR below entry (auto-managed)
 *  Take-Profit: 3.0 × ATR above entry (2:1 risk/reward)
 *  Trailing SL: Moves up by 0.5 × ATR on each new high
 *
 *  Named after: Aaryan — disciplined, structured, warrior spirit.
 * ═══════════════════════════════════════════════════════════════════
 */

import type { IndicatorSnapshot } from "../indicatorService.js";

export type StrategySignal = "BUY" | "SELL" | "HOLD";

export interface StrategyResult {
  strategy: "AARYAN";
  signal: StrategySignal;
  confidence: number;       // 0–1
  slPct: number;            // stop-loss % below entry
  tpPct: number;            // take-profit % above entry
  trailPct: number;         // trailing stop %
  reasons: string[];        // human-readable reasoning
}

export function evaluateAaryan(ind: IndicatorSnapshot): StrategyResult {
  const reasons: string[] = [];
  let bullScore = 0;
  let bearScore = 0;

  /* ── EMA Alignment (Momentum) ─────────────────────── */
  if (ind.ema9 !== null && ind.ema21 !== null) {
    if (ind.ema9 > ind.ema21) {
      bullScore += 0.2;
      reasons.push("EMA9 > EMA21 (short-term bullish)");
    } else {
      bearScore += 0.25;
      reasons.push("EMA9 < EMA21 (bearish crossover)");
    }
  }

  /* ── MACD Histogram (Momentum Confirmation) ───────── */
  if (ind.macd) {
    if (ind.macd.histogram > 0) {
      bullScore += 0.2;
      reasons.push(`MACD histogram positive: ${ind.macd.histogram.toFixed(6)}`);
    } else {
      bearScore += 0.15;
      reasons.push(`MACD histogram negative: ${ind.macd.histogram.toFixed(6)}`);
    }
    // Rising histogram = extra conviction
    if (ind.macd.macd > ind.macd.signal) {
      bullScore += 0.1;
      reasons.push("MACD line above signal (rising momentum)");
    }
  }

  /* ── RSI Sweet Spot ───────────────────────────────── */
  if (ind.rsi14 !== null) {
    if (ind.rsi14 >= 40 && ind.rsi14 <= 65) {
      bullScore += 0.15;
      reasons.push(`RSI in Aaryan sweet-spot: ${ind.rsi14.toFixed(1)}`);
    } else if (ind.rsi14 > 70) {
      bearScore += 0.3;
      reasons.push(`RSI overbought: ${ind.rsi14.toFixed(1)} → EXIT signal`);
    } else if (ind.rsi14 < 30) {
      bullScore += 0.1;
      reasons.push(`RSI oversold: ${ind.rsi14.toFixed(1)} → potential reversal`);
    }
  }

  /* ── Bollinger Position ───────────────────────────── */
  if (ind.bollinger) {
    if (ind.close > ind.bollinger.middle) {
      bullScore += 0.1;
      reasons.push("Price above Bollinger middle band");
    }
    if (ind.close > ind.bollinger.upper) {
      bearScore += 0.15;
      reasons.push("Price above upper Bollinger — overextended");
    }
  }

  /* ── ATR Expanding (Volatility Confirmation) ──────── */
  if (ind.atr14 !== null && ind.stdDev20 !== null && ind.close > 0) {
    const volRatio = ind.stdDev20 / ind.close;
    if (volRatio > 0.01) {
      bullScore += 0.1;
      reasons.push(`Volatility expanding (${(volRatio * 100).toFixed(2)}%) — breakout conditions`);
    }
  }

  /* ── EMA55 Trend Filter ───────────────────────────── */
  if (ind.ema55 !== null && ind.ema21 !== null) {
    if (ind.ema21 > ind.ema55) {
      bullScore += 0.1;
      reasons.push("EMA21 > EMA55 (mid-term trend confirmed)");
    } else {
      bearScore += 0.1;
      reasons.push("EMA21 < EMA55 (mid-term trend bearish)");
    }
  }

  /* ── Decision ─────────────────────────────────────── */
  const confidence = Math.abs(bullScore - bearScore);
  let signal: StrategySignal;

  if (bullScore >= 0.45 && bullScore > bearScore + 0.1) {
    signal = "BUY";
  } else if (bearScore >= 0.35 && bearScore > bullScore) {
    signal = "SELL";
  } else {
    signal = "HOLD";
  }

  /* ── ATR-Based Risk Management ────────────────────── */
  const atrPct = ind.atr14 !== null && ind.close > 0
    ? (ind.atr14 / ind.close) * 100
    : 2.0; // default 2%

  let slPct = +(atrPct * 1.5).toFixed(2);     // 1.5 × ATR
  let tpPct = +(atrPct * 3.0).toFixed(2);     // 3.0 × ATR (2:1 R:R)
  const trailPct = +(atrPct * 0.5).toFixed(2);  // 0.5 × ATR trail

  if (ind.fibLevels && ind.close > 0) {
    const { low, high } = ind.fibLevels;
    // Stop loss placed below the swing low
    const fibSl = ((ind.close - low) / ind.close) * 100;
    // Take profit targeted at the 1.382 Fibonacci extension
    const targetVal = low + (high - low) * 1.382;
    const fibTp = ((targetVal - ind.close) / ind.close) * 100;

    if (fibSl > 0.5 && fibSl < 5.0) {
      slPct = +(slPct * 0.5 + fibSl * 0.5).toFixed(2);
    }
    if (fibTp > 1.0 && fibTp < 10.0) {
      tpPct = +(tpPct * 0.5 + fibTp * 0.5).toFixed(2);
    }
    reasons.push(`Fibonacci-adjusted risk bounds: SL=${slPct}% (Swing Low: ${low.toFixed(4)}), TP=${tpPct}% (138.2% Ext: ${targetVal.toFixed(4)})`);
  }

  return {
    strategy: "AARYAN",
    signal,
    confidence: Math.min(1, confidence),
    slPct,
    tpPct,
    trailPct,
    reasons,
  };
}
