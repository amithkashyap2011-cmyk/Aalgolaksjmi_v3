/*
 * ─── Manual Trade SL/TP Monitor ──────────────────────────────────────────────
 *
 * Monitors ALL open paper and LIVE positions every 30s regardless of whether
 * the autoTradeEngine is enabled for that user. This ensures manual trades
 * placed via the Order Station have their Stop-Loss and Take-Profit levels
 * honoured even when autopilot is OFF. LIVE exits place real Binance orders.
 *
 * Logic:
 *   - Fetches live price from in-memory ticker cache (no API call)
 *   - If SL breached → closes position, credits wallet, updates Trade doc
 *   - If TP breached → closes position with profit, credits wallet
 *   - Emits socket alert to the user on every trigger
 */

import * as paper from "./paperState.js";
import { Trade } from "../models/Trade.js";
import { getTickerPriceSync, getLatestFundingRate } from "./binanceService.js";
import { emitAlert } from "./socketService.js";
import mongoose from "mongoose";

const log = (msg: string) => console.log(`[ManualSLTPMonitor] ${msg}`);

let _running = false;
let _interval: NodeJS.Timeout | null = null;

/** Close a paper position at `exitPrice` and return funds to wallet. */
async function closePaperPosition(
  pos: paper.PaperPosition,
  exitPrice: number,
  reason: string
): Promise<void> {
  try {
    const { userId, symbol, side, quantity, entryPrice, leverage, accountType, tradeId } = pos;
    const isLong = side === "BUY";
    const notional = entryPrice * quantity;
    const lev = leverage || 1;
    const marginUsed = notional / lev;

    // Gross PnL
    const grossPnl = isLong
      ? (exitPrice - entryPrice) * quantity
      : (entryPrice - exitPrice) * quantity;

    // Fees: 0.04% per leg for futures, 0.1% for spot
    const feePct = accountType === "SPOT" ? 0.001 : 0.0004;
    const fees = (entryPrice * quantity * feePct) + (exitPrice * quantity * feePct);
    const netPnl = grossPnl - fees;

    // Remove position from paper state
    paper.removePosition(userId, symbol, "PAPER", accountType);

    // Credit wallet
    const wallet = paper.getWallet(userId, "PAPER", accountType);
    const currentUsdt = wallet.get("USDT") ?? 0;
    const refund = marginUsed + netPnl;
    await paper.setWalletBalance(userId, "PAPER", "USDT", Math.max(0, currentUsdt + refund), accountType);

    // Update Trade document
    if (mongoose.connection.readyState === 1 && tradeId) {
      await Trade.findByIdAndUpdate(tradeId, {
        status: "CLOSED",
        exitPrice,
        closedAt: new Date(),
        pnl: netPnl,
        exitReason: reason,
      });
    }

    const pnlStr = `${netPnl >= 0 ? "+" : ""}$${netPnl.toFixed(2)}`;
    const level = netPnl >= 0 ? "GREEN" : "AMBER";
    emitAlert(
      level,
      `[${reason}] ${symbol} ${side} closed @ $${exitPrice.toFixed(2)} | PnL: ${pnlStr} USDT`
    );
    log(`${reason} ${symbol} ${side} @ ${exitPrice.toFixed(2)} PnL=${pnlStr}`);
  } catch (err: any) {
    log(`ERROR closing ${pos.symbol}: ${err.message}`);
  }
}

// Backoff after a failed LIVE exit so a persistent exchange rejection (key
// permissions, IP whitelist) is retried every few minutes, not every cycle.
const LIVE_EXIT_RETRY_MS = 5 * 60_000;
const liveExitRetryAt = new Map<string, number>();
// Once SL/TP triggers, the exit stays owed until it fills. Without the latch,
// a sell that failed (timeout, IP whitelist, funds in Earn) was silently
// abandoned if price recovered past the stop during the retry backoff.
const liveExitLatched = new Map<string, "STOP_LOSS_HIT" | "TAKE_PROFIT_HIT">();

/**
 * LIVE positions need SL/TP enforcement independent of the AutoTradeEngine,
 * which only manages exits after its entry gates pass — a fully invested
 * account (zero free USDT) or autopilot OFF means it never looks at them.
 * Exits go through handleExit, which places the real Binance order.
 */
async function monitorLivePositions(): Promise<void> {
  const livePositions = paper.getAllOpenPositions("LIVE", ["SPOT", "FUTURES"]);
  const openKeys = new Set(livePositions.map((p: any) => `${p.userId}:${p.symbol}:${p.accountType}`));
  for (const key of liveExitLatched.keys()) {
    if (!openKeys.has(key)) liveExitLatched.delete(key); // closed elsewhere (scheduler, manual)
  }

  for (const pos of livePositions) {
    const { userId, symbol, side, sl, tp, accountType } = pos;
    const livePrice = getTickerPriceSync(symbol, accountType === "FUTURES");
    if (!livePrice || livePrice <= 0) continue;

    const key = `${userId}:${symbol}:${accountType}`;
    const isLong = side === "BUY";
    const slHit = !!sl && sl > 0 && (isLong ? livePrice <= sl : livePrice >= sl);
    const tpHit = !!tp && tp > 0 && (isLong ? livePrice >= tp : livePrice <= tp);
    const latched = liveExitLatched.get(key);
    if (!slHit && !tpHit && !latched) continue;

    const reason = latched ?? (slHit ? "STOP_LOSS_HIT" : "TAKE_PROFIT_HIT");
    liveExitLatched.set(key, reason);
    if ((liveExitRetryAt.get(key) ?? 0) > Date.now()) continue;

    try {
      const { handleExit } = await import("./autoTradeEngine.js");
      await handleExit(userId, symbol, "LIVE", accountType, reason, 1.0, livePrice);
      // handleExit returns quietly when it cannot trade (live barrier closed,
      // no API keys, exit already in flight) — that is not a completed exit.
      if (paper.getPosition(userId, symbol, "LIVE", accountType)) {
        throw new Error("position still open after exit attempt");
      }
      liveExitRetryAt.delete(key);
      liveExitLatched.delete(key);
      log(`LIVE ${reason} ${symbol} ${side} @ ${livePrice}`);
    } catch (err: any) {
      liveExitRetryAt.set(key, Date.now() + LIVE_EXIT_RETRY_MS);
      log(`LIVE ${reason} ${symbol} exit FAILED (retry in 5m): ${err.message}`);
      emitAlert("RED", `[${reason}] LIVE ${symbol} could not be sold on Binance: ${err.message}`);
    }
  }
}

