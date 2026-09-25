/**
 * Price integrity for Indian option trades (2026-09-24 debug).
 *
 * Entries and exits were priced by OptionChainService.markPrice, which uses a
 * real Angel One quote only while it's < 30s old and otherwise a fixed-IV
 * Black-Scholes model. Near expiry the model was far off, so a trade could open
 * on a model premium and seconds later be marked on the real quote: e.g.
 * BANKNIFTY 55800 PE "bought" at 185.9 hit target at 400.7 in 1 min, TCS 2080 CE
 * lost 49% in 2 min. All of the day's net profit came from such ≤2-minute
 * trades; trades held longer lost ₹34.6k.
 *
 * Rules enforced here:
 *  - entries only with a fresh real quote for every option leg (and a live
 *    spot feed); the trade is repriced from those quotes
 *  - exits act only on fresh real quotes (see realOptionValue)
 *  - stops/targets for single-leg long options scale with the option's own
 *    volatility instead of a flat −28% / +45%
 */
import { optionContracts } from "./angelOne/optionContracts.js";
import { getFreshOptionLtp } from "./angelOne/optionQuotes.js";
import { getAngelFeedStatus } from "./angelOne/angelPriceFeed.js";
import { OptionChainService } from "./optionChainService.js";
import { expiryCloseTime } from "./angelOne/optionContracts.js";

const isOptionLeg = (l: any) => l?.instrumentType === "CE" || l?.instrumentType === "PE";

function legToken(underlying: string, leg: any): string | undefined {
  if (leg?.token && optionContracts.getByToken(String(leg.token))) return String(leg.token);
  const exp = leg?.expiry || optionContracts.getExpiries(underlying)[0];
  return exp ? optionContracts.getContract(underlying, exp, Number(leg.strike), leg.instrumentType)?.token : undefined;
}

/** Fresh real premium for one option leg, or undefined. */
export function realLegPrice(underlying: string, leg: any): number | undefined {
  const px = getFreshOptionLtp(legToken(String(underlying).toUpperCase(), leg));
  return px && px > 0 ? px : undefined;
}

/** Net value with the strategy convention: LONG = ΣBUY − ΣSELL, SHORT = ΣSELL − ΣBUY. */
function netValue(legs: any[], prices: number[], isShort: boolean): number {
  let net = 0;
  legs.forEach((l, i) => { net += (l.action === "SELL" ? -1 : 1) * prices[i]; });
  return isShort ? -net : net;
}

/**
 * Real-quote value of an open option trade for the exit monitor, or undefined
 * when any leg lacks a fresh quote (the monitor then skips SL/TP this tick
 * rather than acting on a model price).
 */
export function realOptionValue(t: any, underlying: string): number | undefined {
  const legs: any[] = Array.isArray(t?.legs) && t.legs.length ? t.legs : [];
  if (!legs.length || !legs.every(isOptionLeg)) return undefined;
  const prices = legs.map((l) => realLegPrice(underlying, l));
  if (prices.some((p) => p === undefined)) return undefined;
  if (legs.length === 1) return prices[0]!;
  const isShort = t.position === "SHORT" || t.side === "SELL";
  return Number(Math.max(0.05, netValue(legs, prices as number[], isShort)).toFixed(2));
}

export function isOptionTrade(t: any): boolean {
  return Array.isArray(t?.legs) && t.legs.length > 0 && t.legs.some(isOptionLeg);
}

/**
 * Volatility-scaled stop/target for a single-leg long option, as fractions of
 * the premium. The expected 1-hour premium move is |Δ|·S·σ·√(60/94500)
 * (94,500 = 252 sessions × 375 trading minutes); stop = 1.5×, target = 2.5×
 * that move (1.67R), bounded to 12–40% / 20–80%.
 */
export function volScaledStops(spot: number, strike: number, isCall: boolean, expiry: string, premium: number): { slPct: number; tpPct: number; iv?: number } {
  const dteYears = Math.max(0.5 / 365, (expiryCloseTime(expiry).getTime() - Date.now()) / (365 * 86400_000));
  const iv = OptionChainService.impliedVolatility(premium, spot, strike, dteYears, isCall);
  if (!iv) return { slPct: 0.25, tpPct: 0.42 };
  const delta = Math.abs(OptionChainService.calculateBlackScholesGreeks(spot, strike, dteYears, iv, isCall).delta);
  const move = (delta * spot * iv * Math.sqrt(60 / 94_500)) / premium;
  const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
  return { slPct: clamp(1.5 * move, 0.12, 0.40), tpPct: clamp(2.5 * move, 0.20, 0.80), iv };
}

/**
 * Volatility-scaled stop/target for a two-leg vertical DEBIT spread (bull
 * call / bear put), as fractions of the net debit. Debit spreads used a flat
 * stop at −60% and a target at +75% of max profit (e.g. RELIANCE 1220/1240 CE
 * bought at 8: stop 3.20, target 17.00) — levels an intraday trade squared
 * off at 15:15 almost never reaches, so a loser just bled until square-off.
 * Same method as single legs: expected 1-hour spread move from the net delta
 * of both legs (each leg's IV implied from its real quote); stop = 1.5×,
 * target = 2.5× that move, bounded to 15–40% / 25–100%, with the target kept
 * below the spread's maximum value (its width) and ≥ 1.6× the stop.
 * Returns undefined when the trade isn't a vertical debit spread or IVs
 * can't be implied.
 */
