/*
 * ─── Behaviour Model (Animals / Birds) ─────────────────
 *
 * Each animal represents a trading personality archetype.
 * Weights are stored in Settings (0–100 from UI, normalized to 0–1 here).
 *
 * Every animal produces a multiplier that is blended into
 * the Long / Exit / NoTrade scoring functions.
 *
 * ────────────────────────────────────────────────────────
 * Animal      | Role
 * ────────────────────────────────────────────────────────
 * Eagle       | Higher‑timeframe trend weight
 * Tiger       | Conviction — scales position with confidence
 * Cheetah     | Fast breakout preference; tighter SL, more trades
 * Fox         | Opportunistic scalper; short‑term volatility
 * Tortoise    | Conservative; fewer, smaller trades
 * Dog         | Discipline; strict daily‑loss caps & cool‑downs
 * Owl         | Reversal / divergence hunter
 * Cow         | Steady growth bias, moderate risk
 * Spider      | Correlation‑aware; avoids conflicting symbols
 * Lion        | Aggressive trend continuation
 * ────────────────────────────────────────────────────────
 */

import type { IBehaviorWeights } from "../models/Settings.js";
import type { IndicatorSnapshot } from "./indicatorService.js";

/* ── Normalise 0‑100 slider → 0‑1 ────────────────────── */

export type NormalizedWeights = {
  eagle: number; tiger: number; cheetah: number; fox: number;
  tortoise: number; dog: number; owl: number; om_chant: number;
  gayatri_mantra: number; aaryan: number; aayush: number; lakshmi_hybrid: number;
};

export function normalizeWeights(raw: IBehaviorWeights): NormalizedWeights {
  return {
    eagle:    raw.eagle    / 100,
    tiger:    raw.tiger    / 100,
    cheetah:  raw.cheetah  / 100,
    fox:      raw.fox      / 100,
    tortoise: raw.tortoise / 100,
    dog:      raw.dog      / 100,
    owl:      raw.owl      / 100,
    om_chant:       raw.om_chant       / 100,
    gayatri_mantra: raw.gayatri_mantra / 100,
    aaryan:         raw.aaryan         / 100,
    aayush:         raw.aayush         / 100,
    lakshmi_hybrid: raw.lakshmi_hybrid / 100,
  };
}

/* ── Context that animals inspect ─────────────────────── */

export interface AnimalContext {
  ind: IndicatorSnapshot;
  /** Daily P&L so far (USDT) */
  dailyPnl: number;
  /** Number of trades placed today */
  tradesToday: number;
  /** Max daily loss limit */
  maxDailyLoss: number;
  /** Whether higher‑TF trend is bullish */
  htfTrendBullish: boolean;
  /** Recent short‑term volatility (stdDev / close) */
  volatilityRatio: number;
  isOverdrive?: boolean;
  /** User-configured max concurrent positions (fallback: 15) */
  maxConcurrentPositions?: number;
}

/* ── Per‑animal scoring functions ─────────────────────── */
/* Each returns a modifier in [‑1, +1]:
 *   positive → favours LONG
 *   negative → favours EXIT / avoidance
 *   zero     → neutral
 *
 * The magnitude is multiplied by the animal's weight (0‑1)
 * when blended into the final score.
 */

/** Eagle – higher‑timeframe trend weight. */
function eagleScore(ctx: AnimalContext): number {
  return ctx.htfTrendBullish ? 0.8 : -0.6;
}

/** Tiger – conviction; high RSI alignment ⇒ confidence. */
function tigerScore(ctx: AnimalContext): number {
  const rsi = ctx.ind.rsi14;
  if (rsi === null) return 0;
  // RSI 40‑60 = neutral; <30 = strong long; >70 = overbought caution
  if (rsi < 35) return 0.7;
  if (rsi > 70) return -0.5;
  return 0;
}

/** Cheetah – fast breakouts; price above upper Bollinger. */
function cheetahScore(ctx: AnimalContext): number {
  const bb = ctx.ind.bollinger;
  if (!bb) return 0;
  if (ctx.ind.close > bb.upper) return 0.8;  // breakout
  if (ctx.ind.close < bb.lower) return -0.4; // breakdown
  return 0.1; // inside band
}

