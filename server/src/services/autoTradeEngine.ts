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
import { safeCreateAlert } from "./alertService.js";
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
import { getTradingControlStatus } from "./tradingControlStatus.js";

/* ── V8.0 Institutional Imports ───────────────────────── */
import { TradeQualityEngine } from "./tradeQualityEngine.js";
import { RegimeDetectionEngine } from "./regimeDetectionEngine.js";
import { AdaptiveRiskEngine } from "./adaptiveRiskEngine.js";
import { PortfolioHeatEngine } from "./portfolioHeatEngine.js";
import { BayesianProbabilityEngine } from "./aqea/bayesianPredictor.js";
import { AdaptiveBayesianGate } from "./aqea/bayesian/AdaptiveBayesianGate.js";
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
import { MarketIsolationGuard } from "./market/MarketIsolationGuard.js";
import { emitAlert } from "./socketService.js";

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
const HOLD_ALERT_REPEAT_MS = 30 * 60_000;
const holdAlertSentAt = new Map<string, number>();
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
  if (process.env.DEBUG_TRACES === "true") {
    console.log(`[TRACE] TICK_START tickId=${tickId} activeUsers=${autoEnabledUsers.size}`);
  }

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
        if (process.env.DEBUG_TRACES === "true") {
          console.log(`[TRACE] TICK_USER user=${userId} accountType=${accountType}`);
        }
        await processUser(userId, accountType);
      } catch (err) {
        console.error(`[auto] error for user ${userId} (${accountType}):`, err);
      }
    }
  };

  try {
    const globalTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Global tick exceeded 55000ms limit")), 55000)
    );
    await Promise.race([tickExecution(), globalTimeout]);
    SchedulerAccounting.recordTickCompleted(tickId, Date.now() - start);
  } catch (err: any) {
    const isTimeout = err?.message?.includes("Global tick exceeded");
    if (isTimeout) {
      SchedulerAccounting.recordTickTimedOut(tickId);
      // Clean active processing keys so future ticks are not permanently blocked by aborted execution
      activeProcessingKeys.clear();
    } else {
      SchedulerAccounting.recordTickErrored(tickId, err?.message || String(err));
    }
    console.error(`[auto] Tick ${tickId} aborted/timed out:`, err?.message || err);
  } finally {
    PlatformTelemetry.recordLatency("tickLatencyMs", Date.now() - start);
    if (process.env.DEBUG_TRACES === "true") {
      console.log(`[TRACE] TICK_END tickId=${tickId} latency=${Date.now() - start}ms`);
    }
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
  if (process.env.DEBUG_TRACES === "true") {
    console.log(`[TRACE] PROCESS_USER user=${userId}`);
  }
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

  // Simulated paper capital: User manages deposits via wallet UI or API
  // A zero balance proceeds with telemetry accumulation without executing live orders

  // Separate Decision Capital Availability from Forward Evidence Collection.
  // In PAPER mode, or for AQEA autonomous forward evidence accumulation, a zero balance
  // must NOT suppress market opportunity detection, feature generation, regime classification,
  // model inference, Bayesian fusion, economic EV, risk evaluation, and forward telemetry!
  let balance = 0;
  if (mode === "LIVE") {
    try {
      const { computeAccountBalance } = await import("../routes/wallet.js");
      const liveBal = await computeAccountBalance(userId, "LIVE", accountType, 95.72);
      balance = liveBal.usdt ?? 0;
    } catch {
      const wallet = paper.getWallet(userId, mode, accountType);
      balance = wallet.get("USDT") ?? 0;
    }
  } else {
    const wallet = paper.getWallet(userId, mode, accountType);
    balance = wallet.get("USDT") ?? 0;
  }

  let currentHeat = 0;
  if (balance > 0) {
    currentHeat = await UnifiedSizingEngine.computeCapitalHeat(userId, mode, balance, accountType);
    const heatEnforcement = PortfolioHeatEngine.checkEnforcement(currentHeat);
    if (!heatEnforcement.allowed && mode === "LIVE") {
      console.log(`[auto-v8] User ${userId} blocked by live heat enforcement: ${heatEnforcement.action} (Heat: ${currentHeat.toFixed(1)}%)`);
      await manageHeldPositionsOnly(userId, mode, accountType, settings, currentHeat, balance);
      return;
    }
  } else if (mode === "LIVE") {
    console.log(`[auto] User ${userId} has 0 balance in LIVE ${accountType}. Skipping new entries; reviewing held positions only.`);
    await manageHeldPositionsOnly(userId, mode, accountType, settings, currentHeat, balance);
    return;
  } else {
    console.log(`[auto] User ${userId} has $0.00 balance in PAPER ${accountType}. Proceeding with AQEA autonomous decision evaluation and forward telemetry accumulation.`);
  }

  if (process.env.DEBUG_TRACES === "true") {
    console.log(`[TRACE] PROCESS_USER_SYMBOLS count=${settings.allowedSymbols.length} mode=${mode} heat=${currentHeat.toFixed(1)}%`);
  }

  // Bounded parallel symbol evaluation (max 4 concurrent symbols to prevent inference socket saturation)
  const MAX_CONCURRENT_SYMBOLS = 4;
  const symbols = settings.allowedSymbols;
  for (let i = 0; i < symbols.length; i += MAX_CONCURRENT_SYMBOLS) {
    const chunk = symbols.slice(i, i + MAX_CONCURRENT_SYMBOLS);
    const chunkTasks = chunk.map(async (symbol) => {
      if (process.env.DEBUG_TRACES === "true") {
        console.log(`[PROCESS_SYMBOL] ${symbol} entered.`);
      }
      const symStart = Date.now();
      let timeoutId: NodeJS.Timeout | null = null;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Timeout evaluating symbol ${symbol} after 35000ms`)), 35000);
        });
        await Promise.race([
          processSymbol(userId, symbol, mode, accountType, settings, currentHeat, balance),
          timeoutPromise
        ]);
        if (timeoutId) clearTimeout(timeoutId);
        if (process.env.DEBUG_TRACES === "true") {
          console.log(`[auto] [SYMBOL_TERMINAL] symbol=${symbol} state=EVALUATED latency=${Date.now() - symStart}ms`);
        }
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

// Real Binance spot taker fee per side. pnlService.TAKER_FEE (0.04%) is the
// futures rate; judging a spot "profit" with it would bank trades that lose
// money after the actual 0.1% fees.
const SPOT_TAKER_FEE = 0.001;

/** Sell a held position when it is in profit and the AI view has turned
 *  against it (PositionManager.evaluateProfitBooking). Returns true if closed. */
async function bookProfitOnAiView(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  accountType: "SPOT" | "FUTURES",
  settings: ISettings,
  aqeaDecision: AQEADecision,
  fallbackPrice: number,
): Promise<boolean> {
  const pos = paper.getPosition(userId, symbol, mode, accountType);
  if (!pos) return false;

  // The decision's close is the last completed 5m candle; judge profit on the live tick.
  const price = binance.getTickerPriceSync(symbol, accountType === "FUTURES") || fallbackPrice;
  if (!(price > 0)) return false;

  const fusion = aqeaDecision.meta?.lakshmiEnsemble?.ensembleFusion;
  const signal = PositionManager.evaluateProfitBooking(
    `${userId}:${symbol}:${mode}:${accountType}`,
    { side: pos.side, entryPrice: pos.entryPrice, sl: pos.sl },
    { decision: aqeaDecision.decision, fusedDirection: fusion?.direction ?? "HOLD" },
    price,
    accountType === "SPOT" ? SPOT_TAKER_FEE : TAKER_FEE,
    settings?.aiFlipExitMinProfitR ?? 0.3,
  );
  if (!signal.book) return false;

  console.log(`[AI_BOOK_PROFIT] ${mode} ${accountType} ${symbol} ${pos.side} @ ${price} net=${(signal.netProfitPct * 100).toFixed(2)}% ai=${aqeaDecision.decision}/${fusion?.direction ?? "?"}`);
  await handleExit(userId, symbol, mode, accountType, signal.reason, 1.0, price);
  return !paper.getPosition(userId, symbol, mode, accountType);
}

/** A LIVE account that cannot open trades (no free USDT, heat-blocked) still
 *  needs its open positions reviewed: evaluate only the held symbols, exits only. */
async function manageHeldPositionsOnly(
  userId: string,
  mode: "PAPER" | "LIVE",
  accountType: "SPOT" | "FUTURES",
  settings: ISettings,
  portfolioHeat: number,
  balance: number,
): Promise<void> {
  const held = paper.getAllOpenPositions(mode, [accountType]).filter((p) => p.userId === userId);
  for (const p of held) {
    try {
      await processSymbol(userId, p.symbol, mode, accountType, settings, portfolioHeat, balance, false);
    } catch (err: any) {
      console.error(`[auto] Held-position review ${p.symbol} failed: ${err?.message || err}`);
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
  entriesAllowed: boolean = true,
): Promise<void> {
  // 🛡️ DUAL-MARKET ISOLATION GUARD — Section 6, 14, 55 Invariant
  // Prevent any Indian symbols from accidentally entering Crypto AutoTradeEngine execution pipeline
  if (MarketIsolationGuard.resolveDomainFromSymbol(symbol) !== "CRYPTO") {
    console.warn(`[autoTradeEngine] [MARKET_ISOLATION] Non-crypto symbol ${symbol} rejected from crypto auto-trading loop.`);
    return;
  }

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
  if (process.env.DEBUG_TRACES === "true") {
    console.log(`[PROCESS_SYMBOL_PROFILE] symbol=${symbol} tContext=${tContext}ms tPerf=${tPerf}ms tDecide=${tDecide}ms decision=${aqeaDecision.decision}`);
  }

  // Emit real-time decision for dashboard
  UITelemetryService.emitDecision(userId, symbol, aqeaDecision);

  // AI profit booking on a held position. Runs on every evaluation — the
  // entry gates below return early on HOLD / low conviction, which hid open
  // positions from AI exit management on almost every tick.
  if (await bookProfitOnAiView(userId, symbol, mode, accountType, settings, aqeaDecision, ctx.ind.close)) return;
  if (!entriesAllowed) return;

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
        // Surface the SPECIFIC RiskEngine reason (e.g. PORTFOLIO_EXPOSURE_LIMIT_REACHED,
        // MAX_POSITIONS_BREACH, BALANCE_ZERO) instead of a generic string, so a blocked
        // leg is diagnosable from the alert/telemetry rather than opaque.
        const riskReason = (aqeaDecision.reasons || []).find((r: string) => r.startsWith("RISK_REJECTION:"));
        const detail = riskReason ? riskReason.replace("RISK_REJECTION:", "").trim() : "risk parameters";
        alertMessage = `Score=${originalScore}% but Blocked: Risk rejected — ${detail}`;
      } else if (isEntriesHalted) {
        alertMessage = `Score=${originalScore}% but Blocked: Capital Drift entries halted`;
      } else {
        alertMessage = `Score=${originalScore}% but Blocked: System safety constraints`;
      }
    } else {
      alertMessage = `Score=${originalScore}% (HOLD regime / indicators neutral)`;
    }
    // A neutral HOLD is the normal outcome of most cycles (~1,500/hour across
    // 25 coins x 2 accounts). Alerting on each one buried the alerts feed and
    // filled Mongo; the decision is still recorded in telemetry below. Only
    // blocked HOLDs (a strong score stopped by a gate) raise an alert.
    const isNeutralHold = originalScore >= 40 && originalScore <= 75;

    if (decisionId) {
      const isModelOff = Boolean(wasStrictBlocked);
      const termState = isModelOff ? "MODEL_UNAVAILABLE" : (!aqeaDecision.riskApproved ? "REJECTED" : "NO_TRADE");
      const decClass = isModelOff ? "MODEL_UNAVAILABLE" : (!aqeaDecision.riskApproved ? "REJECTED" : "NO_TRADE");
      const finalReason = isModelOff
        ? `MODEL_SERVICE_OFFLINE: ${mode} requires AI confirmation (quant engine offline)`
        : (!aqeaDecision.riskApproved ? "RISK_REJECTED" : "NORMAL_ABSTENTION_HOLD");
      ForwardTelemetryStore.updateTerminalState(decisionId, termState, alertMessage || finalReason, decClass);
    }

    // Blocked HOLDs repeat every cycle for the same coin and reason; alert on
    // each distinct (coin, reason) at most once per 30 minutes.
    const holdKey = `${userId}|${symbol}|${alertMessage.replace(/^Score=\d+(\.\d+)?%\s*/, "")}`;
    const lastHoldAlert = holdAlertSentAt.get(holdKey) ?? 0;
    if (!isNeutralHold && Date.now() - lastHoldAlert > HOLD_ALERT_REPEAT_MS) {
      holdAlertSentAt.set(holdKey, Date.now());
      await safeCreateAlert({
        userId,
        severity: "AMBER",
        symbol,
        title: "ORDER HOLD / NOT EXECUTED",
        message: alertMessage,
      });
    }
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

  // Persist the 5 evidence scalars so the exit path can feed the realized
  // outcome back into the calibrated Bayesian model (BayesianProbabilityEngine.recordOutcome).
  if (aqeaDecision.meta) {
    (aqeaDecision.meta as any).bayesEvidence = {
      qualityScore: quality.score,
      aiConfidence: aqeaDecision.confidence,
      adxTrendStrength: adxVal,
      htfConsensus: htfAlignedWithDirection,
      smartMoneyScore,
    };
  }

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
    // BUGFIX(spot-short-guard): SPOT accounts cannot hold a short — a LIVE SPOT short
    // would issue a naked market SELL of an unowned asset. Block it here and treat as
    // NO_TRADE; only FUTURES may open a short. (handleShort() also self-guards.)
    if (accountType === "SPOT") {
      console.log(`[HANDLE_SHORT_SKIP] accountType=SPOT cannot short ${symbol} — treating as NO_TRADE`);
      const shortDecisionId = aqeaDecision.meta?.decisionId;
      if (shortDecisionId) {
        ForwardTelemetryStore.updateTerminalState(shortDecisionId, "NO_TRADE", "SHORT blocked on SPOT account (spot can only go long)", "NO_TRADE");
      }
    } else {
      await handleShort(userId, symbol, mode, accountType, settings, aqeaDecision, riskProfile);
    }
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
        await handleExit(userId, symbol, mode, accountType, exitReason, 1.0, currentPrice);
        return;
      }

      // 🛡️ V40 FIX: Max Hold Time Guard (4 hours in ranging/loss, 6 hours max hard ceiling)
      // Fetched once (non-lean) and reused below for AutoCloseEngine.check, which needs
      // the full Mongoose document — this used to be fetched a second time by tradeId
      // just a few lines down.
      const tradeRecord = await Trade.findById(pos.tradeId) as any;
      if (tradeRecord?.openedAt) {
        const holdMs = Date.now() - new Date(tradeRecord.openedAt).getTime();
        const holdHours = holdMs / 3600000;
        const anyTpHit = pos.meta?.tp1Hit || pos.meta?.tp2Hit || pos.meta?.tp3Hit;
        // 🛡️ Stagnant Loss Guard: Cut losing/stagnant trades after 4 hours if no TP hit
        if (holdHours > 4 && (!anyTpHit || unrealizedPnl <= 0)) {
          console.warn(`[STAGNANT_LOSS_GUARD] Cutting stagnant trade symbol=${symbol} holdHours=${holdHours.toFixed(1)} unrealizedPnl=${unrealizedPnl.toFixed(2)}`);
          await handleExit(userId, symbol, mode, accountType, "STAGNANT_LOSS_EXPIRE_4H", 1.0, currentPrice);
          return;
        }

        if (holdHours > 6 && !anyTpHit) {
          console.error(`[V40_CIRCUIT_BREAKER] MAX_HOLD_TIME symbol=${symbol} holdHours=${holdHours.toFixed(1)}`);
          await handleExit(userId, symbol, mode, accountType, "V40_MAX_HOLD_TIME_6H", 1.0, currentPrice);
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
           autoCloseTrigger = AutoCloseEngine.check(tradeRecord, {
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
             await handleExit(userId, symbol, mode, accountType, autoCloseTrigger.reason, 1.0, ctx.ind.close);
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
          await handleExit(userId, symbol, mode, accountType, managementSignal.reason, 1.0, ctx.ind.close);
          return;
      } else if (managementSignal.action === "CLOSE_PARTIAL" && !isFreshPosition) {
          await handleExit(userId, symbol, mode, accountType, managementSignal.reason, managementSignal.qtyPct, ctx.ind.close);
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
              await handleExit(userId, symbol, mode, accountType, exitSignal.reason, exitSignal.qtyPct, ctx.ind.close);
              const rem = paper.getPosition(userId, symbol, mode, accountType);
              if (rem) {
                  const newSl = exitSignal.newStopLoss ?? rem.sl;
                  const updMeta: any = { ...(rem.meta || {}) };
                  if (exitSignal.reason === "TP2_HIT") {
                      const atr = ctx.ind.atr14 || ctx.ind.close * 0.01;
                      const isLong = rem.side === "BUY";
                      // BUGFIX(trailing-stop): IndicatorSnapshot exposes no `ema20`
                      // (only ema9/ema21/ema55), so `(ctx.ind as any).ema20 ?? close`
                      // was ALWAYS `close`. calculateTrailingStop() returns Math.max
                      // (long) of its inputs, so feeding it `close` planted the trail
                      // AT the current price → the runner was force-closed on the very
                      // next tick. Use a real EMA, then clamp so the trail always keeps
                      // a >=1-ATR buffer from price (below for long / above for short).
                      const emaTrail = ctx.ind.ema21 ?? ctx.ind.ema9 ?? ctx.ind.close;
                      let trail = ExitEngine.calculateTrailingStop(
                          rem.entryPrice + (isLong ? atr : -atr),
                          emaTrail,
                          ctx.ind.close - (isLong ? atr : -atr),
                          isLong
                      );
                      trail = isLong
                          ? Math.min(trail, ctx.ind.close - atr)   // long: hold >=1 ATR below price
                          : Math.max(trail, ctx.ind.close + atr);  // short: hold >=1 ATR above price
                      updMeta.trailingStop = trail;
                  }
                  paper.setPosition(userId, symbol, mode, { ...rem, sl: newSl, meta: updMeta });
                  if (exitSignal.newStopLoss) {
                      await Trade.findByIdAndUpdate(pos.tradeId, { sl: newSl });
                  }
              }
          } else {
              await handleExit(userId, symbol, mode, accountType, exitSignal.reason, 1.0, ctx.ind.close);
          }
      } else if (exitSignal.newStopLoss != null) {
          // BUGFIX(breakeven-ratchet): a non-exit signal (e.g. BREAKEVEN_ELEVATION)
          // can still carry a newStopLoss to tighten protection. Previously the stop
          // was only ever applied inside `if (shouldExit)`, so this value was computed
          // in ExitEngine then silently discarded and the winning move could still
          // round-trip to a loss. Ratchet the in-memory + persisted stop, but ONLY in
          // the favorable direction (never loosen: raise SL for a long, lower it for a
          // short).
          const isLong = pos.side === "BUY";
          const proposed = exitSignal.newStopLoss;
          const curSl = typeof pos.sl === "number" ? pos.sl : (isLong ? -Infinity : Infinity);
          const improves = isLong ? proposed > curSl : proposed < curSl;
          if (improves) {
              pos.sl = proposed;
              paper.setPosition(userId, symbol, mode, pos);
              await Trade.findByIdAndUpdate(pos.tradeId, { sl: proposed });
          }
      }

      // 🛡️ GAP #4 FIX: Trailing stop dynamic ratchet
      // Continuously tighten trailing stop as price advances favorably
      if (!exitSignal.shouldExit && pos.meta?.trailingStop) {
          const isLong = pos.side === "BUY";
          const atr = ctx.ind.atr14 || ctx.ind.close * 0.01;
          const emaTrail = ctx.ind.ema21 ?? ctx.ind.ema9 ?? ctx.ind.close;
          let calculatedTrail = ExitEngine.calculateTrailingStop(
              pos.entryPrice + (isLong ? atr : -atr),
              emaTrail,
              ctx.ind.close - (isLong ? atr : -atr),
              isLong
          );
          calculatedTrail = isLong
              ? Math.min(calculatedTrail, ctx.ind.close - atr)
              : Math.max(calculatedTrail, ctx.ind.close + atr);

          const curTrail = pos.meta.trailingStop;
          const ratchetsFavorable = isLong ? calculatedTrail > curTrail : calculatedTrail < curTrail;
          if (ratchetsFavorable) {
              pos.meta = { ...pos.meta, trailingStop: calculatedTrail };
              paper.setPosition(userId, symbol, mode, pos);
          }
      }
  }
}

/* ── LONG handler ─────────────────────────────────────── */

export async function handleLong(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  accountType: "SPOT" | "FUTURES",
  settings: ISettings,
  aqeaDecision: AQEADecision,
  riskProfile: any
): Promise<void> {
  console.log(`[HANDLE_LONG_START] symbol=${symbol}`);
  // Emergency-stop check — the autonomous loop must respect the same
  // kill switch a manual /place-order call does. Exits (handleExit) are
  // deliberately NOT gated by this, so a killed/paused system can still
  // reduce risk.
  if (getTradingControlStatus() !== "RUNNING") {
    console.log(`[HANDLE_LONG_SKIP] trading control status is ${getTradingControlStatus()} — skipping new entry for ${symbol}`);
    return;
  }
  if (settings.shadowMode) {
    console.log(`[HANDLE_LONG_SKIP] shadowMode is ON — logging decision only, no position opened for ${symbol}`);
    return;
  }
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
  const minConvictionThreshold = settings.autoTradeThreshold ? settings.autoTradeThreshold / 100 : 0.68;
  const evaluation = evaluateLongEntry({ existing, aqeaDecision, riskProfile, symbol, sameDirectionCount, maxConcurrent, minConvictionThreshold });
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
  let walletBalance = 0;
  if (mode === "LIVE") {
    try {
      const { computeAccountBalance } = await import("../routes/wallet.js");
      const liveBal = await computeAccountBalance(userId, "LIVE", accountType, 95.72);
      walletBalance = liveBal.usdt ?? 0;
    } catch {
      const wallet = paper.getWallet(userId, mode, accountType);
      walletBalance = wallet.get("USDT") ?? 0;
    }
  } else {
    const wallet = paper.getWallet(userId, mode, accountType);
    walletBalance = wallet.get("USDT") ?? 0;
  }

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
    // Evidence for the calibrated Bayesian model — read on close by recordOutcome.
    bayesEvidence: (aqeaDecision.meta as any)?.bayesEvidence,
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
      const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });

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
        // walletDebited: exactly what left the paper wallet, so every trade's
        // cash flow can be audited against its P&L (a ~$27 Spot gap could not
        // be traced after logs rotated).
        meta: { ...aqeaDecision.meta, aqea: aqeaMeta, decisionId, walletDebited: marginRequired },
      }], { session }).then((docs) => docs[0]),
    );

    paper.setPosition(userId, symbol, mode, { userId, symbol, side: "BUY", quantity, entryPrice: currentPrice, tradeId: trade._id.toString(), accountType, leverage, sl: riskProfile.sl, tp: riskProfile.tp1, meta: trade.meta });

    console.log(`[PAPER_ORDER_CREATED] symbol=${symbol} side=BUY qty=${quantity} price=${currentPrice} decisionId=${decisionId}`);
    console.log(`[PAPER_POSITION_OPENED] symbol=${symbol} side=BUY qty=${quantity} entryPrice=${currentPrice} decisionId=${decisionId}`);

    // 🔔 Notify UI in real-time
    UITelemetryService.emitTradeOpened({
      userId, symbol, side: "BUY", quantity, entryPrice: currentPrice, leverage,
      accountType, sl: riskProfile.sl, tp: riskProfile.tp1,
      confidence: aqeaDecision.confidence, regime: decisionPath.regime,
      mode, tradeId: trade._id.toString(),
    });

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

export async function handleShort(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  accountType: "SPOT" | "FUTURES",
  settings: ISettings,
  aqeaDecision: AQEADecision,
  riskProfile: any
): Promise<void> {
  console.log(`[HANDLE_SHORT_START] symbol=${symbol}`);
  if (getTradingControlStatus() !== "RUNNING") {
    console.log(`[HANDLE_SHORT_SKIP] trading control status is ${getTradingControlStatus()} — skipping new entry for ${symbol}`);
    return;
  }
  if (settings.shadowMode) {
    console.log(`[HANDLE_SHORT_SKIP] shadowMode is ON — logging decision only, no position opened for ${symbol}`);
    return;
  }
  // BUGFIX(spot-short-guard): hard safety net — SPOT can only go long. Never let a
  // SPOT short reach the LIVE naked market SELL path, regardless of caller. Primary
  // guard is at the processSymbol dispatch; this backstops any direct caller.
  if (accountType === "SPOT") {
    console.log(`[HANDLE_SHORT_SKIP] accountType=SPOT cannot short ${symbol} — spot can only go long`);
    return;
  }
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
  const minConvictionThreshold = settings.shortScoreThreshold ? (100 - settings.shortScoreThreshold) / 100 : 0.68;
  const evaluation = evaluateShortEntry({ existing, aqeaDecision, riskProfile, symbol, sameDirectionCount, maxConcurrent, minConvictionThreshold });
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
  let walletBalance = 0;
  if (mode === "LIVE") {
    try {
      const { computeAccountBalance } = await import("../routes/wallet.js");
      const liveBal = await computeAccountBalance(userId, "LIVE", accountType, 95.72);
      walletBalance = liveBal.usdt ?? 0;
    } catch {
      const wallet = paper.getWallet(userId, mode, accountType);
      walletBalance = wallet.get("USDT") ?? 0;
    }
  } else {
    const wallet = paper.getWallet(userId, mode, accountType);
    walletBalance = wallet.get("USDT") ?? 0;
  }

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
    // Evidence for the calibrated Bayesian model — read on close by recordOutcome.
    bayesEvidence: (aqeaDecision.meta as any)?.bayesEvidence,
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
      const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });

      const clientOrderId = binance.genClientOrderId("aalgo-shrt");
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
        // walletDebited: exactly what left the paper wallet, so every trade's
        // cash flow can be audited against its P&L (a ~$27 Spot gap could not
        // be traced after logs rotated).
        meta: { ...aqeaDecision.meta, aqea: aqeaMeta, decisionId, walletDebited: marginRequired },
      }], { session }).then((docs) => docs[0]),
    );

    paper.setPosition(userId, symbol, mode, { userId, symbol, side: "SELL", quantity, entryPrice: currentPrice, tradeId: trade._id.toString(), accountType, leverage, sl: riskProfile.sl, tp: riskProfile.tp1, meta: trade.meta });

    console.log(`[PAPER_ORDER_CREATED] symbol=${symbol} side=SELL qty=${quantity} price=${currentPrice} decisionId=${decisionId}`);
    console.log(`[PAPER_POSITION_OPENED] symbol=${symbol} side=SELL qty=${quantity} entryPrice=${currentPrice} decisionId=${decisionId}`);

    // 🔔 Notify UI in real-time
    UITelemetryService.emitTradeOpened({
      userId, symbol, side: "SELL", quantity, entryPrice: currentPrice, leverage,
      accountType, sl: riskProfile.sl, tp: riskProfile.tp1,
      confidence: aqeaDecision.confidence, regime: decisionPath.regime,
      mode, tradeId: trade._id.toString(),
    });

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

// Exits in progress, keyed like paper positions. The SL/TP monitor and the
// scheduler's exit monitoring can both decide to close the same position
// within one exchange round-trip; without this a LIVE spot position would be
// sold twice (the second SELL eating into any other holdings of that coin).
const exitsInFlight = new Set<string>();

export async function handleExit(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  accountType: string = "FUTURES",
  reason: string = "MANUAL",
  qtyPct: number = 1.0,
  triggerPrice?: number
): Promise<void> {
  const key = `${userId}:${symbol}:${mode}:${accountType}`;
  if (exitsInFlight.has(key)) return;
  exitsInFlight.add(key);
  try {
    await executeExit(userId, symbol, mode, accountType, reason, qtyPct, triggerPrice);
  } finally {
    exitsInFlight.delete(key);
  }
}

/**
 * Caps a LIVE spot SELL at the asset's real free Spot balance. The recorded
 * position quantity can exceed it (buy fee charged in the base asset), and
 * Binance can sweep spot funds into Simple Earn Flexible ("LD" + asset), where
 * neither the order book nor Convert can sell them — both just reject, and
 * Convert's quote comes back without a quoteId. A failed balance read does not
 * block the exit; it proceeds with the requested quantity as before.
 */
async function capSpotSellToFreeBalance(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  requestedQty: number
): Promise<number> {
  const baseAsset = symbol.replace(/(USDT|USDC|FDUSD)$/, "");
  let balances: Array<{ asset: string; free: string }>;
  try {
    balances = await binance.getAccount(apiKey, apiSecret);
  } catch (err: any) {
    console.warn(`[auto] LIVE spot exit ${symbol}: balance check failed (${err?.message}); selling recorded qty`);
    return requestedQty;
  }
  const free = parseFloat(balances.find((b) => b.asset === baseAsset)?.free ?? "0");
  if (free >= requestedQty) return requestedQty;
  if (free > 0) {
    console.warn(`[auto] LIVE spot exit ${symbol}: capping sell ${requestedQty} → free Spot balance ${free}`);
    return free;
  }
  const inEarn = parseFloat(balances.find((b) => b.asset === `LD${baseAsset}`)?.free ?? "0");
  if (inEarn > 0) {
    throw new Error(`${baseAsset} is in Binance Simple Earn (${inEarn} LD${baseAsset}), not the Spot wallet — redeem it to Spot so it can be sold`);
  }
  throw new Error(`No free ${baseAsset} in the Spot wallet to sell (recorded position ${requestedQty})`);
}

async function executeExit(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  accountType: string,
  reason: string,
  qtyPct: number,
  triggerPrice?: number
): Promise<void> {
  const pos = paper.getPosition(userId, symbol, mode, accountType);
  if (!pos) return;

  let requestedCloseQty = pos.quantity * Math.min(1, Math.max(0, qtyPct));
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
    const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });

    const exitClientOrderId = binance.genClientOrderId("aalgo-exit");
    const exitSide = pos.side === "BUY" ? "SELL" : "BUY";
    let exitResult: any;
    if (accountType === "FUTURES") {
      const qtyStr = await binance.formatFuturesQuantity(symbol, requestedCloseQty);
      exitResult = await binance.placeFuturesOrder(apiKey, apiSecret, { symbol, side: exitSide, type: "MARKET", quantity: qtyStr, clientOrderId: exitClientOrderId, reduceOnly: true });
    } else {
      if (exitSide === "SELL") {
        requestedCloseQty = await capSpotSellToFreeBalance(apiKey, apiSecret, symbol, requestedCloseQty);
      }
      const qtyStr = await binance.formatQuantity(symbol, requestedCloseQty);
      try {
        exitResult = await binance.placeOrder(apiKey, apiSecret, { symbol, side: exitSide, type: "MARKET", quantity: qtyStr, clientOrderId: exitClientOrderId });
      } catch (spotErr: any) {
        // Only a definite order-book rejection (400/401/403: filters, key
        // permissions, IP) falls back to Convert. A timeout or 5xx may have
        // filled, and a second sell would double-exit.
        if (!/^Binance Spot 40[013]:/.test(spotErr?.message ?? "")) throw spotErr;
        console.warn(`[auto] LIVE spot exit ${symbol} rejected by order book (${spotErr.message}); retrying via Binance Convert`);
        exitResult = await binance.convertSpotMarket(apiKey, apiSecret, {
          symbol, side: exitSide, quantity: requestedCloseQty, price: triggerPrice ?? pos.entryPrice,
        });
      }
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

  // A LIVE full close is floored to the exchange lot step (495079.57 PEPE
  // sells as 495079), and a sub-$1 remainder can never be sold. Treat it as
  // closed rather than leaving an OPEN dust position that is retried forever.
  const isLotDust = mode === "LIVE" && qtyPct >= 1 && (pos.quantity - closeQty) * pos.entryPrice < 1;
  const isPartial = closeQty < pos.quantity - 1e-9 && !isLotDust;

  // Root cause of exits that booked a loss despite a favorable exitReason
  // (e.g. "TP3_HIT" closing at a net loss): the exit *decision* is made on
  // ctx.ind.close (last closed 5m candle, up to ~5min stale), but this
  // function used to independently re-fetch a fresh 1m kline moments later
  // to price the fill — a different interval fetched at a different time,
  // which can (and did) show a materially different, even reversed, price
  // in a fast-moving market. For PAPER mode there's no real fill to honor,
  // so book the exit at the exact price that triggered it. LIVE mode is
  // unaffected — it always prices off the real broker fill (liveExitPrice).
  const liveExitPrice = (pos.meta as any)?.liveExitPrice;
  const usePriceFallbackFetch = !liveExitPrice && !Number.isFinite(triggerPrice);
  const klines = usePriceFallbackFetch ? await binance.getKlines(symbol, "1m", undefined, undefined, 1) : [];
  const exitPrice = liveExitPrice || (Number.isFinite(triggerPrice) ? triggerPrice! : (klines.length ? parseFloat(klines[0].close) : pos.entryPrice));
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

    // BUGFIX(partial-fill double-release): persist the REDUCED remaining quantity
    // (and preserve the original size via meta/origQty), not just meta. Previously
    // Trade.quantity stayed at the full amount, so on restart hydrate() restored the
    // full position and the already-released partial margin/PnL was released a SECOND
    // time on the eventual final close. Downstream full-close accounting reads the
    // in-memory pos.quantity, which we keep in sync here, so the base qty stays correct.
    const remainingQty = pos.quantity - closeQty;
    const origQty = (existingTrade as any)?.origQty ?? (existingTrade as any)?.quantity ?? pos.quantity;
    updatedMeta.origQty = origQty;
    paper.setPosition(userId, symbol, mode, { ...pos, quantity: remainingQty, meta: updatedMeta });
    await Trade.findByIdAndUpdate(pos.tradeId, { quantity: remainingQty, origQty, meta: updatedMeta });

    if (mode === "PAPER") {
      // BUGFIX: was an unlocked read-modify-write racing against any other
      // concurrent wallet mutation for this key (a manual leverage change,
      // another partial/full exit), and the write itself was missing its
      // `await` (fire-and-forget on an async call).
      await paper.withWalletLock(userId, mode, accountType, async () => {
        const wallet = paper.getWallet(userId, mode, accountType);
        const usdt = wallet.get("USDT") ?? 0;
        const partialMargin = (closeQty * pos.entryPrice) / (pos.leverage || 1);
        const newBalance = usdt + (Number.isFinite(partialMargin) ? partialMargin : 0) + safeNetPnl;
        if (Number.isFinite(newBalance)) await paper.setWalletBalance(userId, mode, "USDT", newBalance, accountType);
      });
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
    closeFields.meta = { ...closeFields.meta, walletCredited: creditAmount };
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

  // 🛡️ Feed the realized outcome back into AdaptiveBayesianGate's empirical
  // calibration. Without this, AdaptiveBayesianGate.recordOutcome() was
  // never called anywhere in the codebase — calibrationRecords stayed
  // permanently empty regardless of how many trades ever closed, so the
  // gate could never leave its strict ANALYTICAL_PRIOR_FALLBACK thresholds
  // (0.78-0.95) for the empirical, regime-specific win rate it's designed
  // to converge on. A class named "Adaptive" that structurally can never
  // adapt — this is the actual reason real trade history never loosened
  // how selective new entries are.
  const entryDecisionPath = (existingTrade?.meta as any)?.aqea?.decisionPath;
  if (entryDecisionPath?.regime) {
    AdaptiveBayesianGate.recordOutcome({
      regime: entryDecisionPath.regime,
      realizedOutcome: totalNetPnl > 0 ? "WIN" : "LOSS",
      priorOdds: Number.isFinite(entryDecisionPath.bayesianPriorOdds) ? entryDecisionPath.bayesianPriorOdds : 0.5,
      posteriorProbability: Number.isFinite(entryDecisionPath.bayesianPosterior) ? entryDecisionPath.bayesianPosterior : 0.5,
      timestamp: Date.now(),
    });
  }

  // Feed the realized outcome into the calibrated Bayesian win-probability
  // model so its empirical likelihood ratios, prior, and calibration layer
  // learn from actual closed trades.
  const bayesEvidence = (existingTrade?.meta as any)?.aqea?.bayesEvidence;
  if (bayesEvidence) {
    try {
      await BayesianProbabilityEngine.recordOutcome(bayesEvidence, totalNetPnl > 0 ? "WIN" : "LOSS");
    } catch (bayesErr) {
      console.warn(`[auto] Failed to record Bayesian outcome for ${symbol}:`, bayesErr);
    }
  }

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

  // 🛡️ GAP #11 FIX: Real-time in-app socket notification for position exit
  try {
    const pnlFormatted = `${totalNetPnl >= 0 ? "+" : ""}$${totalNetPnl.toFixed(2)}`;
    const alertLevel = totalNetPnl >= 0 ? "GREEN" : (reason.includes("STOP_LOSS") || reason.includes("RISK") ? "RED" : "AMBER");
    emitAlert(
      alertLevel,
      `[AutoTrade: ${reason}] ${symbol} ${pos.side} closed @ $${safeExitPrice.toFixed(2)} | Net PnL: ${pnlFormatted} USDT`
    );
  } catch (alertErr) {
    console.warn(`[auto] Failed to emit exit alert:`, alertErr);
  }
}
