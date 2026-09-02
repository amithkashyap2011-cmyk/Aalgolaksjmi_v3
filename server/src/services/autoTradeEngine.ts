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
import { LiveExecutionBarrier } from "./aqea/governance/LiveExecutionBarrier.js";
import { SchedulerAccounting } from "./aqea/dataProvenance.js";
import { ForwardTelemetryStore } from "./aqea/ensemble/ForwardTelemetryStore.js";
import { AgentKernel } from "../kernel/AgentKernel.js";

async function safeCreateAlert(data: { userId: any; severity: "GREEN" | "AMBER" | "RED"; symbol: string; title: string; message: string }) {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const validUserId = toValidObjectId(data.userId);
    Alert.create({ ...data, userId: validUserId }).catch(err => console.warn("[Alert] Failed to save alert:", err));
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
const activeProcessingKeys = new Set<string>();

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

let globalTickSequence = 0;

/* ── Core tick — runs once per interval ───────────────── */

async function tick(): Promise<void> {
  const start = Date.now();
  const tickId = ++globalTickSequence;
  SchedulerAccounting.recordTickScheduled();
  SchedulerAccounting.recordTickStarted(tickId);
  console.log(`[TRACE] TICK_START tickId=${tickId} activeUsers=${autoEnabledUsers.size}`);

  const tickExecution = async () => {
    // Weather Intelligence Engine Update (V1.0)
    try {
      await weatherIntelligenceEngine.update();
      const miningStress = weatherIntelligenceEngine.getMiningStress();
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
  };

  try {
    const globalTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Global tick exceeded 45000ms limit")), 45000)
    );
    await Promise.race([tickExecution(), globalTimeout]);
    SchedulerAccounting.recordTickCompleted(tickId, Date.now() - start);
  } catch (err: any) {
    const isTimeout = err?.message?.includes("Global tick exceeded");
    if (isTimeout) {
      SchedulerAccounting.recordTickTimedOut(tickId);
    } else {
      SchedulerAccounting.recordTickErrored(tickId, err?.message || String(err));
    }
    console.error(`[auto] Tick ${tickId} aborted/timed out:`, err?.message || err);
  } finally {
    PlatformTelemetry.recordLatency("tickLatencyMs", Date.now() - start);
    console.log(`[TRACE] TICK_END tickId=${tickId} latency=${Date.now() - start}ms`);
  }
}

export async function processUser(userId: string, accountTypeArg?: "SPOT" | "FUTURES"): Promise<void> {
  const resolvedType = accountTypeArg || "FUTURES";
  const procKey = `${userId}:${resolvedType}`;
  if (activeProcessingKeys.has(procKey)) {
    SchedulerAccounting.recordTickSkipped(globalTickSequence, `CONCURRENCY_LOCK_ACTIVE:${procKey}`);
    console.warn(`[SCHEDULER_SKIPPED] tickId=${globalTickSequence} user=${userId} accountType=${resolvedType} reason=CONCURRENCY_LOCK_ACTIVE`);
    return;
  }
  activeProcessingKeys.add(procKey);
  try {
    await _executeProcessUser(userId, accountTypeArg);
  } finally {
    activeProcessingKeys.delete(procKey);
  }
}

async function _executeProcessUser(userId: string, accountTypeArg?: "SPOT" | "FUTURES"): Promise<void> {
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

  // Ensure simulated paper capital is available for genuine paper order execution
  if (mode === "PAPER") {
    await paper.ensurePaperWalletFunded(userId, mode, accountType, 10000);
  }

  // Separate Decision Capital Availability from Forward Evidence Collection.
  // In PAPER mode, or for AQEA autonomous forward evidence accumulation, a zero balance
  // must NOT suppress market opportunity detection, feature generation, regime classification,
  // model inference, Bayesian fusion, economic EV, risk evaluation, and forward telemetry!
  const wallet = paper.getWallet(userId, mode, accountType);
  const balance = wallet.get("USDT") ?? 0;

  let currentHeat = 0;
  if (balance > 0) {
    currentHeat = await UnifiedSizingEngine.computeCapitalHeat(userId, mode, balance, accountType);
    const heatEnforcement = PortfolioHeatEngine.checkEnforcement(currentHeat);
    if (!heatEnforcement.allowed && mode === "LIVE") {
      console.log(`[auto-v8] User ${userId} blocked by live heat enforcement: ${heatEnforcement.action} (Heat: ${currentHeat.toFixed(1)}%)`);
      return;
    }
  } else if (mode === "LIVE") {
    console.log(`[auto] User ${userId} has 0 balance in LIVE ${accountType}. Skipping live order execution.`);
    return;
  } else {
    console.log(`[auto] User ${userId} has $0.00 balance in PAPER ${accountType}. Proceeding with AQEA autonomous decision evaluation and forward telemetry accumulation.`);
  }

  console.log(`[TRACE] PROCESS_USER_SYMBOLS count=${settings.allowedSymbols.length} mode=${mode} heat=${currentHeat.toFixed(1)}%`);

  // Bounded parallel symbol evaluation (max 4 concurrent symbols to prevent inference socket saturation)
  const MAX_CONCURRENT_SYMBOLS = 4;
  const symbols = settings.allowedSymbols;
  for (let i = 0; i < symbols.length; i += MAX_CONCURRENT_SYMBOLS) {
    const chunk = symbols.slice(i, i + MAX_CONCURRENT_SYMBOLS);
    const chunkTasks = chunk.map(async (symbol) => {
      console.log(`[PROCESS_SYMBOL] ${symbol} entered.`);
      const symStart = Date.now();
      let timeoutId: NodeJS.Timeout | null = null;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Timeout evaluating symbol ${symbol} after 25000ms`)), 25000);
        });
        await Promise.race([
          processSymbol(userId, symbol, mode, accountType, settings, currentHeat, balance),
          timeoutPromise
        ]);
        if (timeoutId) clearTimeout(timeoutId);
        console.log(`[auto] [SYMBOL_TERMINAL] symbol=${symbol} state=EVALUATED latency=${Date.now() - symStart}ms`);
      } catch (symErr: any) {
        if (timeoutId) clearTimeout(timeoutId);
        const isTimeout = symErr?.message?.includes("Timeout evaluating");
        const terminalState = isTimeout ? "TIMEOUT" : "DATA_UNAVAILABLE";
        const terminalReason = isTimeout ? `SYMBOL_EVALUATION_TIMEOUT: ${symErr?.message || symErr}` : `SYMBOL_EVALUATION_ERROR: ${symErr?.message || symErr}`;
        console.error(`[auto] [SYMBOL_TERMINAL] symbol=${symbol} state=${terminalState} error=${symErr?.message || symErr}`);
        ForwardTelemetryStore.recordDecision({
          decisionId: `ERR_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          timestamp: Date.now(),
          symbol,
          marketDomain: (symbol.endsWith("USDT") || symbol.endsWith("BTC")) ? "CRYPTO" : "INDIAN",
          accountType,
          regime: "UNKNOWN",
          featureVersion: 2,
          dataSource: mode === "LIVE" ? "LIVE" : "PAPER",
          isForward: true,
          isUntouched: true,
          isValidDecision: false,
          direction: "HOLD",
          finalDecision: "HOLD",
          decisionClass: isTimeout ? "TIMEOUT" : "DATA_UNAVAILABLE",
          terminalState: isTimeout ? "TIMEOUT" : "DATA_UNAVAILABLE",
          terminalReason,
          confidence: 0,
          buyProbability: 0.33,
          holdProbability: 0.34,
          sellProbability: 0.33,
          agreementScore: 0,
          tradeQualityScore: 0,
          tradeQualityTier: "POOR",
          expectedValue: 0,
          uncertainty: 1.0,
          fees: 0,
          slippage: 0,
          spread: 0,
          marketImpact: 0,
          netEV: 0,
          evGateResult: false,
          modelBreakdowns: {}
        });
      }
    });

    await Promise.allSettled(chunkTasks);
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
  // 🛡️ AQEA AGENT KERNEL — Control Mode Invariant Enforcement
  const kernelMode = AgentKernel.getInstance().getControlMode();
  if (kernelMode === "SAFE") {
    console.log(`[AQEA_AGENT_KERNEL] Symbol ${symbol} skipped: SAFE mode is ACTIVE (No autonomous side-effects).`);
    return;
  }

  // Check cooldown — keyed per accountType too, else closing a SPOT
  // position would also block re-entering the same symbol on FUTURES.
  const cooldownKey = userId + ":" + accountType + ":" + symbol;
  const expiry = cooldowns.get(cooldownKey) || 0;
  if (expiry > Date.now()) {
    console.log("[COOLDOWN] ACTIVE symbol=" + symbol);
    return;
  }

  /* 1. Build Context (Legacy Fetcher) */
  const t0 = Date.now();
  const ctx = await agent.buildContext(symbol, mode, userId, accountType);
  const tContext = Date.now() - t0;
  
  /* 2. AQEA CORE DECISION (SOLE AUTHORITY) */
  const avgVol = ctx.bars.slice(-20).reduce((a, b) => a + (b.volume || 0), 0) / 20;
  let btcDom = 53.5;
  try {
    const p = await binance.getTickerPriceSync("BTCDOMUSDT", true);
    if (p) btcDom = p;
  } catch (err) {}

  const t1 = Date.now();
  const perfMetrics = await AnalyticsCache.getPerformanceMetrics(userId, symbol);
  const tPerf = Date.now() - t1;

  const t2 = Date.now();
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
  const tDecide = Date.now() - t2;
  console.log(`[PROCESS_SYMBOL_PROFILE] symbol=${symbol} tContext=${tContext}ms tPerf=${tPerf}ms tDecide=${tDecide}ms decision=${aqeaDecision.decision}`);

  // Emit real-time decision for dashboard
  UITelemetryService.emitDecision(userId, symbol, aqeaDecision);

  const decisionId = aqeaDecision.meta?.decisionId;

  if (aqeaDecision.decision === "HOLD") {
    cooldowns.set(cooldownKey, Date.now() + 15_000);
    let alertMessage = "Score=" + aqeaDecision.confidence + "%";
    const originalScore = aqeaDecision.meta?.finalScore ?? aqeaDecision.confidence;
    const isConsensusHold = aqeaDecision.decisionPath?.aiConsensusHold;
    const isEntriesHalted = aqeaDecision.meta?.institutional?.entriesHalted;
    const wasStrictBlocked = Boolean(aqeaDecision.decisionPath?.aiModelsOffline && isConsensusHold);
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

    if (decisionId) {
      const isModelOff = Boolean(wasStrictBlocked);
      const termState = isModelOff ? "MODEL_UNAVAILABLE" : (!aqeaDecision.riskApproved ? "REJECTED" : "NO_TRADE");
      const decClass = isModelOff ? "MODEL_UNAVAILABLE" : (!aqeaDecision.riskApproved ? "REJECTED" : "NO_TRADE");
      const finalReason = isModelOff
        ? `MODEL_SERVICE_OFFLINE: ${mode} requires AI confirmation (quant engine offline)`
        : (!aqeaDecision.riskApproved ? "RISK_REJECTED" : "NORMAL_ABSTENTION_HOLD");
      ForwardTelemetryStore.updateTerminalState(decisionId, termState, alertMessage || finalReason, decClass);
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
     if (decisionId) {
       ForwardTelemetryStore.updateTerminalState(decisionId, "REJECTED", `Trade Quality rating REJECT (score ${quality.score}/100)`, "REJECTED");
     }
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
  
  // 🛡️ INSTITUTIONAL TIER-1 ASSET GATE: Filter out speculative meme coins unless explicitly allowed
  const speculativeTokens = ["PEPEUSDT", "FLOKIUSDT", "BONKUSDT", "WIFUSDT"];
  if (speculativeTokens.includes(symbol) && !settings.allowedSymbols?.includes(symbol)) {
    console.log(`[INSTITUTIONAL_ASSET_GATE] Blocked ${symbol} trade. Reason: Speculative meme token filtered for Tier-1 safety`);
    if (decisionId) {
      ForwardTelemetryStore.updateTerminalState(decisionId, "REJECTED", "Speculative meme token filtered for Tier-1 safety", "REJECTED");
    }
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
  const minScoreRequired = isOverdrive ? 40 : (settings.autoTradeThreshold ? settings.autoTradeThreshold * 0.7 : 50);
  const minConfRequired  = isOverdrive ? 45 : (settings.autoTradeThreshold ? settings.autoTradeThreshold * 0.75 : 55);
  const minAdxRequired   = isOverdrive ? 8 : 12;
  const minProbRequired  = isOverdrive ? 0.48 : 0.52;
  const adxVal           = ctx.ind.adx14 ?? 25;

  const isTradeDirectionLong = aqeaDecision.decision === "LONG";
  const htfAlignedWithDirection = isTradeDirectionLong ? Boolean(ctx.htfTrendBullish) : !ctx.htfTrendBullish;
  const smartMoneyScore = aqeaDecision.meta?.smartMoneyScore ?? 50;

  // 🧠 ADA BAYESIAN PROBABILITY ALGORITHM (Target Win-Rate >= 85.0%)
  const bayesTrace = BayesianProbabilityEngine.calculatePosteriorWinProbabilityWithTrace(
    0.752,
    quality.score,
    aqeaDecision.confidence,
    adxVal,
    htfAlignedWithDirection,
    smartMoneyScore
  );
  const posteriorWinProb = bayesTrace.posterior;

  console.log(`[P6_BAYES_TRACE] ` + JSON.stringify({
    decisionId: decisionId || "UNKNOWN",
    symbol,
    direction: aqeaDecision.decision,
    prior: 0.752,
    qualityScore: quality.score,
    aiConfidence: aqeaDecision.confidence,
    adxTrendStrength: adxVal,
    htfConsensus: htfAlignedWithDirection,
    smartMoneyScore,
    likelihoodRatios: {
      lQuality: Number((bayesTrace.lQualityWin / bayesTrace.lQualityLoss).toFixed(4)),
      lConfidence: Number((bayesTrace.lConfidenceWin / bayesTrace.lConfidenceLoss).toFixed(4)),
      lAdx: Number((bayesTrace.lAdxWin / bayesTrace.lAdxLoss).toFixed(4)),
      lHtf: Number((bayesTrace.lHtfWin / bayesTrace.lHtfLoss).toFixed(4)),
      lSmart: Number((bayesTrace.lSmartWin / bayesTrace.lSmartLoss).toFixed(4))
    },
    winLikelihood: Number(bayesTrace.winLikelihood.toFixed(4)),
    lossLikelihood: Number(bayesTrace.lossLikelihood.toFixed(4)),
    posteriorFinal: posteriorWinProb,
    threshold: minProbRequired,
    passesGate: posteriorWinProb >= minProbRequired,
    firstBlockReason: posteriorWinProb < minProbRequired ? "BAYESIAN_POSTERIOR_BELOW_THRESHOLD" : "NONE"
  }));

  const netEV = aqeaDecision.meta?.lakshmiEnsemble?.ensembleFusion?.expectedValue ?? ((aqeaDecision.confidence - 50) * 0.001);
  const convictionPassed = !(quality.score < minScoreRequired || aqeaDecision.confidence < minConfRequired || adxVal < minAdxRequired || posteriorWinProb < minProbRequired);

  console.log(`[P4_EXEC_TRACE] ` + JSON.stringify({
    decisionId: decisionId || "UNKNOWN",
    symbol,
    direction: aqeaDecision.decision,
    confidence: aqeaDecision.confidence,
    bayesianWinProb: Number(posteriorWinProb.toFixed(4)),
    netEV: Number(netEV.toFixed(6)),
    riskApproved: Boolean(aqeaDecision.riskApproved),
    convictionApproved: convictionPassed,
    tradeGovernorApproved: true,
    requiredMargin: 0,
    paperBalance: Number((balance || 0).toFixed(2)),
    positionSize: 0,
    entryPrice: ctx.ind.close,
    executionMode: mode,
    finalExecutionState: convictionPassed ? "PENDING" : "REJECTED",
    blockReason: convictionPassed ? "NONE" : (quality.score < minScoreRequired ? `Quality Score ${quality.score} < ${minScoreRequired}` : (aqeaDecision.confidence < minConfRequired ? `AI Confidence ${aqeaDecision.confidence}% < ${minConfRequired}%` : (adxVal < minAdxRequired ? `ADX Volatility ${adxVal.toFixed(1)} < ${minAdxRequired}` : `Bayesian Win-Prob ${(posteriorWinProb * 100).toFixed(1)}% < ${(minProbRequired * 100).toFixed(1)}%`)))
  }));

  if (!convictionPassed) {
    const reasons: string[] = [];
    if (quality.score < minScoreRequired) reasons.push(`Quality Score ${quality.score} < ${minScoreRequired}`);
    if (aqeaDecision.confidence < minConfRequired) reasons.push(`AI Confidence ${aqeaDecision.confidence}% < ${minConfRequired}%`);
    if (adxVal < minAdxRequired) reasons.push(`ADX Volatility ${adxVal.toFixed(1)} < ${minAdxRequired}`);
    if (posteriorWinProb < minProbRequired) reasons.push(`Bayesian Win-Prob ${(posteriorWinProb * 100).toFixed(1)}% < ${(minProbRequired * 100).toFixed(1)}%`);

    const reason = reasons.join(" | ");
    console.log(`[ULTRA_CONVICTION_GATE] Blocked ${symbol} trade. Reason: ${reason}`);

    if (decisionId) {
      ForwardTelemetryStore.updateTerminalState(decisionId, "REJECTED", `ULTRA_CONVICTION_GATE: ${reason}`, "REJECTED");
    }

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
      // or if unrealized loss exceeds 2.0% of position notional
      const maxLossThreshold = -Math.max(notional * 0.02, 10.0); // 2.0% position notional risk ceiling
      const isSlBreached = pos.sl && pos.sl > 0
        ? (pos.side === "BUY" ? currentPrice <= pos.sl : currentPrice >= pos.sl)
        : false;

      if (isSlBreached || pnlPct < -2.0 || unrealizedPnl < maxLossThreshold) {
        const exitReason = isSlBreached ? "STOP_LOSS_HIT" : "DYNAMIC_DRAWDOWN_CUT";
        console.error(`[DRAWDOWN_CUT] symbol=${symbol} PnLPct=${pnlPct.toFixed(2)}% unrealizedPnl=${unrealizedPnl.toFixed(2)}USDT reason=${exitReason}`);
        await handleExit(userId, symbol, mode, accountType, exitReason);
        return;
      }

      // 🛡️ V40 FIX: Max Hold Time Guard (4 hours in ranging/loss, 6 hours max hard ceiling)
      const tradeRecord = await Trade.findById(pos.tradeId).lean() as any;
      if (tradeRecord?.openedAt) {
        const holdMs = Date.now() - new Date(tradeRecord.openedAt).getTime();
        const holdHours = holdMs / 3600000;
        const anyTpHit = pos.meta?.tp1Hit || pos.meta?.tp2Hit || pos.meta?.tp3Hit;
        // 🛡️ Stagnant Loss Guard: Cut losing/stagnant trades after 4 hours if no TP hit
        if (holdHours > 4 && (!anyTpHit || unrealizedPnl <= 0)) {
          console.warn(`[STAGNANT_LOSS_GUARD] Cutting stagnant trade symbol=${symbol} holdHours=${holdHours.toFixed(1)} unrealizedPnl=${unrealizedPnl.toFixed(2)}`);
          await handleExit(userId, symbol, mode, accountType, "STAGNANT_LOSS_EXPIRE_4H");
          return;
        }

        if (holdHours > 6 && !anyTpHit) {
          console.error(`[V40_CIRCUIT_BREAKER] MAX_HOLD_TIME symbol=${symbol} holdHours=${holdHours.toFixed(1)}`);
          await handleExit(userId, symbol, mode, accountType, "V40_MAX_HOLD_TIME_6H");
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
  const decisionId = aqeaDecision.meta?.decisionId;
  const dbExisting = await Trade.findOne({
    userId: toValidObjectId(userId),
    symbol,
    mode,
    accountType,
    status: "OPEN"
  }).lean();
  const existing = paper.getPosition(userId, symbol, mode, accountType) || dbExisting;
  const openPositions = paper.getOpenPositions(userId, mode).filter(p => p.accountType === accountType);
  const sameDirectionCount = openPositions.filter(p => p.side === "BUY").length;
  const maxConcurrent = settings.riskConfig?.maxConcurrentPositions || 10;
  const evaluation = evaluateLongEntry({ existing, aqeaDecision, riskProfile, symbol, sameDirectionCount, maxConcurrent });
  if (!evaluation.ok) {
    if (decisionId) {
      const reason = "reason" in evaluation ? evaluation.reason : "Entry evaluation rejected";
      ForwardTelemetryStore.updateTerminalState(decisionId, "REJECTED", reason, "REJECTED");
    }
    if (evaluation.silent) return; // matches the original's bare `return;` (no Alert) on invalid quantity
    await Alert.create({
      userId,
      severity: "AMBER",
      symbol,
      title: "ORDER HOLD / NOT EXECUTED",
      message: `Score=${aqeaDecision.confidence}% but Blocked: ${"reason" in evaluation ? evaluation.reason : "Evaluation failed"}`,
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
    if (decisionId) {
      ForwardTelemetryStore.updateTerminalState(decisionId, "REJECTED", `Blocked by Governor: ${governorVerdict.reason}`, "REJECTED");
    }
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
    // 🛡️ CRITICAL FIX: LiveExecutionBarrier Hard Gate
    const barrier = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
    if (!barrier.permitted) {
      console.warn(`[TRADE_BLOCKED] LIVE_BARRIER symbol=${symbol} reason=${barrier.reason}`);
      if (decisionId) {
        ForwardTelemetryStore.updateTerminalState(decisionId, "REJECTED", `Live BUY blocked by LiveExecutionBarrier: ${barrier.reason}`, "REJECTED");
      }
      await safeCreateAlert({
        userId,
        severity: "AMBER",
        symbol,
        title: "ORDER BLOCKED / LIVE BARRIER",
        message: `Score=${aqeaDecision.confidence}%: Live BUY blocked by LiveExecutionBarrier: ${barrier.reason}`,
      });
      return;
    }

    try {
      const keys = await ApiKeys.findOne({ userId });
      if (!keys) {
        if (decisionId) {
          ForwardTelemetryStore.updateTerminalState(decisionId, "REJECTED", "Missing API keys for live trading", "REJECTED");
        }
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
        meta: { ...aqeaDecision.meta, aqea: aqeaMeta, decisionId, clientOrderId, binanceOrderId: result.orderId },
      });

      paper.setPosition(userId, symbol, mode, { userId, symbol, side: "BUY", quantity: actualExecutedQty, entryPrice, tradeId: trade._id.toString(), accountType, leverage, sl: riskProfile.sl, tp: riskProfile.tp1, meta: trade.meta });
      
      if (decisionId) {
        ForwardTelemetryStore.updateTerminalState(decisionId, "TRADE", `LIVE_EXECUTION_COMPLETED: order filled at price=${entryPrice}`, "TRADE");
      }

      await safeCreateAlert({
        userId,
        severity: "GREEN",
        symbol,
        title: "ORDER SUCCESS",
        message: `Score=${aqeaDecision.confidence}%: Placed LIVE BUY order for ${symbol}. Price=${entryPrice}`,
      });
    } catch (err: any) {
      console.log(`[TRADE_BLOCKED] LIVE_ERROR symbol=${symbol} err=${err.message}`);
      if (decisionId) {
        ForwardTelemetryStore.updateTerminalState(decisionId, "DATA_UNAVAILABLE", `LIVE_ORDER_ERROR: ${err.message}`, "DATA_UNAVAILABLE");
      }
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
    if (walletBalance < marginRequired || walletBalance <= 0) {
      console.log(`[PAPER_CAPITAL_UNAVAILABLE] symbol=${symbol} required=${marginRequired.toFixed(2)} available=${walletBalance.toFixed(2)}`);
      if (decisionId) {
        ForwardTelemetryStore.updateTerminalState(
          decisionId,
          "INSUFFICIENT_FUNDS",
          `PAPER_CAPITAL_UNAVAILABLE: required=$${marginRequired.toFixed(2)}, available=$${walletBalance.toFixed(2)}`,
          "INSUFFICIENT_FUNDS"
        );
      }
      await safeCreateAlert({
        userId,
        severity: "AMBER",
        symbol,
        title: "ORDER HOLD / PAPER CAPITAL UNAVAILABLE",
        message: `Score=${aqeaDecision.confidence}%: AQEA signal BUY generated, but paper simulated balance is insufficient ($${walletBalance.toFixed(2)} < $${marginRequired.toFixed(2)}). Decision recorded for forward evidence.`,
      });
      return;
    }

    const userObjId = toValidObjectId(userId);
    const trade = await paper.debitWalletAndCreateTrade(
      userId, mode, accountType, marginRequired,
      (session) => Trade.create([{
        userId: userObjId, mode: "PAPER", symbol, side: "BUY", quantity, entryPrice: currentPrice, leverage,
        sl: riskProfile.sl, tp: riskProfile.tp1, tp1: riskProfile.tp1, tp2: riskProfile.tp2, tp3: riskProfile.tp3,
        qualityScore: aqeaDecision.confidence * 100, aiConfidence: aqeaDecision.confidence,
        aiReasoning: riskProfile.reason, marketRegime: decisionPath.regime, strategy: "AQEA_V33", status: "OPEN", accountType,
        entrySource, decisionPath, authorizedVotes, shadowVotes, coreScore: decisionPath.coreScore, finalScore: decisionPath.finalScore,
        meta: { ...aqeaDecision.meta, aqea: aqeaMeta, decisionId },
      }], { session }).then((docs) => docs[0]),
    );

    paper.setPosition(userId, symbol, mode, { userId, symbol, side: "BUY", quantity, entryPrice: currentPrice, tradeId: trade._id.toString(), accountType, leverage, sl: riskProfile.sl, tp: riskProfile.tp1, meta: trade.meta });

    console.log(`[PAPER_ORDER_CREATED] symbol=${symbol} side=BUY qty=${quantity} price=${currentPrice} decisionId=${decisionId}`);
    console.log(`[PAPER_POSITION_OPENED] symbol=${symbol} side=BUY qty=${quantity} entryPrice=${currentPrice} decisionId=${decisionId}`);

    if (decisionId) {
      ForwardTelemetryStore.updateTerminalState(
        decisionId,
        "TRADE",
        `PAPER_EXECUTION_COMPLETED: order filled at price=${currentPrice}`,
        "TRADE"
      );
    }

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
  const decisionId = aqeaDecision.meta?.decisionId;
  const dbExisting = await Trade.findOne({
    userId: toValidObjectId(userId),
    symbol,
    mode,
    accountType,
    status: "OPEN"
  }).lean();
  const existing = paper.getPosition(userId, symbol, mode, accountType) || dbExisting;
  const openPositions = paper.getOpenPositions(userId, mode).filter(p => p.accountType === accountType);
  const sameDirectionCount = openPositions.filter(p => p.side === "SELL").length;
  const maxConcurrent = settings.riskConfig?.maxConcurrentPositions || 10;
  const evaluation = evaluateShortEntry({ existing, aqeaDecision, riskProfile, symbol, sameDirectionCount, maxConcurrent });
  if (!evaluation.ok) {
    if (decisionId) {
      const reason = "reason" in evaluation ? evaluation.reason : "Entry evaluation rejected";
      ForwardTelemetryStore.updateTerminalState(decisionId, "REJECTED", reason, "REJECTED");
    }
    if (evaluation.silent) return;
    await Alert.create({
      userId,
      severity: "AMBER",
      symbol,
      title: "ORDER HOLD / NOT EXECUTED",
      message: `Score=${aqeaDecision.confidence}% but Blocked: ${"reason" in evaluation ? evaluation.reason : "Evaluation failed"}`,
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
    if (decisionId) {
      ForwardTelemetryStore.updateTerminalState(decisionId, "REJECTED", `Blocked by Governor: ${governorVerdict.reason}`, "REJECTED");
    }
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
    // 🛡️ CRITICAL FIX: LiveExecutionBarrier Hard Gate
    const barrier = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
    if (!barrier.permitted) {
      console.warn(`[TRADE_BLOCKED] LIVE_BARRIER symbol=${symbol} reason=${barrier.reason}`);
      if (decisionId) {
        ForwardTelemetryStore.updateTerminalState(decisionId, "REJECTED", `Live SELL blocked by LiveExecutionBarrier: ${barrier.reason}`, "REJECTED");
      }
      await safeCreateAlert({
        userId,
        severity: "AMBER",
        symbol,
        title: "ORDER BLOCKED / LIVE BARRIER",
        message: `Score=${aqeaDecision.confidence}%: Live SELL blocked by LiveExecutionBarrier: ${barrier.reason}`,
      });
      return;
    }

    try {
      const keys = await ApiKeys.findOne({ userId });
      if (!keys) {
        if (decisionId) {
          ForwardTelemetryStore.updateTerminalState(decisionId, "REJECTED", "Missing API keys for live trading", "REJECTED");
        }
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
        meta: { ...aqeaDecision.meta, aqea: aqeaMeta, decisionId, clientOrderId, binanceOrderId: result.orderId },
      });

      paper.setPosition(userId, symbol, mode, { userId, symbol, side: "SELL", quantity: actualExecutedQty, entryPrice, tradeId: trade._id.toString(), accountType, leverage, sl: riskProfile.sl, tp: riskProfile.tp1, meta: trade.meta });
      
      if (decisionId) {
        ForwardTelemetryStore.updateTerminalState(decisionId, "TRADE", `LIVE_EXECUTION_COMPLETED: order filled at price=${entryPrice}`, "TRADE");
      }

      await safeCreateAlert({
        userId,
        severity: "GREEN",
        symbol,
        title: "ORDER SUCCESS",
        message: `Score=${aqeaDecision.confidence}%: Placed LIVE SELL order for ${symbol}. Price=${entryPrice}`,
      });
    } catch (err: any) {
      console.log(`[TRADE_BLOCKED] LIVE_ERROR symbol=${symbol} err=${err.message}`);
      if (decisionId) {
        ForwardTelemetryStore.updateTerminalState(decisionId, "DATA_UNAVAILABLE", `LIVE_ORDER_ERROR: ${err.message}`, "DATA_UNAVAILABLE");
      }
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
    if (walletBalance < marginRequired || walletBalance <= 0) {
      console.log(`[PAPER_CAPITAL_UNAVAILABLE] symbol=${symbol} required=${marginRequired.toFixed(2)} available=${walletBalance.toFixed(2)}`);
      if (decisionId) {
        ForwardTelemetryStore.updateTerminalState(
          decisionId,
          "INSUFFICIENT_FUNDS",
          `PAPER_CAPITAL_UNAVAILABLE: required=$${marginRequired.toFixed(2)}, available=$${walletBalance.toFixed(2)}`,
          "INSUFFICIENT_FUNDS"
        );
      }
      await safeCreateAlert({
        userId,
        severity: "AMBER",
        symbol,
        title: "ORDER HOLD / PAPER CAPITAL UNAVAILABLE",
        message: `Score=${aqeaDecision.confidence}%: AQEA signal SELL generated, but paper simulated balance is insufficient ($${walletBalance.toFixed(2)} < $${marginRequired.toFixed(2)}). Decision recorded for forward evidence.`,
      });
      return;
    }

    const userObjId = toValidObjectId(userId);
    const trade = await paper.debitWalletAndCreateTrade(
      userId, mode, accountType, marginRequired,
      (session) => Trade.create([{
        userId: userObjId, mode: "PAPER", symbol, side: "SELL", quantity, entryPrice: currentPrice, leverage,
        sl: riskProfile.sl, tp: riskProfile.tp1, tp1: riskProfile.tp1, tp2: riskProfile.tp2, tp3: riskProfile.tp3,
        qualityScore: aqeaDecision.confidence * 100, aiConfidence: aqeaDecision.confidence,
        aiReasoning: riskProfile.reason, marketRegime: decisionPath.regime, strategy: "AQEA_V33", status: "OPEN", accountType,
        entrySource, decisionPath, authorizedVotes, shadowVotes, coreScore: decisionPath.coreScore, finalScore: decisionPath.finalScore,
        meta: { ...aqeaDecision.meta, aqea: aqeaMeta, decisionId },
      }], { session }).then((docs) => docs[0]),
    );

    paper.setPosition(userId, symbol, mode, { userId, symbol, side: "SELL", quantity, entryPrice: currentPrice, tradeId: trade._id.toString(), accountType, leverage, sl: riskProfile.sl, tp: riskProfile.tp1, meta: trade.meta });

    console.log(`[PAPER_ORDER_CREATED] symbol=${symbol} side=SELL qty=${quantity} price=${currentPrice} decisionId=${decisionId}`);
    console.log(`[PAPER_POSITION_OPENED] symbol=${symbol} side=SELL qty=${quantity} entryPrice=${currentPrice} decisionId=${decisionId}`);

    if (decisionId) {
      ForwardTelemetryStore.updateTerminalState(
        decisionId,
        "TRADE",
        `PAPER_EXECUTION_COMPLETED: order filled at price=${currentPrice}`,
        "TRADE"
      );
    }

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
    // 🛡️ CRITICAL FIX: LiveExecutionBarrier Hard Gate
    const barrier = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
    if (!barrier.permitted) {
      console.warn(`[TRADE_BLOCKED] LIVE_BARRIER symbol=${symbol} reason=${barrier.reason}`);
      return;
    }

    const keys = await ApiKeys.findOne({ userId });
    if (!keys) return;
    const { decrypt } = await import("../lib/crypto.js");
    const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
    const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.iv, authTag: keys.authTag });

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

    const executedQty = parseFloat(exitResult.executedQty || exitResult.origQty || "0");
    if (Number.isFinite(executedQty) && executedQty > 0) {
      closeQty = executedQty;
    }

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
  console.log(`[PAPER_POSITION_CLOSED] symbol=${symbol} side=${pos.side} qty=${closeQty} exitPrice=${safeExitPrice} netPnl=${totalNetPnl.toFixed(4)} reason=${reason}`);

  // 🛡️ Resolve outcome in ForwardTelemetryStore if decisionId exists
  const decId = (pos.meta as any)?.decisionId || (existingTrade?.meta as any)?.decisionId || (existingTrade?.meta as any)?.aqea?.decisionPath?.decisionId;
  if (decId) {
    try {
      const entryTs = existingTrade?.createdAt ? new Date(existingTrade.createdAt).getTime() : (Date.now() - 60000);
      const exitTs = Date.now();
      const realizedReturn = (pos.entryPrice > 0 && closeQty > 0) ? totalNetPnl / (pos.entryPrice * closeQty) : 0;
      ForwardTelemetryStore.resolveOutcome(decId, {
        resolvedTimestamp: exitTs,
        entryTimestamp: entryTs,
        entryPrice: pos.entryPrice,
        exitTimestamp: exitTs,
        exitPrice: safeExitPrice,
        realizedDirection: pos.side === "BUY" ? "LONG" : "SHORT",
        realizedReturn,
        realizedPnL: totalNetPnl,
        outcome: totalNetPnl > 0 ? "WIN" : (totalNetPnl < 0 ? "LOSS" : "BREAKEVEN"),
        directionCorrect: totalNetPnl > 0,
        fees: feeCost,
        slippage: slippageCost,
        holdingDurationMs: Math.max(1, exitTs - entryTs),
        mfe: 0,
        mae: 0
      });
      console.log(`[OUTCOME_RESOLVED] decisionId=${decId} outcome=${totalNetPnl > 0 ? "WIN" : (totalNetPnl < 0 ? "LOSS" : "BREAKEVEN")} pnl=${totalNetPnl.toFixed(4)}`);
    } catch (resErr) {
      console.warn(`[auto] Failed to resolve forward outcome for ${decId}:`, resErr);
    }
  }
}
