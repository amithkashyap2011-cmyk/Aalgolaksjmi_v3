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

import * as binance from "../services/binanceService.js";
import { type Kline } from "../services/binanceService.js";
import { computeSnapshot, type IndicatorSnapshot, type OHLC } from "../services/indicatorService.js";
import {
  normalizeWeights,
  type NormalizedWeights,
  type AnimalContributions,
} from "../services/behaviourModel.js";
import mongoose from "mongoose";
import { Settings, type IRiskConfig, type IBehaviorWeights } from "../models/Settings.js";
import { Trade } from "../models/Trade.js";
import * as paper from "../services/paperState.js";

/* ── ML & DL model hooks (Phase 5) ───────────────────── */
import { predict as mlPredict, buildMLFeatures, type MLPrediction } from "../services/mlModelService.js";
import { predictSequence as dlPredict, buildSequenceInput, type DLPrediction } from "../services/dlModelService.js";
import { applyDynamicMarketWeights } from "../services/modelRegistry.js";

/* ════════════════════════════════════════════════════════
 *  Types
 * ════════════════════════════════════════════════════════ */

export interface AgentContext {
  symbol: string;
  mode: "PAPER" | "LIVE";
  accountType?: "SPOT" | "FUTURES";
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
  bypassHtfTrendGate?: boolean;
  bypassChecklist?: boolean;
  bypassConsensusLag?: boolean;
  isOverdrive?: boolean;
  noLossMode?: boolean;
  fundingRate?: number;
  lastTradeMinutesAgo?: number;
  saraswatiAlphaThreshold?: number;
}

const userTradeStatsCache = new Map<string, { dailyPnl: number; weeklyPnl: number; monthlyPnl: number; tradesToday: number; lastTradeMinutesAgo: number; timestamp: number }>();

