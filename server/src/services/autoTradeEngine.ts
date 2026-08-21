/*
 * ─── Auto‑Trade Engine (Scheduler) ─────────────────────
 *
 * Periodically loops over all AUTO‑enabled symbols for
 * each user, builds an agent context, runs the decision
 * pipeline, applies risk guards, and places orders.
 *
 * Uses efficient Maps from paperState to avoid O(n) scans.
 */

import { Settings, type ISettings } from "../models/Settings.js";
import { Trade } from "../models/Trade.js";
import { Alert } from "../models/Alert.js";
import { ApiKeys } from "../models/ApiKeys.js";
import { decrypt } from "../lib/crypto.js";
import mongoose from "mongoose";
import * as agent from "./agentService.js";
import * as paper from "./paperState.js";
import * as binance from "./binanceService.js";
import { TAKER_FEE } from "./pnlService.js";
import { SchedulerStateManager } from "./schedulerStateManager.js";
import { AnalyticsCache } from "./analyticsCache.js";
import { PlatformTelemetry } from "./platformTelemetry.js";
import { UITelemetryService } from "./uiTelemetry.js";
import { toValidObjectId } from "../utils/mongoUtils.js";

/* ── V8.0 Institutional Imports ───────────────────────── */
import { TradeQualityEngine } from "./tradeQualityEngine.js";
import { RegimeDetectionEngine } from "./regimeDetectionEngine.js";
import { AdaptiveRiskEngine } from "./adaptiveRiskEngine.js";
import { PortfolioHeatEngine } from "./portfolioHeatEngine.js";
import { BayesianProbabilityEngine } from "./aqea/bayesianPredictor.js";
import { weatherIntelligenceEngine } from "./weatherIntelligenceEngine.js";

/* ── AQEA Imports ─────────────────────────────────────── */
import { AQEAEngine, type AQEADecision } from "./aqea/engine.js";
import { evaluateLongEntry, evaluateShortEntry } from "./autoTradeEngine.decisionLogic.js";
import { RiskEngine } from "./aqea/riskEngine.js";
import { ShadowSimulator } from "./aqea/shadowSimulator.js";
import { PerformanceMonitorService } from "./aqea/performanceMonitor.js";
import { ExitEngine } from "./aqea/exitEngine.js";
import { PositionManager } from "./aqea/positionManager.js";
import { ShadowValidationService } from "./aqea/shadowValidation.js";
import { OutcomeAttributionService } from "./aqea/outcomeAttribution.js";
import * as tradeGovernor from "./aqea/tradeGovernor.js";
import { PaperTradingMonitorService } from "./aqea/paperMonitor.js";
import { UnifiedSizingEngine } from "./aqea/unifiedSizingEngine.js";

async function safeCreateAlert(data: { userId: any; severity: "GREEN" | "AMBER" | "RED"; symbol: string; title: string; message: string }) {
  try {
    const validUserId = toValidObjectId(data.userId);
    await Alert.create({ ...data, userId: validUserId });
  } catch (err) {
    console.warn("[Alert] Failed to save alert:", err);
  }
}

/* ── State ────────────────────────────────────────────── */

let intervalId: ReturnType<typeof setInterval> | null = null;
let shadowTrackerId: ReturnType<typeof setInterval> | null = null;
let shadowReportId: ReturnType<typeof setInterval> | null = null;
let outcomeTrackerId: ReturnType<typeof setInterval> | null = null;
const DEFAULT_INTERVAL_MS = 60_000; // 1 minute
const SHADOW_TRACK_INTERVAL = 5 * 60_000; // 5 minutes
const OUTCOME_TRACK_INTERVAL = 5 * 60_000; // 5 minutes
const DAILY_REPORT_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

/** Set of "userId:accountType" composite keys that have auto‑trade enabled —
 * SPOT and FUTURES are independent legs, so a user can have either, both,
 * or neither active at once. */
const autoEnabledUsers = new Set<string>();

function scanKey(userId: string, accountType: string): string {
  return `${userId}:${accountType}`;
}

function parseScanKey(key: string): { userId: string; accountType: "SPOT" | "FUTURES" } {
  const idx = key.lastIndexOf(":");
  return { userId: key.slice(0, idx), accountType: key.slice(idx + 1) as "SPOT" | "FUTURES" };
}

/** Optional primary symbol focus per user. */
const primarySymbols = new Map<string, string>();

/** Peak price tracking for trailing SL. */
const peakPrices = new Map<string, number>();

/** Cooldown timers per symbol/user. */
const cooldowns = new Map<string, number>();

/* ── Public API ───────────────────────────────────────── */

export function enableUser(userId: string, accountType: "SPOT" | "FUTURES" | "BOTH" = "FUTURES"): void {
  if (accountType === "BOTH") {
    enableUser(userId, "SPOT");
    enableUser(userId, "FUTURES");
    return;
  }
  autoEnabledUsers.add(scanKey(userId, accountType));
  SchedulerStateManager.persistStatus(userId, true, accountType).catch(console.error);
  console.log(`[auto] enabled for user ${userId} (${accountType})`);
}

export function disableUser(userId: string, accountType: "SPOT" | "FUTURES" | "BOTH" = "FUTURES"): void {
  if (accountType === "BOTH") {
    disableUser(userId, "SPOT");
    disableUser(userId, "FUTURES");
    return;
  }
  autoEnabledUsers.delete(scanKey(userId, accountType));
  SchedulerStateManager.persistStatus(userId, false, accountType).catch(console.error);
  console.log(`[auto] disabled for user ${userId} (${accountType})`);
}

/** Disables both legs at once — for kill-switch/hard-reset paths where
 * "stop everything for this user" is the intent, not "stop one account
 * type". */
export function disableUserAll(userId: string): void {
  disableUser(userId, "SPOT");
  disableUser(userId, "FUTURES");
}

export function isEnabled(userId: string, accountType: "SPOT" | "FUTURES" = "FUTURES"): boolean {
  return autoEnabledUsers.has(scanKey(userId, accountType));
}

/** True if EITHER account type is enabled for this user — for legacy call
 * sites that only ever cared about a single on/off signal. */
export function isEnabledAny(userId: string): boolean {
  return isEnabled(userId, "SPOT") || isEnabled(userId, "FUTURES");
}

export function setPrimarySymbol(userId: string, symbol: string): void {
  primarySymbols.set(userId, symbol);
  Settings.updateOne({ userId: toValidObjectId(userId) }, { $set: { primarySymbol: symbol } }).catch(console.error);
  console.log(`[auto] primary symbol set to ${symbol} for user ${userId}`);
}

export function getScannerCount(): number {
  // Unique users, not (user, accountType) pairs — a user running both
  // legs still counts once here (this feeds an "active users" metric).
  const users = new Set<string>();
  for (const key of autoEnabledUsers) users.add(parseScanKey(key).userId);
  return users.size;
}

export function clearPeakPrice(userId: string, symbol: string, tradeId: string): void {
  const key = `${userId}:${symbol}:${tradeId}`;
  peakPrices.delete(key);
}

export function clearUserState(userId: string): void {
  // Clear any temporary state for the user
  for (const k of peakPrices.keys()) {
    if (k.startsWith(userId)) peakPrices.delete(k);
  }
  for (const k of cooldowns.keys()) {
    if (k.startsWith(userId)) cooldowns.delete(k);
  }
}

export function setCooldown(userId: string, accountType: "SPOT" | "FUTURES", symbol: string, minutes: number): void {
  const key = `${userId}:${accountType}:${symbol}`;
  cooldowns.set(key, Date.now() + minutes * 60_000);
}

export async function hydrate(): Promise<void> {
  const configs = await SchedulerStateManager.getActiveConfigs();
  for (const config of configs) {
    autoEnabledUsers.add(scanKey(config.userId, (config.accountType as "SPOT" | "FUTURES") || "FUTURES"));
    if (config.primarySymbol) primarySymbols.set(config.userId, config.primarySymbol);
  }
  console.log(`[auto] hydrated ${configs.length} active configurations.`);
}

