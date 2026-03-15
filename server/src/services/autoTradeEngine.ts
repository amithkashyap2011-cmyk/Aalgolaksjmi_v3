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
import * as agent from "./agentService.js";
import * as paper from "./paperState.js";
import * as binance from "./binanceService.js";

/* ── State ────────────────────────────────────────────── */

let intervalId: ReturnType<typeof setInterval> | null = null;
const DEFAULT_INTERVAL_MS = 60_000; // 1 minute

/** Set of userIds that have auto‑trade enabled. */
const autoEnabledUsers = new Set<string>();

/* ── Public API ───────────────────────────────────────── */

export function enableUser(userId: string): void {
  autoEnabledUsers.add(userId);
  console.log(`[auto] enabled for user ${userId}`);
}

export function disableUser(userId: string): void {
  autoEnabledUsers.delete(userId);
  console.log(`[auto] disabled for user ${userId}`);
}

export function isEnabled(userId: string): boolean {
  return autoEnabledUsers.has(userId);
}

export function start(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (intervalId) return; // already running
  console.log(`[auto] scheduler started (interval=${intervalMs}ms)`);
  intervalId = setInterval(() => tick().catch(console.error), intervalMs);
}

export function stop(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[auto] scheduler stopped");
  }
}

/* ── Core tick — runs once per interval ───────────────── */

async function tick(): Promise<void> {
  for (const userId of autoEnabledUsers) {
    try {
      await processUser(userId);
    } catch (err) {
      console.error(`[auto] error for user ${userId}:`, err);
    }
  }
}

async function processUser(userId: string): Promise<void> {
  const settings = await Settings.findOne({ userId });
  if (!settings) return;

  const mode = settings.defaultMode === "BACKTEST" ? "PAPER" : settings.defaultMode as "PAPER" | "LIVE";

  for (const symbol of settings.allowedSymbols) {
    await processSymbol(userId, symbol, mode, settings);
  }
}

async function processSymbol(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  settings: ISettings,
): Promise<void> {
  /* 1. Build context & decide */
  const decision = await agent.recommend(symbol, mode, userId);

  /* 2. Log decision as alert */
  await Alert.create({
    userId,
    severity: decision.action === "LONG" ? "GREEN" : decision.action === "EXIT" ? "AMBER" : "GREEN",
    symbol,
    title: `Auto: ${decision.action}`,
    message: `Long=${decision.confidenceLong} Exit=${decision.confidenceExit} NoTrade=${decision.confidenceNoTrade} | Checklist ${decision.checklist.passedCount}/${decision.checklist.totalCount}`,
  });

  /* 3. Act on decision */
  if (decision.action === "LONG") {
    await handleLong(userId, symbol, mode, settings);
  } else if (decision.action === "EXIT") {
    await handleExit(userId, symbol, mode);
  }
  // NO_TRADE → do nothing
}

/* ── LONG handler ─────────────────────────────────────── */

async function handleLong(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
  settings: ISettings,
): Promise<void> {
  // Check if already in position (O(1) lookup)
  const existing = paper.getPosition(userId, symbol, mode);
  if (existing) return; // already open — skip

  const risk = settings.riskConfig;
  const wallet = paper.getWallet(userId, mode);
  const usdt = wallet.get("USDT") ?? 0;
  const allocPct = risk.maxPositionSizePct / 100;
  const allocUsdt = usdt * allocPct;

  if (allocUsdt < 1) return; // too small

  if (mode === "LIVE") {
    /* ── LIVE order ───────────────────────────────────── */
    const keys = await ApiKeys.findOne({ userId });
    if (!keys) return;
    const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
    const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.iv, authTag: keys.authTag });

    // Estimate qty from current price (use last kline close)
    const klines = await binance.getKlines(symbol, "1m", undefined, undefined, 1);
    if (!klines.length) return;
    const price = parseFloat(klines[0].close);
    const qty = allocUsdt / price;

    const result = await binance.placeOrder(apiKey, apiSecret, {
      symbol, side: "BUY", type: "MARKET",
      quantity: qty.toFixed(6),
    });
    const entryPrice = parseFloat(result.cummulativeQuoteQty) / parseFloat(result.executedQty);

    const trade = await Trade.create({
      userId, mode: "LIVE", symbol, side: "BUY",
      quantity: parseFloat(result.executedQty),
      entryPrice,
      sl: entryPrice * (1 - risk.defaultSL / 100),
      tp: entryPrice * (1 + risk.defaultTP / 100),
      strategy: "LAKSHMI",
      status: "OPEN",
      meta: { binanceOrderId: result.orderId, source: "auto" },
    });

    paper.setPosition(userId, symbol, mode, {
      userId, symbol, side: "BUY",
      quantity: parseFloat(result.executedQty),
      entryPrice, tradeId: trade._id.toString(),
    });
  } else {
    /* ── PAPER order ──────────────────────────────────── */
    const klines = await binance.getKlines(symbol, "1m", undefined, undefined, 1);
    if (!klines.length) return;
    const price = parseFloat(klines[0].close);
    const qty = allocUsdt / price;
    const cost = qty * price;

    paper.setWalletBalance(userId, mode, "USDT", usdt - cost);

    const trade = await Trade.create({
      userId, mode: "PAPER", symbol, side: "BUY",
      quantity: qty, entryPrice: price,
      sl: price * (1 - risk.defaultSL / 100),
      tp: price * (1 + risk.defaultTP / 100),
      strategy: "LAKSHMI",
      status: "OPEN",
      meta: { source: "auto" },
    });

    paper.setPosition(userId, symbol, mode, {
      userId, symbol, side: "BUY",
      quantity: qty, entryPrice: price,
      tradeId: trade._id.toString(),
    });
  }
}

/* ── EXIT handler ─────────────────────────────────────── */

async function handleExit(
  userId: string,
  symbol: string,
  mode: "PAPER" | "LIVE",
): Promise<void> {
  const pos = paper.getPosition(userId, symbol, mode);
  if (!pos) return; // nothing to close

  if (mode === "LIVE") {
    const keys = await ApiKeys.findOne({ userId });
    if (!keys) return;
    const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
    const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.iv, authTag: keys.authTag });

    await binance.placeOrder(apiKey, apiSecret, {
      symbol, side: "SELL", type: "MARKET",
      quantity: pos.quantity.toFixed(6),
    });
  }

  // Get exit price
  const klines = await binance.getKlines(symbol, "1m", undefined, undefined, 1);
  const exitPrice = klines.length ? parseFloat(klines[0].close) : pos.entryPrice;
  const pnl = (exitPrice - pos.entryPrice) * pos.quantity;

  // Update Trade doc
  await Trade.findByIdAndUpdate(pos.tradeId, {
    exitPrice,
    pnl,
    status: "CLOSED",
    closedAt: new Date(),
  });

  // Credit wallet
  if (mode === "PAPER") {
    const wallet = paper.getWallet(userId, mode);
    const usdt = wallet.get("USDT") ?? 0;
    paper.setWalletBalance(userId, mode, "USDT", usdt + pos.quantity * exitPrice);
  }

  // Remove position
  paper.removePosition(userId, symbol, mode);
}