export function volScaledSpreadStops(spot: number, legs: any[], prices: number[], netDebit: number): { slPct: number; tpPct: number } | undefined {
  if (legs.length !== 2 || !(spot > 0) || !(netDebit > 0)) return undefined;
  const bi = legs.findIndex((l) => l.action === "BUY"), si = legs.findIndex((l) => l.action === "SELL");
  if (bi < 0 || si < 0) return undefined;
  const [b, sl] = [legs[bi], legs[si]];
  if (b.instrumentType !== sl.instrumentType || !isOptionLeg(b) || b.expiry !== sl.expiry || !b.expiry) return undefined;
  const isCall = b.instrumentType === "CE";
  const dteYears = Math.max(0.5 / 365, (expiryCloseTime(b.expiry).getTime() - Date.now()) / (365 * 86400_000));
  const ivB = OptionChainService.impliedVolatility(prices[bi], spot, Number(b.strike), dteYears, isCall);
  const ivS = OptionChainService.impliedVolatility(prices[si], spot, Number(sl.strike), dteYears, isCall);
  const iv = ivB ?? ivS;
  if (!iv) return undefined;
  const delta = (k: number, v: number) => OptionChainService.calculateBlackScholesGreeks(spot, k, dteYears, v, isCall).delta;
  const netDelta = Math.abs(delta(Number(b.strike), ivB ?? iv) - delta(Number(sl.strike), ivS ?? iv));
  const move = (netDelta * spot * ((ivB ?? iv) + (ivS ?? iv)) / 2 * Math.sqrt(60 / 94_500)) / netDebit;
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  const width = Math.abs(Number(b.strike) - Number(sl.strike));
  const maxTp = width > netDebit ? (width * 0.95 - netDebit) / netDebit : 0.25;
  const tpPct = Math.min(clamp(2.5 * move, 0.25, 1.0), Math.max(0.25, maxTp));
  const slPct = Math.min(clamp(1.5 * move, 0.15, 0.40), tpPct / 1.6);
  return { slPct: Number(slPct.toFixed(4)), tpPct: Number(tpPct.toFixed(4)) };
}

/**
 * Reprices a proposed option trade from fresh real quotes and resets its
 * stop/target. Returns { ok: false, reason } when it must not be opened.
 */
export function priceTradeFromRealQuotes(trade: any, underlying: string, spot: number): { ok: true; source: string } | { ok: false; reason: string } {
  if (!isOptionTrade(trade)) return { ok: true, source: "SPOT" };
  const feed = getAngelFeedStatus();
  if (feed.source !== "ANGEL_ONE" || !(feed.symbolsLive > 0)) {
    return { ok: false, reason: "SPOT_FEED_NOT_LIVE (prices are simulated)" };
  }
  const und = String(underlying).toUpperCase();
  const prices = trade.legs.map((l: any) => (isOptionLeg(l) ? realLegPrice(und, l) : undefined));
  const missing = trade.legs.filter((_: any, i: number) => !prices[i]).map((l: any) => l.tradingSymbol || `${l.strike}${l.instrumentType}`);
  if (missing.length) return { ok: false, reason: `NO_FRESH_QUOTE: ${missing.join(", ")}` };

  const oldEntry = Number(trade.entryPrice) || 0;
  trade.legs.forEach((l: any, i: number) => { l.entryPrice = prices[i]; });
  const isShort = trade.position === "SHORT";
  const entry = trade.legs.length === 1 ? prices[0] : Number(Math.max(0.05, netValue(trade.legs, prices, isShort)).toFixed(2));
  trade.entryPrice = entry;

  const leg = trade.legs[0];
  if (trade.legs.length === 1 && leg.action === "BUY" && spot > 0 && leg.expiry) {
    const { slPct, tpPct } = volScaledStops(spot, Number(leg.strike), leg.instrumentType === "CE", leg.expiry, entry);
    trade.stopLoss = Number((entry * (1 - slPct)).toFixed(2));
    trade.target = Number((entry * (1 + tpPct)).toFixed(2));
  } else if (!isShort && spot > 0 && volScaledSpreadStops(spot, trade.legs, prices, entry)) {
    const { slPct, tpPct } = volScaledSpreadStops(spot, trade.legs, prices, entry)!;
    trade.stopLoss = Number((entry * (1 - slPct)).toFixed(2));
    trade.target = Number((entry * (1 + tpPct)).toFixed(2));
  } else if (oldEntry > 0) {
    // Other multi-leg: keep the strategy's stop/target distances relative to entry.
    const r = entry / oldEntry;
    if (trade.stopLoss) trade.stopLoss = Number((trade.stopLoss * r).toFixed(2));
    if (trade.target) trade.target = Number((trade.target * r).toFixed(2));
  }
  return { ok: true, source: "ANGEL_ONE_QUOTE" };
}
