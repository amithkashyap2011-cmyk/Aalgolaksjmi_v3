/*
 * ─── Ensemble AI Service ─────────────────────────────────
 *
 * Multi-model research ensemble for institutional-grade crypto.
 * Combines classical ML, deep learning, reinforcement learning,
 * and market microstructure signal paths.
 *
 * The implementation below is intentionally modular: each model
 * can be upgraded independently while the ensemble voting layer
 * remains stable.
 */

import type { IndicatorSnapshot, OHLC, OHLCVol } from "./indicatorService.js";
import { computeSnapshot, StreamingVWAP, computeSupertrend } from "./indicatorService.js";
import { buildSequenceInput, predictSequence, predictSequenceLocalAttention, predictSequenceLocalTransformer, predictSequenceLocalMamba, predictSequenceLocalxLSTM, callQuantEngine, type SequenceInput, type DLPrediction } from "./dlModelService.js";
import { getQuantModelHealth, quantModelMayVote, type QuantModelHealthMap, type QuantModelKey } from "./ensemble/modelHealthService.js";
import { mambaPredictor } from "./aqea/ai/MambaPredictor.js";
import { transformerPredictor } from "./aqea/ai/TransformerPredictor.js";
import { buildMLFeatures, type MLFeatures, type MLPrediction } from "./mlModelService.js";
import * as binance from "./binanceService.js";
import * as selfLearning from "./selfLearningService.js";
import * as registry from "./modelRegistry.js";
import mongoose from "mongoose";
import { AI_ENDPOINTS } from "../config/aiEndpointRegistry.js";
import { Trade } from "../models/Trade.js";
import { toValidObjectId } from "../utils/mongoUtils.js";
import { OrderFlowEngine } from "./aqea/orderFlowEngine.js";

export type MarketRegime =
  | "Strong Bull"
  | "Bull"
  | "Sideways"
  | "Bear"
  | "Strong Bear"
  | "High Volatility"
  | "Low Volatility";

export interface RiskSizing {
  recommendedPositionPct: number;
  kellyPct: number;
  volatilityAdjustedPct: number;
  maxDailyDrawdownPct: number;
  maxWeeklyDrawdownPct: number;
  maxMonthlyDrawdownPct: number;
  emergencyKillActive: boolean;
}

export interface ModelContribution {
  modelName: string;
  category: string;
  weight: number;
  longProbability: number;
  shortProbability: number;
  confidence: number;
  expectedReturn: number;
  expectedDrawdown: number;
  notes: string;
}

