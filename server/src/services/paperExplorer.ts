/**
 * PAPER exploration trader (2026-09-24).
 *
 * The live gates (adaptive ~56% threshold, Bayesian conviction, EV, quality)
 * keep crypto on HOLD almost all the time, and backtests show the current
 * signals have no edge after fees — so the gates are right for real money.
 * This runs a small, clearly-tagged PAPER-only experiment on weaker signals
 * to build a live, measurable record instead of relying on backtests:
 *
 *   - reads the engine's latest per-symbol probabilities (live-decisions)
 *   - enters when a side has ≥ 45% and leads the other side by ≥ 10 points
 *     (BUY → PAPER Spot, SELL → PAPER Futures short)
 *   - small size (5% of that PAPER balance, min $6), ≤ 3 open, 1 per symbol,
 *     30-min cooldown per symbol after an exploration trade closes
 *   - orders go through the normal PAPER /trading/place-order path (server-
 *     side stop/target defaults and validation), tagged entrySource
 *     "PAPER_EXPLORATION" so results are reported separately
 *   - closes at market after 2 hours if neither stop nor target was hit
 *     (EXPLORATION_TIME_EXIT): the signals predict a ~25-min move, and trades
 *     waiting days on wider levels kept all 3 slots taken (2026-09-25)
 *   - never touches LIVE; pauses whenever the auto-trader is PAUSED / KILLED
 *
 * Disable with PAPER_EXPLORATION=false.
 */
import mongoose from "mongoose";
import { Trade } from "../models/Trade.js";
import { UITelemetryService } from "./uiTelemetry.js";
import { getTradingControlStatus } from "./tradingControlStatus.js";
import { getTickerPrice } from "./binanceService.js";
import * as paper from "./paperState.js";
import { DEMO_USER_ID } from "../middleware/auth.js";

export const EXPLORATION_SOURCE = "PAPER_EXPLORATION";
const MIN_PROB = 0.45;
const MIN_LEAD = 0.10;
const MAX_OPEN = 3;
const COOLDOWN_MS = 30 * 60_000;
const DECISION_MAX_AGE_MS = 3 * 60_000;
const SIZE_FRACTION = 0.05;
const MIN_NOTIONAL = 6;
const MAX_HOLD_MS = 2 * 60 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
const lastSkip = new Map<string, string>();

function log(msg: string) {
  console.log(`[PAPER_EXPLORATION] ${msg}`);
}

export async function explorationTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (getTradingControlStatus() !== "RUNNING") return;
    if (mongoose.connection.readyState !== 1) return;

    const userId = DEMO_USER_ID;
    const port = Number(process.env.PORT) || 9991;
    const openAll = await Trade.find({ userId, entrySource: EXPLORATION_SOURCE, status: "OPEN" }, { symbol: 1, openedAt: 1 }).lean();

    // Time exit: free the slot once the trade has outlived its signal.
    const expired = new Set<string>();
    for (const t of openAll as any[]) {
      if (!t.openedAt || Date.now() - new Date(t.openedAt).getTime() < MAX_HOLD_MS) continue;
      const res = await fetch(`http://127.0.0.1:${port}/trading/close-position`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId: String(t._id), mode: "PAPER", reason: "EXPLORATION_TIME_EXIT" }),
        signal: AbortSignal.timeout(20_000),
      }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) }) as any);
      const body: any = await res.json().catch(() => ({}));
      if (res.ok) {
        expired.add(String(t._id));
        log(`time exit ${t.symbol} after ${((Date.now() - new Date(t.openedAt).getTime()) / 3_600_000).toFixed(1)}h (pnl ${Number(body?.pnl ?? body?.trade?.pnl ?? 0).toFixed(4)})`);
      } else {
        log(`time exit failed for ${t.symbol}: ${body?.error || res.status}`);
      }
    }
    const open = (openAll as any[]).filter((t) => !expired.has(String(t._id)));
    if (open.length >= MAX_OPEN) return;
    const openSymbols = new Set(open.map((t: any) => t.symbol));
    const recent = await Trade.find(
      { userId, entrySource: EXPLORATION_SOURCE, closedAt: { $gte: new Date(Date.now() - COOLDOWN_MS) } },
      { symbol: 1 },
    ).lean();
    const cooling = new Set(recent.map((t: any) => t.symbol));

    const now = Date.now();
    const candidates = Object.values(UITelemetryService.getLatestDecisions())
      .filter((d) => now - d.at < DECISION_MAX_AGE_MS)
      .map((d) => {
        const buy = d.buyProbability ?? 0, sell = d.sellProbability ?? 0;
        const side = buy >= MIN_PROB && buy - sell >= MIN_LEAD ? "BUY" : sell >= MIN_PROB && sell - buy >= MIN_LEAD ? "SELL" : null;
        return { d, side, strength: Math.max(buy, sell) };
      })
      .filter((c) => c.side && !openSymbols.has(c.d.symbol) && !cooling.has(c.d.symbol))
      .sort((a, b) => b.strength - a.strength);

    let slots = MAX_OPEN - open.length;
    for (const c of candidates) {
      if (slots <= 0) break;
      const accountType = c.side === "BUY" ? "SPOT" : "FUTURES";
      const balance = paper.getWallet(userId, "PAPER", accountType).get("USDT") ?? 0;
      const notional = Math.max(MIN_NOTIONAL, balance * SIZE_FRACTION);
      if (balance < notional) {
        if (lastSkip.get(accountType) !== "balance") log(`skip: PAPER ${accountType} balance $${balance.toFixed(2)} below $${notional.toFixed(2)}`);
        lastSkip.set(accountType, "balance");
        continue;
      }
      const price = await getTickerPrice(c.d.symbol, accountType === "FUTURES").catch(() => 0);
      if (!(price > 0)) continue;
      const quantity = Number((notional / price).toPrecision(6));
      // Normal PAPER order path from this machine (auth: local operator).
      const res = await fetch(`http://127.0.0.1:${port}/trading/place-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: c.d.symbol, side: c.side, quantity, mode: "PAPER", accountType, leverage: 1, strategy: EXPLORATION_SOURCE }),
        signal: AbortSignal.timeout(20_000),
      }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) }) as any);
      const body: any = await res.json().catch(() => ({}));
      if (res.ok) {
        slots--;
        log(`opened ${c.side} ${c.d.symbol} ~$${notional.toFixed(2)} (buy ${(c.d.buyProbability! * 100).toFixed(1)}% / sell ${(c.d.sellProbability! * 100).toFixed(1)}%)`);
      } else {
        log(`order refused for ${c.d.symbol}: ${body?.error || res.status}`);
      }
    }
  } catch (e: any) {
    log(`tick error: ${e?.message || e}`);
  } finally {
    running = false;
  }
}

export function startPaperExplorer(intervalMs = 60_000): void {
  if (timer || process.env.NODE_ENV === "test" || process.env.PAPER_EXPLORATION === "false") return;
  timer = setInterval(() => { explorationTick(); }, intervalMs);
  timer.unref?.();
  log(`started (≥${MIN_PROB * 100}% & ${MIN_LEAD * 100}-pt lead, max ${MAX_OPEN} open, ${SIZE_FRACTION * 100}% size, PAPER only)`);
}