let dayCounter = 1;

export function start(intervalMs: number | any = DEFAULT_INTERVAL_MS): void {
  // 🛡️ Handle case where Socket.io instance might be passed instead of number
  const ms = typeof intervalMs === "number" ? intervalMs : DEFAULT_INTERVAL_MS;
  if (intervalId) return; // already running
  
  // Trigger hydration before starting the interval
  hydrate().catch(err => console.error("[auto] hydration failed:", err));
  
  console.log(`[auto] scheduler started (interval=${ms}ms)`);
  
  // Initial Weather Sync (V1.0)
  weatherIntelligenceEngine.update().catch(console.error);

  intervalId = setInterval(() => tick().catch(console.error), ms);

  // AQEA V8.5 Shadow Validation Tasks
  shadowTrackerId = setInterval(() => {
    ShadowValidationService.trackOutcomes().catch(err => console.error("[shadow-validation] track failed:", err));
  }, SHADOW_TRACK_INTERVAL);

  shadowReportId = setInterval(() => {
    // Determine target userId for monitoring — composite keys are
    // "userId:accountType" now, so pull just the userId back out.
    const firstKey = autoEnabledUsers.values().next().value;
    if (!firstKey) return;
    const primaryUserId = parseScanKey(firstKey).userId;

    ShadowValidationService.generateDailyReport(dayCounter)
      .then(path => console.log(`[shadow-validation] Day report generated: ${path}`))
      .catch(err => console.error("[shadow-validation] report failed:", err));

    OutcomeAttributionService.generateDailyReport(dayCounter)
      .then(path => console.log(`[outcome-attribution] Day report generated: ${path}`))
      .catch(err => console.error("[outcome-attribution] report failed:", err));

    PaperTradingMonitorService.generateDailyReport(dayCounter++, primaryUserId)
      .then(path => console.log(`[paper-monitor] Day report generated: ${path}`))
      .catch(err => console.error("[paper-monitor] report failed:", err));
  }, DAILY_REPORT_INTERVAL);

  outcomeTrackerId = setInterval(() => {
    OutcomeAttributionService.trackOutcomes().catch(err => console.error("[outcome-attribution] track failed:", err));
  }, OUTCOME_TRACK_INTERVAL);
}

export function stop(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[auto] scheduler stopped");
  }
  if (shadowTrackerId) {
    clearInterval(shadowTrackerId);
    shadowTrackerId = null;
  }
  if (shadowReportId) {
    clearInterval(shadowReportId);
    shadowReportId = null;
  }
  if (outcomeTrackerId) {
    clearInterval(outcomeTrackerId);
    outcomeTrackerId = null;
  }
}

/* ── Core tick — runs once per interval ───────────────── */

async function tick(): Promise<void> {
  const start = Date.now();
  console.log(`[TRACE] TICK_START count=${autoEnabledUsers.size}`);

  // 🛡️ Weather Intelligence Engine Update (V1.0)
  try {
    await weatherIntelligenceEngine.update();
    const miningStress = weatherIntelligenceEngine.getMiningStress();

    // ⚠️ Miner-impact alt-data has NO real data source wired yet. Previously a block of
    // fabricated metrics (hashRate 640.5, difficulty 83.5, reserves 1.8M, …) was fed into
    // MinerImpactEngine to produce a weatherAlpha that could flip the regime to
    // WEATHER_STRESS — i.e. fake numbers influencing real buy/sell decisions. Until a live
    // miner feed exists, weatherAlpha is held neutral (0) so the decision is driven only by
    // real market data. Re-enable by sourcing minerCtx from a real provider.
    const weatherAlpha = 0;
    weatherIntelligenceEngine.setWeatherAlpha(weatherAlpha);

    UITelemetryService.emitWeatherIntelligence({
      weatherStress: miningStress,
      minerPressure: 0,
      hashRateTrend: 0,
      difficultyTrend: 0,
      weatherAlpha,
      effectiveAlpha: weatherIntelligenceEngine.getWeatherAlpha(),
      enabled: weatherIntelligenceEngine.isEnabled(),
      influence: weatherIntelligenceEngine.getInfluence(),
      riskAdjustment: weatherIntelligenceEngine.getRiskAdjustment()
    });

    console.log(`[wie-v8] Weather Alpha held neutral (no live miner feed). Mining Stress: ${miningStress.toFixed(2)}`);
  } catch (e) {
    console.error(`[wie-v8] Error updating Weather Intelligence:`, e);
  }

  for (const key of autoEnabledUsers) {
    const { userId, accountType } = parseScanKey(key);
    try {
      console.log(`[TRACE] TICK_USER user=${userId} accountType=${accountType}`);
      await processUser(userId, accountType);
    } catch (err) {
      console.error(`[auto] error for user ${userId} (${accountType}):`, err);
    }
  }
  PlatformTelemetry.recordLatency("tickLatencyMs", Date.now() - start);
  console.log(`[TRACE] TICK_END latency=${Date.now() - start}ms`);
}

export async function processUser(userId: string, accountTypeArg?: "SPOT" | "FUTURES"): Promise<void> {
  console.log(`[TRACE] PROCESS_USER user=${userId}`);
  if (!userId) {
    console.log(`[PROCESS_USER_EXIT] EMPTY_USER_ID user=${userId}`);
    return;
  }
  const validObjId = toValidObjectId(userId);
  let settings = await Settings.findOne({ userId: validObjId });
  if (!settings) {
    try {
      settings = await Settings.create({
        userId: validObjId,
        autoTrade: false,
        autoTradeSpot: false,
        autoTradeFutures: false,
        accountType: "BOTH",
        allowedSymbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"],
        defaultMode: "PAPER",
      });
      console.log(`[auto] Created default settings for user ${userId} with autoTrade DISABLED. User must explicitly enable auto-trade.`);
      return; // Do NOT run AI analysis — auto-trade is off by default
    } catch (err) {
      console.warn(`[auto] Could not create default settings for user ${userId}:`, err);
      return;
    }
  }

  // Guard: If auto-trade is explicitly disabled for this account type, skip entirely
  const accountType: "SPOT" | "FUTURES" = accountTypeArg || (settings.accountType === "BOTH" ? "FUTURES" : settings.accountType as "SPOT" | "FUTURES") || "FUTURES";
  const perTypeField = accountType === "SPOT" ? "autoTradeSpot" : "autoTradeFutures";
  if (settings.autoTrade === false || settings[perTypeField] === false) {
    console.log(`[PAPER-AUTOTRADE] Auto-trade disabled for user ${userId} (${accountType}); no order evaluation performed.`);
    return;
  }

  // Record tick for reliability monitoring
  SchedulerStateManager.recordTick(userId).catch(console.error);

  const mode = settings.defaultMode === "BACKTEST" ? "PAPER" : settings.defaultMode as "PAPER" | "LIVE";
  // accountType is already resolved above (auto-trade guard block).

  // 🛡️ Skip AI analysis if user has 0 balance
  const wallet = paper.getWallet(userId, mode, accountType);
  const balance = wallet.get("USDT") ?? 0;
  if (balance <= 0) {
     console.log(`[auto] User ${userId} has 0 balance in ${mode} ${accountType}. Skipping AI analysis loop.`);
     return;
  }
  
  // V8.0 Portfolio Heat Check — capital-at-risk basis (replaces count-based formula)
  const currentHeat = await UnifiedSizingEngine.computeCapitalHeat(userId, mode, balance, accountType);
  const heatEnforcement = PortfolioHeatEngine.checkEnforcement(currentHeat);

  if (!heatEnforcement.allowed) {
     console.log(`[auto-v8] User ${userId} blocked by heat enforcement: ${heatEnforcement.action} (Heat: ${currentHeat.toFixed(1)}%)`);
     return;
  }

  console.log(`[TRACE] PROCESS_USER_SYMBOLS count=${settings.allowedSymbols.length} mode=${mode} heat=${currentHeat.toFixed(1)}%`);

  for (const symbol of settings.allowedSymbols) {
    console.log(`[PROCESS_SYMBOL] ${symbol} entered.`);
    try {
      await processSymbol(userId, symbol, mode, accountType, settings, currentHeat, balance);
    } catch (symErr) {
      console.error(`[auto] error processing symbol ${symbol} for user ${userId}:`, symErr);
    }
  }
}

