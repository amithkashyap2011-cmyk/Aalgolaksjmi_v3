/*
 * ─── Agent Service — the "trading brain" ───────────────
 *
 * Layers:  indicators → behaviour blend → ML/DL fusion → rule scoring → decision
 *
 * Public API:
 *   buildContext(symbol, mode, userId)
 *   scoreLong(ctx)   → 0‑1
 *   scoreExit(ctx)   → 0‑1
 *   scoreNoTrade(ctx) → 0‑1
 *   decideAction(ctx) → { action, confidences, contributions, checklist, ml, dl }
 *   recommend(symbol, mode, userId) → full recommendation
 */

import { getKlines, type Kline } from "./binanceService.js";
import { computeSnapshot, type IndicatorSnapshot, type OHLC } from "./indicatorService.js";
import {
  normalizeWeights,
  blendAnimalScores,
  type NormalizedWeights,
  type AnimalContributions,
  type AnimalContext,
} from "./behaviourModel.js";
import { buildChecklist, type ChecklistResult, type ChecklistInput } from "./checklist.js";
import { Settings, type IRiskConfig, type IBehaviorWeights } from "../models/Settings.js";
import { Trade } from "../models/Trade.js";
import * as paper from "./paperState.js";
import {
  evaluateLakshmi,
} from "./strategies/index.js";

/* ── ML & DL model hooks (Phase 5) ───────────────────── */
import { predict as mlPredict, buildMLFeatures, type MLPrediction } from "./mlModelService.js";
import { predictSequence as dlPredict, buildSequenceInput, type DLPrediction } from "./dlModelService.js";

/* ════════════════════════════════════════════════════════
 *  Types
 * ════════════════════════════════════════════════════════ */

export type Action = "LONG" | "EXIT" | "NO_TRADE";

export interface AgentContext {
  symbol: string;
  mode: "PAPER" | "LIVE";
  userId: string;
  /** OHLC bars fed to indicators (oldest → newest) */
  bars: OHLC[];
  ind: IndicatorSnapshot;
  weights: NormalizedWeights;
  risk: IRiskConfig;
  dailyPnl: number;
  tradesToday: number;
  openPositionCount: number;
  htfTrendBullish: boolean;
  volatilityRatio: number;
  animalBlend: { score: number; contributions: AnimalContributions };
  /** ML model prediction (Phase 5) */
  mlPrediction: MLPrediction;
  /** DL model prediction (Phase 5) */
  dlPrediction: DLPrediction;
}

export interface FusionMeta {
  /** Effective weight assigned to rule-based layer (may exceed 0.5 if ML/DL confidence is low) */
  effRuleWeight: number;
  /** Effective weight assigned to ML layer (scaled by confidence) */
  effMLWeight: number;
  /** Effective weight assigned to DL layer (scaled by confidence) */
  effDLWeight: number;
  /** Whether ML and DL layers agreed on direction (both bullish or both bearish) */
  modelsAgree: boolean;
  /** Agreement bonus applied to the fused score (0 if no agreement or low confidence) */
  agreementBonus: number;
}

export interface Decision {
  action: Action;
  confidenceLong: number;
  confidenceExit: number;
  confidenceNoTrade: number;
  contributions: AnimalContributions;
  checklist: ChecklistResult;
  /** ML model output (Phase 5) */
  ml: MLPrediction;
  /** DL model output (Phase 5) */
  dl: DLPrediction;
  /** Fusion layer metadata (Phase 5) */
  fusion: FusionMeta;
}

/* ════════════════════════════════════════════════════════
 *  buildContext
 * ════════════════════════════════════════════════════════ */

