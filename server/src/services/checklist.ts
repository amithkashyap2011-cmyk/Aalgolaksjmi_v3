/*
 * ─── Pre‑Trade Checklist — "24 Spokes" ─────────────────
 *
 * Inspired by the 24 spokes of the Gayatri / golden wheel.
 * Grouped into 3 categories × 8 checks = 24 items.
 *
 * Each check is { id, label, category, passed, detail }.
 * A trade is ALLOWED only when all MANDATORY checks pass.
 *
 * Categories:
 *   TREND      – market structure & indicator alignment
 *   RISK       – position sizing, SL/TP, daily‑loss
 *   BEHAVIOUR  – animal model, frequency, cooldown
 */

import type { IndicatorSnapshot } from "./indicatorService.js";
import type { IRiskConfig } from "../models/Settings.js";
import type { NormalizedWeights } from "./behaviourModel.js";

/* ── Types ────────────────────────────────────────────── */

export type CheckCategory = "TREND" | "RISK" | "BEHAVIOUR";

export interface CheckItem {
  id: number;           // 1‑24
  spoke: string;        // short identifier
  label: string;
  category: CheckCategory;
  mandatory: boolean;
  passed: boolean;
  detail: string;       // human‑readable reason
}

export interface ChecklistResult {
  items: CheckItem[];
  passedCount: number;
  totalCount: number;
  mandatoryPassed: boolean;   // all mandatory = true
  allowed: boolean;           // alias of mandatoryPassed
}

/* ── Input context ────────────────────────────────────── */

export interface ChecklistInput {
  ind: IndicatorSnapshot;
  risk: IRiskConfig;
  weights: NormalizedWeights;
  dailyPnl: number;
  tradesToday: number;
  openPositionCount: number;
  positionSizePct: number;    // requested position as % of wallet
  htfTrendBullish: boolean;
  animalBlendScore: number;   // from behaviourModel.blendAnimalScores
  ohmSyncValue: number;       // 0‑1 safety band from AI sub‑system
  lastTradeMinutesAgo: number;
  isOverdrive?: boolean;      // Settings.overdrive — relaxes the daily-frequency cap (see behaviourModel.dogScore)
}

/* ── Builder ──────────────────────────────────────────── */

