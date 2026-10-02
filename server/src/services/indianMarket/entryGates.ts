/**
 * Pre-entry gates shared by the auto-trader (via IndianRiskManager.validateTrade)
 * and the manual /execute and /execute-strategy routes. NEW entries only —
 * square-off / close paths never call these.
 */
import { ExchangeCalendar } from "./exchangeCalendar.js";
import { expiryDateOfTrade } from "./expiryFromSymbol.js";

type Gate = { ok: true } | { ok: false; reason: string };

/** Blocks NEW option entries whose contract expires today (IST) unless INDIA_ALLOW_EXPIRY_DAY_ENTRIES=true. */
export function expiryDayEntryGate(
  trade: { instrument?: string; symbol?: string; expiry?: string; legs?: Array<{ instrumentType?: string; expiry?: string; symbol?: string; tradingSymbol?: string }> },
  now: Date = new Date(),
): Gate {
  if (String(process.env.INDIA_ALLOW_EXPIRY_DAY_ENTRIES).toLowerCase() === "true") return { ok: true };
  const legs = trade.legs ?? [];
  const isOption = trade.instrument === "CE" || trade.instrument === "PE" || legs.some((l) => l.instrumentType === "CE" || l.instrumentType === "PE");
  if (!isOption) return { ok: true };
  const dates = [trade.expiry, ...legs.map((l) => l.expiry), expiryDateOfTrade(trade)].filter((d): d is string => !!d).map((d) => String(d).slice(0, 10));
  const today = ExchangeCalendar.formatDateStr(ExchangeCalendar.toIST(now));
  if (dates.includes(today)) {
    return { ok: false, reason: `EXPIRY_DAY_ENTRY_BLOCKED: contract expires today (${today} IST); new option entries on expiry day are disabled (set INDIA_ALLOW_EXPIRY_DAY_ENTRIES=true to override)` };
  }
  return { ok: true };
}

export function offHoursManualAllowed(): boolean {
  return String(process.env.INDIA_ALLOW_OFF_HOURS_MANUAL).toLowerCase() === "true";
}

/** Manual NEW entries need an open NSE session (09:15-15:30 IST, trading day) unless INDIA_ALLOW_OFF_HOURS_MANUAL=true. */
export function manualSessionGate(now: Date = new Date()): Gate {
  if (String(process.env.INDIA_ALLOW_OFF_HOURS_MANUAL).toLowerCase() === "true") return { ok: true };
  const s = ExchangeCalendar.getSessionStatus(now);
  if (s.isOpen) return { ok: true };
  return { ok: false, reason: `MARKET_CLOSED: ${s.reason}. New orders are only accepted 09:15-15:30 IST on trading days (set INDIA_ALLOW_OFF_HOURS_MANUAL=true to override)` };
}
