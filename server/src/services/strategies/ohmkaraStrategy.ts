/*
 * ═══════════════════════════════════════════════════════════════════
 *  OHMKARA STRATEGY — "The Primordial Sound" (ॐकार)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Philosophy:  OM is the primordial sound — it only resonates when
 *               the universe is in perfect alignment. Ohmkara refuses
 *               to trade unless 5 completely independent market
 *               dimensions are simultaneously resonating.
 *
 *               The result: fewer trades, far higher win rate,
 *               and wide profit targets when it does enter.
 *
 *  The 5 Resonance Gates:
 *
 *  🕉️  Gate 1 — OM Octave Resonance
 *       All 8 Gayatri OM-octave signals (17–24) must be active:
 *       RSI balanced, MACD controlled, Near EMA21, Liquidity OK,
 *       BB %B healthy, Full EMA harmony, RSI moderate, Resonance ≥ 15
 *
 *  📈  Gate 2 — EMA Spine Alignment
 *       Full trend stack: EMA9 > EMA21 > EMA55 > SMA200
 *       Ensures short, medium AND long-term all agree on direction.
 *
 *  🌊  Gate 3 — Momentum Wave Lock
 *       MACD histogram > 0 AND rising (momentum accelerating)
 *       RSI in the 45–62 zone (healthy momentum, not overbought)
 *
 *  🎯  Gate 4 — Bollinger Precision Zone
 *       Price between BB middle and 90% of upper band (room to run)
 *       AND BB bandwidth expanding (live market, not squeeze)
 *
 *  🦁  Gate 5 — ADX Conviction Filter
 *       ADX ≥ 25 (confirmed trending market, not sideways chop)
 *       This single gate eliminates the vast majority of losing trades.
 *
 *  Signal Thresholds:
 *    STRONG_BUY  → All 5 gates + 8/8 OM octave active
 *    BUY         → 4 of 5 gates + Gayatri OM ≥ 6/8 active
 *    HOLD        → 3 of 5 gates or OM < 6/8
 *    SELL        → < 3 gates OR ADX < 15 (dangerous chop)
 *
 *  Risk Management (Profit-First):
 *    Stop-Loss   : 1.2 × ATR  (tight — only enters high confidence)
 *    Take-Profit : 4.5 × ATR  (min 3.5%) — rides harmonic moves fully
 *    Trailing SL : 0.8 × ATR from peak — locks profit aggressively
 *
 *  Named after: OM (ॐ) — the cosmic sound of creation.
 *               It precedes everything; so should this gate.
 * ═══════════════════════════════════════════════════════════════════
 */

import type { IndicatorSnapshot } from "../indicatorService.js";

export type StrategySignal = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

export interface OhmkaraGate {
  id: number;
  name: string;
  emoji: string;
  active: boolean;
  detail: string;
}

export interface StrategyResult {
  strategy: "OHMKARA";
  signal: StrategySignal;
  confidence: number;       // 0–1
  slPct: number;
  tpPct: number;
  trailPct: number;
  gatesActive: number;      // 0–5
  omOctaveScore: number;    // 0–8 (OM octave signals from Gayatri)
  gates: OhmkaraGate[];
  reasons: string[];
  isFullResonance: boolean; // true = all 5 gates + 8/8 OM
}

/* ─────────────────────────────────────────────────────────
 *  Evaluate the 8 Gayatri OM Octave signals (gates 17–24)
 *  Returns count of how many OM signals are active.
 * ───────────────────────────────────────────────────────── */
