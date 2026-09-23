/**
 * Latest real option quotes from Angel One, keyed by contract token. Filled by
 * the price feed (FULL mode: LTP, OI, volume, best bid/ask); read synchronously
 * by OptionChainService so entry pricing, the exit monitor and the option
 * chain all use exchange data when it's fresh.
 */
import { IndianMarketHours } from "../../indianMarketHours.js";

// In session quotes refresh every ~5s; off-hours every 2 min on frozen
// premiums, so a quote stays usable for longer instead of lapsing between polls.
const OPEN_FRESH_MS = 30_000;
const CLOSED_FRESH_MS = 10 * 60_000;
const freshMs = () => (IndianMarketHours.getSessionStatus().isOpen ? OPEN_FRESH_MS : CLOSED_FRESH_MS);

export interface OptionQuote {
  ltp: number;
  oi: number;
  /** OI at the first quote seen this IST day (Angel's quote API has no previous OI). */
  dayOpenOi: number;
  volume: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  at: number;
}

const quotes = new Map<string, OptionQuote>();
const dayOpenOi = new Map<string, { day: string; oi: number }>();
const istDay = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export function setOptionQuote(
  token: string,
  q: number | { ltp: number; oi?: number; volume?: number; bid?: number; ask?: number; bidQty?: number; askQty?: number },
): void {
  const d = typeof q === "number" ? { ltp: q } : q;
  if (!(d.ltp > 0)) return;
  const oi = Number(d.oi) || 0;
  const day = istDay();
  const open = dayOpenOi.get(token);
  if (!open || open.day !== day) dayOpenOi.set(token, { day, oi });
  quotes.set(token, {
    ltp: d.ltp,
    oi,
    dayOpenOi: dayOpenOi.get(token)!.oi,
    volume: Number(d.volume) || 0,
    bid: Number(d.bid) || 0,
    ask: Number(d.ask) || 0,
    bidQty: Number(d.bidQty) || 0,
    askQty: Number(d.askQty) || 0,
    at: Date.now(),
  });
}

export function getFreshOptionQuote(token: string | undefined): OptionQuote | undefined {
  if (!token) return undefined;
  const q = quotes.get(token);
  return q && Date.now() - q.at < freshMs() ? q : undefined;
}

export function getFreshOptionLtp(token: string | undefined): number | undefined {
  return getFreshOptionQuote(token)?.ltp;
}

export function freshOptionQuoteCount(): number {
  const now = Date.now();
  const max = freshMs();
  let n = 0;
  for (const q of quotes.values()) if (now - q.at < max) n++;
  return n;
}
