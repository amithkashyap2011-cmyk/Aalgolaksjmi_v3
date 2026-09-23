/**
 * Real NSE/BSE prices from Angel One, replacing the simulated random walk.
 *
 * Polls one FULL-mode quote call for every tracked symbol (Angel allows ≤50
 * tokens per call) — every 3s in market hours, every 60s otherwise so the
 * frozen off-hours price is the real close. Each quote overwrites the shared
 * ticker; indianPricing's simulator skips drift for any symbol with a fresh
 * real quote, so it only fills in when the feed is down.
 */
import mongoose from "mongoose";
import { smartApi } from "./smartApiClient.js";
import { ANGEL_INSTRUMENTS, SYMBOL_BY_EXCHANGE_TOKEN } from "./instrumentTokens.js";
import { optionContracts, OPTION_UNDERLYINGS } from "./optionContracts.js";
import { setOptionQuote, freshOptionQuoteCount } from "./optionQuotes.js";
import { rsi, adx } from "./indicators.js";
import { applyRealQuote, applyRealIndicators, MOCK_LIVE_INDIAN_TIKERS } from "../indianPricing.js";
import { IndianMarketHours } from "../../indianMarketHours.js";

const OPEN_POLL_MS = 3_000;
const CLOSED_POLL_MS = 60_000;
const OPTION_OPEN_POLL_MS = 5_000;
const OPTION_CLOSED_POLL_MS = 120_000;
const INDICATOR_OPEN_POLL_MS = 5 * 60_000;
const INDICATOR_CLOSED_POLL_MS = 30 * 60_000;
const QUOTE_BATCH = 50; // Angel quote API limit per request

interface FeedStatus {
  running: boolean;
  source: "ANGEL_ONE" | "SIMULATED";
  lastQuoteAt?: string;
  symbolsLive: number;
  lastError?: string;
  contractsLoaded: boolean;
  optionQuotesLive: number;
  lastOptionQuoteAt?: string;
  optionError?: string;
  indicatorsLive: number;
  lastIndicatorsAt?: string;
  indicatorError?: string;
}

const status: FeedStatus = { running: false, source: "SIMULATED", symbolsLive: 0, contractsLoaded: false, optionQuotesLive: 0, indicatorsLive: 0 };

/** App underlying → spot ticker key. */
const SPOT_KEY: Record<string, string> = { NIFTY: "NIFTY50" };
const INDEXES = new Set(["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"]);
let timer: NodeJS.Timeout | null = null;

export function getAngelFeedStatus(): FeedStatus {
  return { ...status, optionQuotesLive: freshOptionQuoteCount() };
}

// ─── Option quotes ───────────────────────────────────────────────────────────
async function openTradeOptionTokens(): Promise<Set<string>> {
  const tokens = new Set<string>();
  if (mongoose.connection.readyState !== 1) return tokens;
  const open = await mongoose.connection.db!.collection("trades")
    .find({ status: "OPEN", accountType: { $in: ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"] } }, { projection: { legs: 1 } })
    .toArray();
  for (const t of open) for (const leg of (t as any).legs ?? []) {
    if (leg?.token && optionContracts.getByToken(String(leg.token))) tokens.add(String(leg.token));
  }
  return tokens;
}

async function pollOptions(): Promise<void> {
  await optionContracts.refreshIfStale();
  status.contractsLoaded = optionContracts.isLoaded();
  const tokens = await openTradeOptionTokens();
  for (const und of OPTION_UNDERLYINGS) {
    const spot = MOCK_LIVE_INDIAN_TIKERS[SPOT_KEY[und] ?? und]?.ltp;
    if (!spot) continue;
    for (const c of optionContracts.getAtmWindow(und, spot, INDEXES.has(und) ? 10 : 5)) tokens.add(c.token);
  }
  const all = [...tokens];
  for (let i = 0; i < all.length; i += QUOTE_BATCH) {
    const exchangeTokens: Record<string, string[]> = {};
    for (const tok of all.slice(i, i + QUOTE_BATCH)) {
      const c = optionContracts.getByToken(tok);
      if (c) (exchangeTokens[c.exchange] ??= []).push(tok);
    }
    const data = await smartApi.getQuotes("LTP", exchangeTokens);
    for (const q of data?.fetched ?? []) setOptionQuote(String(q.symbolToken), Number(q.ltp));
  }
  status.lastOptionQuoteAt = new Date().toISOString();
  status.optionError = undefined;
}

// ─── Indicators from real candles ───────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
const angelTime = (d: Date) => {
  const ist = new Date(d.getTime() + 5.5 * 3600_000); // Angel expects IST wall time
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
};

async function pollIndicators(): Promise<void> {
  const to = new Date();
  const from = new Date(to.getTime() - 5 * 86400_000); // ~3 sessions of 5m bars, enough for ADX14
  let ok = 0;
  const failed: string[] = [];
  const fetchOne = async (sym: string) => {
    const inst = ANGEL_INSTRUMENTS[sym];
    const bars = await smartApi.getCandles({ exchange: inst.exchange, symboltoken: inst.token, interval: "FIVE_MINUTE", fromdate: angelTime(from), todate: angelTime(to) });
    if (Array.isArray(bars) && bars.length > 30) {
      const highs = bars.map((b) => Number(b[2]));
      const lows = bars.map((b) => Number(b[3]));
      const closes = bars.map((b) => Number(b[4]));
      applyRealIndicators(sym, { rsi14: rsi(closes), adx14: adx(highs, lows, closes) });
      ok++;
    }
  };
  // Historical data is rate-limited (403 when exceeded): space calls ~1/s and
  // retry any failures once after a pause, rather than hammering the API.
  for (const sym of Object.keys(ANGEL_INSTRUMENTS)) {
    try { await fetchOne(sym); } catch { failed.push(sym); }
    await new Promise((r) => setTimeout(r, 900));
  }
  if (failed.length) {
    await new Promise((r) => setTimeout(r, 5_000));
    for (const sym of failed) {
      try { await fetchOne(sym); } catch (err: any) { status.indicatorError = `${sym}: ${err?.message || err}`; }
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }
  status.indicatorsLive = ok;
  status.lastIndicatorsAt = new Date().toISOString();
  if (ok === Object.keys(ANGEL_INSTRUMENTS).length) status.indicatorError = undefined;
}

function loop(job: () => Promise<void>, openMs: number, closedMs: number, onError: (e: any) => void): void {
  const run = async () => {
    try { await job(); } catch (e) { onError(e); }
    if (!status.running) return;
    const t = setTimeout(run, IndianMarketHours.getSessionStatus().isOpen ? openMs : closedMs);
    t.unref?.();
  };
  run();
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
  try {
    await optionContracts.load();
    status.contractsLoaded = optionContracts.isLoaded();
  } catch (e: any) {
    status.optionError = `contracts: ${e?.message || e}`;
  }
  loop(pollOptions, OPTION_OPEN_POLL_MS, OPTION_CLOSED_POLL_MS, (e) => { status.optionError = e?.message || String(e); });
  loop(pollIndicators, INDICATOR_OPEN_POLL_MS, INDICATOR_CLOSED_POLL_MS, (e) => { status.indicatorError = e?.message || String(e); });
}

export function stopAngelPriceFeed(): void {
  status.running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
