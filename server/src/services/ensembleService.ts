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
import { buildSequenceInput, predictSequence, predictSequenceLocalAttention, predictSequenceLocalTransformer, predictSequenceLocalMamba, predictSequenceLocalxLSTM, type SequenceInput, type DLPrediction } from "./dlModelService.js";
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

function computeRiskSizing(overallWin: number, expectedReturn: number, volatilityScore: number, drawdownWarning: boolean): RiskSizing {
  const baseRisk = 0.03;
  const probabilityFactor = clamp(overallWin - 0.5, 0, 0.4);
  const volatilityFactor = clamp(0.12 - volatilityScore, 0, 0.08);
  const recommendedPositionPct = clamp(baseRisk + probabilityFactor * 0.5 + volatilityFactor * 0.5, 0.01, 0.12);
  const kellyPct = clamp((overallWin - 0.5) / Math.max(0.05, 1 - overallWin), 0.01, 0.10);
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

/**
 * Computes dynamic, regime-adaptive weights based on the detected market regime.
 * Trend-following sequence models get boosted in trending regimes,
 * while classical tabular and reinforcement models get boosted in ranging/volatile regimes.
 */
function getRegimeAdaptiveWeights(
  baseWeights: Record<string, number>,
  regime: MarketRegime
): Record<string, number> {
  const adapted: Record<string, number> = {};
  let total = 0;

  const isTrending = ["Strong Bull", "Bull", "Strong Bear", "Bear"].includes(regime);
  const isRanging = ["Sideways", "Low Volatility"].includes(regime);
  const isHighVol = regime === "High Volatility";

  for (const [id, baseWeight] of Object.entries(baseWeights)) {
    let multiplier = 1.0;

    if (isTrending) {
      if (["xlstm", "transformer", "mamba-hybrid"].includes(id)) {
        multiplier = 1.30;
      } else if (["xgboost", "lightgbm"].includes(id)) {
        multiplier = 0.80;
      }
    } else if (isRanging) {
      if (["xgboost", "lightgbm", "ppo-agent"].includes(id)) {
        multiplier = 1.25;
      } else if (["xlstm", "transformer", "mamba-hybrid"].includes(id)) {
        multiplier = 0.75;
      }
    } else if (isHighVol) {
      if (["ppo-agent", "xgboost"].includes(id)) {
        multiplier = 1.35;
      } else if (["transformer", "xlstm", "mamba-hybrid"].includes(id)) {
        multiplier = 0.65;
      }
    }

    const adaptedVal = baseWeight * multiplier;
    adapted[id] = adaptedVal;
    total += adaptedVal;
  }

  // Normalize back to sum to 1.0
  const normalized: Record<string, number> = {};
  for (const [id, val] of Object.entries(adapted)) {
    normalized[id] = total > 0 ? +(val / total).toFixed(4) : 0;
  }

  return normalized;
}

export async function buildEnsembleReport(symbol: string, interval = "5m", limit = 200, userId?: string | null): Promise<EnsembleReport> {
  const normalizedSymbol = symbol.toUpperCase();
  const klines = await binance.getKlines(normalizedSymbol, interval, undefined, undefined, limit);
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
  const fundingRate = await binance.getLatestFundingRate(normalizedSymbol).catch(() => 0);
  const openInterest = await binance.getFuturesOpenInterest(normalizedSymbol).catch(() => 0);
  const book = await binance.getOrderBook(normalizedSymbol, 20).catch(() => ({ bids: [], asks: [] }));
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
  );

  const activeModels = registry.getEnabledModels();
  const registryWeights = registry.getEnsembleWeights();
  const modelWeights = getRegimeAdaptiveWeights(registryWeights, regime);
  const models: ModelContribution[] = [];

  // ─── Track A & B Research (Shadow Only) ───────────────
  try {
     // We map ensemble context to the new AQEA FeatureVector contract
     const mockFV: any = {
        symbol: normalizedSymbol,
        market: { ...ind, bars },
        regime: { state: regime, score: regimeScore * 100 },
        orderFlow: { fundingRate, liquidationScore: liquidityPulse * 100 },
        smartMoney: { poc: vwap },
        execution: { positionSize: 0 }
     };

     const mambaPred = await mambaPredictor.predict(mockFV);
     models.push(transformDLResponse(mambaPred, "mamba-v2-research", 0));

     const microPred = await transformerPredictor.predict(mockFV);
     models.push({
        modelName: "transformer-micro-shadow",
        category: "MICROSTRUCTURE",
        weight: 0,
        longProbability: microPred.probability,
        shortProbability: 1 - microPred.probability,
        confidence: microPred.confidence,
        expectedReturn: 0,
        expectedDrawdown: 0,
        notes: `Track B Research: Microstructure outcome is ${microPred.meta?.outcome || "UNKNOWN"} (Shadow)`
     });
  } catch (err) {
    console.warn("[Ensemble] Research shadow predictions failed:", err);
  }
  // ────────────────────────────────────────────────────────

  for (const model of activeModels) {
    const weight = modelWeights[model.id] ?? 0;
    if (weight <= 0) continue;

    if (model.id === "xgboost") {
      models.push(predictLocalClassical("XGBoost", mlFeatures, 0.01, fundingRate, volatilityScore, weight));
    } else if (model.id === "lightgbm") {
      models.push(predictLocalClassical("LightGBM", mlFeatures, -0.01, fundingRate, volatilityScore, weight));
    } else if (model.id === "transformer") {
      models.push(await predictDeepModel(bars, normalizedSymbol, interval, "transformer-v1", weight));
    } else if (model.id === "xlstm") {
      models.push(await predictDeepModel(bars, normalizedSymbol, interval, "xlstm-v1", weight));
    } else if (model.id === "ppo-agent") {
      models.push(predictReinforcementModel(regimeScore, orderBookImbalance, fundingRate, weight));
    } else if (model.id === "mamba-hybrid") {
      models.push(await predictDeepModel(bars, normalizedSymbol, interval, "mamba-hybrid", weight));
    }
  }

  // Fall back when no *weighted* model contributed. The shadow research models
  // above are always present with weight 0, so a plain `models.length === 0`
  // check never fired — leaving the ensemble with totalWeight≈0, which produced
  // confidence ≈ regimeScore×0.01 ("1%") and a 0/0 probability tie (NEUTRAL).
  if (!models.some((m) => m.weight > 0)) {
    models.push(predictLocalClassical("XGBoost", mlFeatures, 0.01, fundingRate, volatilityScore, 1.0));
  }

  const totalWeight = models.reduce((sum, m) => sum + m.weight, 0) || 1;
  const longProbability = clamp(models.reduce((sum, m) => sum + m.longProbability * m.weight, 0) / totalWeight, 0, 1);
  const shortProbability = clamp(models.reduce((sum, m) => sum + m.shortProbability * m.weight, 0) / totalWeight, 0, 1);
  const confidence = clamp(models.reduce((sum, m) => sum + m.confidence * m.weight, 0) / totalWeight * 0.98 + regimeScore * 0.01, 0, 1);
  const expectedReturn = models.reduce((sum, m) => sum + m.expectedReturn * m.weight, 0) / totalWeight;
  const expectedDrawdown = clamp(models.reduce((sum, m) => sum + m.expectedDrawdown * m.weight, 0) / totalWeight, 0.02, 0.25);

  const drawdownWarning = confidence < 0.45 || regime === "High Volatility";

  // Directional call for the UI's "AI Signal" panel. NEUTRAL when the ensemble
  // is unconfident or the two sides are effectively tied; otherwise the stronger
  // probability wins. (Previously absent, so the panel always rendered "—".)
  const probEdge = Math.abs(longProbability - shortProbability);
  const signal: "LONG" | "SHORT" | "NEUTRAL" =
    confidence < 0.45 || probEdge < 0.04
      ? "NEUTRAL"
      : longProbability > shortProbability ? "LONG" : "SHORT";

  const maxWinProb = Math.max(longProbability, shortProbability);
  const riskSizing = computeRiskSizing(maxWinProb, Math.abs(expectedReturn), volatilityScore, drawdownWarning);

  const selfLearningSummary = await selfLearning.summarize(userId).catch(() => ({
    retrainWeekly: false,
    strategyDecayDetected: false,
    regimeChangeDetected: false,
    overfittingRisk: false,
    notes: ["Self-learning summary unavailable."],
  }));

  return {
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
}

function predictLocalClassical(name: string, features: MLFeatures, seed: number, fundingRate: number, volatilityScore: number, weight: number): ModelContribution {
  const score = classicalModelScore(features, seed);
  const expectedReturn = classicalExpectedReturn(score, volatilityScore, fundingRate);
  const confidence = clamp(0.55 + Math.abs(score - 0.5) * 0.40, 0.25, 0.92);
  return buildModelContribution({
    name,
    category: "CLASSICAL_ML",
    weight,
    score,
    confidence,
    expectedReturn,
    notes: `${name} proxy modeled from indicator fusion and weight patterns`,
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

function predictReinforcementModel(regimeScore: number, orderBookImbalance: number, fundingRate: number, weight: number): ModelContribution {
  const score = reinforcementAgentScore(regimeScore, orderBookImbalance, fundingRate);
  const expectedReturn = clamp((score - 0.5) * 0.03, -0.03, 0.05);
  const confidence = clamp(0.45 + Math.abs(score - 0.5) * 0.50, 0.25, 0.88);
  return buildModelContribution({
    name: "PPO-Agent",
    category: "REINFORCEMENT",
    weight,
    score,
    confidence,
    expectedReturn,
    notes: "Execution-aware RL signal layer using market microstructure cues.",
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