export async function buildContext(
  symbol: string,
  mode: "PAPER" | "LIVE",
  userId: string,
): Promise<AgentContext> {
  /* 1. Fetch last 200 bars (5m) for indicators */
  const klines: Kline[] = await getKlines(symbol, "5m", undefined, undefined, 200);
  const bars: OHLC[] = klines.map((k) => ({
    open: parseFloat(k.open),
    high: parseFloat(k.high),
    low: parseFloat(k.low),
    close: parseFloat(k.close),
  }));

  /* 2. Compute indicators */
  const ind = computeSnapshot(bars);

  /* 3. Load settings */
  const settings = await Settings.findOne({ userId });
  const riskConfig: IRiskConfig = settings?.riskConfig ?? {
    maxDailyLoss: 100, maxPositionSizePct: 21,
    defaultSL: 2, defaultTP: 4, trailingSL: 1,
  };
  const rawWeights: IBehaviorWeights = settings?.behaviorWeights ?? {
    eagle: 50, tiger: 50, cheetah: 50, fox: 50, tortoise: 50,
    dog: 50, owl: 50, cow: 50, spider: 50, lion: 50,
    om_chant: 50, gayatri_mantra: 50, aaryan: 50, aayush: 50, lakshmi_hybrid: 50,
  };
  const weights = normalizeWeights(rawWeights);

  /* 4. Daily P&L + trade count */
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTrades = await Trade.find({
    userId, mode,
    openedAt: { $gte: todayStart },
  }).lean();

  const dailyPnl = todayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const tradesToday = todayTrades.length;
  const openPositionCount = paper.getOpenPositions(userId, mode).length;

  /* 5. HTF trend — check 1h EMA alignment via a quick 55‑bar fetch */
  let htfTrendBullish = true;
  try {
    const htfKlines = await getKlines(symbol, "1h", undefined, undefined, 60);
    const htfBars = htfKlines.map((k) => ({
      open: parseFloat(k.open), high: parseFloat(k.high),
      low: parseFloat(k.low), close: parseFloat(k.close),
    }));
    const htfInd = computeSnapshot(htfBars);
    htfTrendBullish =
      htfInd.ema9 !== null && htfInd.ema21 !== null && htfInd.ema9 > htfInd.ema21;
  } catch {
    /* fallback to true if data unavailable */
  }

  /* 6. Volatility ratio */
  const volatilityRatio =
    ind.stdDev20 !== null && ind.close > 0 ? ind.stdDev20 / ind.close : 0.01;

  /* 7. Blend animal scores */
  const animalCtx: AnimalContext = {
    ind, dailyPnl, tradesToday,
    maxDailyLoss: riskConfig.maxDailyLoss,
    htfTrendBullish, volatilityRatio,
  };
  const animalBlend = blendAnimalScores(weights, animalCtx);

  /* 8. ML prediction (Phase 5) */
  const mlFeatures = buildMLFeatures(
    ind, weights, dailyPnl, riskConfig.maxDailyLoss, tradesToday, openPositionCount,
  );
  const mlPrediction = await mlPredict(mlFeatures);

  /* 9. DL prediction (Phase 5) */
  const seqInput = buildSequenceInput(symbol, "5m", bars, 60);
  const dlPrediction = await dlPredict(seqInput);

  return {
    symbol, mode, userId,
    bars, ind, weights, risk: riskConfig,
    dailyPnl, tradesToday, openPositionCount,
    htfTrendBullish, volatilityRatio,
    animalBlend, mlPrediction, dlPrediction,
  };
}

/* ════════════════════════════════════════════════════════
 *  Scoring functions (deterministic, 0‑1)
 * ════════════════════════════════════════════════════════ */

/**
 * Score for opening a LONG position.
 * Blends indicator signals with animal model and strategy consensus.
 */
export function scoreLong(ctx: AgentContext): number {
  let base = 0;
  const { ind, animalBlend } = ctx;

  // RSI sweet spot (35‑55 = opportunity)
  if (ind.rsi14 !== null) {
    if (ind.rsi14 >= 35 && ind.rsi14 <= 55) base += 0.25;
    else if (ind.rsi14 < 30) base += 0.15; // oversold — potential reversal
    else if (ind.rsi14 > 70) base -= 0.2;  // overbought — avoid
  }

  // EMA alignment
  if (ind.ema9 !== null && ind.ema21 !== null) {
    if (ind.ema9 > ind.ema21) base += 0.2;
    else base -= 0.1;
  }

  // MACD positive histogram
  if (ind.macd && ind.macd.histogram > 0) base += 0.15;

  // Price near lower Bollinger = opportunity
  if (ind.bollinger) {
    const pos = (ind.close - ind.bollinger.lower) / (ind.bollinger.upper - ind.bollinger.lower || 1);
    if (pos < 0.3) base += 0.15;
  }

  // ADX trend strength — strong trend boosts long conviction
  if (ind.adx14 !== null) {
    if (ind.adx14 > 25) base += 0.10;      // trending market
    else if (ind.adx14 < 15) base -= 0.05; // ranging — less conviction
  }

  // HTF confirmation
  if (ctx.htfTrendBullish) base += 0.1;

  // Lakshmi hybrid strategy consensus boost
  const lakshmi = evaluateLakshmi(ind, animalBlend.score);
  if (lakshmi.signal === "BUY") base += 0.15;
  else if (lakshmi.signal === "SELL") base -= 0.10;

  // Blend animal score (already in roughly ‑1..+1 range)
  base += animalBlend.score * 0.3;

  return clamp01(base);
}

