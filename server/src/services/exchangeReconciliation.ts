/*
 * ─── Exchange Reconciliation Engine ────────────────────
 *
 * For LIVE-mode trading, the local system's belief about what positions
 * exist can drift from what's actually true on Binance — a lost order
 * response, a crash mid-operation, a partial fill, or simply a bug. This
 * engine periodically asks Binance directly ("what do you actually show?")
 * and compares it against MongoDB's Trade collection (the same source the
 * in-memory paperState and the dashboard both read from), rather than
 * trusting any of those to already agree with each other.
 *
 * Scope, deliberately: this detects and safely repairs the *unambiguous*
 * mismatch (local says a position is open, Binance shows it flat — the
 * exchange is always the source of truth for whether a position exists).
 * It does NOT silently rewrite financial figures (quantity, entry price,
 * leverage) for a position that both sides agree exists but disagree on
 * the details — that's flagged for review, not auto-corrected, since
 * papering over a mismatch there could hide a real bug rather than fix one.
 * It does NOT invent trading decisions — a position Binance shows but local
 * has no record of gets a minimal, clearly-labeled placeholder Trade (not
 * fabricated AI metadata), so it's visible rather than 100% invisible,
 * and it never creates a second one on a re-run (idempotent by construction:
 * every write here is a conditional update or a find-before-create).
 */
import { Trade } from "../models/Trade.js";
import { toValidObjectId } from "../utils/mongoUtils.js";
import { Alert } from "../models/Alert.js";
import { ApiKeys } from "../models/ApiKeys.js";
import { decrypt } from "../lib/crypto.js";
import * as binance from "./binanceService.js";
import { log } from "../utils/logger.js";
import mongoose from "mongoose";

export interface ReconciliationSummary {
  userId: string;
  checkedAt: Date;
  exchangePositions: number;
  localOpenTrades: number;
  orphanedLocalTrades: number;       // local says OPEN, exchange is flat — safely auto-closed
  orphanedExchangePositions: number; // exchange has a position, local has no record — flagged + placeholder created
  detailMismatches: number;          // both exist, quantity/side disagree — flagged only
  hedgeModeWarning: boolean;
  errors: string[];
}

// Avoid alert spam: don't re-alert the same userId+title+symbol combination
// more than once per this window, even if reconciliation runs every few
// minutes and the same real mismatch is still present.
const ALERT_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

async function alertOnce(userId: string, severity: "RED" | "AMBER", symbol: string, title: string, message: string) {
  const recent = await Alert.findOne({
    userId, symbol, title,
    createdAt: { $gte: new Date(Date.now() - ALERT_DEDUPE_WINDOW_MS) },
  }).catch(() => null);
  if (recent) return;
  await Alert.create({ userId, severity, symbol, title, message }).catch(() => {});
}

