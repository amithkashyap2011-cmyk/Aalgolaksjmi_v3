/**
 * Positional (multi-day) orders for Indian paper trading.
 *
 * INTRADAY (MIS): squared off by the 15:15 IST daemon, stops sized to the time left today.
 * POSITIONAL: options book as NRML, cash equity as CNC — both skipped by the square-off
 * daemon. Because the stop/target distances an order arrives with are intraday-sized, they
 * are widened; the position takes no leverage; and option positions exit automatically
 * before expiry (an option carried into its last days loses value fast and can expire
 * worthless or get assigned).
 */
import { ExchangeCalendar } from "./exchangeCalendar.js";

export type Period = "INTRADAY" | "POSITIONAL";
export type Product = "MIS" | "CNC" | "NRML";

export const POSITIONAL_WIDEN_FACTOR = 2.5;
/** Minimum weekdays that must remain before expiry to open a positional option position. */
export const MIN_DAYS_BEFORE_EXPIRY = 3;
/** Positional option positions are closed this many weekdays before expiry (15:15 IST). */
export const EXIT_DAYS_BEFORE_EXPIRY = 2;
/** A long option's widened stop never risks more than this fraction of the premium. */
const MAX_OPTION_SL_FRACTION = 0.5;

export function resolvePeriod(x: unknown): Period {
  return String(x ?? "").toUpperCase() === "POSITIONAL" ? "POSITIONAL" : "INTRADAY";
}

export function productFor(period: Period, isOption: boolean): Product {
  if (period === "INTRADAY") return "MIS";
  return isOption ? "NRML" : "CNC";
}

/** Multiplies the stop and target distances (longs and shorts), keeping direction. */
export function widenStops(i: { isLong: boolean; entry: number; sl: number; tp: number; isOption: boolean; factor?: number }): { sl: number; tp: number } {
  const f = i.factor ?? POSITIONAL_WIDEN_FACTOR;
  const dir = i.isLong ? 1 : -1;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let slDist = Math.abs(i.entry - i.sl) * f;
  const tpDist = Math.abs(i.tp - i.entry) * f;
  if (i.isOption && i.isLong) slDist = Math.min(slDist, i.entry * MAX_OPTION_SL_FRACTION);
  return { sl: round2(i.entry - dir * slDist), tp: round2(i.entry + dir * tpDist) };
}

const IST_MS = 5.5 * 3_600_000;

/** The date `days` trading days (weekends and NSE holidays skipped) before `iso` (YYYY-MM-DD). */
function weekdaysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const dow = d.getUTCDay();
    // 06:30Z = 12:00 IST, the same calendar day for the IST holiday lookup.
    const isHoliday = ExchangeCalendar.isHoliday(new Date(`${d.toISOString().slice(0, 10)}T06:30:00Z`));
    if (dow !== 0 && dow !== 6 && !isHoliday) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** ISO instant (15:15 IST) by which a positional option position must be closed, or null for equity. */
export function exitDeadline(expiryDate: string | null): string | null {
  if (!expiryDate) return null;
  const day = weekdaysBefore(expiryDate, EXIT_DAYS_BEFORE_EXPIRY);
  return new Date(new Date(`${day}T15:15:00Z`).getTime() - IST_MS).toISOString();
}

/** Positional option positions need room before expiry: today must be at least MIN_DAYS_BEFORE_EXPIRY weekdays ahead of it. */
export function positionalAllowed(expiryDate: string | null, now: number = Date.now()): { ok: true } | { ok: false; reason: string } {
  if (!expiryDate) return { ok: true };
  const todayIst = new Date(now + IST_MS).toISOString().slice(0, 10);
  if (todayIst <= weekdaysBefore(expiryDate, MIN_DAYS_BEFORE_EXPIRY)) return { ok: true };
  return { ok: false, reason: `POSITIONAL_TOO_CLOSE_TO_EXPIRY: expiry ${expiryDate} leaves fewer than ${MIN_DAYS_BEFORE_EXPIRY} trading days — use Intraday or a later expiry` };
}