/** Fox – short‑term volatility lover. */
function foxScore(ctx: AnimalContext): number {
  if (ctx.volatilityRatio > 0.03) return 0.6;  // high vol = opportunity
  if (ctx.volatilityRatio < 0.005) return -0.3; // too quiet
  return 0.1;
}

/** Tortoise – conservative; fewer trades, penalise overtrading. */
function tortoiseScore(ctx: AnimalContext): number {
  const userMax = ctx.maxConcurrentPositions ?? 15;
  const maxTrades = ctx.isOverdrive ? userMax * 3 : userMax;
  if (ctx.tradesToday > maxTrades) return -0.8;  // too many trades
  if (ctx.tradesToday > (ctx.isOverdrive ? userMax * 2 : Math.ceil(userMax * 0.67))) return -0.3;
  return 0.2; // calm = ok
}

/** Dog – discipline; daily‑loss cap enforcement. */
function dogScore(ctx: AnimalContext): number {
  const used = Math.abs(ctx.dailyPnl);
  // maxDailyLoss<=0 means no valid cap is configured — dividing by it would
  // yield NaN (used===0) or Infinity (used>0), poisoning the weighted blend.
  // Fail safe: treat any loss as breached, no loss as neutral.
  if (ctx.maxDailyLoss <= 0) return used > 0 ? -1 : 0.1;
  const pct = used / ctx.maxDailyLoss;
  if (pct > 1) return -1;  // breached — block
  if (pct > 0.7) return -0.7;
  return 0.1;
}

/** Owl – reversal/divergence hunter; RSI extremes + MACD crossover. */
function owlScore(ctx: AnimalContext): number {
  const rsi = ctx.ind.rsi14;
  const macd = ctx.ind.macd;
  if (rsi === null || !macd) return 0;
  // RSI oversold + MACD histogram turning positive = reversal
  if (rsi < 30 && macd.histogram > 0) return 0.9;
  // RSI overbought + MACD histogram turning negative = exit
  if (rsi > 70 && macd.histogram < 0) return -0.8;
  return 0;
}


/** Om Chant – harmonic mean of RSI balance + Bollinger mean reversion. */
function omChantScore(ctx: AnimalContext): number {
  const rsi = ctx.ind.rsi14;
  const boll = ctx.ind.bollinger;
  if (rsi === null || !boll) return 0;
  // RSI near 50 → balance → positive resonance
  const rsiBalance = 1 - Math.abs(rsi - 50) / 50; // 0–1, 1 = perfect balance
  const midDist = boll.middle !== 0
    ? (ctx.ind.close - boll.middle) / boll.middle
    : 0;
  // Near middle → calm → positive
  if (Math.abs(midDist) < 0.01) return +(rsiBalance * 0.6).toFixed(4);
  return +(rsiBalance * 0.3 - Math.abs(midDist) * 0.5).toFixed(4);
}

/** Gayatri Mantra – 24-signal frequency resonance proxy. */
function gayatriMantraScore(ctx: AnimalContext): number {
  // Quick proxy: count how many basic conditions align bullishly
  let aligned = 0;
  const { ema9, ema21, ema55, rsi14, macd, bollinger, atr14, close, changePercent } = ctx.ind;
  if (ema9 !== null && ema21 !== null && ema9 > ema21) aligned++;
  if (ema21 !== null && ema55 !== null && ema21 > ema55) aligned++;
  if (macd && macd.macd > macd.signal) aligned++;
  if (macd && macd.histogram > 0) aligned++;
  if (rsi14 !== null && rsi14 > 40 && rsi14 < 70) aligned++;
  if (bollinger && close > bollinger.middle) aligned++;
  if (atr14 !== null && atr14 > 0) aligned++;
  if (changePercent > 0) aligned++;
  // 8 checks → normalise
  const ratio = aligned / 8;
  return +(ratio * 2 - 1).toFixed(4); // -1 to +1
}