export async function runMonitorCycle(): Promise<void> {
  try {
    await monitorLivePositions();
  } catch (err: any) {
    log(`LIVE monitor cycle error: ${err.message}`);
  }

  try {
    // Get all open PAPER positions across all users
    const allPositions = paper.getAllOpenPositions("PAPER", ["SPOT", "FUTURES"]);
    if (allPositions.length === 0) return;

    for (const pos of allPositions) {
      const { symbol, side, sl, tp, accountType } = pos;
      const isFutures = accountType === "FUTURES";

      // Use cached ticker price — no Binance API call, instant
      const livePrice = getTickerPriceSync(symbol, isFutures);
      if (!livePrice || livePrice <= 0) continue;

      const isLong = side === "BUY";

      // ── SL Check ──────────────────────────────────────────────────
      if (sl && sl > 0) {
        const slBreached = isLong ? livePrice <= sl : livePrice >= sl;
        if (slBreached) {
          await closePaperPosition(pos, livePrice, "STOP_LOSS_HIT");
          continue; // Position closed, skip TP check
        }
      }

      // ── TP Check ─────────────────────────────────────────────────
      if (tp && tp > 0) {
        const tpHit = isLong ? livePrice >= tp : livePrice <= tp;
        if (tpHit) {
          await closePaperPosition(pos, livePrice, "TAKE_PROFIT_HIT");
          continue;
        }
      }

      // ── Trailing Stop: ratchet SL upward for LONG (downward for SHORT) ──
      if (pos.meta?.trailingStop && pos.meta.trailingStop > 0) {
        const trailSl = pos.meta.trailingStop;
        const trailBreached = isLong ? livePrice <= trailSl : livePrice >= trailSl;
        if (trailBreached) {
          await closePaperPosition(pos, livePrice, "TRAILING_STOP_HIT");
          continue;
        }

        // Ratchet: move trailing stop up with price (LONG) / down (SHORT)
        const atrEst = pos.entryPrice * 0.012; // ~1.2% ATR estimate
        const newTrail = isLong
          ? Math.max(trailSl, livePrice - atrEst)
          : Math.min(trailSl, livePrice + atrEst);

        if (newTrail !== trailSl) {
          const updated: paper.PaperPosition = {
            ...pos,
            meta: { ...(pos.meta || {}), trailingStop: newTrail },
          };
          paper.setPosition(pos.userId, symbol, "PAPER", updated);
        }
      }

      // ── GAP #17 FIX: 8h Paper Funding Fee Settlement ────────────────────
      if (isFutures) {
        const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
        const lastFundingTime = pos.meta?.lastFundingAppliedAt || pos.meta?.openedAt || Date.now();
        const now = Date.now();
        if (now - lastFundingTime >= EIGHT_HOURS_MS) {
          try {
            const fundingRate = await getLatestFundingRate(symbol);
            const notional = pos.quantity * livePrice;
            const fundingCost = notional * fundingRate;
            // If Long and rate > 0: Long pays funding (-fundingCost)
            // If Short and rate > 0: Short receives funding (+fundingCost)
            const netCashFlow = isLong ? -fundingCost : fundingCost;

            const wallet = paper.getWallet(pos.userId, "PAPER", "FUTURES");
            const currentUsdt = wallet.get("USDT") ?? 0;
            await paper.setWalletBalance(pos.userId, "PAPER", "USDT", Math.max(0, currentUsdt + netCashFlow), "FUTURES");

            const updatedMeta = {
              ...(pos.meta || {}),
              lastFundingAppliedAt: now,
              accruedFunding: (pos.meta?.accruedFunding || 0) + netCashFlow
            };
            paper.setPosition(pos.userId, symbol, "PAPER", { ...pos, meta: updatedMeta });
            log(`8h Funding settled for ${symbol} (${pos.side}): ${netCashFlow >= 0 ? "+" : ""}$${netCashFlow.toFixed(4)} USDT (rate: ${(fundingRate * 100).toFixed(4)}%)`);
          } catch (fundErr: any) {
            log(`Funding settlement error for ${symbol}: ${fundErr.message}`);
          }
        }
      }
    }
  } catch (err: any) {
    log(`Monitor cycle error: ${err.message}`);
  }
}

export function startManualSLTPMonitor(intervalMs = 30_000): void {
  if (_running) return;
  _running = true;
  log(`Started — checking all open positions every ${intervalMs / 1000}s`);
  // Run immediately, then on interval
  void runMonitorCycle();
  _interval = setInterval(() => void runMonitorCycle(), intervalMs);
}

export function stopManualSLTPMonitor(): void {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  _running = false;
  log("Stopped.");
}