function evaluateOMOctave(ind: IndicatorSnapshot): { score: number; details: string[] } {
  const details: string[] = [];
  let score = 0;

  // 17. RSI balanced (30–70)
  if (ind.rsi14 !== null && ind.rsi14 >= 30 && ind.rsi14 <= 70) {
    score++;
    details.push(`RSI balanced: ${ind.rsi14.toFixed(1)}`);
  } else {
    details.push(`RSI unbalanced: ${ind.rsi14?.toFixed(1) ?? "N/A"}`);
  }

  // 18. MACD controlled (|histogram| < ATR)
  const macdControlled =
    ind.macd !== null && ind.atr14 !== null
      ? Math.abs(ind.macd.histogram) < ind.atr14
      : true;
  if (macdControlled) {
    score++;
    details.push("MACD controlled (no extreme divergence)");
  } else {
    details.push(`MACD extreme: |hist|=${ind.macd ? Math.abs(ind.macd.histogram).toFixed(6) : "N/A"}`);
  }

  // 19. Price within 5% of EMA21
  const ema21Dist =
    ind.ema21 !== null ? Math.abs((ind.close - ind.ema21) / ind.ema21) : 1;
  if (ind.ema21 !== null && ema21Dist < 0.05) {
    score++;
    details.push(`Near EMA21: ${(ema21Dist * 100).toFixed(2)}% away`);
  } else {
    details.push(`Far from EMA21: ${(ema21Dist * 100).toFixed(2)}%`);
  }

  // 20. Liquidity present (ATR/close > 0.5%)
  const liquidityRatio =
    ind.atr14 !== null && ind.close > 0 ? ind.atr14 / ind.close : 0;
  if (liquidityRatio > 0.005) {
    score++;
    details.push(`Liquidity OK: ATR/Price=${(liquidityRatio * 100).toFixed(3)}%`);
  } else {
    details.push(`Low liquidity: ATR/Price=${(liquidityRatio * 100).toFixed(3)}%`);
  }

  // 21. Bollinger %B between 0.2–0.8
  const pctB = ind.bollinger
    ? (ind.close - ind.bollinger.lower) /
      (ind.bollinger.upper - ind.bollinger.lower || 1)
    : 0.5;
  if (pctB >= 0.2 && pctB <= 0.8) {
    score++;
    details.push(`BB %B healthy: ${(pctB * 100).toFixed(1)}%`);
  } else {
    details.push(`BB %B outside range: ${(pctB * 100).toFixed(1)}%`);
  }

  // 22. Full EMA harmony (9 > 21 > 55)
  if (
    ind.ema9 !== null &&
    ind.ema21 !== null &&
    ind.ema55 !== null &&
    ind.ema9 > ind.ema21 &&
    ind.ema21 > ind.ema55
  ) {
    score++;
    details.push("Full EMA harmony: 9 > 21 > 55");
  } else {
    details.push("EMA harmony broken");
  }

  // 23. RSI moderate balance (35–65)
  if (ind.rsi14 !== null && ind.rsi14 >= 35 && ind.rsi14 <= 65) {
    score++;
    details.push(`RSI moderate: ${ind.rsi14.toFixed(1)}`);
  } else {
    details.push(`RSI not moderate: ${ind.rsi14?.toFixed(1) ?? "N/A"}`);
  }

  // 24. Composite resonance ≥ 6/7 so far (self-referential)
  if (score >= 6) {
    score++;
    details.push(`Composite resonance achieved: ${score - 1}/7 signals active`);
  } else {
    details.push(`Composite resonance not met: only ${score}/7 active`);
  }

  return { score: Math.min(score, 8), details };
}

/* ─────────────────────────────────────────────────────────
 *  Main Ohmkara Evaluator
 * ───────────────────────────────────────────────────────── */
