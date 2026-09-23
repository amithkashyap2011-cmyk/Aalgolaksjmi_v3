/**
 * Real NSE/BSE prices from Angel One, replacing the simulated random walk.
 *
 * Polls one FULL-mode quote call for every tracked symbol (Angel allows ≤50
 * tokens per call) — every 3s in market hours, every 60s otherwise so the
 * frozen off-hours price is the real close. Each quote overwrites the shared
 * ticker; indianPricing's simulator skips drift for any symbol with a fresh
 * real quote, so it only fills in when the feed is down.
 */
import { smartApi } from "./smartApiClient.js";
import { ANGEL_INSTRUMENTS, SYMBOL_BY_EXCHANGE_TOKEN } from "./instrumentTokens.js";
import { applyRealQuote } from "../indianPricing.js";
import { IndianMarketHours } from "../../indianMarketHours.js";

const OPEN_POLL_MS = 3_000;
const CLOSED_POLL_MS = 60_000;

interface FeedStatus {
  running: boolean;
  source: "ANGEL_ONE" | "SIMULATED";
  lastQuoteAt?: string;
  symbolsLive: number;
  lastError?: string;
}

const status: FeedStatus = { running: false, source: "SIMULATED", symbolsLive: 0 };
let timer: NodeJS.Timeout | null = null;

export function getAngelFeedStatus(): FeedStatus {
  return { ...status };
}

async function pollOnce(): Promise<void> {
  const exchangeTokens: Record<string, string[]> = {};
  for (const inst of Object.values(ANGEL_INSTRUMENTS)) {
    (exchangeTokens[inst.exchange] ??= []).push(inst.token);
  }
  const data = await smartApi.getQuotes("FULL", exchangeTokens);
  let live = 0;
  for (const q of data?.fetched ?? []) {
    const sym = SYMBOL_BY_EXCHANGE_TOKEN[`${q.exchange}:${q.symbolToken}`];
    const ltp = Number(q.ltp);
    if (!sym || !(ltp > 0)) continue;
    applyRealQuote(sym, {
      ltp,
      open: Number(q.open) || ltp,
      high: Number(q.high) || ltp,
      low: Number(q.low) || ltp,
      prevClose: Number(q.close) || undefined,
      volume: Number(q.tradeVolume) || undefined,
    });
    live++;
  }
  status.source = live > 0 ? "ANGEL_ONE" : "SIMULATED";
  status.symbolsLive = live;
  status.lastQuoteAt = new Date().toISOString();
  status.lastError = undefined;
}

function schedule(): void {
  const open = IndianMarketHours.getSessionStatus().isOpen;
  timer = setTimeout(tick, open ? OPEN_POLL_MS : CLOSED_POLL_MS);
  timer.unref?.();
}

async function tick(): Promise<void> {
  try {
    await pollOnce();
  } catch (err: any) {
    status.source = "SIMULATED";
    status.symbolsLive = 0;
    status.lastError = err?.message || String(err);
  } finally {
    if (status.running) schedule();
  }
}

/** Starts the feed if Angel One credentials are configured; otherwise stays simulated. */
export async function startAngelPriceFeed(): Promise<void> {
  if (status.running || process.env.NODE_ENV === "test") return;
  if (!(await smartApi.isConfigured())) {
    status.lastError = "Angel One credentials not configured — using simulated prices";
    return;
  }
  status.running = true;
  await tick();
}

export function stopAngelPriceFeed(): void {
  status.running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