export async function buildContext(
  symbol: string,
  mode: "PAPER" | "LIVE",
  userId: string,
  accountTypeArg?: "SPOT" | "FUTURES",
): Promise<AgentContext> {
  /* 1. Fetch last 200 bars (5m) for indicators */
  const klines: Kline[] = await binance.getKlines(symbol, "5m", undefined, undefined, 200);
  const bars: OHLC[] = klines.map((k) => ({
    open: parseFloat(k.open),
    high: parseFloat(k.high),
    low: parseFloat(k.low),
    close: parseFloat(k.close),
    volume: parseFloat(k.volume),
  }));

  /* 2. Compute indicators */
  const ind = computeSnapshot(bars);

  /* 3. Load settings & Daily P&L metrics */
  const isDbConnected = () => (mongoose?.connection?.readyState === 1 || (mongoose as any)?.default?.connection?.readyState === 1);
  const isValId = (id: any) => Boolean(id && (typeof id === "string" ? id.trim().length > 0 : true));
  const safeExec = async (q: any, fallback: any) => {
    try {
      if (!q) return fallback;
      if (typeof q.lean === "function") return await q.lean().catch(() => fallback);
      return await Promise.resolve(q).catch(() => fallback);
    } catch {
      return fallback;
    }
  };

  let settings: any = null;
  if (userId && isValId(userId) && isDbConnected()) {
    settings = await safeExec(Settings.findOne({ userId }), null);
  }
  const riskConfig: IRiskConfig = (settings as any)?.riskConfig ?? {
    maxDailyLoss: 100, maxWeeklyLoss: 300, maxMonthlyLoss: 800, maxPositionSizePct: 21,
    defaultSL: 2, defaultTP: 4, trailingSL: 1,
    defaultLeverage: 1, maxConcurrentPositions: 15,
    maxPortfolioHeat: 40, capitalPreservationMode: true,
    riskEngineEnabled: true, autoCloseEnabled: true,
    dynamicSLTP: true, multiStageTP: true
  };

  const now = Date.now();
  const cacheKey = `${userId}:${mode}`;
  if (process.env.NODE_ENV === "test") {
    userTradeStatsCache.clear();
  }
  let stats = userTradeStatsCache.get(cacheKey);

  if (!stats || now - stats.timestamp > 15000) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const [todayTrades, weekTrades, monthTrades, lastTrade] = isDbConnected()
      ? await Promise.all([
          safeExec(Trade.find({ userId, mode, openedAt: { $gte: todayStart } }), []),
          safeExec(Trade.find({ userId, mode, openedAt: { $gte: weekStart } }), []),
          safeExec(Trade.find({ userId, mode, openedAt: { $gte: monthStart } }), []),
          safeExec(Trade.findOne({ userId, mode })?.sort ? Trade.findOne({ userId, mode }).sort({ openedAt: -1 }) : Trade.findOne({ userId, mode }), null),
        ])
      : [[], [], [], null];

    const dailyPnl = (todayTrades || []).reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
    const weeklyPnl = (weekTrades || []).reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
    const monthlyPnl = (monthTrades || []).reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
    const tradesToday = todayTrades.length;
    const lastTradeMinutesAgo = lastTrade
      ? Math.floor((Date.now() - new Date(lastTrade.openedAt!).getTime()) / 60000)
      : 9999;

    stats = {
      dailyPnl, weeklyPnl, monthlyPnl, tradesToday, lastTradeMinutesAgo,
      timestamp: now
    };
    if (userTradeStatsCache.size >= 500) {
      userTradeStatsCache.clear();
    }
    userTradeStatsCache.set(cacheKey, stats);
  }

  const { dailyPnl, weeklyPnl, monthlyPnl, tradesToday, lastTradeMinutesAgo } = stats;
  const openPositionCount = paper.getOpenPositions(userId, mode).length;

  let rawWeights: IBehaviorWeights = settings?.behaviorWeights ?? {
    eagle: 50, tiger: 50, cheetah: 50, fox: 50, tortoise: 50,
    dog: 50, owl: 50, cow: 50, spider: 50, lion: 50,
    om_chant: 50, gayatri_mantra: 50, aaryan: 50, aayush: 50, lakshmi_hybrid: 50,
  };

  if (settings?.dynamicAnimals === true) {
    const volRatio = ind.stdDev20 !== null && ind.close > 0 ? ind.stdDev20 / ind.close : 0.01;
    const lossPct = Math.abs(dailyPnl) / (riskConfig.maxDailyLoss || 100);

    rawWeights = {
      eagle: ind.adx14 !== null && ind.adx14 > 25 ? 85 : 35,
      tiger: ind.rsi14 !== null && (ind.rsi14 < 35 || ind.rsi14 > 65) ? 80 : 35,
      cheetah: ind.bollinger && ind.bollinger.bandwidth > 0.08 ? 85 : 30,
      fox: volRatio > 0.015 ? 90 : 30,
      tortoise: volRatio < 0.008 ? 85 : 30,
      dog: lossPct > 0.6 ? 95 : 40,
      owl: ind.rsi14 !== null && (ind.rsi14 < 30 || ind.rsi14 > 70) && ind.macd ? 85 : 35,
      cow: ind.adx14 !== null && ind.adx14 < 18 ? 80 : 40,
      spider: openPositionCount >= 2 ? 80 : 40,
      lion: ind.ema9 !== null && ind.ema21 !== null && ind.ema55 !== null && 
            ((ind.ema9 > ind.ema21 && ind.ema21 > ind.ema55) || (ind.ema9 < ind.ema21 && ind.ema21 < ind.ema55)) ? 90 : 35,
      om_chant: rawWeights.om_chant ?? 50,
      gayatri_mantra: 0, // ⛔ DISABLED
      aaryan: rawWeights.aaryan ?? 50,
      aayush: 0,         // ⛔ DISABLED
      lakshmi_hybrid: 0, // ⛔ DISABLED
    };
  }
  const weights = normalizeWeights(rawWeights);

  if (settings?.dynamicWeights === true) {
    const volRatio = ind.stdDev20 !== null && ind.close > 0 ? ind.stdDev20 / ind.close : 0.01;
    // dynamically manage global ML models
    applyDynamicMarketWeights(volRatio, ind.adx14);
  }

  /* 5. HTF trend — check 1h EMA alignment via a quick 55‑bar fetch */
  let htfTrendBullish = true;
  if (!settings?.bypassConsensusLag && !settings?.bypassHtfTrendGate) {
    try {
      const htfKlines = await binance.getKlines(symbol, "1h", undefined, undefined, 60);
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
  }

  /* 6. Volatility ratio */
  const volatilityRatio =
    ind.stdDev20 !== null && ind.close > 0 ? ind.stdDev20 / ind.close : 0.01;

  /* 7. Animal behaviour model REMOVED. */
  const animalBlend = { score: 0, contributions: {} as AnimalContributions };

  /* 8 & 9. ML & DL prediction (Phase 5) — Run concurrently */
  const mlFeatures = buildMLFeatures(
    ind, weights, dailyPnl, riskConfig.maxDailyLoss, tradesToday, openPositionCount,
  );
  const seqInput = buildSequenceInput(symbol, "5m", bars, 60);
  const [mlPrediction, dlPrediction] = await Promise.all([
    mlPredict(mlFeatures).catch(() => ({ profitProbability: 0.5, expectedReturn: 0, confidence: 0, modelName: "stub" })),
    dlPredict(seqInput).catch(() => ({ directionScore: 0.5, predictedMove: 0, confidence: 0, modelName: "stub" })),
  ]);

  // Merge AI-configurable thresholds into riskConfig so checklist can read them
  // without needing a separate settings reference.
  const enrichedRisk: IRiskConfig = {
    ...riskConfig,
    ...(settings?.adxMinimum !== undefined ? { adxMinimum: settings.adxMinimum } as any : {}),
  };

  return {
    symbol, mode, userId,
    // Explicit accountType (from autoTradeEngine's per-leg tick) takes
    // priority — without this, two concurrent SPOT+FUTURES runs for the
    // same user would both silently resolve to whichever single value is
    // on Settings, collapsing them onto the same wallet/leverage rules.
    accountType: (accountTypeArg || (settings?.accountType === "BOTH" ? "FUTURES" : settings?.accountType) || "FUTURES") as "SPOT" | "FUTURES",
    bars, ind, weights, risk: enrichedRisk,
    dailyPnl, tradesToday, openPositionCount,
    htfTrendBullish, volatilityRatio, lastTradeMinutesAgo,
    animalBlend, mlPrediction, dlPrediction,
    bypassHtfTrendGate: settings?.bypassHtfTrendGate ?? false,
    bypassChecklist: settings?.bypassChecklist ?? false,
    bypassConsensusLag: settings?.bypassConsensusLag ?? false,
    isOverdrive: settings?.overdrive ?? false,
    noLossMode: settings?.noLossMode ?? false,
    saraswatiAlphaThreshold: settings?.saraswatiAlphaThreshold ?? 45,
    // Real funding rate from Binance (neutral 0 on failure — never a fabricated value).
    fundingRate: await binance.getLatestFundingRate(symbol).catch(() => 0),
  };
}