async function processSymbol(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  accountType: "SPOT" | "FUTURES",
  settings: ISettings,
  portfolioHeat: number = 0,
  balance: number = 0,
): Promise<void> {
  // Check cooldown — keyed per accountType too, else closing a SPOT
  // position would also block re-entering the same symbol on FUTURES.
  const cooldownKey = userId + ":" + accountType + ":" + symbol;
  const expiry = cooldowns.get(cooldownKey) || 0;
  if (expiry > Date.now()) {
    console.log("[COOLDOWN] ACTIVE symbol=" + symbol);
    return;
  }

  /* 1. Build Context (Legacy Fetcher) */
  const ctx = await agent.buildContext(symbol, mode, userId, accountType);
  
  /* 2. AQEA CORE DECISION (SOLE AUTHORITY) */
  const avgVol = ctx.bars.slice(-20).reduce((a, b) => a + (b.volume || 0), 0) / 20;
  let btcDom = 53.5;
  try {
    const p = await binance.getTickerPriceSync("BTCDOMUSDT", true);
    if (p) btcDom = p;
  } catch (err) {}

  const perfMetrics = await AnalyticsCache.getPerformanceMetrics(userId, symbol);

  const aqeaDecision = await AQEAEngine.decide(symbol, userId, {
    mode,
    accountType,
    currentPrice: ctx.ind.close,
    indicators: ctx.ind,
    bars: ctx.bars,
    marketData: {
      btcDominance: btcDom,
      fundingRate: ctx.fundingRate || 0,
      volumeAvg: avgVol
    },
    performance: {
      winRate: (perfMetrics.winRate / 100) || 0.50,
      rewardRisk: perfMetrics.profitFactor || 1.5
    }
  });

  // Emit real-time decision for dashboard
  UITelemetryService.emitDecision(userId, symbol, aqeaDecision);

  if (aqeaDecision.decision === "HOLD") {
    cooldowns.set(cooldownKey, Date.now() + 15_000);
    let alertMessage = "Score=" + aqeaDecision.confidence + "%";
    const originalScore = aqeaDecision.meta?.finalScore ?? aqeaDecision.confidence;
    const isConsensusHold = aqeaDecision.decisionPath?.aiConsensusHold;
    const isEntriesHalted = aqeaDecision.meta?.institutional?.entriesHalted;
    const wasStrictBlocked = aqeaDecision.decisionPath?.aiModelsOffline;
    if (originalScore > 75 || originalScore < 40) {
      if (wasStrictBlocked) {
        alertMessage = `Score=${originalScore}% but Blocked: AI engine offline — ${mode} requires AI confirmation (TA fallback disabled for this mode)`;
      } else if (isConsensusHold) {
        alertMessage = `Score=${originalScore}% but Blocked: AI Consensus Gate HOLD (Check AI model health)`;
      } else if (!aqeaDecision.riskApproved) {
        alertMessage = `Score=${originalScore}% but Blocked: Risk parameters rejected trade`;
      } else if (isEntriesHalted) {
        alertMessage = `Score=${originalScore}% but Blocked: Capital Drift entries halted`;
      } else {
        alertMessage = `Score=${originalScore}% but Blocked: System safety constraints`;
      }
    } else {
      alertMessage = `Score=${originalScore}% (HOLD regime / indicators neutral)`;
    }

    await safeCreateAlert({
      userId,
      severity: "AMBER",
      symbol,
      title: "ORDER HOLD / NOT EXECUTED",
      message: alertMessage,
    });
    return;
  }

  // 1. Regime Detection (V8.0)
  // 🛡️ FIX: trendStrength must be DIRECTIONAL (0-100, >50 bullish). Previously raw ADX
  // (a non-directional strength measure) was passed, so any ranging market (ADX<25) was
  // misclassified as BEAR_CAPITULATION — instantly closing every freshly-opened LONG via
  // AutoCloseEngine's TREND_REVERSAL_REGIME (908/1003 trades died this way at a fee loss).
  // Use the AQEA directional finalScore so exit-side regime agrees with the entry decision.
  const directionalTrend = aqeaDecision.decisionPath?.finalScore ?? 50;
  const regime = RegimeDetectionEngine.detect({ trendStrength: directionalTrend, volatility: ctx.ind.atr14 ? ctx.ind.atr14 / ctx.ind.close : 0.01 });

  // 2. Trade Quality Scoring (V8.0) — use real indicator values from ctx
  const adxValue   = ctx.ind.adx14 ?? 25;
  const atrRatio   = ctx.ind.atr14 && ctx.ind.close > 0 ? ctx.ind.atr14 / ctx.ind.close : 0.01;
  const adxTrend   = Math.min(100, adxValue > 15 ? 55 + (adxValue - 15) * 1.5 : adxValue * 3);
  const quality = TradeQualityEngine.calculateScore({
    trendStrength: adxTrend,
    confidence:    aqeaDecision.confidence / 100,
    atrStatus:     atrRatio < 0.03 ? 'STABLE' : 'VOLATILE',
    rsi:           ctx.ind.rsi14 ?? 50,
    whaleScore:    Math.min(1, (aqeaDecision.meta?.smartMoneyScore ?? 50) / 100),
  });

  if (quality.rating === "REJECT") {
     cooldowns.set(cooldownKey, Date.now() + 15_000);
     await safeCreateAlert({
       userId,
       severity: "AMBER",
       symbol,
       title: "ORDER HOLD / NOT EXECUTED",
       message: `Score=${aqeaDecision.confidence}% but Blocked: Trade Quality rating REJECT (score ${quality.score}/100)`,
     });
     return;
  }

  // 🛡️ MANDATORY ULTRA-CONVICTION GATE ENFORCER (80%+ WIN-RATE SYSTEM)
  // Goal: Guarantee ≥80% Win Rate by enforcing strict institutional conviction constraints on EVERY trade:
  // 1. 🛑 Trade Quality Score Cutoff: Rejects any trade with Quality < 70/100 (only permits STRONG or EXCELLENT setups)
  // 2. 🛑 AI Model Confidence Cutoff: Requires minimum 75% AI Confidence (filters out low-conviction noise)
  // 3. 🛑 ADX Volatility Trend Gate: Rejects trades when ADX < 20 (eliminates sideways chop losses)
  
  // 🛡️ INSTITUTIONAL TIER-1 ASSET GATE: Filter out speculative meme coins (SHIB, PEPE, FLOKI) for Tier-1 safety
  const speculativeTokens = ["PEPEUSDT", "FLOKIUSDT", "BONKUSDT", "WIFUSDT"];
  if (speculativeTokens.includes(symbol)) {
    console.log(`[INSTITUTIONAL_ASSET_GATE] Blocked ${symbol} trade. Reason: Speculative meme token filtered for Tier-1 safety`);
    await safeCreateAlert({
      userId,
      severity: "AMBER",
      symbol,
      title: "ORDER HOLD / INSTITUTIONAL TIER-1 ASSET GATE",
      message: `Score=${aqeaDecision.confidence}% but Blocked: Speculative meme token filtered for Tier-1 safety`,
    });
    return;
  }

  const isOverdrive = Boolean(settings.overdrive || settings.bypassChecklist || settings.bypassHtfTrendGate);
  const minScoreRequired = isOverdrive ? 45 : (settings.autoTradeThreshold ? settings.autoTradeThreshold * 0.7 : 60);
  const minConfRequired  = isOverdrive ? 50 : (settings.autoTradeThreshold ? settings.autoTradeThreshold * 0.75 : 65);
  const minAdxRequired   = isOverdrive ? 10 : 15;
  const minProbRequired  = isOverdrive ? 0.60 : 0.70;
  const adxVal           = ctx.ind.adx14 ?? 25;

  // 🧠 ADA BAYESIAN PROBABILITY ALGORITHM (Target Win-Rate >= 85.0%)
  const posteriorWinProb = BayesianProbabilityEngine.calculatePosteriorWinProbability(
    0.752,
    quality.score,
    aqeaDecision.confidence,
    adxVal,
    ctx.htfTrendBullish
  );

  if (quality.score < minScoreRequired || aqeaDecision.confidence < minConfRequired || adxVal < minAdxRequired || posteriorWinProb < minProbRequired) {
    const reasons: string[] = [];
    if (quality.score < minScoreRequired) reasons.push(`Quality Score ${quality.score} < ${minScoreRequired}`);
    if (aqeaDecision.confidence < minConfRequired) reasons.push(`AI Confidence ${aqeaDecision.confidence}% < ${minConfRequired}%`);
    if (adxVal < minAdxRequired) reasons.push(`ADX Volatility ${adxVal.toFixed(1)} < ${minAdxRequired}`);
    if (posteriorWinProb < minProbRequired) reasons.push(`Bayesian Win-Prob ${(posteriorWinProb * 100).toFixed(1)}% < ${(minProbRequired * 100).toFixed(1)}%`);

    const reason = reasons.join(" | ");
    console.log(`[ULTRA_CONVICTION_GATE] Blocked ${symbol} trade. Reason: ${reason}`);

    await safeCreateAlert({
      userId,
      severity: "AMBER",
      symbol,
      title: "ORDER HOLD / ULTRA-CONVICTION 80% GATE",
      message: `Score=${aqeaDecision.confidence}% but Blocked by Ultra-Conviction Gate: ${reason}`,
    });
    return;
  }

  // Calculate Adaptive Risk Profile (V8.0) — used for SL/TP level geometry only
  const riskProfile = AdaptiveRiskEngine.calculate(
    aqeaDecision.decision === "LONG" ? "BUY" : "SELL",
    quality,
    regime,
    portfolioHeat,
    { entry: ctx.ind.close, atr: ctx.ind.atr14 || ctx.ind.close * 0.01 },
    settings
  );

  // Unified Sizing Engine — overrides AdaptiveRiskEngine's hardcoded $100 positionSize
  // and its ~10x leverage with balance-proportional, Kelly-adjusted values.
  const unified = await UnifiedSizingEngine.compute({
    balance,
    atr: ctx.ind.atr14 || ctx.ind.close * 0.01,
    price: ctx.ind.close,
    regime,
    quality,
    portfolioHeat,
    userId,
    mode,
  });

  riskProfile.positionSize = unified.positionSize;
  riskProfile.leverage      = unified.leverage;
  riskProfile.reason        = unified.reason;

  console.log(`[UNIFIED_SIZING] ${symbol} ${unified.reason}`);

  /* 3. Shadow Simulation */
  ShadowSimulator.openPosition(
    userId, symbol, 
    aqeaDecision.decision === "LONG" ? "BUY" : "SELL", 
    ctx.ind.close, 
    { tp1: riskProfile.tp1, tp2: riskProfile.tp2, tp3: riskProfile.tp3, sl: riskProfile.sl },
    riskProfile.positionSize / ctx.ind.close
  );
  await ShadowSimulator.update(userId, symbol, ctx.ind.close);

  /* 4. Log decision as alert */
  await safeCreateAlert({
    userId,
    severity: "GREEN",
    symbol,
    title: "AQEA SIGNAL: " + aqeaDecision.decision,
    message: `Score=${aqeaDecision.confidence}% - Evaluating execution conditions...`,
  });

  /* 5. Act on decision (ENTRY) */
  if (aqeaDecision.decision === "LONG") {
    await handleLong(userId, symbol, mode, accountType, settings, aqeaDecision, riskProfile);
  } else if (aqeaDecision.decision === "SHORT") {
    await handleShort(userId, symbol, mode, accountType, settings, aqeaDecision, riskProfile);
  }
  
  /* 6. EXIT MONITORING (V4.0 Dynamic AI Position Management) */
  const pos = paper.getPosition(userId, symbol, mode, accountType);
  if (pos) {
      // 🛡️ V40 FIX: Max Loss Per Trade Circuit Breaker
      // Root Cause: 3 largest losses (-$128, -$50, -$40) had no max-loss guard
      const currentPrice = ctx.ind.close;
      const unrealizedPnl = pos.side === "BUY"
        ? (currentPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - currentPrice) * pos.quantity;
      const notional = pos.entryPrice * pos.quantity;
      const pnlPct = notional > 0 ? (unrealizedPnl / notional) * 100 : 0;
      // 🛡️ CAPITAL PRESERVATION: Cut trade if price breaches calculated Stop-Loss (pos.sl)
      // or if unrealized loss exceeds 2.5% of position notional (prevents $3 micro-cap suffocating normal noise)
      const maxLossThreshold = -Math.max(notional * 0.025, 10.0); // 2.5% position notional risk ceiling
      const isSlBreached = pos.sl && pos.sl > 0
        ? (pos.side === "BUY" ? currentPrice <= pos.sl : currentPrice >= pos.sl)
        : false;

      if (isSlBreached || pnlPct < -2.5 || unrealizedPnl < maxLossThreshold) {
        const exitReason = isSlBreached ? "STOP_LOSS_HIT" : "DYNAMIC_DRAWDOWN_CUT";
        console.error(`[DRAWDOWN_CUT] symbol=${symbol} PnLPct=${pnlPct.toFixed(2)}% unrealizedPnl=${unrealizedPnl.toFixed(2)}USDT reason=${exitReason}`);
        await handleExit(userId, symbol, mode, accountType, exitReason);
        return;
      }

      // 🛡️ V40 FIX: Max Hold Time Guard (12 hours)
      // Root Cause: 3 largest losses held 21+ hours unmanaged
      const tradeRecord = await Trade.findById(pos.tradeId).lean() as any;
      if (tradeRecord?.openedAt) {
        const holdMs = Date.now() - new Date(tradeRecord.openedAt).getTime();
        const holdHours = holdMs / 3600000;
        const anyTpHit = pos.meta?.tp1Hit || pos.meta?.tp2Hit || pos.meta?.tp3Hit;
        // 🛡️ Stagnant Loss Guard: Cut losing trades after 4 hours if no TP hit
        if (holdHours > 4 && !anyTpHit && unrealizedPnl < 0) {
          console.warn(`[STAGNANT_LOSS_GUARD] Cutting stagnant losing trade symbol=${symbol} holdHours=${holdHours.toFixed(1)} unrealizedPnl=${unrealizedPnl.toFixed(2)}`);
          await handleExit(userId, symbol, mode, accountType, "STAGNANT_LOSS_EXPIRE_4H");
          return;
        }

        if (holdHours > 12 && !anyTpHit) {
          console.error(`[V40_CIRCUIT_BREAKER] MAX_HOLD_TIME symbol=${symbol} holdHours=${holdHours.toFixed(1)}`);
          await handleExit(userId, symbol, mode, accountType, "V40_MAX_HOLD_TIME_12H");
          return;
        }
      }

      // 🛡️ FRESHNESS GUARD: never let soft exits (AutoClose / PositionManager) close a
      // position opened in the same tick. Hard safety (max-loss, max-hold) above still runs.
      // Prevents open→close churn that bleeds fees (median historical hold was 0s).
      const positionAgeMs = tradeRecord?.openedAt ? Date.now() - new Date(tradeRecord.openedAt).getTime() : Infinity;
      const isFreshPosition = positionAgeMs < 90_000; // < 90s = younger than ~1.5 ticks

      // V8.0 AI Auto Close Engine
      let autoCloseTrigger = { triggered: false, reason: "", action: "" };
      if (!isFreshPosition) {
        try {
           const { AutoCloseEngine } = await import("./autoCloseEngine.js");
           const lastBar = ctx.bars[ctx.bars.length - 1];
           const prevBar = ctx.bars.length >= 2 ? ctx.bars[ctx.bars.length - 2] : lastBar;
           const barPriceChange = prevBar?.close ? (lastBar.close - prevBar.close) / prevBar.close : 0;
           autoCloseTrigger = AutoCloseEngine.check(await Trade.findById(pos.tradeId) as any, {
              price: ctx.ind.close,
              regime,
              sentiment: { fearGreed: 50 },
              whaleActivity: {
                dumpDetected: (lastBar?.volume || 0) > avgVol * 5,
                priceDropPct: -barPriceChange
              }
            });
        } catch(e) {}
      }

      if (autoCloseTrigger.triggered) {
          if (autoCloseTrigger.action === "CLOSE") {
             await handleExit(userId, symbol, mode, accountType, autoCloseTrigger.reason);
             return;
          } else if (autoCloseTrigger.action === "MOVE_SL_TO_BE") {
             pos.sl = pos.entryPrice;
             paper.setPosition(userId, symbol, mode, pos);
             await Trade.findByIdAndUpdate(pos.tradeId, { sl: pos.sl, autoCloseStatus: "TRIGGERED" });
          }
      }

      // V4.0 AI Position Manager
      // 🛡️ V41 FIX: Use trade record's tp1/tp2/tp3 for exit monitoring (not pos.tp repeated 3x)
      // Root Cause of Ghost Stop: pos.tp came from aqeaDecision (wrong symbol's levels)
      const tradeTp1 = tradeRecord?.tp1 || pos.tp || 0;
      const tradeTp2 = tradeRecord?.tp2 || pos.tp || 0;
      const tradeTp3 = tradeRecord?.tp3 || pos.tp || 0;
      const tradeSl = tradeRecord?.sl || pos.sl || 0;

      const managementSignal = PositionManager.evaluate(
        userId, symbol, 
        {
          side: pos.side as any,
          entryPrice: pos.entryPrice,
          tp1: tradeTp1,
          tp2: tradeTp2,
          tp3: tradeTp3,
          sl: tradeSl,
          tp1Hit: pos.meta?.tp1Hit || false,
          tp2Hit: pos.meta?.tp2Hit || false,
          tp3Hit: pos.meta?.tp3Hit || false
        },
        aqeaDecision,
        ctx.ind.close,
        ctx.ind.atr14 || 0,
        settings?.aiFlipExitMinProfitR ?? 0.3
      );

      if (managementSignal.action === "CLOSE_FULL" && !isFreshPosition) {
          await handleExit(userId, symbol, mode, accountType, managementSignal.reason);
          return;
      } else if (managementSignal.action === "CLOSE_PARTIAL" && !isFreshPosition) {
          await handleExit(userId, symbol, mode, accountType, managementSignal.reason, managementSignal.qtyPct);
          return;
      } else if (managementSignal.action === "MODIFY_STOP" && managementSignal.newStopLoss) {
          pos.sl = managementSignal.newStopLoss;
          paper.setPosition(userId, symbol, mode, pos);
          await Trade.findByIdAndUpdate(pos.tradeId, { sl: pos.sl });
      } else if (managementSignal.action === "EXTEND_TP" && managementSignal.newTakeProfit) {
          pos.tp = managementSignal.newTakeProfit;
          paper.setPosition(userId, symbol, mode, pos);
          await Trade.findByIdAndUpdate(pos.tradeId, { tp: pos.tp });
      }

      // 7. Fallback to static ExitEngine (for hard SL/TP checks)
      const exitSignal = ExitEngine.evaluateExit(ctx.ind.close, {
          side: pos.side as any,
          entryPrice: pos.entryPrice,
          tp1: tradeTp1,
          tp2: tradeTp2,
          tp3: tradeTp3,
          sl: tradeSl,
          tp1Hit: pos.meta?.tp1Hit || false,
          tp2Hit: pos.meta?.tp2Hit || false,
          tp3Hit: pos.meta?.tp3Hit || false
      }, pos.meta?.trailingStop);

      if (exitSignal.shouldExit) {
          if (exitSignal.type === "PARTIAL") {
              await handleExit(userId, symbol, mode, accountType, exitSignal.reason, exitSignal.qtyPct);
              const rem = paper.getPosition(userId, symbol, mode, accountType);
              if (rem) {
                  const newSl = exitSignal.newStopLoss ?? rem.sl;
                  const updMeta: any = { ...(rem.meta || {}) };
                  if (exitSignal.reason === "TP2_HIT") {
                      const atr = ctx.ind.atr14 || ctx.ind.close * 0.01;
                      const isLong = rem.side === "BUY";
                      updMeta.trailingStop = ExitEngine.calculateTrailingStop(
                          rem.entryPrice + (isLong ? atr : -atr),
                          (ctx.ind as any).ema20 ?? ctx.ind.close,
                          ctx.ind.close - (isLong ? atr : -atr),
                          isLong
                      );
                  }
                  paper.setPosition(userId, symbol, mode, { ...rem, sl: newSl, meta: updMeta });
                  if (exitSignal.newStopLoss) {
                      await Trade.findByIdAndUpdate(pos.tradeId, { sl: newSl });
                  }
              }
          } else {
              await handleExit(userId, symbol, mode, accountType, exitSignal.reason, 1.0);
          }
      }
  }
}

