/**
 * Dynamic exits for the Indian paper/auto-pilot monitor.
 *
 *  - stockTrail: trailing stop for cash equities. The option tiers in
 *    autoPilotStateMachine trigger on +25% … +100% PREMIUM gains, which a stock never
 *    makes intraday, so a stock's stop and target stayed fixed. These tiers are in
 *    R multiples instead (R = the initial stop distance).
 *  - extendTarget: dynamic profit. Instead of selling at the first touch of the target, once price is
 *    within 10% of it the target is raised by half its original distance (max 3 times) and the stop
 *    is pulled up to lock half the open gain, so a strong move can run while a reversal still exits in profit.
 *
 * Both only ever move levels in the trade's favour. Pure functions — the monitor persists the result.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface StockTrailInput {
  isLong: boolean;
  entry: number;
  sl: number;
  initialSl: number;
  highest: number;
  lowest: number;
}

/** Returns a tighter stop + stage name, or null when no tier applies / it would not tighten. */
export function stockTrail(i: StockTrailInput): { sl: number; stage: string } | null {
  const R = i.isLong ? i.entry - i.initialSl : i.initialSl - i.entry;
  if (!(R > 0) || !(i.entry > 0)) return null;
  const peak = i.isLong ? i.highest - i.entry : i.entry - i.lowest;
  const peakR = peak / R;
  let lockGain = -1;
  let stage = "";
  if (peakR >= 2) { lockGain = peak * 0.6; stage = "STOCK_TRAIL_60PCT"; }
  else if (peakR >= 1.25) { lockGain = 0.5 * R; stage = "STOCK_LOCK_0_5R"; }
  else if (peakR >= 0.75) { lockGain = 0.1 * R; stage = "STOCK_BREAKEVEN"; }
  if (lockGain < 0) return null;
  const candidate = round2(i.isLong ? i.entry + lockGain : i.entry - lockGain);
  const tighter = i.isLong ? candidate > i.sl : candidate < i.sl;
  return tighter ? { sl: candidate, stage } : null;
}

export const MAX_TARGET_EXTENSIONS = 3;
const APPROACH = 0.9;   // extend once price covers 90% of the way to the target
const STEP = 0.5;       // each extension adds 50% of the ORIGINAL entry→target distance

export interface ExtendInput {
  isLong: boolean;
  entry: number;
  sl: number;
  tp: number;
  ltp: number;
  initialTpDistance: number;
  extensions: number;
}

export interface ExtendResult { tp: number; sl: number; extensions: number; extended: boolean }

export function extendTarget(i: ExtendInput): ExtendResult {
  let { tp, sl, extensions } = i;
  const dir = i.isLong ? 1 : -1;
  const step = i.initialTpDistance * STEP;
  if (!(i.entry > 0) || !(tp > 0) || !(step > 0)) return { tp, sl, extensions, extended: false };
  let extended = false;
  while (extensions < MAX_TARGET_EXTENSIONS) {
    const dist = (tp - i.entry) * dir;
    if (!(dist > 0)) break;
    if ((i.ltp - i.entry) * dir < dist * APPROACH) break;
    tp = round2(tp + dir * step);
    extensions += 1;
    extended = true;
  }
  if (extended) {
    // Lock half of the gain reached so far (never loosen).
    const lock = round2(i.entry + dir * (i.ltp - i.entry) * dir * 0.5);
    if (i.isLong ? lock > sl : lock < sl) sl = lock;
  }
  return { tp, sl, extensions, extended };
}