export async function reconcileUserLive(userId: string): Promise<ReconciliationSummary | null> {
  if (mongoose.connection.readyState !== 1) return null;

  const keys = await ApiKeys.findOne({ userId });
  if (!keys) return null; // nothing to reconcile — user has no LIVE credentials

  const summary: ReconciliationSummary = {
    userId, checkedAt: new Date(), exchangePositions: 0, localOpenTrades: 0,
    orphanedLocalTrades: 0, orphanedExchangePositions: 0, detailMismatches: 0,
    hedgeModeWarning: false, errors: [],
  };

  let apiKey: string, apiSecret: string;
  try {
    apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
    apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });
  } catch (err: any) {
    summary.errors.push(`Failed to decrypt API keys: ${err.message}`);
    return summary;
  }

  let exchangePositions: Awaited<ReturnType<typeof binance.getFuturesPositions>>;
  try {
    exchangePositions = await binance.getFuturesPositions(apiKey, apiSecret);
  } catch (err: any) {
    summary.errors.push(`Failed to fetch exchange positions: ${err.message}`);
    log(`[reconciliation] ${userId}: ${summary.errors[summary.errors.length - 1]}`);
    return summary;
  }
  summary.exchangePositions = exchangePositions.length;

  try {
    const hedge = await binance.isHedgeMode(apiKey, apiSecret);
    summary.hedgeModeWarning = hedge;
    if (hedge) {
      await alertOnce(userId, "RED", "ACCOUNT", "HEDGE MODE ACTIVE",
        "This Binance account is in Hedge (dual-side) position mode. This system's order placement never sends positionSide, which Binance requires in Hedge mode — LIVE orders will likely be rejected. Switch the account to One-way mode before LIVE trading, or do not enable LIVE mode until Hedge-mode support is built.");
    }
  } catch (err: any) {
    summary.errors.push(`Failed to check position mode: ${err.message}`);
  }

  const localOpenTrades = await Trade.find({ userId: toValidObjectId(userId), mode: "LIVE", status: "OPEN" }).lean();
  summary.localOpenTrades = localOpenTrades.length;

  const exchangeBySymbol = new Map(exchangePositions.map(p => [p.symbol, p]));
  const localSymbolsSeen = new Set<string>();

  // 1. Local says OPEN — does the exchange agree a position exists?
  for (const trade of localOpenTrades) {
    localSymbolsSeen.add(trade.symbol);
    const exch = exchangeBySymbol.get(trade.symbol);
    const exchQty = exch ? Math.abs(parseFloat(exch.positionAmt)) : 0;

    if (!exch || exchQty < 1e-9) {
      // Exchange is flat — the local OPEN record is stale. Safe to close:
      // there is no ambiguity here (exchange is always truth for existence),
      // and this is a conditional update on status:"OPEN", so a re-run
      // finds nothing left to do (idempotent).
      const closed = await Trade.findOneAndUpdate(
        { _id: trade._id, status: "OPEN" },
        { $set: { status: "CLOSED", closedAt: new Date(), "meta.closeReason": "RECONCILIATION_ORPHANED_LOCAL" } },
      );
      if (closed) {
        summary.orphanedLocalTrades++;
        await alertOnce(userId, "AMBER", trade.symbol, "RECONCILIATION: LOCAL TRADE ORPHANED",
          `Local record showed ${trade.symbol} OPEN but Binance shows no position. Marked CLOSED locally to match exchange truth. Realized PnL for this trade was NOT recalculated — review manually if this trade's P&L matters.`);
      }
      continue;
    }

    // Both sides agree a position exists — check the details agree too.
    const exchLeverage = parseFloat(exch.leverage) || 1;
    const exchSide = parseFloat(exch.positionAmt) > 0 ? "BUY" : "SELL";
    const qtyDeltaPct = Math.abs(exchQty - trade.quantity) / Math.max(exchQty, trade.quantity, 1e-9);
    if (exchSide !== trade.side || qtyDeltaPct > 0.01 || exchLeverage !== (trade.leverage || 1)) {
      summary.detailMismatches++;
      await alertOnce(userId, "AMBER", trade.symbol, "RECONCILIATION: POSITION DETAIL MISMATCH",
        `${trade.symbol}: local shows side=${trade.side} qty=${trade.quantity} lev=${trade.leverage}, Binance shows side=${exchSide} qty=${exchQty} lev=${exchLeverage}. Not auto-corrected — review manually.`);
    }
  }

  // 2. Exchange shows a position with no local OPEN record at all — the
  // "order executed but the response was lost" scenario this session's
  // clientOrderId work was meant to make detectable.
  for (const pos of exchangePositions) {
    const qty = Math.abs(parseFloat(pos.positionAmt));
    if (qty < 1e-9 || localSymbolsSeen.has(pos.symbol)) continue;

    const alreadyPlaceholder = await Trade.findOne({ userId: toValidObjectId(userId), mode: "LIVE", symbol: pos.symbol, status: "OPEN" }).lean();
    if (alreadyPlaceholder) continue; // already reconciled on a prior run — idempotent

    summary.orphanedExchangePositions++;
    await Trade.create({
      userId: toValidObjectId(userId), mode: "LIVE", symbol: pos.symbol,
      side: parseFloat(pos.positionAmt) > 0 ? "BUY" : "SELL",
      quantity: qty, entryPrice: parseFloat(pos.entryPrice) || 0,
      leverage: parseFloat(pos.leverage) || 1,
      status: "OPEN", accountType: "FUTURES",
      entrySource: "RECONCILIATION", decisionPath: {}, authorizedVotes: {}, shadowVotes: {}, coreScore: 0, finalScore: 0,
      meta: { closeReason: undefined, note: "Reconstructed from exchange state — this system had no record of this position. Real entry price/quantity/leverage from Binance; no AI decision data exists for it." },
    });
    await alertOnce(userId, "RED", pos.symbol, "RECONCILIATION: UNTRACKED EXCHANGE POSITION FOUND",
      `Binance shows an open ${pos.symbol} position with no local record — likely an order whose placement response was lost. Created a placeholder Trade record from exchange data so it isn't invisible. Verify SL/TP manually — none were set by this system.`);
  }

  log(`[reconciliation] ${userId}: exchange=${summary.exchangePositions} local=${summary.localOpenTrades} orphanedLocal=${summary.orphanedLocalTrades} orphanedExchange=${summary.orphanedExchangePositions} mismatches=${summary.detailMismatches}`);
  return summary;
}

export async function reconcileAllLiveUsers(): Promise<ReconciliationSummary[]> {
  if (mongoose.connection.readyState !== 1) return [];
  const usersWithKeys = await ApiKeys.find({}).select("userId").lean();
  const results: ReconciliationSummary[] = [];
  for (const { userId } of usersWithKeys) {
    try {
      const result = await reconcileUserLive(String(userId));
      if (result) results.push(result);
    } catch (err: any) {
      log(`[reconciliation] Unexpected failure for ${userId}: ${err.message}`);
    }
  }
  return results;
}

let reconciliationTimer: NodeJS.Timeout | null = null;

/** Runs reconcileAllLiveUsers on a fixed interval. Call once at boot. */
export function startReconciliationSchedule(intervalMs: number = 5 * 60 * 1000): void {
  if (reconciliationTimer) return; // already running
  reconciliationTimer = setInterval(() => {
    reconcileAllLiveUsers().catch(err => log(`[reconciliation] scheduled run failed: ${err.message}`));
  }, intervalMs);
  if (typeof reconciliationTimer.unref === "function") reconciliationTimer.unref();
}

export function stopReconciliationSchedule(): void {
  if (reconciliationTimer) {
    clearInterval(reconciliationTimer);
    reconciliationTimer = null;
  }
}