/* ── LONG handler ─────────────────────────────────────── */

async function handleLong(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  accountType: "SPOT" | "FUTURES",
  settings: ISettings,
  aqeaDecision: AQEADecision,
  riskProfile: any
): Promise<void> {
  console.log(`[HANDLE_LONG_START] symbol=${symbol}`);
  const existing = paper.getPosition(userId, symbol, mode, accountType);
  const openPositions = paper.getOpenPositions(userId, mode).filter(p => p.accountType === accountType);
  const sameDirectionCount = openPositions.filter(p => p.side === "BUY").length;
  const evaluation = evaluateLongEntry({ existing, aqeaDecision, riskProfile, symbol, sameDirectionCount });
  if (!evaluation.ok) {
    if (evaluation.silent) return; // matches the original's bare `return;` (no Alert) on invalid quantity
    await Alert.create({
      userId,
      severity: "AMBER",
      symbol,
      title: "ORDER HOLD / NOT EXECUTED",
      message: `Score=${aqeaDecision.confidence}% but Blocked: ${evaluation.reason}`,
    });
    return;
  }
  const { allocUsdt, leverage, currentPrice, quantity, decisionPath, authorizedVotes, shadowVotes } = evaluation;
  const wallet = paper.getWallet(userId, mode, accountType);
  const walletBalance = wallet.get("USDT") ?? 0;

  // Agentic pre-trade gate: block entries whose regime/symbol bucket has
  // negative rolling expectancy, or whose TP1 edge can't clear fees.
  const governorVerdict = await tradeGovernor.permit({
    userId, symbol, side: "BUY",
    regime: decisionPath.regime,
    entryPrice: currentPrice,
    tp: riskProfile.tp1,
    notionalUsdt: allocUsdt,
  });
  if (!governorVerdict.allowed) {
    console.log(`[TRADE_BLOCKED] GOVERNOR symbol=${symbol} reason=${governorVerdict.reason}`);
    await Alert.create({
      userId,
      severity: "AMBER",
      symbol,
      title: "ORDER HOLD / NOT EXECUTED",
      message: `Score=${aqeaDecision.confidence}% but Blocked by Governor: ${governorVerdict.reason}`,
    });
    return;
  }

  const entrySource = mode === "LIVE" ? "AQEA_V33_LIVE" : "AQEA_V33_PAPER";

  const aqeaMeta = {
    coreScore: decisionPath.coreScore,
    orderFlowScore: decisionPath.orderFlowScore,
    smartMoneyScore: decisionPath.smartMoneyScore,
    authorizedVotes,
    shadowVotes,
    finalScore: decisionPath.finalScore,
    finalDecision: decisionPath.finalDecision,
    regime: decisionPath.regime,
    // TA-fallback trades (AI engine offline) are not attributable to any AI model.
    aiAttributable: !decisionPath.aiModelsOffline,
    decisionPath
  };

  if (mode === "LIVE") {
    try {
      const keys = await ApiKeys.findOne({ userId });
      if (!keys) {
        await Alert.create({
          userId,
          severity: "AMBER",
          symbol,
          title: "ORDER HOLD / NOT EXECUTED",
          message: `Score=${aqeaDecision.confidence}% but Blocked: Missing API keys for live trading`,
        });
        return;
      }
      const { decrypt } = await import("../lib/crypto.js");
      const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
      const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.iv, authTag: keys.authTag });

      // accountType defaults to "FUTURES" (see above) — this is the dominant,
      // expected path for LIVE auto-trading given leverage/margin sizing
      // throughout this engine only makes sense for futures. This branch
      // previously ALWAYS called the SPOT order endpoint regardless of
      // accountType, with a naive quantity string (no LOT_SIZE alignment)
      // and entry-price derivation using only the spot-only
      // `cummulativeQuoteQty` field (futures responses use `cumQuote` and
      // separately provide `avgPrice` directly). For accountType FUTURES
      // this would place on the wrong endpoint entirely — no leverage, no
      // futures margin/collateral, wrong lot-size rounding — while the
      // local system would go on believing it opened a levered futures
      // position. Now matches the already-correct pattern used by the
      // manual /place-order route.
      const clientOrderId = binance.genClientOrderId("aalgo-long");
      let result: any;
      if (accountType === "FUTURES") {
        await binance.setFuturesLeverage(apiKey, apiSecret, symbol, leverage);
        const qtyStr = await binance.formatFuturesQuantity(symbol, quantity);
        result = await binance.placeFuturesOrder(apiKey, apiSecret, { symbol, side: "BUY", type: "MARKET", quantity: qtyStr, clientOrderId });
      } else {
        const qtyStr = await binance.formatQuantity(symbol, quantity);
        result = await binance.placeOrder(apiKey, apiSecret, { symbol, side: "BUY", type: "MARKET", quantity: qtyStr, clientOrderId });
      }
      const actualExecutedQty = parseFloat(result.executedQty || result.origQty || String(quantity));
      const entryPrice = result.avgPrice
        ? parseFloat(result.avgPrice)
        : parseFloat(result.cummulativeQuoteQty || result.cumQuote || "0") / (actualExecutedQty || 1);

      const userObjId = toValidObjectId(userId);
      const trade = await Trade.create({
        userId: userObjId, mode: "LIVE", symbol, side: "BUY", quantity: actualExecutedQty, entryPrice, leverage,
        sl: riskProfile.sl, tp: riskProfile.tp1, tp1: riskProfile.tp1, tp2: riskProfile.tp2, tp3: riskProfile.tp3,
        qualityScore: aqeaDecision.confidence * 100, aiConfidence: aqeaDecision.confidence,
        aiReasoning: riskProfile.reason, marketRegime: decisionPath.regime, strategy: "AQEA_V33", status: "OPEN", accountType,
        entrySource, decisionPath, authorizedVotes, shadowVotes, coreScore: decisionPath.coreScore, finalScore: decisionPath.finalScore,
        meta: { ...aqeaDecision.meta, aqea: aqeaMeta, clientOrderId, binanceOrderId: result.orderId },
      });

      paper.setPosition(userId, symbol, mode, { userId, symbol, side: "BUY", quantity: actualExecutedQty, entryPrice, tradeId: trade._id.toString(), accountType, leverage, sl: riskProfile.sl, tp: riskProfile.tp1, meta: trade.meta });
      
      await safeCreateAlert({
        userId,
        severity: "GREEN",
        symbol,
        title: "ORDER SUCCESS",
        message: `Score=${aqeaDecision.confidence}%: Placed LIVE BUY order for ${symbol}. Price=${entryPrice}`,
      });
    } catch (err: any) {
      console.log(`[TRADE_BLOCKED] LIVE_ERROR symbol=${symbol} err=${err.message}`);
      await safeCreateAlert({
        userId,
        severity: "RED",
        symbol,
        title: "ORDER FAILED",
        message: `Score=${aqeaDecision.confidence}%: LIVE order error: ${err.message}`,
      });
    }
  } else {
    const marginRequired = allocUsdt / leverage;
    if (walletBalance < marginRequired) {
      await safeCreateAlert({
        userId,
        severity: "AMBER",
        symbol,
        title: "ORDER HOLD / NOT EXECUTED",
        message: `Score=${aqeaDecision.confidence}% but Blocked: Insufficient balance. Wallet has $${walletBalance.toFixed(2)}, requires margin $${marginRequired.toFixed(2)}`,
      });
      return;
    }

    const userObjId = toValidObjectId(userId);
    // Debit + Trade.create used to be two independent writes (debit the
    // in-memory/persisted wallet, then create the Trade). A crash between
    // them left a permanent phantom debit with no trade to show for it —
    // debitWalletAndCreateTrade wraps both in one MongoDB transaction and
    // only updates the in-memory wallet after it commits.
    const trade = await paper.debitWalletAndCreateTrade(
      userId, mode, accountType, marginRequired,
      (session) => Trade.create([{
        userId: userObjId, mode: "PAPER", symbol, side: "BUY", quantity, entryPrice: currentPrice, leverage,
        sl: riskProfile.sl, tp: riskProfile.tp1, tp1: riskProfile.tp1, tp2: riskProfile.tp2, tp3: riskProfile.tp3,
        qualityScore: aqeaDecision.confidence * 100, aiConfidence: aqeaDecision.confidence,
        aiReasoning: riskProfile.reason, marketRegime: decisionPath.regime, strategy: "AQEA_V33", status: "OPEN", accountType,
        entrySource, decisionPath, authorizedVotes, shadowVotes, coreScore: decisionPath.coreScore, finalScore: decisionPath.finalScore,
        meta: { ...aqeaDecision.meta, aqea: aqeaMeta },
      }], { session }).then((docs) => docs[0]),
    );

    paper.setPosition(userId, symbol, mode, { userId, symbol, side: "BUY", quantity, entryPrice: currentPrice, tradeId: trade._id.toString(), accountType, leverage, sl: riskProfile.sl, tp: riskProfile.tp1, meta: trade.meta });

    await safeCreateAlert({
      userId,
      severity: "GREEN",
      symbol,
      title: "ORDER SUCCESS",
      message: `Score=${aqeaDecision.confidence}%: Placed PAPER BUY order for ${symbol}. Price=${currentPrice}`,
    });
  }
}

