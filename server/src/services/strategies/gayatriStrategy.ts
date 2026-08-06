/*
 * ═══════════════════════════════════════════════════════════════════
 *  GAYATRI STRATEGY — "The 24-Signal Mantra Frequency"
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Philosophy:  Inspired by the 24 syllables of the Gayatri Mantra,
 *               each representing a cosmic energy / vibration.
 *               The strategy maps 24 distinct market signals to the
 *               24 mantra syllables, creating a holistic "chant
 *               frequency" score.
 *
 *               When the frequency resonates (≥ 18/24 aligned),
 *               the market is "in harmony" → strong signal.
 *               When dissonant (< 12/24), energy is scattered → HOLD.
 *
 *  The 24 Signals (3 octaves × 8 notes):
 *
 *  OCTAVE 1 — TAT (Momentum):
 *    1. EMA9 > EMA21                    (short trend)
 *    2. EMA21 > EMA55                   (mid trend)
 *    3. MACD line > signal              (momentum rising)
 *    4. MACD histogram > 0              (positive momentum)
 *    5. RSI > 40                        (not oversold)
 *    6. RSI < 70                        (not overbought)
 *    7. Price > EMA9                    (above fast MA)
 *    8. Price change > 0                (positive candle)
 *
 *  OCTAVE 2 — SAT (Structure):
 *    9.  Price > Bollinger middle       (above mean)
 *    10. Price < Bollinger upper        (not overextended)
 *    11. Bollinger bandwidth expanding  (volatility alive)
 *    12. Price > SMA200                 (long-term bullish)
 *    13. ATR > 0                        (market active)
 *    14. StdDev moderate (0.005–0.05)   (healthy volatility)
 *    15. Close > Open (current bar)     (bullish candle)
 *    16. EMA9 slope positive            (fast MA rising)
 *
 *  OCTAVE 3 — OM (Harmony):
 *    17. RSI divergence (not extreme)   (balance)
 *    18. MACD not extreme divergence    (controlled)
 *    19. Price within 5% of EMA21       (not overextended)
 *    20. Volume proxy (ATR/close) > 0.5% (liquidity present)
 *    21. Bollinger %B between 0.2–0.8  (healthy range)
 *    22. EMA alignment: 9 > 21 > 55    (full harmony)
 *    23. No extreme RSI (RSI 30–70)     (balance check)
 *    24. Composite resonance ≥ 15       (self-referential harmony)
 *
 *  Frequency Score: Count of TRUE signals out of 24
 *    ≥ 20/24 → STRONG BUY    (deep resonance / 528 Hz alignment)
 *    ≥ 16/24 → BUY           (harmonic convergence)
 *    ≥ 12/24 → HOLD          (mixed frequencies)
 *    < 12/24 → SELL          (dissonance — exit positions)
 *    < 8/24  → STRONG SELL   (full dissonance)
 *
 *  Stop-Loss:  Dynamic — ATR × (24 - frequency) / 12
 *              Higher resonance = tighter SL (confidence)
 *              Lower resonance = wider SL (uncertainty)
 *
 *  Named after: Gayatri Mantra — the universal prayer for
 *               enlightenment, protection, and divine guidance.
 *               528 Hz = the "love frequency" / DNA repair tone.
 * ═══════════════════════════════════════════════════════════════════
 */

import type { IndicatorSnapshot } from "../indicatorService.js";

export type StrategySignal = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

export interface GayatriSignalItem {
  id: number;           // 1–24
  syllable: string;     // Gayatri syllable
  octave: "TAT" | "SAT" | "OM";
  label: string;        // human-readable
  active: boolean;      // true = resonating
  detail: string;       // explanation
}

export interface StrategyResult {
  strategy: "GAYATRI";
  signal: StrategySignal;
  confidence: number;
  frequency: number;        // 0–24 count of active signals
  frequencyPct: number;     // 0–100%
  hzLabel: string;          // "528 Hz" when fully resonant
  slPct: number;
  tpPct: number;
  trailPct: number;
  signals: GayatriSignalItem[];
  reasons: string[];
  noiseGateActive?: boolean; // Added for 18.8 Hz Infrasound Gate
}


/* ── The 24 Gayatri syllables ────────────────────────── */
const SYLLABLES = [
  // OCTAVE 1 — TAT (Momentum)
  "tat", "sa", "vi", "tur", "va", "re", "ṇi", "yaṃ",
  // OCTAVE 2 — SAT (Structure)
  "bhar", "go", "de", "vas", "ya", "dhī", "ma", "hi",
  // OCTAVE 3 — OM (Harmony)
  "dhi", "yo", "yo", "naḥ", "pra", "cho", "da", "yāt",
];