export interface EnsembleReport {
  symbol: string;
  interval: string;
  computedAt: string;
  regime: MarketRegime;
  regimeScore: number;
  marketPulse: {
    vwap: number;
    fundingRate: number;
    openInterest: number;
    orderBookImbalance: number;
    volatilityScore: number;
    liquidityPulse: number;
  };
  models: ModelContribution[];
  /** Directional call derived from the ensemble probabilities + confidence. */
  signal: "LONG" | "SHORT" | "NEUTRAL";
  longProbability: number;
  shortProbability: number;
  confidence: number;
  expectedReturn: number;
  expectedDrawdown: number;
  riskSizing: RiskSizing;
  selfLearning?: {
    retrainWeekly: boolean;
    strategyDecayDetected: boolean;
    regimeChangeDetected: boolean;
    overfittingRisk: boolean;
    notes: string[];
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function scoreOrderBookImbalance(book: { bids: { price: number; quantity: number }[]; asks: { price: number; quantity: number }[] }) {
  const bidSize = book.bids.reduce((sum, x) => sum + x.quantity, 0);
  const askSize = book.asks.reduce((sum, x) => sum + x.quantity, 0);
  return bidSize + askSize > 0 ? clamp((bidSize - askSize) / (bidSize + askSize), -1, 1) : 0;
}

function scoreLiquidityPulse(openInterest: number) {
  return openInterest > 0 ? clamp(openInterest / 1_200_000_000, 0, 1) : 0;
}

function detectMarketRegime(ind: IndicatorSnapshot, vwap: number, openInterest: number, fundingRate: number, orderBookImbalance: number): { regime: MarketRegime; score: number } {
  const emaBull = (ind.ema9 ?? 0) > (ind.ema21 ?? 0) && (ind.ema21 ?? 0) > (ind.ema55 ?? 0);
  const emaBear = (ind.ema9 ?? 0) < (ind.ema21 ?? 0) && (ind.ema21 ?? 0) < (ind.ema55 ?? 0);
  const trendStrength = ind.adx14 ?? 0;
  const priceAboveVwap = ind.close >= vwap;
  const volatilityScore = ind.stdDev20 !== null && ind.close > 0 ? (ind.stdDev20 / ind.close) : 0;

  if (trendStrength >= 30 && emaBull) {
    return { regime: "Strong Bull", score: 0.95 };
  }
  if (trendStrength >= 30 && emaBear) {
    return { regime: "Strong Bear", score: 0.95 };
  }
  if (volatilityScore > 0.09) {
    return { regime: "High Volatility", score: clamp(volatilityScore * 5, 0.5, 0.95) };
  }
  if (volatilityScore < 0.012) {
    return { regime: "Low Volatility", score: clamp(0.75 - volatilityScore * 20, 0.35, 0.85) };
  }
  if (trendStrength < 18) {
    return { regime: "Sideways", score: 0.60 };
  }
  if (priceAboveVwap) {
    return { regime: "Bull", score: 0.70 + clamp(orderBookImbalance, 0, 0.15) };
  }
  return { regime: "Bear", score: 0.70 + clamp(-orderBookImbalance, 0, 0.15) };
}

export function computeRiskSizing(overallWin: number, expectedReturn: number, volatilityScore: number, drawdownWarning: boolean, expectedDrawdown: number): RiskSizing {
  const baseRisk = 0.03;
  const probabilityFactor = clamp(overallWin - 0.5, 0, 0.4);
  const volatilityFactor = clamp(0.12 - volatilityScore, 0, 0.08);
  const recommendedPositionPct = clamp(baseRisk + probabilityFactor * 0.5 + volatilityFactor * 0.5, 0.01, 0.12);
  // Standard Kelly criterion: f* = W - (1-W)/R, where W is win probability
  // and R is the payoff ratio (expected win size / expected loss size).
  // The ensemble already estimates both sides of that ratio per-symbol —
  // expectedReturn (weighted favorable move) and expectedDrawdown (weighted
  // adverse move) — they just weren't being used for this. The previous
  // formula, (overallWin - 0.5) / max(0.05, 1 - overallWin), doesn't match
  // Kelly under any payoff ratio and silently dropped expectedReturn as an
  // unused parameter, despite being labeled "Kelly Criterion" in the UI.
  const payoffRatio = Math.max(0.05, expectedDrawdown > 0 ? expectedReturn / expectedDrawdown : 1);
  const kellyPct = clamp(overallWin - (1 - overallWin) / payoffRatio, 0, 0.25);
  const volatilityAdjustedPct = clamp(recommendedPositionPct * (1 - volatilityScore), 0.01, 0.12);

  return {
    recommendedPositionPct,
    kellyPct,
    volatilityAdjustedPct,
    maxDailyDrawdownPct: 3,
    maxWeeklyDrawdownPct: 7,
    maxMonthlyDrawdownPct: 15,
    emergencyKillActive: drawdownWarning,
  };
}

function buildModelContribution(params: {
  name: string;
  category: string;
  score: number;
  confidence: number;
  expectedReturn: number;
  weight: number;
  notes?: string;
}): ModelContribution {
  const longProbability = clamp(0.5 + params.score * 0.5, 0, 1);
  const shortProbability = clamp(1 - longProbability, 0, 1);
  const expectedDrawdown = clamp(0.06 + (1 - params.confidence) * 0.08 + Math.abs(params.score - 0.5) * 0.02, 0.02, 0.22);
  return {
    modelName: params.name,
    category: params.category,
    weight: params.weight,
    longProbability,
    shortProbability,
    confidence: clamp(params.confidence, 0, 1),
    expectedReturn: params.expectedReturn,
    expectedDrawdown,
    notes: params.notes ?? "",
  };
}

function classicalModelScore(features: MLFeatures, seed: number) {
  const base = (features.wEagle + features.wTiger + features.wCheetah) / 3 * 0.35
    + (1 - features.wTortoise) * 0.10
    + clamp(features.rsi14 - 50, -30, 30) / 120
    + clamp(features.changePercent, -3, 3) / 10;
  return clamp(0.46 + seed * 0.05 + base * 0.18, 0.05, 0.99);
}

function classicalExpectedReturn(score: number, volatilityScore: number, fundingRate: number) {
  return clamp((score - 0.5) * 0.035 + fundingRate * 0.35 - volatilityScore * 0.007, -0.04, 0.08);
}

function reinforcementAgentScore(regimeScore: number, orderBookImbalance: number, fundingRate: number) {
  const base = 0.5 + (regimeScore - 0.5) * 0.2 + orderBookImbalance * 0.1 + fundingRate * 15;
  return clamp(base, 0.08, 0.92);
}

function transformDLResponse(pred: any, name: string, weight: number): ModelContribution {
  const longProbability = clamp(pred.probability ?? pred.directionScore ?? 0.5, 0, 1);
  const shortProbability = 1 - longProbability;
  const expectedReturn = pred.predictedMove ?? 0;
  const confidence = clamp(pred.confidence * 0.95, 0.2, 0.99);
  return {
    modelName: name,
    category: "DEEP_LEARNING",
    weight,
    longProbability,
    shortProbability,
    confidence,
    expectedReturn,
    expectedDrawdown: clamp(0.05 + (1 - confidence) * 0.12, 0.03, 0.22),
    notes: `Signal path contribution from ${name}`,
  };
}

/* ════════════════════════════════════════════════════════
 *  Real trained-model wiring (quant engine)
 * ════════════════════════════════════════════════════════ */

/**
 * Build the 12-dim institutional feature vector the CNN/LSTM quant models
 * were trained on (same layout as CNNPredictor/LSTMPredictor):
 * [open, high, low, close, volume, ret1, vol1, distMa, hiLow, std14, ma9, ma21].
 */
function buildInstitutionalVector(bars: OHLCVol[]): number[] {
  const last = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : last;
  const close = last.close;
  const ret1 = prev.close > 0 ? close / prev.close - 1 : 0;
  const vol = last.volume || 1;
  const vol1 = prev.volume > 0 ? vol / prev.volume - 1 : 0;

  const closes = bars.map((b) => b.close);
  const last21 = closes.slice(-21);
  while (last21.length < 21) last21.push(close);
  const ma21 = last21.reduce((a, b) => a + b, 0) / 21;

  const last9 = closes.slice(-9);
  while (last9.length < 9) last9.push(close);
  const ma9 = last9.reduce((a, b) => a + b, 0) / 9;

  const distMa = ma21 > 0 ? close / ma21 - 1 : 0;
  const hiLow = last.low > 0 ? last.high / last.low - 1 : 0;

  const last14 = closes.slice(-14);
  while (last14.length < 14) last14.push(close);
  const m14 = last14.reduce((a, b) => a + b, 0) / 14;
  const s14 = Math.sqrt(last14.map((x) => (x - m14) ** 2).reduce((a, b) => a + b, 0) / 14);
  const std14 = m14 > 0 ? s14 / m14 : 0;

  return [last.open, last.high, last.low, close, vol, ret1, vol1, distMa, hiLow, std14, ma9, ma21]
    .map((v) => (Number.isFinite(v) ? v : 0));
}

/**
 * Build a 32-dim PPO execution state vector from the ensemble context.
 * PPO is an execution/sizing agent, not a directional model, so we only
 * populate the regime / order-flow / market slots it uses.
 */
function buildPpoStateVector(ind: IndicatorSnapshot, regimeScore: number, orderBookImbalance: number, fundingRate: number, liquidityPulse: number, vwap: number): number[] {
  const close = ind.close || 1;
  const sv: number[] = [
    // Regime (5)
    regimeScore, regimeScore, 0, 0, 0,
    // Order flow (5)
    0, 0, 0, fundingRate * 1000, liquidityPulse,
    // Smart money (5)
    0, 0, 0, 0, vwap / close,
    // CNN signal (2)
    0, 0,
    // Risk & context (5)
    0, 0, 0, 0, 0,
    // Market (5)
    (ind.rsi14 ?? 50) / 100,
    (ind.adx14 ?? 0) / 100,
    (ind.atr14 ?? 0) / close,
    (ind.macd?.histogram ?? 0) / close,
    orderBookImbalance,
  ];
  while (sv.length < 32) sv.push(0);
  return sv.slice(0, 32).map((v) => (Number.isFinite(v) ? v : 0));
}

/**
 * Map a quant-engine classifier response ({direction, confidence, probs})
 * into a ModelContribution using the REAL model probabilities. Directional
 * lean is derived from the true LONG/SHORT class probabilities — no
 * fabricated confidence.
 */
function classifierToContribution(
  resp: { direction?: string; confidence?: number; probability?: number; probs?: { LONG?: number; SHORT?: number; HOLD?: number } },
  name: string,
  category: string,
  weight: number,
  notes: string,
): ModelContribution {
  const pLongRaw = clamp(resp.probs?.LONG ?? 0, 0, 1);
  const pShortRaw = clamp(resp.probs?.SHORT ?? 0, 0, 1);
  // Centre on 0.5 and lean by the real long-vs-short class-probability spread.
  let longProbability = clamp(0.5 + (pLongRaw - pShortRaw) / 2, 0, 1);
  if (resp.probs?.LONG === undefined && resp.probs?.SHORT === undefined) {
    // No class breakdown — fall back to the reported direction + confidence.
    const conf = clamp(resp.confidence ?? 0.5, 0, 1);
    longProbability = resp.direction === "LONG" ? clamp(0.5 + conf / 2, 0, 1)
      : resp.direction === "SHORT" ? clamp(0.5 - conf / 2, 0, 1)
      : 0.5;
  }
  const confidence = clamp(resp.confidence ?? 0, 0, 1);
  return {
    modelName: name,
    category,
    weight,
    longProbability,
    shortProbability: clamp(1 - longProbability, 0, 1),
    confidence,
    expectedReturn: 0,
    expectedDrawdown: clamp(0.05 + (1 - confidence) * 0.12, 0.03, 0.22),
    notes,
  };
}

/** A transparent, non-voting (weight 0) placeholder for a real model that
 *  was gated out (DEGRADED/stub/offline). Shown in the report so the UI can
 *  see the model was considered and why it does not contribute. */
function gatedPlaceholder(name: string, category: string, reason: string): ModelContribution {
  return {
    modelName: name,
    category,
    weight: 0,
    longProbability: 0.5,
    shortProbability: 0.5,
    confidence: 0,
    expectedReturn: 0,
    expectedDrawdown: 0,
    notes: `Gated to weight 0 — ${reason}. Does not vote.`,
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════
 *  Dynamic Mixture-of-Experts (MoE) Softmax Router
 * ═══════════════════════════════════════════════════════════════════
 * Evaluates real-time market micro-conditions to dynamically route
 * voting weight to specialized model families:
 *   - Momentum & Deep Sequence Experts: (cnn, lstm-bilstm, mamba-hybrid, xlstm)
 *   - Microstructure & Mean-Reversion: (transformer, tabular, xgboost, lightgbm)
 *   - Execution & Risk Preservation Agent: (ppo-agent)
 */
export interface MoEContext {
  regime: MarketRegime;
  regimeScore: number;
  adx: number;
  volatilityScore: number;
  orderBookImbalance: number;
  cvdNormalized?: number;
  fundingRate: number;
}

export function getDynamicMoEWeights(
  baseWeights: Record<string, number>,
  ctx: MoEContext
): Record<string, number> {
  const { regime, adx, volatilityScore, orderBookImbalance, cvdNormalized = 0, fundingRate } = ctx;

  const isTrending = ["Strong Bull", "Bull", "Strong Bear", "Bear"].includes(regime) || adx >= 25;
  const isChop = ["Sideways", "Low Volatility"].includes(regime) || adx < 20;
  const isHighVol = regime === "High Volatility" || volatilityScore > 0.045;
  const strongFlow = Math.abs(cvdNormalized) > 0.3 || Math.abs(orderBookImbalance) > 0.35;

  const adapted: Record<string, number> = {};
  let totalScore = 0;

  for (const [id, baseWeight] of Object.entries(baseWeights)) {
    let multiplier = 1.0;

    // 1. Momentum & Deep Sequence Experts
    if (["cnn", "lstm-bilstm", "mamba-hybrid", "xlstm"].includes(id)) {
      if (isTrending) multiplier *= 1.45;
      if (strongFlow) multiplier *= 1.25;
      if (isChop) multiplier *= 0.70;
      if (isHighVol) multiplier *= 0.85;
    }

    // 2. Microstructure & Mean-Reversion Experts
    if (["transformer", "xgboost", "lightgbm"].includes(id)) {
      if (isChop) multiplier *= 1.40;
      if (Math.abs(fundingRate) > 0.0003) multiplier *= 1.20; // high basis / funding disparity
      if (isTrending && adx > 35) multiplier *= 0.75;
    }

    // 3. Execution & Risk Preservation Agent (PPO)
    if (id === "ppo-agent") {
      if (isHighVol) multiplier *= 1.60;
      if (strongFlow && Math.sign(orderBookImbalance) !== Math.sign(cvdNormalized)) {
        // Disagreeing order flow + book = high execution slippage risk
        multiplier *= 1.40;
      }
      if (isChop) multiplier *= 1.15;
    }

    const score = Math.max(0.01, baseWeight * multiplier);
    adapted[id] = score;
    totalScore += score;
  }

  // Softmax-style temperature normalization (T = 1.2) to maintain diversity while sharp routing
  const normalized: Record<string, number> = {};
  for (const [id, val] of Object.entries(adapted)) {
    normalized[id] = totalScore > 0 ? +(val / totalScore).toFixed(4) : 0;
  }

  return normalized;
}

// ── In-Memory Cache for Ensemble Reports (4-second TTL for instant UI responsiveness) ──
const ensembleReportCache = new Map<string, { report: EnsembleReport; expiresAt: number }>();

export async function buildEnsembleReport(symbol: string, interval = "5m", limit = 200, userId?: string | null): Promise<EnsembleReport> {
  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = `${normalizedSymbol}:${interval}:${limit}:${userId || "anon"}`;
  const cached = ensembleReportCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.report;
  }

  // 1. Fetch Market Data in Parallel
  const [klines, fundingRate, openInterest, book, orderFlowRes] = await Promise.all([
    binance.getKlines(normalizedSymbol, interval, undefined, undefined, limit),
    binance.getLatestFundingRate(normalizedSymbol).catch(() => 0),
    binance.getFuturesOpenInterest(normalizedSymbol).catch(() => 0),
    binance.getOrderBook(normalizedSymbol, 20).catch(() => ({ bids: [], asks: [] })),
    OrderFlowEngine.analyze(normalizedSymbol).catch(() => null),
  ]);

  if (!klines || klines.length === 0) {
    throw new Error("Market data not available for ensemble report");
  }

  const bars: OHLCVol[] = klines.map((k: any) => ({
    open: parseFloat(k.open),
    high: parseFloat(k.high),
    low: parseFloat(k.low),
    close: parseFloat(k.close),
    volume: parseFloat(k.volume),
  }));

  const ind = computeSnapshot(bars);
  const vwapCalc = new StreamingVWAP();
  bars.forEach((bar) => vwapCalc.update(bar));
  const vwap = vwapCalc.value ?? ind.close;
  const supertrend = computeSupertrend(bars, 10, 3);
  const orderBookImbalance = scoreOrderBookImbalance(book);
  const liquidityPulse = scoreLiquidityPulse(openInterest);
  const { regime, score: regimeScore } = detectMarketRegime(ind, vwap, openInterest, fundingRate, orderBookImbalance);
  const volatilityScore = ind.stdDev20 !== null && ind.close > 0 ? ind.stdDev20 / ind.close : 0;

  const mlFeatures = buildMLFeatures(
    ind,
    {
      eagle: 0.7,
      tiger: 0.6,
      cheetah: 0.6,
      fox: 0.5,
      tortoise: 0.4,
      dog: 0.55,
      owl: 0.45,
    },
    0,
    100,
    0,
    0,
    orderBookImbalance,
    orderFlowRes?.diagnostics?.cvdNormalized ?? 0,
  );

  const activeModels = registry.getEnabledModels();
  const enabledIds = new Set(activeModels.map((m) => m.id));
  const registryWeights = registry.getEnsembleWeights();
  const modelWeights = getDynamicMoEWeights(registryWeights, {
    regime,
    regimeScore,
    adx: ind.adx14 ?? 20,
    volatilityScore,
    orderBookImbalance,
    cvdNormalized: orderFlowRes?.diagnostics?.cvdNormalized ?? 0,
    fundingRate
  });
  const models: ModelContribution[] = [];

  // Live health gate: which quant-engine checkpoints are real+loaded right now.
  const healthMap = await getQuantModelHealth();

  /** Health-gated voting weight for a quant-engine-backed model: its registry
   *  weight when enabled AND the backing checkpoint is HEALTHY, else 0. */
  const gatedWeight = (registryId: string, healthKey: QuantModelKey): number => {
    if (!enabledIds.has(registryId)) return 0;
    const w = modelWeights[registryId] ?? 0;
    if (w <= 0) return 0;
    return quantModelMayVote(healthKey, healthMap) ? w : 0;
  };

  // 2. Prepare Feature Vector for Research Models
  const mockFV: any = {
    symbol: normalizedSymbol,
    market: { ...ind, bars },
    regime: { state: regime, score: regimeScore * 100 },
    orderFlow: { fundingRate, liquidationScore: liquidityPulse * 100 },
    smartMoney: { poc: vwap },
    execution: { positionSize: 0 }
  };

  // 3. Execute all model predictions in parallel
  const researchPromises: Promise<ModelContribution | null>[] = [
    mambaPredictor.predict(mockFV)
      .then(mambaPred => transformDLResponse(mambaPred, "mamba-v2-research", 0))
      .catch(() => null),
    transformerPredictor.predict(mockFV)
      .then(microPred => ({
        modelName: "transformer-micro-shadow",
        category: "MICROSTRUCTURE" as const,
        weight: 0,
        longProbability: microPred.probability,
        shortProbability: 1 - microPred.probability,
        confidence: microPred.confidence,
        expectedReturn: 0,
        expectedDrawdown: 0,
        notes: `Track B Research: Microstructure outcome is ${microPred.meta?.outcome || "UNKNOWN"} (Shadow)`
      }))
      .catch(() => null)
  ];

  // Feature vectors the real trained models were trained on.
  const institutionalVec = buildInstitutionalVector(bars);
  const ppoStateVec = buildPpoStateVector(ind, regimeScore, orderBookImbalance, fundingRate, liquidityPulse, vwap);

  const activeModelPromises: Promise<ModelContribution | null>[] = [];

  // ── Real trained models (quant engine) — health-gated, NO heuristic substitution ──
  // Each gets its real class probabilities when the checkpoint is HEALTHY and
  // reachable; otherwise it is shown as a transparent weight-0 placeholder and
  // does NOT vote (no JS heuristic is dressed up as the model).

  // CNN (1-D convolutional)
  {
    const w = gatedWeight("cnn", "cnn");
    if (w > 0) {
      activeModelPromises.push(
        callQuantEngine(AI_ENDPOINTS.CNN, {
          symbol: normalizedSymbol,
          features: { ohlcv: institutionalVec.slice(0, 5), indicators: institutionalVec.slice(5) },
        })
          .then((resp) => resp
            ? classifierToContribution(resp, "cnn-1d", "DEEP_LEARNING", w, "Trained 1-D CNN (quant engine): real LONG/SHORT/HOLD class probabilities.")
            : gatedPlaceholder("cnn-1d", "DEEP_LEARNING", "quant-engine CNN endpoint unavailable"))
          .catch(() => gatedPlaceholder("cnn-1d", "DEEP_LEARNING", "quant-engine CNN call failed")),
      );
    } else if (enabledIds.has("cnn")) {
      models.push(gatedPlaceholder("cnn-1d", "DEEP_LEARNING", "checkpoint DEGRADED/stub/missing per /health/models"));
    }
  }

  // LSTM (bi-directional)
  {
    const w = gatedWeight("lstm-bilstm", "lstm");
    if (w > 0) {
      activeModelPromises.push(
        callQuantEngine(AI_ENDPOINTS.LSTM, { symbol: normalizedSymbol, features: institutionalVec })
          .then((resp) => resp
            ? classifierToContribution(resp, "lstm-bilstm", "DEEP_LEARNING", w, "Trained Bi-LSTM (quant engine): real LONG/SHORT/HOLD class probabilities.")
            : gatedPlaceholder("lstm-bilstm", "DEEP_LEARNING", "quant-engine LSTM endpoint unavailable"))
          .catch(() => gatedPlaceholder("lstm-bilstm", "DEEP_LEARNING", "quant-engine LSTM call failed")),
      );
    } else if (enabledIds.has("lstm-bilstm")) {
      models.push(gatedPlaceholder("lstm-bilstm", "DEEP_LEARNING", "checkpoint DEGRADED/stub/missing per /health/models"));
    }
  }

  // PPO (execution/sizing agent — non-directional by design)
  {
    const w = gatedWeight("ppo-agent", "ppo");
    if (w > 0) {
      activeModelPromises.push(
        callQuantEngine(AI_ENDPOINTS.PPO, { symbol: normalizedSymbol, state_vector: ppoStateVec })
          .then((resp) => {
            if (!resp) return gatedPlaceholder("ppo-execution", "REINFORCEMENT", "quant-engine PPO endpoint unavailable");
            const confidence = clamp(resp.confidence ?? 0, 0, 1);
            return {
              modelName: "ppo-execution",
              category: "REINFORCEMENT",
              weight: w,
              // PPO's action space is sizing/veto/exit — it has no LONG/SHORT
              // content, so it contributes real confidence with a neutral
              // directional lean rather than a fabricated direction.
              longProbability: 0.5,
              shortProbability: 0.5,
              confidence,
              expectedReturn: 0,
              expectedDrawdown: clamp(0.05 + (1 - confidence) * 0.12, 0.03, 0.22),
              notes: `Trained PPO execution agent (quant engine): action=${resp.action ?? "UNKNOWN"}. Sizing/veto agent — non-directional (neutral 0.5/0.5 by design).`,
            } as ModelContribution;
          })
          .catch(() => gatedPlaceholder("ppo-execution", "REINFORCEMENT", "quant-engine PPO call failed")),
      );
    } else if (enabledIds.has("ppo-agent")) {
      models.push(gatedPlaceholder("ppo-execution", "REINFORCEMENT", "checkpoint DEGRADED/stub/missing per /health/models"));
    }
  }

  // Transformer micro (real quant model; a KNOWN stub per prior audits → gated in practice)
  {
    const w = gatedWeight("transformer", "transformer");
    if (w > 0) {
      const seqInput = buildSequenceInput(normalizedSymbol, interval, bars as OHLC[], Math.min(80, bars.length));
      activeModelPromises.push(
        predictSequence(seqInput, AI_ENDPOINTS.TRANSFORMER)
          .then((pred) => {
            // predictSequence falls back to a local JS heuristic on any error —
            // never surface that as the real transformer; zero it out instead.
            if (!pred || /^(local-|stub-)/.test(pred.modelName)) {
              return gatedPlaceholder("transformer-micro", "DEEP_LEARNING", "quant-engine transformer returned a local fallback");
            }
            const c = transformDLResponse(pred, "transformer-micro", w);
            return { ...c, notes: "Trained Transformer micro (quant engine): attention-based sequence prediction." };
          })
          .catch(() => gatedPlaceholder("transformer-micro", "DEEP_LEARNING", "quant-engine transformer call failed")),
      );
    } else if (enabledIds.has("transformer")) {
      models.push(gatedPlaceholder("transformer-micro", "DEEP_LEARNING", "checkpoint DEGRADED/stub/missing per /health/models"));
    }
  }

  // ── Heuristic fallback voters (NOT trained models) — always present, low weight ──
  // These keep the ensemble producing a signal when every real model is gated
  // out/offline, but are honestly labeled and can never dominate a real model.
  const HEURISTIC_FALLBACK_WEIGHT = 0.04;
  models.push(predictHeuristicTabular(mlFeatures, 0.01, fundingRate, volatilityScore, HEURISTIC_FALLBACK_WEIGHT));
  models.push(predictHeuristicRL(regimeScore, orderBookImbalance, fundingRate, HEURISTIC_FALLBACK_WEIGHT));

  const selfLearningPromise = selfLearning.summarize(userId).catch(() => ({
    retrainWeekly: false,
    strategyDecayDetected: false,
    regimeChangeDetected: false,
    overfittingRisk: false,
    notes: ["Self-learning summary unavailable."],
  }));

  const [researchResults, activeResults, selfLearningSummary] = await Promise.all([
    Promise.all(researchPromises),
    Promise.all(activeModelPromises),
    selfLearningPromise
  ]);

  for (const r of researchResults) {
    if (r) models.push(r);
  }
  for (const r of activeResults) {
    if (r) models.push(r);
  }

  // Safety net: the heuristic fallback voters above always carry weight, so a
  // zero-weight ensemble should never happen — but if it somehow does, add one
  // honestly-labeled heuristic voter rather than a fake named model.
  if (!models.some((m) => m.weight > 0)) {
    models.push(predictHeuristicTabular(mlFeatures, 0.01, fundingRate, volatilityScore, 1.0));
  }

  const totalWeight = models.reduce((sum, m) => sum + m.weight, 0) || 1;
  const longProbability = clamp(models.reduce((sum, m) => sum + m.longProbability * m.weight, 0) / totalWeight, 0, 1);
  const shortProbability = clamp(models.reduce((sum, m) => sum + m.shortProbability * m.weight, 0) / totalWeight, 0, 1);
  const confidence = clamp(models.reduce((sum, m) => sum + m.confidence * m.weight, 0) / totalWeight * 0.98 + regimeScore * 0.01, 0, 1);
  const expectedReturn = models.reduce((sum, m) => sum + m.expectedReturn * m.weight, 0) / totalWeight;
  const expectedDrawdown = clamp(models.reduce((sum, m) => sum + m.expectedDrawdown * m.weight, 0) / totalWeight, 0.02, 0.25);

  const drawdownWarning = confidence < 0.45 || regime === "High Volatility";
  const probEdge = Math.abs(longProbability - shortProbability);
  const signal: "LONG" | "SHORT" | "NEUTRAL" =
    confidence < 0.45 || probEdge < 0.04
      ? "NEUTRAL"
      : longProbability > shortProbability ? "LONG" : "SHORT";

  const maxWinProb = Math.max(longProbability, shortProbability);
  const riskSizing = computeRiskSizing(maxWinProb, Math.abs(expectedReturn), volatilityScore, drawdownWarning, expectedDrawdown);

  const reportResult: EnsembleReport = {
    symbol: normalizedSymbol,
    interval,
    computedAt: new Date().toISOString(),
    regime,
    regimeScore,
    marketPulse: {
      vwap,
      fundingRate,
      openInterest,
      orderBookImbalance,
      volatilityScore,
      liquidityPulse,
    },
    models,
    signal,
    longProbability,
    shortProbability,
    confidence,
    expectedReturn,
    expectedDrawdown,
    riskSizing,
    selfLearning: selfLearningSummary,
  };

  // Cache for 4 seconds
  ensembleReportCache.set(cacheKey, { report: reportResult, expiresAt: Date.now() + 4000 });
  return reportResult;
}

/**
 * Hand-written tabular heuristic. This is NOT a trained gradient-boosting
 * model — there is no XGBoost/LightGBM checkpoint in this system. It is a
 * deterministic formula over indicators + behaviour weights, kept only as a
 * clearly-labeled low-weight fallback voter so the ensemble still produces a
 * signal when every real quant-engine model is offline or gated out.
 */
function predictHeuristicTabular(features: MLFeatures, seed: number, fundingRate: number, volatilityScore: number, weight: number): ModelContribution {
  const score = classicalModelScore(features, seed);
  const expectedReturn = classicalExpectedReturn(score, volatilityScore, fundingRate);
  const confidence = clamp(0.55 + Math.abs(score - 0.5) * 0.40, 0.25, 0.92);
  return buildModelContribution({
    name: "heuristic-tabular",
    category: "HEURISTIC",
    weight,
    score,
    confidence,
    expectedReturn,
    notes: "Heuristic fallback (NOT a trained model): deterministic tabular formula over indicators + behaviour weights. Low-weight voter used when real quant-engine models are unavailable.",
  });
}

async function predictDeepModel(bars: OHLCVol[], symbol: string, interval: string, modelName: string, weight: number): Promise<ModelContribution> {
  const sequenceInput = buildSequenceInput(symbol, interval, bars as OHLC[], Math.min(80, bars.length));
  let prediction: any;

  if (modelName === "transformer-v1") {
    // Try quant engine first; real local Transformer if offline.
    // Was calling a nonexistent "/predict/transformer" route (quant_engine
    // only exposes AI_ENDPOINTS.TRANSFORMER) — every call 404'd and silently
    // fell through to the local JS heuristic below, so the real Python
    // transformer model was never actually queried on this path.
    prediction = await predictSequence(sequenceInput, AI_ENDPOINTS.TRANSFORMER);
  } else if (modelName === "mamba-hybrid") {
    // Try quant engine Mamba endpoint; real local Mamba SSM if offline
    try {
      prediction = await predictSequence(sequenceInput, "/research/predict/mamba");
    } catch {
      prediction = predictSequenceLocalMamba(sequenceInput);
    }
    if (!prediction || prediction.modelName === "local-temporal-attention-v2") {
      prediction = predictSequenceLocalMamba(sequenceInput);
    }
  } else if (modelName === "xlstm-v1") {
    prediction = predictSequenceLocalxLSTM(sequenceInput);
  } else if (modelName === "mamba-v2-research") {
    prediction = predictSequenceLocalMamba(sequenceInput);
    prediction.modelName = "mamba-v2-research";
  } else {
    prediction = predictSequenceLocalAttention(sequenceInput);
    prediction.modelName = modelName;
  }

  const contribution = transformDLResponse(prediction, modelName, weight);
  let notes = `Deep Learning forecast from ${modelName}`;
  if (modelName === "cnn-lstm-v1") {
    notes = "Short-term pattern extraction via hybrid CNN-LSTM attention approximation.";
  } else if (modelName === "transformer-v1") {
    notes = "Transformer sequence prediction prioritizing temporal context.";
  } else if (modelName === "mamba-hybrid") {
    notes = "Hybrid Mamba-3 state-space model with selective cross-attention.";
  } else if (modelName === "mamba-v2-research") {
    notes = "AQEA v2.0 Track A: Mamba State Space Model with long-context sequence learning (Shadow).";
  } else if (modelName === "xlstm-v1") {
    notes = "xLSTM exponential gating sequence prediction tracking long-range momentum.";
  }

  return {
    ...contribution,
    notes,
  };
}

/**
 * Hand-written RL-flavoured heuristic. This is NOT the trained PPO agent
 * (that is wired separately via the real /predict/ppo-execution endpoint).
 * It is a deterministic formula over regime + order-book + funding, kept
 * only as a clearly-labeled low-weight fallback voter.
 */
function predictHeuristicRL(regimeScore: number, orderBookImbalance: number, fundingRate: number, weight: number): ModelContribution {
  const score = reinforcementAgentScore(regimeScore, orderBookImbalance, fundingRate);
  const expectedReturn = clamp((score - 0.5) * 0.03, -0.03, 0.05);
  const confidence = clamp(0.45 + Math.abs(score - 0.5) * 0.50, 0.25, 0.88);
  return buildModelContribution({
    name: "heuristic-rl",
    category: "HEURISTIC",
    weight,
    score,
    confidence,
    expectedReturn,
    notes: "Heuristic fallback (NOT a trained model): deterministic formula over regime/order-book/funding cues. Low-weight voter used when real quant-engine models are unavailable.",
  });
}

async function buildSelfLearningSummary(userId?: string | null) {
  if (!userId || mongoose.connection.readyState !== 1) {
    return {
      retrainWeekly: false,
      strategyDecayDetected: false,
      regimeChangeDetected: false,
      overfittingRisk: false,
      notes: ["User not authenticated or database unavailable. Self-learning summary not populated."],
    };
  }

  const userTrades = await Trade.find({ userId: toValidObjectId(userId), status: "CLOSED" }).sort({ closedAt: -1 }).limit(120).lean();
  if (!userTrades || userTrades.length === 0) {
    return {
      retrainWeekly: true,
      strategyDecayDetected: false,
      regimeChangeDetected: false,
      overfittingRisk: false,
      notes: ["No closed trades found, scheduling weekly retrain by default."],
    };
  }

  const recent = userTrades.slice(0, 20);
  const prior = userTrades.slice(20, 60);
  const recentProfit = recent.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const priorProfit = prior.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  const recentWinRate = recent.length > 0 ? recent.filter((t) => (t.pnl ?? 0) > 0).length / recent.length : 0;
  const priorWinRate = prior.length > 0 ? prior.filter((t) => (t.pnl ?? 0) > 0).length / prior.length : 0;
  const decayDetected = priorProfit > 0 && recentProfit < priorProfit * 0.75;
  const overfittingRisk = recentWinRate > 0.86 && recentProfit > priorProfit * 1.6;
  const regimeChangeDetected = Math.abs(recentWinRate - priorWinRate) > 0.15;

  return {
    retrainWeekly: true,
    strategyDecayDetected: decayDetected,
    regimeChangeDetected,
    overfittingRisk,
    notes: [
      `Recent profitability: ${recentProfit.toFixed(2)} USDT, prior window: ${priorProfit.toFixed(2)} USDT`,
      decayDetected ? "Strategy decay detected by recent return deterioration." : "No strong decay signal yet.",
      regimeChangeDetected ? "Market regime may have changed (win-rate drift)." : "Regime appears stable over the last 20 trades.",
      overfittingRisk ? "High recent win-rate may indicate overfitting to recent market noise." : "Overfitting risk low." ,
    ],
  };
}

export interface OrderBookResponse {
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
}

export async function getOrderBook(symbol: string, limit = 20): Promise<OrderBookResponse> {
  return binance.getOrderBook(symbol, limit);
}