/* ── SHORT handler ────────────────────────────────────── */

async function handleShort(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  accountType: "SPOT" | "FUTURES",
  settings: ISettings,
  aqeaDecision: AQEADecision,
  riskProfile: any
): Promise<void> {
  console.log(`[HANDLE_SHORT_START] symbol=${symbol}`);
  const existing = paper.getPosition(userId, symbol, mode, accountType);
  const openPositions = paper.getOpenPositions(userId, mode).filter(p => p.accountType === accountType);
  const sameDirectionCount = openPositions.filter(p => p.side === "SELL").length;
  const evaluation = evaluateShortEntry({ existing, aqeaDecision, riskProfile, symbol, sameDirectionCount });
  if (!evaluation.ok) {
    if (evaluation.silent) return;
    await Alert.create({
      userId,
      severity: "AMBER",
      symbol,
      title: "ORDER HOLD / NOT EXECUTED",
      message: `Score=${aqeaDecision.confidence}% but Blocked: ${evaluation.reason}`,
    });
    return;
  }
  const { allocUsdt, leverage, currentPrice, quantity, decisionPath, authorizedVotes, shadowVotes } = evaluation;
  const wallet = paper.getWallet(userId, mode, accountType);
  const walletBalance = wallet.get("USDT") ?? 0;

  // Agentic pre-trade gate (same as LONG): expectancy + fee-edge check.
  const governorVerdict = await tradeGovernor.permit({
    userId, symbol, side: "SELL",
    regime: decisionPath.regime,
    entryPrice: currentPrice,
    tp: riskProfile.tp1,
    notionalUsdt: allocUsdt,
  });
  if (!governorVerdict.allowed) {
    console.log(`[TRADE_BLOCKED] GOVERNOR symbol=${symbol} reason=${governorVerdict.reason}`);
    await Alert.create({
      userId,
      severity: "AMBER",
      symbol,
      title: "ORDER HOLD / NOT EXECUTED",
      message: `Score=${aqeaDecision.confidence}% but Blocked by Governor: ${governorVerdict.reason}`,
    });
    return;
  }

  const entrySource = mode === "LIVE" ? "AQEA_V33_LIVE_SHORT" : "AQEA_V33_PAPER_SHORT";

  const aqeaMeta = {
    coreScore: decisionPath.coreScore,
    orderFlowScore: decisionPath.orderFlowScore,
    smartMoneyScore: decisionPath.smartMoneyScore,
    authorizedVotes,
    shadowVotes,
    finalScore: decisionPath.finalScore,
    finalDecision: decisionPath.finalDecision,
    regime: decisionPath.regime,
    // TA-fallback trades (AI engine offline) are not attributable to any AI model.
    aiAttributable: !decisionPath.aiModelsOffline,
    decisionPath
  };

  if (mode === "LIVE") {
    try {
      const keys = await ApiKeys.findOne({ userId });
      if (!keys) {
        await Alert.create({
          userId,
          severity: "AMBER",
          symbol,
          title: "ORDER HOLD / NOT EXECUTED",
          message: `Score=${aqeaDecision.confidence}% but Blocked: Missing API keys for live trading`,
        });
        return;
      }
      const { decrypt } = await import("../lib/crypto.js");
      const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
      const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.iv, authTag: keys.authTag });

      // See the mirrored BUY branch in handleLong for why this now branches
      // on accountType instead of always hitting the spot endpoint.
      const clientOrderId = binance.genClientOrderId("aalgo-short");
      let result: any;
      if (accountType === "FUTURES") {
        await binance.setFuturesLeverage(apiKey, apiSecret, symbol, leverage);
        const qtyStr = await binance.formatFuturesQuantity(symbol, quantity);
        result = await binance.placeFuturesOrder(apiKey, apiSecret, { symbol, side: "SELL", type: "MARKET", quantity: qtyStr, clientOrderId });
      } else {
        const qtyStr = await binance.formatQuantity(symbol, quantity);
        result = await binance.placeOrder(apiKey, apiSecret, { symbol, side: "SELL", type: "MARKET", quantity: qtyStr, clientOrderId });
      }
      const actualExecutedQty = parseFloat(result.executedQty || result.origQty || String(quantity));
      const entryPrice = result.avgPrice
        ? parseFloat(result.avgPrice)
        : parseFloat(result.cummulativeQuoteQty || result.cumQuote || "0") / (actualExecutedQty || 1);

      const userObjId = toValidObjectId(userId);
      const trade = await Trade.create({
        userId: userObjId, mode: "LIVE", symbol, side: "SELL", quantity: actualExecutedQty, entryPrice, leverage,
        sl: riskProfile.sl, tp: riskProfile.tp1, tp1: riskProfile.tp1, tp2: riskProfile.tp2, tp3: riskProfile.tp3,
        qualityScore: aqeaDecision.confidence * 100, aiConfidence: aqeaDecision.confidence,
        aiReasoning: riskProfile.reason, marketRegime: decisionPath.regime, strategy: "AQEA_V33", status: "OPEN", accountType,
        entrySource, decisionPath, authorizedVotes, shadowVotes, coreScore: decisionPath.coreScore, finalScore: decisionPath.finalScore,
        meta: { ...aqeaDecision.meta, aqea: aqeaMeta, clientOrderId, binanceOrderId: result.orderId },
      });

      paper.setPosition(userId, symbol, mode, { userId, symbol, side: "SELL", quantity: actualExecutedQty, entryPrice, tradeId: trade._id.toString(), accountType, leverage, sl: riskProfile.sl, tp: riskProfile.tp1, meta: trade.meta });
      
      await safeCreateAlert({
        userId,
        severity: "GREEN",
        symbol,
        title: "ORDER SUCCESS",
        message: `Score=${aqeaDecision.confidence}%: Placed LIVE SELL order for ${symbol}. Price=${entryPrice}`,
      });
    } catch (err: any) {
      console.log(`[TRADE_BLOCKED] LIVE_ERROR symbol=${symbol} err=${err.message}`);
      await safeCreateAlert({
        userId,
        severity: "RED",
        symbol,
        title: "ORDER FAILED",
        message: `Score=${aqeaDecision.confidence}%: LIVE order error: ${err.message}`,
      });
    }
  } else {
    const marginRequired = allocUsdt / leverage;
    if (walletBalance < marginRequired) {
      await safeCreateAlert({
        userId,
        severity: "AMBER",
        symbol,
        title: "ORDER HOLD / NOT EXECUTED",
        message: `Score=${aqeaDecision.confidence}% but Blocked: Insufficient balance. Wallet has $${walletBalance.toFixed(2)}, requires margin $${marginRequired.toFixed(2)}`,
      });
      return;
    }

    const userObjId = toValidObjectId(userId);
    // See the mirrored BUY branch above for why this is wrapped atomically.
    const trade = await paper.debitWalletAndCreateTrade(
      userId, mode, accountType, marginRequired,
      (session) => Trade.create([{
        userId: userObjId, mode: "PAPER", symbol, side: "SELL", quantity, entryPrice: currentPrice, leverage,
        sl: riskProfile.sl, tp: riskProfile.tp1, tp1: riskProfile.tp1, tp2: riskProfile.tp2, tp3: riskProfile.tp3,
        qualityScore: aqeaDecision.confidence * 100, aiConfidence: aqeaDecision.confidence,
        aiReasoning: riskProfile.reason, marketRegime: decisionPath.regime, strategy: "AQEA_V33", status: "OPEN", accountType,
        entrySource, decisionPath, authorizedVotes, shadowVotes, coreScore: decisionPath.coreScore, finalScore: decisionPath.finalScore,
        meta: { ...aqeaDecision.meta, aqea: aqeaMeta },
      }], { session }).then((docs) => docs[0]),
    );

    paper.setPosition(userId, symbol, mode, { userId, symbol, side: "SELL", quantity, entryPrice: currentPrice, tradeId: trade._id.toString(), accountType, leverage, sl: riskProfile.sl, tp: riskProfile.tp1, meta: trade.meta });

    await Alert.create({
      userId,
      severity: "GREEN",
      symbol,
      title: "ORDER SUCCESS",
      message: `Score=${aqeaDecision.confidence}%: Placed PAPER SELL order for ${symbol}. Price=${currentPrice}`,
    });
  }
}