export function evaluateGayatri(ind: IndicatorSnapshot): StrategyResult {
  const signals: GayatriSignalItem[] = [];
  const reasons: string[] = [];
  let id = 0;

  const add = (
    octave: GayatriSignalItem["octave"],
    label: string,
    active: boolean,
    detail: string,
  ) => {
    signals.push({
      id: ++id,
      syllable: SYLLABLES[id - 1] || "oṃ",
      octave,
      label,
      active,
      detail,
    });
  };

  /* ═══════════════ OCTAVE 1 — TAT (Momentum) ═══════════ */

  // 1. EMA9 > EMA21
  add("TAT", "EMA9 > EMA21 (short trend)",
    ind.ema9 !== null && ind.ema21 !== null && ind.ema9 > ind.ema21,
    ind.ema9 !== null && ind.ema21 !== null
      ? `EMA9=${ind.ema9.toFixed(6)}, EMA21=${ind.ema21.toFixed(6)}`
      : "Insufficient data");

  // 2. EMA21 > EMA55
  add("TAT", "EMA21 > EMA55 (mid trend)",
    ind.ema21 !== null && ind.ema55 !== null && ind.ema21 > ind.ema55,
    ind.ema21 !== null && ind.ema55 !== null
      ? `EMA21=${ind.ema21.toFixed(6)}, EMA55=${ind.ema55.toFixed(6)}`
      : "Insufficient data");

  // 3. MACD line > signal
  add("TAT", "MACD line above signal",
    ind.macd !== null && ind.macd.macd > ind.macd.signal,
    ind.macd ? `MACD=${ind.macd.macd.toFixed(6)}, Sig=${ind.macd.signal.toFixed(6)}` : "No MACD");

  // 4. MACD positive (longer-term momentum)
  add("TAT", "MACD line positive",
    ind.macd !== null && ind.macd.macd > 0,
    ind.macd ? `MACD=${ind.macd.macd.toFixed(6)}` : "No MACD");

  // 5. RSI > 45 (bullish zone lower bound)
  add("TAT", "RSI above 45",
    ind.rsi14 !== null && ind.rsi14 > 45,
    ind.rsi14 !== null ? `RSI=${ind.rsi14.toFixed(1)}` : "No RSI");

  // 6. RSI < 65 (not overextended)
  add("TAT", "RSI below 65",
    ind.rsi14 !== null && ind.rsi14 < 65,
    ind.rsi14 !== null ? `RSI=${ind.rsi14.toFixed(1)}` : "No RSI");

  // 7. Price > EMA9
  add("TAT", "Price above fast EMA",
    ind.ema9 !== null && ind.close > ind.ema9,
    ind.ema9 !== null ? `Close=${ind.close.toFixed(6)}, EMA9=${ind.ema9.toFixed(6)}` : "No EMA9");

  // 8. Positive momentum rate
  add("TAT", "Change percent > 0.1%",
    ind.changePercent > 0.1,
    `Change=${ind.changePercent.toFixed(2)}%`);

  /* ═══════════════ OCTAVE 2 — SAT (Structure) ═══════════ */

  // 9. Price > Bollinger middle
  add("SAT", "Above Bollinger middle",
    ind.bollinger !== null && ind.close > ind.bollinger.middle,
    ind.bollinger ? `Close=${ind.close.toFixed(6)}, Mid=${ind.bollinger.middle.toFixed(6)}` : "No BB");

  // 10. Bollinger room to run
  let bbRoom = false;
  let bbRoomDetail = "No Bollinger data";
  if (ind.bollinger) {
    const range = ind.bollinger.upper - ind.bollinger.lower;
    const limit = ind.bollinger.lower + range * 0.85;
    bbRoom = ind.close < limit;
    bbRoomDetail = `Close=${ind.close.toFixed(6)}, Upper85%=${limit.toFixed(6)}`;
  }
  add("SAT", "Bollinger room to run (close < 85% of upper)",
    bbRoom,
    bbRoomDetail);

  // 11. Bollinger bandwidth expanding
  add("SAT", "Bandwidth expanding",
    ind.bollinger !== null && ind.bollinger.bandwidth > 0.02,
    ind.bollinger ? `BW=${(ind.bollinger.bandwidth * 100).toFixed(2)}%` : "No BB");

  // 12. Price > SMA200 (long-term bullish)
  add("SAT", "Above SMA200",
    ind.sma200 !== null && ind.close > ind.sma200,
    ind.sma200 !== null ? `Close=${ind.close.toFixed(6)}, SMA200=${ind.sma200.toFixed(6)}` : "Insufficient data");

  // 13. ADX trend strength confirmed
  add("SAT", "ADX trending (ADX > 20)",
    ind.adx14 !== null && ind.adx14 > 20,
    ind.adx14 !== null ? `ADX14=${ind.adx14.toFixed(1)}` : "No ADX");

  // 14. Healthy volatility (stdDev/price 0.5%–4%)
  const volRatio = ind.stdDev20 !== null && ind.close > 0 ? ind.stdDev20 / ind.close : 0;
  add("SAT", "Healthy volatility range",
    volRatio >= 0.005 && volRatio <= 0.04,
    `VolRatio=${(volRatio * 100).toFixed(3)}%`);

  // 15. Price above middle EMA
  add("SAT", "Price above mid EMA (EMA21)",
    ind.ema21 !== null && ind.close > ind.ema21,
    ind.ema21 !== null ? `Close=${ind.close.toFixed(6)}, EMA21=${ind.ema21.toFixed(6)}` : "No EMA21");

  // 16. EMA spread expanding
  const emaSpreadOk = ind.ema9 !== null && ind.ema21 !== null && ind.atr14 !== null && (ind.ema9 - ind.ema21) > ind.atr14;
  add("SAT", "EMA spread expanding (EMA9 - EMA21 > ATR)",
    emaSpreadOk,
    ind.ema9 !== null && ind.ema21 !== null && ind.atr14 !== null
      ? `Spread=${(ind.ema9 - ind.ema21).toFixed(6)}, ATR=${ind.atr14.toFixed(6)}`
      : "Insufficient data");

  /* ═══════════════ OCTAVE 3 — OM (Harmony) ══════════════ */

  // 17. RSI balanced mid-range (40–60)
  add("OM", "RSI balanced mid-range",
    ind.rsi14 !== null && ind.rsi14 >= 40 && ind.rsi14 <= 60,
    ind.rsi14 !== null ? `RSI=${ind.rsi14.toFixed(1)}` : "No RSI");

  // 18. MACD not extreme divergence (|histogram| < ATR)
  const macdControlled = ind.macd !== null && ind.atr14 !== null
    ? Math.abs(ind.macd.histogram) < ind.atr14
    : true;
  add("OM", "MACD controlled",
    macdControlled,
    ind.macd ? `|Hist|=${Math.abs(ind.macd.histogram).toFixed(6)}` : "No MACD");

  // 19. Price within 3% of EMA21 (reversion anchor)
  const ema21Dist = ind.ema21 !== null
    ? Math.abs((ind.close - ind.ema21) / ind.ema21)
    : 0;
  add("OM", "Near EMA21 (within 3%)",
    ind.ema21 !== null && ema21Dist < 0.03,
    ind.ema21 !== null ? `Dist=${(ema21Dist * 100).toFixed(2)}%` : "No EMA21");

  // 20. Liquidity present (ATR/close > 0.3%)
  const liquidityRatio = ind.atr14 !== null && ind.close > 0 ? ind.atr14 / ind.close : 0;
  add("OM", "Liquidity present",
    liquidityRatio > 0.003,
    `ATR/Price=${(liquidityRatio * 100).toFixed(3)}%`);

  // 21. Bollinger %B healthy range (30%-70%)
  const pctB = ind.bollinger
    ? (ind.close - ind.bollinger.lower) / (ind.bollinger.upper - ind.bollinger.lower || 1)
    : 0.5;
  add("OM", "Bollinger %B healthy range (30-70%)",
    pctB >= 0.3 && pctB <= 0.7,
    `%B=${(pctB * 100).toFixed(1)}%`);

  // 22. Macro trend aligned (EMA55 > SMA200)
  add("OM", "Macro trend aligned (EMA55 > SMA200)",
    ind.ema55 !== null && ind.sma200 !== null && ind.ema55 > ind.sma200,
    ind.ema55 !== null && ind.sma200 !== null
      ? `EMA55=${ind.ema55.toFixed(6)}, SMA200=${ind.sma200.toFixed(6)}`
      : "Insufficient data");

  // 23. RSI and ADX trend harmony
  const rsiTrendHarmony = ind.rsi14 !== null && ind.adx14 !== null && ind.rsi14 > 50 && ind.adx14 > 15;
  add("OM", "RSI/ADX trend harmony (RSI > 50 & ADX > 15)",
    rsiTrendHarmony,
    ind.rsi14 !== null && ind.adx14 !== null
      ? `RSI=${ind.rsi14.toFixed(1)}, ADX=${ind.adx14.toFixed(1)}`
      : "Insufficient data");

  // 24. Self-referential resonance (≥ 14 other signals active)
  const preCount = signals.filter((s) => s.active).length;
  add("OM", "Composite resonance ≥ 14",
    preCount >= 14,
    `Active signals so far: ${preCount}/23`);

  /* ═══════════════ Frequency Score ══════════════════════ */
  const frequency = signals.filter((s) => s.active).length;
  const frequencyPct = +(frequency / 24 * 100).toFixed(1);

  // Dynamic Infrasound Noise Detection (18.8 Hz Gate criteria)
  const adxNoise = ind.adx14 !== null && ind.adx14 < 18.8;
  const rsiCongestion = ind.rsi14 !== null && ind.rsi14 >= 42.5 && ind.rsi14 <= 57.5;
  const volChop = ind.stdDev20 !== null && ind.close > 0 && (ind.stdDev20 / ind.close) < 0.01;
  const noiseGateActive = adxNoise || (rsiCongestion && volChop);

  if (noiseGateActive) {
    reasons.push(`🌌 18.8 Hz Infrasound Noise Gate is ACTIVE (ADX=${ind.adx14?.toFixed(1) ?? "N/A"}) — filtering market chop`);
  }

  /* ═══════════════ Signal Decision ══════════════════════ */
  let signal: StrategySignal;
  if (frequency >= 20) {
    signal = "STRONG_BUY";
    reasons.push(`🕉️ Deep resonance: ${frequency}/24 signals aligned — 528 Hz harmony`);
  } else if (frequency >= 16) {
    signal = "BUY";
    reasons.push(`🕉️ Harmonic convergence: ${frequency}/24 signals`);
  } else if (frequency >= 12) {
    signal = "HOLD";
    reasons.push(`⏸️ Mixed frequencies: ${frequency}/24 — waiting for clarity`);
  } else if (frequency >= 8) {
    signal = "SELL";
    reasons.push(`📉 Dissonance: ${frequency}/24 — exit positions`);
  } else {
    signal = "STRONG_SELL";
    reasons.push(`🔻 Full dissonance: ${frequency}/24 — strong exit`);
  }

  /* ═══════════════ Hz Label ═════════════════════════════ */
  let hzLabel: string;
  if (frequency >= 22) {
    hzLabel = "108 Hz 🕉️ (Cosmic Wholeness)";
  } else if (frequency >= 20) {
    hzLabel = "528 Hz ✨ (Love Frequency)";
  } else if (frequency >= 18) {
    hzLabel = noiseGateActive ? "18.8 Hz 🌌 (Noise Elimination)" : "518 Hz 🎵 (Harmonic)";
  } else if (frequency >= 16) {
    hzLabel = "518 Hz 🎵 (Harmonic)";
  } else if (frequency >= 12) {
    hzLabel = "396 Hz ⚖️ (Liberation)";
  } else if (frequency >= 8) {
    hzLabel = "285 Hz ⚠️ (Healing Needed)";
  } else {
    hzLabel = "174 Hz 🔻 (Foundation Reset)";
  }

  /* ═══════════════ Dynamic Risk Management ══════════════ */
  const atrPct = ind.atr14 !== null && ind.close > 0
    ? (ind.atr14 / ind.close) * 100
    : 2.0;

  // Higher frequency = tighter SL (more confident)
  // Lower frequency = wider SL (uncertain, protect capital)
  const slMultiplier = (24 - frequency) / 12 + 0.5; // range: 0.5–2.5
  const tpMultiplier = frequency / 8;                // range: 0–3

  return {
    strategy: "GAYATRI",
    signal,
    confidence: Math.min(1, frequencyPct / 100),
    frequency,
    frequencyPct,
    hzLabel,
    slPct: +(atrPct * slMultiplier).toFixed(2),
    tpPct: +(atrPct * Math.max(1, tpMultiplier)).toFixed(2),
    trailPct: +(atrPct * 0.75).toFixed(2),
    signals,
    reasons,
    noiseGateActive,
  };
}
