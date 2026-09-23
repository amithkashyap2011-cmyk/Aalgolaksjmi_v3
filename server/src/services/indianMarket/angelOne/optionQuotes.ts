/**
 * Latest real option LTPs from Angel One, keyed by contract token. Filled by
 * the price feed; read synchronously by OptionChainService.markPrice so both
 * entry pricing and the exit monitor use the exchange premium when it's fresh.
 */
import { IndianMarketHours } from "../../indianMarketHours.js";

// In session quotes refresh every ~5s; off-hours every 2 min on frozen
// premiums, so a quote stays usable for longer instead of lapsing between polls.
const OPEN_FRESH_MS = 30_000;
const CLOSED_FRESH_MS = 10 * 60_000;
const freshMs = () => (IndianMarketHours.getSessionStatus().isOpen ? OPEN_FRESH_MS : CLOSED_FRESH_MS);
const quotes = new Map<string, { ltp: number; at: number }>();

export function setOptionQuote(token: string, ltp: number): void {
  if (ltp > 0) quotes.set(token, { ltp, at: Date.now() });
}

export function getFreshOptionLtp(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const q = quotes.get(token);
  return q && Date.now() - q.at < freshMs() ? q.ltp : undefined;
}

export function freshOptionQuoteCount(): number {
  const now = Date.now();
  const max = freshMs();
  let n = 0;
  for (const q of quotes.values()) if (now - q.at < max) n++;
  return n;
}