/**
 * Score for EXITING an existing position.
 */
export function scoreExit(ctx: AgentContext): number {
  let base = 0;
  const { ind, animalBlend } = ctx;

  // RSI overbought
  if (ind.rsi14 !== null && ind.rsi14 > 70) base += 0.35;

  // EMA bearish cross
  if (ind.ema9 !== null && ind.ema21 !== null && ind.ema9 < ind.ema21) base += 0.2;

  // MACD histogram turning negative
  if (ind.macd && ind.macd.histogram < 0) base += 0.2;

  // Bollinger upper breach = potential reversal
  if (ind.bollinger && ind.close > ind.bollinger.upper) base += 0.15;

  // ADX declining from high level = trend weakening
  if (ind.adx14 !== null && ind.adx14 < 20) base += 0.05;

  // Negative animal blend
  if (animalBlend.score < -0.1) base += 0.2;

  // Lakshmi consensus SELL signal
  const lakshmi = evaluateLakshmi(ind, animalBlend.score);
  if (lakshmi.signal === "SELL") base += 0.15;

  return clamp01(base);
}

/**
 * Score for doing NOTHING (stay flat).
 */
export function scoreNoTrade(ctx: AgentContext): number {
  let base = 0.3; // start with mild "do nothing" bias (safety)

  // Low volatility = nothing to do
  if (ctx.volatilityRatio < 0.005) base += 0.3;

  // RSI in dead zone (45‑55)
  if (ctx.ind.rsi14 !== null && ctx.ind.rsi14 >= 45 && ctx.ind.rsi14 <= 55) base += 0.15;

  // Too many trades today
  if (ctx.tradesToday > 6) base += 0.25;

  // Daily loss close to limit
  if (Math.abs(ctx.dailyPnl) > ctx.risk.maxDailyLoss * 0.8) base += 0.3;

  return clamp01(base);
}

/* ════════════════════════════════════════════════════════
 *  decideAction — fused decision (rules + ML + DL)
 *
 *  Blending weights (configurable):
 *    RULE_WEIGHT = 0.50  (indicator + animal model)
 *    ML_WEIGHT   = 0.25  (classical ML)
 *    DL_WEIGHT   = 0.25  (deep learning sequence)
 *
 *  Weights of ML/DL are scaled by their own confidence so
 *  stub models (confidence=0) contribute nothing.
 *
 *  Risk & checklist ALWAYS have final veto — no model can
 *  bypass max‑loss, position limits, or mandatory checks.
 * ════════════════════════════════════════════════════════ */

export const RULE_WEIGHT = 0.50;
export const ML_WEIGHT   = 0.25;
export const DL_WEIGHT   = 0.25;

/**
 * Agreement bonus — when both ML and DL agree on direction (both bullish
 * or both bearish) AND both have meaningful confidence, we add a small
 * bonus to the winning side.  Capped at AGREEMENT_BONUS_MAX.
 */
export const AGREEMENT_BONUS_MAX = 0.08;

