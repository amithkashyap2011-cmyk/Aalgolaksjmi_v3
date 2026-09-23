/**
 * ═══════════════════════════════════════════════════════════════════
 *  Indian Market Real-Time Pricing & Instrument Valuation Service
 * ═══════════════════════════════════════════════════════════════════
 *  Provides canonical pricing resolution for Indian equities, indices,
 *  futures, and options without pulling heavy auto-trader daemon dependencies.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { INDIAN_SYMBOLS, SUPPORTED_INDIAN_SYMBOLS } from "../../config/indianSymbols.js";
import { IndianMarketHours } from "../indianMarketHours.js";
import { OptionChainService } from "./optionChainService.js";
import { InstrumentMaster } from "./instrumentMaster.js";

// ─── Account type domain classification ─────────────────────────────────────
export const INDIAN_ACCOUNT_TYPES = new Set([
  "INDIAN_NSE",
  "INDIAN_BSE",
  "INDIAN_NIFTY50",
  "INDIAN_FNO",
  "INDIAN_EQUITY",
]);

export function isIndianTrade(t: any): boolean {
  if (!t) return false;
  if (t.accountType && INDIAN_ACCOUNT_TYPES.has(t.accountType)) return true;
  if (t.symbol && SUPPORTED_INDIAN_SYMBOLS.includes(t.symbol)) return true;
  return false;
}

export function isCryptoTrade(t: any): boolean {
  return !INDIAN_ACCOUNT_TYPES.has(t.accountType);
}

// Mock baseline tickers shared across Indian Market subsystems
export const MOCK_LIVE_INDIAN_TIKERS: Record<
  string,
  { ltp: number; open: number; high: number; low: number; volume: number; rsi14: number; adx14: number; prevClose?: number }
> = {
  "NIFTY50":   { ltp: 24538.50, open: 24371.80, high: 24590.00, low: 24350.10, volume: 1850000, rsi14: 61.2, adx14: 28.5 },
  "BANKNIFTY": { ltp: 52165.20, open: 51715.40, high: 52310.00, low: 51680.00, volume: 940000,  rsi14: 64.8, adx14: 31.2 },
  "SENSEX":    { ltp: 80425.40, open: 79950.50, high: 80600.00, low: 79900.00, volume: 2100000, rsi14: 59.4, adx14: 26.8 },
  "RELIANCE":  { ltp: 2988.20,  open: 2952.90,  high: 2998.00,  low: 2948.00,  volume: 4200000, rsi14: 66.5, adx14: 32.1 },
  "TCS":       { ltp: 4212.80,  open: 4222.55,  high: 4235.00,  low: 4195.00,  volume: 1100000, rsi14: 47.8, adx14: 18.4 },
  "HDFCBANK":  { ltp: 1648.10,  open: 1627.60,  high: 1652.00,  low: 1622.00,  volume: 8500000, rsi14: 63.4, adx14: 29.8 },
  "INFY":      { ltp: 1823.40,  open: 1805.80,  high: 1832.00,  low: 1802.00,  volume: 3100000, rsi14: 58.9, adx14: 24.6 },
  "ICICIBANK": { ltp: 1242.75,  open: 1228.80,  high: 1246.00,  low: 1225.00,  volume: 5400000, rsi14: 62.1, adx14: 27.9 },
  "TATASTEEL": { ltp: 168.90,   open: 170.30,   high: 171.20,   low: 167.80,   volume: 12800000,rsi14: 38.2, adx14: 22.4 },
  "SBIN":      { ltp: 847.20,   open: 838.20,   high: 852.00,   low: 836.00,   volume: 7200000, rsi14: 65.4, adx14: 30.2 },
  "AXISBANK":  { ltp: 1178.10,  open: 1162.00,  high: 1182.00,  low: 1158.00,  volume: 4500000, rsi14: 64.2, adx14: 28.6 },
  "KOTAKBANK": { ltp: 1783.50,  open: 1765.00,  high: 1792.00,  low: 1760.00,  volume: 3800000, rsi14: 61.8, adx14: 26.4 },
  "BHARTIARTL":{ ltp: 1488.60,  open: 1472.00,  high: 1495.00,  low: 1468.00,  volume: 4800000, rsi14: 67.8, adx14: 33.1 },
};

// ─── Real quotes (Angel One) ─────────────────────────────────────────────────
// When the Angel One feed is up, each symbol's price comes from the exchange
// and the random-walk simulator leaves it alone; it only fills in for symbols
// with no quote in the last REAL_QUOTE_FRESH_MS (feed down / not configured).
const REAL_QUOTE_FRESH_MS = 60_000;
const realQuoteAt = new Map<string, number>();

export function applyRealQuote(
  symbol: string,
  q: { ltp: number; open: number; high: number; low: number; prevClose?: number; volume?: number },
): void {
  if (!(q.ltp > 0)) return;
  // Symbols with no simulated baseline (FINNIFTY, TATAMOTORS) get an entry from
  // the real quote instead of being dropped — the scan otherwise showed a
  // ₹1,000 placeholder for them.
  const t = (MOCK_LIVE_INDIAN_TIKERS[symbol] ??= { ltp: q.ltp, open: q.open, high: q.high, low: q.low, volume: 0, rsi14: 50, adx14: 20 });
  t.ltp = q.ltp;
  t.open = q.open;
  t.high = q.high;
  t.low = q.low;
  if (q.prevClose && q.prevClose > 0) t.prevClose = q.prevClose;
  if (q.volume && q.volume > 0) t.volume = q.volume;
  realQuoteAt.set(symbol, Date.now());
}

export function hasFreshRealQuote(symbol: string): boolean {
  return Date.now() - (realQuoteAt.get(symbol) ?? 0) < REAL_QUOTE_FRESH_MS;
}

// RSI/ADX from real Angel One candles. Until then the /ticks and /scan routes
// fill rsi14/adx14 with a sine wave — which the strategies were deciding on.
const REAL_INDICATORS_FRESH_MS = 40 * 60_000; // candles refresh every 5 min (30 off-hours)
const realIndicatorsAt = new Map<string, number>();

export function applyRealIndicators(symbol: string, ind: { rsi14?: number; adx14?: number }): void {
  const t = MOCK_LIVE_INDIAN_TIKERS[symbol];
  if (!t) return;
  if (ind.rsi14 !== undefined && Number.isFinite(ind.rsi14)) t.rsi14 = Number(ind.rsi14.toFixed(1));
  if (ind.adx14 !== undefined && Number.isFinite(ind.adx14)) t.adx14 = Number(ind.adx14.toFixed(1));
  realIndicatorsAt.set(symbol, Date.now());
}

export function hasFreshRealIndicators(symbol: string): boolean {
  return Date.now() - (realIndicatorsAt.get(symbol) ?? 0) < REAL_INDICATORS_FRESH_MS;
}

// ─── Simulated price persistence ────────────────────────────────────────────
// The simulated prices above live only in memory, so every restart (pm2,
// crash, deploy) snapped every symbol back to the hardcoded baseline. Open
// trades then saw a fake discontinuity — an INFY put "gained" 143% 8s after a
// reboot. The latest prices are saved each tick and restored at load; a save
// from an earlier IST day opens the new session at that last close.
const SIM_STATE_FILE = process.env.INDIAN_SIM_STATE_FILE
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../runtime/indian_sim_tickers.json");

function istDateKey(d: Date = new Date()): string {
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function restoreSimulatedTickers(file: string = SIM_STATE_FILE): number {
  let saved: { date?: string; tickers?: Record<string, any> };
  try {
    saved = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return 0; // first run or unreadable — keep the baseline
  }
  const sameDay = saved.date === istDateKey();
  let restored = 0;
  for (const [sym, data] of Object.entries(MOCK_LIVE_INDIAN_TIKERS)) {
    const s = saved.tickers?.[sym];
    if (!s || !(Number(s.ltp) > 0)) continue;
    const ltp = Number(s.ltp);
    data.ltp = ltp;
    if (sameDay) {
      data.open = Number(s.open) > 0 ? Number(s.open) : ltp;
      data.high = Math.max(Number(s.high) || ltp, ltp);
      data.low = Math.min(Number(s.low) || ltp, ltp);
      data.volume = Number(s.volume) > 0 ? Number(s.volume) : data.volume;
    } else {
      data.open = data.high = data.low = ltp; // new session opens at last close
    }
    restored++;
  }
  return restored;
}

export function persistSimulatedTickers(file: string = SIM_STATE_FILE): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ date: istDateKey(), savedAt: new Date().toISOString(), tickers: MOCK_LIVE_INDIAN_TIKERS }));
    fs.renameSync(tmp, file); // atomic swap so a crash mid-write can't corrupt the state
  } catch {
    // Persistence is best-effort; pricing keeps working in memory.
  }
}

if (process.env.NODE_ENV !== "test") {
  restoreSimulatedTickers();
}

// Realistic micro-tick simulation during active market sessions
if (typeof setInterval !== "undefined" && process.env.NODE_ENV !== "test") {
  let savedWhileClosed = false;
  const tickInterval = setInterval(() => {
    try {
      const session = IndianMarketHours.getSessionStatus();
      if (!session.isOpen) {
        // Prices are frozen off-hours; save once so the last close survives
        // an overnight restart, then stop writing until the next session.
        if (!savedWhileClosed) { persistSimulatedTickers(); savedWhileClosed = true; }
        return;
      }
      savedWhileClosed = false;

      for (const [sym, data] of Object.entries(MOCK_LIVE_INDIAN_TIKERS)) {
        if (hasFreshRealQuote(sym)) continue; // real exchange price — don't random-walk it
        // Uniform ±0.02% per 4s tick (sd ≈ 0.0118%) ≈ 14% annualised over a
        // 6.25h session — in line with NIFTY's real ~12-15%. The previous
        // 0.0015 scale was ~50% annualised and the -0.495 offset added a
        // ~4%/day upward bias; together they whipsawed option premiums
        // through SL/TP within seconds of entry.
        const drift = (Math.random() - 0.5) * 0.0004;
        const newLtp = Number((data.ltp * (1 + drift)).toFixed(2));
        data.ltp = newLtp;
        if (newLtp > data.high) data.high = newLtp;
        if (newLtp < data.low) data.low = newLtp;
        data.volume += Math.floor(Math.random() * 200) + 50;
      }
      persistSimulatedTickers();
    } catch {}
  }, 4000);

  if (typeof tickInterval.unref === "function") {
    tickInterval.unref();
  }
}

/**
 * Accurately resolves live market price for Indian equities, futures, and option contracts.
 */