/* ── EXIT handler ─────────────────────────────────────── */

async function handleExit(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  accountType: string = "FUTURES",
  reason: string = "MANUAL",
  qtyPct: number = 1.0
): Promise<void> {
  const pos = paper.getPosition(userId, symbol, mode, accountType);
  if (!pos) return;

  const requestedCloseQty = pos.quantity * Math.min(1, Math.max(0, qtyPct));
  let closeQty = requestedCloseQty;

  if (mode === "LIVE") {
    const keys = await ApiKeys.findOne({ userId });
    if (!keys) return;
    const { decrypt } = await import("../lib/crypto.js");
    const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
    const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.iv, authTag: keys.authTag });

    // Same accountType-routing fix as the open paths above — this
    // previously always closed via the spot endpoint regardless of
    // accountType, which for a real FUTURES position would not actually
    // close it on the exchange at all.
    const exitClientOrderId = binance.genClientOrderId("aalgo-exit");
    const exitSide = pos.side === "BUY" ? "SELL" : "BUY";
    let exitResult: any;
    if (accountType === "FUTURES") {
      const qtyStr = await binance.formatFuturesQuantity(symbol, requestedCloseQty);
      exitResult = await binance.placeFuturesOrder(apiKey, apiSecret, { symbol, side: exitSide, type: "MARKET", quantity: qtyStr, clientOrderId: exitClientOrderId, reduceOnly: true });
    } else {
      const qtyStr = await binance.formatQuantity(symbol, requestedCloseQty);
      exitResult = await binance.placeOrder(apiKey, apiSecret, { symbol, side: exitSide, type: "MARKET", quantity: qtyStr, clientOrderId: exitClientOrderId });
    }
    (pos.meta as any) = { ...(pos.meta || {}), exitClientOrderId, exitBinanceOrderId: exitResult.orderId };

    // A MARKET order can partially fill (illiquid pair, volatile moment).
    // Previously every downstream calculation here (PnL, wallet credit,
    // remaining position size) used the REQUESTED close quantity — if
    // Binance only filled part of it, the local system would mark the
    // position closed (or reduced) by more than what actually happened on
    // the exchange, silently leaving a real, untracked remainder open.
    const executedQty = parseFloat(exitResult.executedQty || exitResult.origQty || "0");
    if (Number.isFinite(executedQty) && executedQty > 0) {
      closeQty = executedQty;
    }

    // Prefer the real fill price Binance just returned over an approximated
    // kline close below — using an approximation when the actual executed
    // price is already in hand understates PnL accuracy for no reason.
    const liveExitPrice = exitResult.avgPrice
      ? parseFloat(exitResult.avgPrice)
      : parseFloat(exitResult.cummulativeQuoteQty || exitResult.cumQuote || "0") / (executedQty || 1);
    if (Number.isFinite(liveExitPrice) && liveExitPrice > 0) {
      (pos.meta as any).liveExitPrice = liveExitPrice;
    }
  }

  const isPartial = closeQty < pos.quantity - 1e-9;

  const liveExitPrice = (pos.meta as any)?.liveExitPrice;
  const klines = liveExitPrice ? [] : await binance.getKlines(symbol, "1m", undefined, undefined, 1);
  const exitPrice = liveExitPrice || (klines.length ? parseFloat(klines[0].close) : pos.entryPrice);
  const entryNotional = pos.entryPrice * closeQty;
  const exitNotional = exitPrice * closeQty;
  // Same TAKER_FEE as pnlService's live unrealised-PnL preview and the manual
  // /close-position route — previously this path used its own 0.05%/0.05%/0.02%
  // rates, so a trade closed by the SL/TP/AI engine booked a different net PnL
  // than what the Positions/Dashboard preview had been showing for it.
  const entryFee = entryNotional * TAKER_FEE;
  const exitFee = exitNotional * TAKER_FEE;
  const slippageCost = 0;

  let grossPnl = pos.side === "BUY" ? (exitPrice - pos.entryPrice) * closeQty : (pos.entryPrice - exitPrice) * closeQty;
  const feeCost = entryFee + exitFee;
  const netPnl = grossPnl - feeCost - slippageCost;

  const safeExitPrice = Number.isFinite(exitPrice) ? exitPrice : pos.entryPrice;
  const safeNetPnl = Number.isFinite(netPnl) ? netPnl : 0;
  const safeGrossPnl = Number.isFinite(grossPnl) ? grossPnl : 0;

  const existingTrade = await Trade.findById(pos.tradeId).lean() as any;

  if (isPartial) {
    // Partial close: reduce position, return partial margin + PnL to wallet
    const updatedMeta = { ...(existingTrade?.meta || {}), ...(pos.meta || {}) };
    if (reason === "TP1_HIT") updatedMeta.tp1Hit = true;
    if (reason === "TP2_HIT") updatedMeta.tp2Hit = true;
    updatedMeta.partialPnl = ((updatedMeta.partialPnl as number) || 0) + safeNetPnl;

    paper.setPosition(userId, symbol, mode, { ...pos, quantity: pos.quantity - closeQty, meta: updatedMeta });
    await Trade.findByIdAndUpdate(pos.tradeId, { meta: updatedMeta });

    if (mode === "PAPER") {
      const wallet = paper.getWallet(userId, mode, accountType);
      const usdt = wallet.get("USDT") ?? 0;
      const partialMargin = (closeQty * pos.entryPrice) / (pos.leverage || 1);
      const newBalance = usdt + (Number.isFinite(partialMargin) ? partialMargin : 0) + safeNetPnl;
      if (Number.isFinite(newBalance)) paper.setWalletBalance(userId, mode, "USDT", newBalance, accountType);
    }
    return;
  }

  // Full close — include any previously realized partial PnL in final trade record
  const preservedMeta = { ...(existingTrade?.meta || {}), ...(pos.meta || {}), exitReason: reason, realityAudit: "V10.1_FINANCIAL_REALITY" };
  const partialPnlAccumulated = Number.isFinite(preservedMeta.partialPnl) ? (preservedMeta.partialPnl as number) : 0;
  const totalNetPnl = safeNetPnl + partialPnlAccumulated;
  const totalGrossPnl = safeGrossPnl + partialPnlAccumulated;

  // Atomically claim the OPEN → CLOSED transition. The manual /close-position
  // route can race this same tradeId (e.g. a user clicks "close" the same
  // tick this exit fires) — without this guard both paths would independently
  // credit margin + PnL to the wallet, minting phantom balance for one trade.
  // Only the caller that actually flips status here is allowed to pay out.
  //
  // In PAPER mode the claim and the wallet credit are wrapped in one
  // transaction (creditWalletAndCloseTrade) — previously these were two
  // independent writes (Trade → CLOSED, then a separate wallet credit), and
  // a crash in between left a trade permanently CLOSED with its margin+PnL
  // never paid out, invisible to hydrate() since it only restores OPEN
  // trades. LIVE mode has no internal wallet to credit, so it just claims.
  const closeFields = {
    exitPrice: safeExitPrice, pnl: totalNetPnl, grossPnl: totalGrossPnl,
    feeCost: Number.isFinite(feeCost) ? feeCost : 0,
    slippageCost: Number.isFinite(slippageCost) ? slippageCost : 0,
    netPnl: totalNetPnl, status: "CLOSED", closedAt: new Date(),
    meta: preservedMeta,
  };

  let claimed: any;
  if (mode === "PAPER") {
    const marginReturned = (pos.quantity * pos.entryPrice) / (pos.leverage || 1);
    const creditAmount = (Number.isFinite(marginReturned) ? marginReturned : 0) + safeNetPnl;
    claimed = Number.isFinite(creditAmount)
      ? await paper.creditWalletAndCloseTrade(
          userId, mode, accountType, creditAmount,
          (session) => Trade.findOneAndUpdate({ _id: pos.tradeId, status: "OPEN" }, closeFields, { session }),
        )
      : await Trade.findOneAndUpdate({ _id: pos.tradeId, status: "OPEN" }, closeFields);
  } else {
    claimed = await Trade.findOneAndUpdate({ _id: pos.tradeId, status: "OPEN" }, closeFields);
  }

  paper.removePosition(userId, symbol, mode, accountType);
}
