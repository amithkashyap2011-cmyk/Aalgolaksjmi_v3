/**
 * Broad-market trend guard for the Indian rule engine.
 *
 * The momentum rules (BULL_CALL_SPREAD = stock RSI>55 and spot>VWAP) looked only at the single
 * stock, so on 2026-10-01 they opened bullish spreads on KOTAKBANK/AXISBANK while NIFTY, SENSEX
 * and BANKNIFTY were all falling (closing -0.88% / -0.79% / -0.33%); both were stopped out
 * (-Rs3,932 net). This reads the live index change vs previous close and tells the engine which
 * directions are not allowed right now:
 *   indices down by >= threshold  -> no BULLISH entries
 *   indices up   by >= threshold  -> no BEARISH entries
 * Anything in between, or without fresh real quotes for at least two indices, blocks nothing
 * (fail open — we never invent a market view from simulated prices).
 *
 * Threshold: INDIA_INDEX_TREND_BLOCK_PCT (default 0.5 %, average of the available indices).
 */

import { MOCK_LIVE_INDIAN_TIKERS, hasFreshRealQuote } from "./indianPricing.js";

export type IndexBias = "UP" | "DOWN" | "FLAT" | "UNKNOWN";
export type StrategyDirection = "BULLISH" | "BEARISH";

export const INDEX_TREND_SYMBOLS = ["NIFTY50", "BANKNIFTY", "SENSEX"] as const;

export function defaultThresholdPct(): number {
  const v = Number(process.env.INDIA_INDEX_TREND_BLOCK_PCT);
  return Number.isFinite(v) && v > 0 ? v : 0.5;
}

/** Pure: classify the average % move of the indices. Needs >= 2 readings, otherwise UNKNOWN. */
export function classifyIndexTrend(movesPct: number[], thresholdPct = defaultThresholdPct()): { bias: IndexBias; avgPct: number | null } {
  const moves = movesPct.filter((m) => Number.isFinite(m));
  if (moves.length < 2) return { bias: "UNKNOWN", avgPct: null };
  const avg = moves.reduce((a, b) => a + b, 0) / moves.length;
  if (avg <= -thresholdPct) return { bias: "DOWN", avgPct: avg };
  if (avg >= thresholdPct) return { bias: "UP", avgPct: avg };
  return { bias: "FLAT", avgPct: avg };
}

export function blockedDirections(bias: IndexBias): StrategyDirection[] {
  if (bias === "DOWN") return ["BULLISH"];
  if (bias === "UP") return ["BEARISH"];
  return [];
}

/** Live read: index % change vs previous close (open if the feed gave no previous close). */
export function currentIndexTrend(thresholdPct = defaultThresholdPct()): { bias: IndexBias; avgPct: number | null; used: string[] } {
  const moves: number[] = [];
  const used: string[] = [];
  for (const sym of INDEX_TREND_SYMBOLS) {
    const t = MOCK_LIVE_INDIAN_TIKERS[sym];
    if (!t || !hasFreshRealQuote(sym)) continue;
    const base = t.prevClose && t.prevClose > 0 ? t.prevClose : t.open;
    if (!(base > 0) || !(t.ltp > 0)) continue;
    moves.push(((t.ltp - base) / base) * 100);
    used.push(sym);
  }
  return { ...classifyIndexTrend(moves, thresholdPct), used };
}