export function resolveLivePriceForIndianTrade(t: any): number {
  if (!t) return 0;
  if (t.currentLtp && t.currentLtp > 0) return t.currentLtp;
  if (t.meta?.currentLtp && t.meta.currentLtp > 0) return t.meta.currentLtp;
  if (t.meta?.ltp && t.meta.ltp > 0) return t.meta.ltp;
  if (typeof t.symbol === "string" && MOCK_LIVE_INDIAN_TIKERS[t.symbol]?.ltp > 0) {
    return MOCK_LIVE_INDIAN_TIKERS[t.symbol].ltp;
  }

  const normUnderlying = InstrumentMaster.normalizeUnderlying(t.underlying || t.symbol || "NIFTY");

  // Multi-leg (spreads, straddles, condors): value = Σ BUY legs − Σ SELL legs
  // for a LONG/net-debit position, the negative for a SHORT/net-credit one —
  // the same convention the strategies use for entryPrice. This used to price
  // only legs[0] (or, with no legs stored, the underlying's spot price).
  if (Array.isArray(t.legs) && t.legs.length > 1) {
    const spotKey = normUnderlying === "NIFTY" ? "NIFTY50" : normUnderlying;
    const spot = MOCK_LIVE_INDIAN_TIKERS[spotKey]?.ltp;
    if (spot && spot > 0) {
      let net = 0;
      for (const leg of t.legs) {
        const px = OptionChainService.markPrice(normUnderlying as any, spot, Number(leg.strike), leg.instrumentType === "CE", leg.expiry || t.expiry);
        net += (leg.action === "SELL" ? -1 : 1) * px;
      }
      const isShort = t.position === "SHORT" || t.side === "SELL";
      return Number(Math.max(0.05, isShort ? -net : net).toFixed(2));
    }
  }

  const isOption = t.instrumentType === "CE" || t.instrumentType === "PE" ||
    (t.legs && t.legs.length > 0 && (t.legs[0].instrumentType === "CE" || t.legs[0].instrumentType === "PE")) ||
    (typeof t.symbol === "string" && (t.symbol.endsWith("CE") || t.symbol.endsWith("PE")));

  if (isOption) {
    const spotKey = normUnderlying === "NIFTY" ? "NIFTY50" : normUnderlying;
    const spotTicker = MOCK_LIVE_INDIAN_TIKERS[spotKey] || MOCK_LIVE_INDIAN_TIKERS["NIFTY50"] || { ltp: 24538.50 };
    const spotPrice = spotTicker.ltp;

    let strike = t.legs?.[0]?.strike;
    let optionType = t.legs?.[0]?.instrumentType || (t.symbol?.endsWith("PE") ? "PE" : "CE");

    if (!strike && typeof t.symbol === "string") {
      const match = t.symbol.match(/(\d+)(CE|PE)$/);
      if (match) {
        strike = parseInt(match[1], 10);
        optionType = match[2];
      }
    }

    if (strike) {
      // Same mark the entry was priced with (see OptionChainService.markPrice).
      const mark = OptionChainService.markPrice(normUnderlying as any, spotPrice, strike, optionType === "CE", t.legs?.[0]?.expiry || t.expiry);
      if (mark > 0) return mark;
    }
  }

  const spotKey = normUnderlying === "NIFTY" ? "NIFTY50" : normUnderlying;
  const liveTicker = MOCK_LIVE_INDIAN_TIKERS[t.symbol] || MOCK_LIVE_INDIAN_TIKERS[spotKey] || MOCK_LIVE_INDIAN_TIKERS[normUnderlying];
  if (liveTicker && liveTicker.ltp > 0) {
    return liveTicker.ltp;
  }

  return t.entryPrice || 0;
}