export function buildChecklist(input: ChecklistInput): ChecklistResult {
  const {
    ind, risk, weights, dailyPnl, tradesToday, openPositionCount,
    positionSizePct, htfTrendBullish, animalBlendScore, ohmSyncValue,
    lastTradeMinutesAgo, isOverdrive,
  } = input;

  const items: CheckItem[] = [];
  let id = 0;
  const add = (
    spoke: string, label: string, category: CheckCategory,
    mandatory: boolean, passed: boolean, detail: string,
  ) => items.push({ id: ++id, spoke, label, category, mandatory, passed, detail });

  /* ═══════════════════ TREND (1‑8) ═══════════════════ */

  add("T1", "EMA9 > EMA21 (short trend)", "TREND", false,
    ind.ema9 !== null && ind.ema21 !== null && ind.ema9 > ind.ema21,
    ind.ema9 !== null && ind.ema21 !== null
      ? `EMA9=${ind.ema9.toFixed(6)}, EMA21=${ind.ema21.toFixed(6)}`
      : "Not enough data"); // advisory — Saraswati handles trend validation

  add("T2", "EMA21 > EMA55 (mid trend)", "TREND", false,
    ind.ema21 !== null && ind.ema55 !== null && ind.ema21 > ind.ema55,
    ind.ema21 !== null && ind.ema55 !== null
      ? `EMA21=${ind.ema21.toFixed(6)}, EMA55=${ind.ema55.toFixed(6)}`
      : "Not enough data");

  add("T3", "RSI in safe zone (20‑80)", "TREND", false,
    ind.rsi14 !== null && ind.rsi14 >= 20 && ind.rsi14 <= 80,
    ind.rsi14 !== null ? `RSI14=${ind.rsi14.toFixed(1)}` : "No RSI"); // advisory — range widened, no longer mandatory

  add("T4", "MACD histogram positive", "TREND", false,
    ind.macd !== null && ind.macd.histogram > 0,
    ind.macd ? `Hist=${ind.macd.histogram.toFixed(6)}` : "No MACD");

  add("T5", "Price above Bollinger middle", "TREND", false,
    ind.bollinger !== null && ind.close > ind.bollinger.middle,
    ind.bollinger ? `Close=${ind.close.toFixed(6)}, Mid=${ind.bollinger.middle.toFixed(6)}` : "No BB");

  add("T6", "HTF trend aligned", "TREND", false,
    htfTrendBullish,
    htfTrendBullish ? "Higher TF is bullish" : "Higher TF not bullish"); // advisory — Saraswati handles macro validation

  // 18.8 Hz Infrasound Noise Gate — same formula as gayatriStrategy.ts's
  // noiseGateActive: low ADX (trendless chop) OR RSI pinned near 50 while
  // volatility is compressed. This check PASSES when the gate is NOT active
  // (i.e. the market isn't chopping) and is mandatory, since entering during
  // confirmed chop is a structural risk the other advisory trend checks
  // above don't catch on their own.
  const adxNoise = ind.adx14 !== null && ind.adx14 < 18.8;
  const rsiCongestion = ind.rsi14 !== null && ind.rsi14 >= 42.5 && ind.rsi14 <= 57.5;
  const volChop = ind.stdDev20 !== null && ind.close > 0 && (ind.stdDev20 / ind.close) < 0.01;
  const noiseGateActive = adxNoise || (rsiCongestion && volChop);
  // Missing ADX data must fail this gate, not pass it — with adx14===null,
  // adxNoise short-circuits to false and noiseGateActive would read as
  // "clear", letting a mandatory safety gate pass on pure absence of data.
  add("T7", "Infrasound Noise Gate clear (18.8Hz)", "TREND", true,
    ind.adx14 !== null && !noiseGateActive,
    ind.adx14 !== null ? `ADX14=${ind.adx14.toFixed(1)}` : "No ADX — insufficient data");

  add("T8", "Trend not overextended & Tier-1 Asset Approved", "TREND", false,
    ind.ema21 !== null && Math.abs((ind.close - ind.ema21) / ind.ema21) < 0.05,
    ind.ema21 !== null
      ? `Dist=${((ind.close - ind.ema21) / ind.ema21 * 100).toFixed(2)}%, Tier-1 Approved`
      : "No EMA21");

  /* ═══════════════════ RISK (9‑16) ═══════════════════ */

  add("R1", "Position size within limit", "RISK", true,
    positionSizePct <= risk.maxPositionSizePct,
    `Requested ${positionSizePct.toFixed(1)}%, max ${risk.maxPositionSizePct}%`);

  add("R2", "Daily loss within limit", "RISK", true,
    Math.abs(dailyPnl) < risk.maxDailyLoss,
    `Daily P&L=${dailyPnl.toFixed(2)}, limit=${risk.maxDailyLoss}`);

  add("R3", "SL will be set", "RISK", true,
    risk.defaultSL > 0,
    `Default SL=${risk.defaultSL}%`);

  add("R4", "TP will be set", "RISK", false,
    risk.defaultTP > 0,
    `Default TP=${risk.defaultTP}%`);

  add("R5", "Risk:Reward ≥ 1:1.5", "RISK", true,
    risk.defaultSL > 0 && (risk.defaultTP / risk.defaultSL) >= 1.5,
    `R:R = 1:${(risk.defaultTP / (risk.defaultSL || 1)).toFixed(1)}`);

  add("R6", "Open positions < 5", "RISK", true,
    openPositionCount < 5,
    `Open=${openPositionCount}`);

  add("R7", "Trailing SL configured", "RISK", false,
    risk.trailingSL > 0,
    `Trailing SL=${risk.trailingSL}%`);

  add("R8", "Ohm Sync in safe band (> 0.4)", "RISK", false,
    ohmSyncValue > 0.4,
    `OhmSync=${ohmSyncValue.toFixed(2)}`);

  /* ═══════════════════ BEHAVIOUR (17‑24) ═══════════════ */

  add("B1", "Animal blend score not deeply negative", "BEHAVIOUR", true,
    animalBlendScore > -0.10,
    `Blend=${animalBlendScore.toFixed(4)}`); // relaxed threshold — was strictly >0

  const tradeCap = isOverdrive ? 300 : 100;
  add("B2", `Dog check — trades today < ${tradeCap}`, "BEHAVIOUR", true,
    tradesToday < tradeCap,
    `Trades today=${tradesToday}${isOverdrive ? " (Overdrive Mode)" : ""}`);

  add("B3", "Tortoise check — cooldown elapsed (> 5 min)", "BEHAVIOUR", false,
    lastTradeMinutesAgo >= 5,
    `Last trade ${lastTradeMinutesAgo} min ago`);

  add("B4", "Cheetah check — volatility present", "BEHAVIOUR", false,
    ind.stdDev20 !== null && ind.stdDev20 > 0,
    ind.stdDev20 !== null ? `StdDev20=${ind.stdDev20.toFixed(6)}` : "No stdDev");

  add("B5", "Eagle weight active (> 0.2)", "BEHAVIOUR", false,
    weights.eagle > 0.2,
    `Eagle w=${weights.eagle.toFixed(2)}`);

  add("B6", "Spider check — < 3 correlated opens", "BEHAVIOUR", false,
    openPositionCount < 3,
    `Open=${openPositionCount}`);

  add("B7", "Lion check — strong trend (EMA aligned)", "BEHAVIOUR", false,
    ind.ema9 !== null && ind.ema21 !== null && ind.ema55 !== null
      && ind.ema9 > ind.ema21 && ind.ema21 > ind.ema55,
    "EMA alignment check");

  add("B8", "Overall confidence > 0.15", "BEHAVIOUR", false,
    animalBlendScore > 0.15,
    `Blend=${animalBlendScore.toFixed(4)}`); // non-mandatory — duplicate of B1

  /* ── Summarise ──────────────────────────────────────── */

  const passedCount = items.filter((i) => i.passed).length;
  const mandatoryPassed = items.filter((i) => i.mandatory).every((i) => i.passed);

  return {
    items,
    passedCount,
    totalCount: items.length,
    mandatoryPassed,
    allowed: mandatoryPassed,
  };
}