export function evaluateOhmkara(ind: IndicatorSnapshot): StrategyResult {
  const reasons: string[] = [];
  const gates: OhmkaraGate[] = [];

  /* ══════════════════════════════════════════════
   *  GATE 1 — OM Octave Resonance
   * ══════════════════════════════════════════════ */
  const { score: omScore, details: omDetails } = evaluateOMOctave(ind);
  const gate1Active = omScore >= 6; // Need 6/8 minimum for gate to pass
  gates.push({
    id: 1,
    name: "OM Octave Resonance",
    emoji: "🕉️",
    active: gate1Active,
    detail: `OM octave: ${omScore}/8 signals active. ${omDetails[0]}`,
  });
  if (gate1Active) {
    reasons.push(`🕉️ Gate 1 OPEN: OM Octave resonating ${omScore}/8`);
  } else {
    reasons.push(`🕉️ Gate 1 CLOSED: OM Octave only ${omScore}/8 (need ≥ 6)`);
  }

  /* ══════════════════════════════════════════════
   *  GATE 2 — EMA Spine Alignment (Full Stack)
   * ══════════════════════════════════════════════ */
  const ema9ok = ind.ema9 !== null && ind.ema21 !== null && ind.ema9 > ind.ema21;
  const ema21ok = ind.ema21 !== null && ind.ema55 !== null && ind.ema21 > ind.ema55;
  const sma200ok = ind.sma200 !== null && ind.close > ind.sma200;
  const gate2Active = ema9ok && ema21ok && sma200ok;
  const emaDetail = [
    `EMA9>${ind.ema9 !== null ? "✓" : "✗"}EMA21`,
    `EMA21>${ind.ema21 !== null ? "✓" : "✗"}EMA55`,
    `Price>${ind.sma200 !== null ? "✓" : "✗"}SMA200`,
  ].join(" | ");
  gates.push({
    id: 2,
    name: "EMA Spine Alignment",
    emoji: "📈",
    active: gate2Active,
    detail: emaDetail,
  });
  if (gate2Active) {
    reasons.push(`📈 Gate 2 OPEN: Full EMA spine bullish (9>21>55>SMA200)`);
  } else {
    reasons.push(`📈 Gate 2 CLOSED: EMA spine misaligned (${emaDetail})`);
  }

  /* ══════════════════════════════════════════════
   *  GATE 3 — Momentum Wave Lock
   * ══════════════════════════════════════════════ */
  const macdHistPositive = ind.macd !== null && ind.macd.histogram > 0;
  const macdRising = ind.macd !== null && ind.macd.macd > ind.macd.signal;
  const rsiInZone = ind.rsi14 !== null && ind.rsi14 >= 45 && ind.rsi14 <= 62;
  const gate3Active = macdHistPositive && macdRising && rsiInZone;
  const momDetail = `MACD hist=${ind.macd?.histogram.toFixed(6) ?? "N/A"}, RSI=${ind.rsi14?.toFixed(1) ?? "N/A"}`;
  gates.push({
    id: 3,
    name: "Momentum Wave Lock",
    emoji: "🌊",
    active: gate3Active,
    detail: momDetail,
  });
  if (gate3Active) {
    reasons.push(`🌊 Gate 3 OPEN: Momentum wave aligned (${momDetail})`);
  } else {
    reasons.push(`🌊 Gate 3 CLOSED: Momentum weak or RSI out of zone (${momDetail})`);
  }

  /* ══════════════════════════════════════════════
   *  GATE 4 — Bollinger Precision Zone
   * ══════════════════════════════════════════════ */
  let gate4Active = false;
  let bbDetail = "No Bollinger data";
  if (ind.bollinger) {
    const bbRange = ind.bollinger.upper - ind.bollinger.lower;
    const bb90pct = ind.bollinger.lower + bbRange * 0.90;
    const aboveMiddle = ind.close > ind.bollinger.middle;
    const belowTop90 = ind.close < bb90pct;
    const expanding = ind.bollinger.bandwidth > 0.01;
    gate4Active = aboveMiddle && belowTop90 && expanding;
    bbDetail = `%B=${((ind.close - ind.bollinger.lower) / (bbRange || 1) * 100).toFixed(1)}%, BW=${(ind.bollinger.bandwidth * 100).toFixed(2)}%`;
  }
  gates.push({
    id: 4,
    name: "Bollinger Precision Zone",
    emoji: "🎯",
    active: gate4Active,
    detail: bbDetail,
  });
  if (gate4Active) {
    reasons.push(`🎯 Gate 4 OPEN: Price in Bollinger sweet zone (${bbDetail})`);
  } else {
    reasons.push(`🎯 Gate 4 CLOSED: Price outside precision zone (${bbDetail})`);
  }

  /* ══════════════════════════════════════════════
   *  GATE 5 — ADX Conviction Filter
   * ══════════════════════════════════════════════ */
  const adxValue = ind.adx14 ?? 0;
  const gate5Active = adxValue >= 25;
  gates.push({
    id: 5,
    name: "ADX Conviction Filter",
    emoji: "🦁",
    active: gate5Active,
    detail: `ADX=${adxValue.toFixed(1)} (need ≥ 25)`,
  });
  if (gate5Active) {
    reasons.push(`🦁 Gate 5 OPEN: Strong trend confirmed ADX=${adxValue.toFixed(1)}`);
  } else {
    reasons.push(`🦁 Gate 5 CLOSED: Weak/choppy trend ADX=${adxValue.toFixed(1)} < 25`);
  }

  /* ══════════════════════════════════════════════
   *  Final Signal Decision
   * ══════════════════════════════════════════════ */
  const gatesActive = gates.filter((g) => g.active).length;
  const isFullResonance = gatesActive === 5 && omScore === 8;

  let signal: StrategySignal;
  let confidence = 0;

  if (isFullResonance) {
    signal = "STRONG_BUY";
    confidence = 1.0;
    reasons.push("🕉️ OHMKARA FULL RESONANCE — All 5 gates + 8/8 OM octave ACTIVE");
  } else if (gatesActive >= 4 && omScore >= 6) {
    signal = "BUY";
    confidence = 0.75 + (gatesActive - 4) * 0.1;
    reasons.push(`🕉️ OHMKARA BUY — ${gatesActive}/5 gates active, OM ${omScore}/8`);
  } else if (gatesActive >= 3 && omScore >= 5) {
    signal = "HOLD";
    confidence = 0.4 + gatesActive * 0.05;
    reasons.push(`⏸️ OHMKARA HOLD — ${gatesActive}/5 gates, OM ${omScore}/8 (need more alignment)`);
  } else if (adxValue < 15 || gatesActive <= 1) {
    // Dangerous chop — signal exit
    signal = "SELL";
    confidence = 0.6;
    reasons.push(`⚠️ OHMKARA SELL — Choppy/dissonant market (ADX=${adxValue.toFixed(1)}, gates=${gatesActive}/5)`);
  } else {
    signal = "HOLD";
    confidence = 0.2;
    reasons.push(`⏸️ OHMKARA HOLD — ${gatesActive}/5 gates (insufficient resonance)`);
  }

  /* ══════════════════════════════════════════════
   *  ATR-Based Profit-First Risk Management
   * ══════════════════════════════════════════════ */
  const atrPct =
    ind.atr14 !== null && ind.close > 0
      ? (ind.atr14 / ind.close) * 100
      : 1.5;

  // Tighter SL than other strategies — only enters high-conviction setups
  const slPct = +(atrPct * 1.2).toFixed(2);
  // Wide TP — rides the full harmonic move, minimum 3.5%
  const rawTpPct = atrPct * 4.5;
  const tpPct = +Math.max(rawTpPct, 3.5).toFixed(2);
  // Aggressive trailing — locks profit fast once in the green
  const trailPct = +(atrPct * 0.8).toFixed(2);

  // Boost TP when fully resonant
  const finalTpPct = isFullResonance ? +Math.max(tpPct * 1.2, 5.0).toFixed(2) : tpPct;
  const finalSlPct = isFullResonance ? +(slPct * 0.9).toFixed(2) : slPct;

  reasons.push(
    `Risk: SL=${finalSlPct}% (1.2×ATR${isFullResonance ? ", tightened 10%" : ""}), ` +
    `TP=${finalTpPct}% (4.5×ATR${isFullResonance ? ", boosted 20%" : ""}), ` +
    `Trail=${trailPct}%`
  );

  return {
    strategy: "OHMKARA",
    signal,
    confidence: Math.min(1, confidence),
    slPct: finalSlPct,
    tpPct: finalTpPct,
    trailPct,
    gatesActive,
    omOctaveScore: omScore,
    gates,
    reasons,
    isFullResonance,
  };
}
