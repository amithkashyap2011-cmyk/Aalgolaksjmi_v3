/**
 * Expiry date of an option position, for display.
 *
 * Contract symbols look like KOTAKBANK27OCT26410CE / NIFTY06OCT2622700CE:
 * <underlying><DD><MON><YY><strike><CE|PE>. Multi-leg spreads carry the contract
 * symbols on their legs, not on the trade itself.
 */
const MONTHS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const CONTRACT = /(\d{2})([A-Z]{3})(\d{2})\d+(?:CE|PE)$/;

function parse(symbol: unknown): string | null {
  const m = CONTRACT.exec(String(symbol ?? "").toUpperCase());
  if (!m) return null;
  const mon = MONTHS[m[2]];
  if (!mon) return null;
  const day = Number(m[1]);
  if (day < 1 || day > 31) return null;
  return `20${m[3]}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** ISO date (YYYY-MM-DD) of the earliest expiry among the trade's contracts, or null for cash equity. */
export function expiryDateOfTrade(t: { symbol?: string; legs?: Array<{ symbol?: string; tradingSymbol?: string }> }): string | null {
  const found = [parse(t.symbol), ...(t.legs ?? []).map((l) => parse(l.symbol ?? l.tradingSymbol))].filter(Boolean) as string[];
  return found.length ? found.sort()[0] : null;
}