/** Aaryan – disciplined momentum bias; favours confirmed breakouts. */
function aaryanScore(ctx: AnimalContext): number {
  const { ema9, ema21, rsi14, macd } = ctx.ind;
  let score = 0;
  if (ema9 !== null && ema21 !== null && ema9 > ema21) score += 0.3;
  if (macd && macd.histogram > 0 && macd.macd > macd.signal) score += 0.3;
  if (rsi14 !== null && rsi14 >= 40 && rsi14 <= 65) score += 0.2;
  if (rsi14 !== null && rsi14 > 70) score -= 0.4;
  return +Math.max(-1, Math.min(1, score)).toFixed(4);
}

/** Aayush – patient accumulator; favours oversold mean-reversion. */
function aayushScore(ctx: AnimalContext): number {
  const { rsi14, bollinger, close } = ctx.ind;
  let score = 0;
  if (rsi14 !== null && rsi14 < 35) score += 0.5;
  if (rsi14 !== null && rsi14 > 70) score -= 0.3;
  if (bollinger && close < bollinger.lower) score += 0.4;
  if (bollinger && close > bollinger.upper) score -= 0.3;
  return +Math.max(-1, Math.min(1, score)).toFixed(4);
}

/** Lakshmi Hybrid – consensus blend proxy; positive when multiple signals agree. */
function lakshmiHybridScore(ctx: AnimalContext): number {
  const a = aaryanScore(ctx);
  const b = aayushScore(ctx);
  const g = gayatriMantraScore(ctx);
  // Consensus: average, boosted when all agree on direction
  const avg = (a + b + g) / 3;
  const allAgree = (a > 0 && b > 0 && g > 0) || (a < 0 && b < 0 && g < 0);
  const boosted = allAgree ? avg * 1.3 : avg;
  // The 1.3x consensus boost can push |avg| past the documented [-1, 1]
  // range (e.g. avg=1.0 → 1.3) — clamp to keep this score on the same scale
  // as every other animal score before it enters the weighted blend.
  return +Math.max(-1, Math.min(1, boosted)).toFixed(4);
}

/* ── Master blend ─────────────────────────────────────── */

export interface AnimalContributions {
  eagle: number;
  tiger: number;
  cheetah: number;
  fox: number;
  tortoise: number;
  dog: number;
  owl: number;
  om_chant: number;
  gayatri_mantra: number;
  aaryan: number;
  aayush: number;
  lakshmi_hybrid: number;
}

/**
 * Compute a weighted blend of all animal scores.
 * Returns a value roughly in [‑1, +1] where:
 *   > 0  favours LONG
 *   < 0  favours EXIT / NO_TRADE
 *
 * Also returns individual contributions for transparency.
 */
export function blendAnimalScores(
  weights: NormalizedWeights,
  ctx: AnimalContext,
): { score: number; contributions: AnimalContributions } {
  const scorers: Partial<Record<keyof IBehaviorWeights, (c: AnimalContext) => number>> = {
    eagle: eagleScore,
    tiger: tigerScore,
    cheetah: cheetahScore,
    fox: foxScore,
    tortoise: tortoiseScore,
    dog: dogScore,
    owl: owlScore,
    om_chant: omChantScore,
    gayatri_mantra: gayatriMantraScore,
    aaryan: aaryanScore,
    aayush: aayushScore,
    lakshmi_hybrid: lakshmiHybridScore,
  };

  let totalWeight = 0;
  let weightedSum = 0;
  const contributions = {} as AnimalContributions;

  for (const animal of Object.keys(scorers) as (keyof typeof scorers)[]) {
    const fn = scorers[animal];
    if (!fn) continue;
    const w = (weights as Record<string, number>)[animal] ?? 0;
    const raw = fn(ctx);
    (contributions as unknown as Record<string, number>)[animal] = +(w * raw).toFixed(4);
    weightedSum += w * raw;
    totalWeight += w;
  }

  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return { score: +score.toFixed(4), contributions };
}