export function decideAction(ctx: AgentContext): Decision {
  /* ── 1. Rule‑based scores ───────────────────────────── */
  const rLong = scoreLong(ctx);
  const rExit = scoreExit(ctx);
  const rNo   = scoreNoTrade(ctx);

  /* ── 2. ML contribution (scaled by confidence) ──────── */
  const mlConf = ctx.mlPrediction.confidence;   // 0 for stub
  const mlLong = ctx.mlPrediction.profitProbability;
  const mlExit = 1 - mlLong;                    // inverse
  const mlNo   = 0.5;                           // neutral

  /* ── 3. DL contribution (scaled by confidence) ──────── */
  const dlConf = ctx.dlPrediction.confidence;   // 0 for stub
  const dlLong = ctx.dlPrediction.directionScore;
  const dlExit = 1 - dlLong;
  const dlNo   = 0.5;

  /* ── 4. Effective weights (ML/DL fade out when conf=0) */
  const effML = ML_WEIGHT * mlConf;
  const effDL = DL_WEIGHT * dlConf;
  const effRule = RULE_WEIGHT + (ML_WEIGHT - effML) + (DL_WEIGHT - effDL);
  // effRule + effML + effDL always sums to 1.0

  /* ── 5. Fused scores ────────────────────────────────── */
  let cLong = effRule * rLong + effML * mlLong + effDL * dlLong;
  let cExit = effRule * rExit + effML * mlExit + effDL * dlExit;
  let cNo   = effRule * rNo   + effML * mlNo   + effDL * dlNo;

  /* ── 5b. Agreement bonus (Phase 5) ─────────────────── */
  /*   When ML and DL agree AND both have meaningful
   *   confidence (>0.3), add a small bonus to the
   *   agreed‑upon direction. This rewards model consensus. */
  const minConf = Math.min(mlConf, dlConf);
  const bothBullish = mlLong > 0.5 && dlLong > 0.5;
  const bothBearish = mlLong < 0.5 && dlLong < 0.5;
  const modelsAgree = (bothBullish || bothBearish) && minConf > 0.3;
  let agreementBonus = 0;

  if (modelsAgree) {
    agreementBonus = Math.min(AGREEMENT_BONUS_MAX, minConf * 0.1);
    if (bothBullish) {
      cLong += agreementBonus;
    } else {
      cExit += agreementBonus;
    }
  }

  /* ── 6. Determine winning action ────────────────────── */
  let action: Action;
  if (cLong >= cExit && cLong >= cNo && cLong > 0.35) {
    action = "LONG";
  } else if (cExit >= cLong && cExit >= cNo && cExit > 0.3) {
    action = "EXIT";
  } else {
    action = "NO_TRADE";
  }

  /* ── 7. Checklist — mandatory risk/trend/behaviour gate */
  const checkInput: ChecklistInput = {
    ind: ctx.ind,
    risk: ctx.risk,
    weights: ctx.weights,
    dailyPnl: ctx.dailyPnl,
    tradesToday: ctx.tradesToday,
    openPositionCount: ctx.openPositionCount,
    positionSizePct: ctx.risk.maxPositionSizePct,
    htfTrendBullish: ctx.htfTrendBullish,
    animalBlendScore: ctx.animalBlend.score,
    ohmSyncValue: 0.6, // placeholder until Ohm AI subsystem
    lastTradeMinutesAgo: 10, // placeholder
  };
  const checklist = buildChecklist(checkInput);

  /* ── 8. VETO: checklist blocks LONG → NO_TRADE ──────── */
  /*    No model (ML/DL) can bypass risk or mandatory checks */
  if (action === "LONG" && !checklist.allowed) {
    action = "NO_TRADE";
  }

  /* ── 9. EXIT VETO: daily‑loss breach forces NO_TRADE ── */
  /*    If daily loss already exceeds the limit, block EXIT
   *    from opening reverse positions as well — safety‑first. */
  if (action === "EXIT" && Math.abs(ctx.dailyPnl) >= ctx.risk.maxDailyLoss) {
    action = "NO_TRADE";
  }

  /* ── Build fusion metadata ──────────────────────────── */
  const fusion: FusionMeta = {
    effRuleWeight: +effRule.toFixed(4),
    effMLWeight:   +effML.toFixed(4),
    effDLWeight:   +effDL.toFixed(4),
    modelsAgree,
    agreementBonus: +agreementBonus.toFixed(4),
  };

  return {
    action,
    confidenceLong: +cLong.toFixed(4),
    confidenceExit: +cExit.toFixed(4),
    confidenceNoTrade: +cNo.toFixed(4),
    contributions: ctx.animalBlend.contributions,
    checklist,
    ml: ctx.mlPrediction,
    dl: ctx.dlPrediction,
    fusion,
  };
}

/* ════════════════════════════════════════════════════════
 *  recommend — convenience: build context + decide
 * ════════════════════════════════════════════════════════ */

export async function recommend(
  symbol: string,
  mode: "PAPER" | "LIVE",
  userId: string,
): Promise<Decision & { symbol: string; mode: string }> {
  const ctx = await buildContext(symbol, mode, userId);
  const decision = decideAction(ctx);
  return { symbol, mode, ...decision };
}

/* ── util ─────────────────────────────────────────────── */

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
