/*
 * ─── Pure entry-decision logic, extracted from autoTradeEngine.ts ──
 *
 * handleLong()/handleShort() previously interleaved validation/rejection
 * logic with I/O (Alert.create, Binance calls, Trade.create) in one long
 * async function — impossible to unit test without mocking ~15 modules
 * (measured coverage: 9.79% before this extraction). This file is a
 * MECHANICAL extraction of the synchronous, side-effect-free rejection
 * checks from handleLong's opening section (existing-position check
 * through decisionPath/vote validation) — same conditions, same order,
 * same computed values, zero logic changes. It stops short of the async
 * tradeGovernor.permit() call and all actual execution (Binance orders,
 * DB writes, alerts), which remain in autoTradeEngine.ts exactly as
 * before — those still need real I/O and aren't meaningfully "pure".
 *
 * handleLong() itself now calls evaluateLongEntry() and maps its result
 * onto the exact same Alert.create() calls it always made — the
 * observable behavior (what gets alerted, when, with what message) is
 * unchanged; only where the decision is COMPUTED moved.
 */
import type { AQEADecision } from "./aqea/engine.js";

export interface EntryEvaluationInput {
  existing: unknown; // paper.PaperPosition | undefined — only truthiness matters here
  aqeaDecision: AQEADecision;
  riskProfile: any;
  symbol: string;
  sameDirectionCount?: number;
  maxConcurrent?: number;
  /** Same-side cap; falls back to maxConcurrent when unset. */
  maxSameDirection?: number;
  /** Overbought/oversold entry guard: LONG blocked above maxLongEntryRsi, SHORT below minShortEntryRsi. */
  maxLongEntryRsi?: number;
  minShortEntryRsi?: number;
  minConvictionThreshold?: number;
}

export type EntryEvaluationResult =
  | { ok: true; allocUsdt: number; leverage: number; currentPrice: number; quantity: number; decisionPath: any; authorizedVotes: Record<string, any>; shadowVotes: Record<string, any> }
  | { ok: false; silent: true } // matches the original's bare `return;` with no Alert
  | { ok: false; silent: false; reason: string };

/**
 * Every check here, in this exact order, is copied byte-for-byte from
 * handleLong's original opening section — see the note in handleLong
 * itself for confirmation this is where it now delegates.
 */
export function evaluateLongEntry(input: EntryEvaluationInput): EntryEvaluationResult {
  const { existing, aqeaDecision, riskProfile, symbol, maxConcurrent = 10, minConvictionThreshold = 0.68 } = input;

  if (existing) {
    return { ok: false, silent: false, reason: `Existing active position for ${symbol}` };
  }

  const sameSideCap = input.maxSameDirection ?? maxConcurrent;
  if (input.sameDirectionCount !== undefined && input.sameDirectionCount >= sameSideCap) {
    return { ok: false, silent: false, reason: `Correlated exposure cap reached (max ${sameSideCap} active BUY positions)` };
  }

  if (!aqeaDecision.riskApproved) {
    return { ok: false, silent: false, reason: `Risk parameters check failed` };
  }

  const rawConf = aqeaDecision.confidence ?? 0;
  const confNormalized = rawConf > 1 ? rawConf / 100 : rawConf;
  if (confNormalized < minConvictionThreshold) {
    return { ok: false, silent: false, reason: `AI conviction below minimum threshold (Score: ${Math.round(confNormalized * 100)}% < ${Math.round(minConvictionThreshold * 100)}%)` };
  }

  const regime = aqeaDecision.decisionPath?.regime || "";
  if (["TRENDING_BEAR", "VOLATILE_BEAR", "EXTREME_BEAR"].includes(regime) && confNormalized < 0.75) {
    return { ok: false, silent: false, reason: `Counter-trend BUY rejected in BEARISH regime (${regime}) with sub-75% conviction (${Math.round(confNormalized * 100)}%)` };
  }

  // Don't chase: engine LONGs entered at RSI >= 70 lost money (19 trades,
  // -$0.31) while RSI < 60 entries won 60% (+$18.18); after 2026-09-26 the
  // engine was buying at RSI 70–92 and went 3W/10L. Wait for a pullback.
  const entryRsi = Number(aqeaDecision.meta?.indicators?.rsi14);
  const maxLongRsi = input.maxLongEntryRsi ?? 70;
  if (Number.isFinite(entryRsi) && entryRsi > maxLongRsi) {
    return { ok: false, silent: false, reason: `Overbought: BUY skipped at RSI ${entryRsi.toFixed(1)} > ${maxLongRsi} — waiting for a pullback` };
  }

  // Zero is an intentional no-trade instruction from the sizing engine, not
  // a missing value.  Only an absent field may fall back to AQEA defaults.
  const allocUsdt = riskProfile?.positionSize !== undefined ? riskProfile.positionSize : aqeaDecision.positionSize;
  const leverage = riskProfile?.leverage !== undefined ? riskProfile.leverage : (aqeaDecision.leverage ?? 10);

  if (!allocUsdt || !Number.isFinite(allocUsdt) || allocUsdt <= 0 || !Number.isFinite(leverage) || leverage <= 0) {
    return { ok: false, silent: false, reason: `Invalid size or leverage configured` };
  }

  const currentPrice = aqeaDecision.meta?.indicators?.close || (aqeaDecision as any).currentPrice || (riskProfile as any)?.entry || (riskProfile as any)?.entryPrice;
  if (!currentPrice || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { ok: false, silent: false, reason: `Entry price could not be resolved` };
  }

  const quantity = allocUsdt / currentPrice;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    // Original: bare `if (!Number.isFinite(quantity) || quantity <= 0) return;`
    // — deliberately no Alert on this specific path. Preserved exactly.
    return { ok: false, silent: true };
  }

  const decisionPath = aqeaDecision.decisionPath;
  const authorizedVotes = { CNN: decisionPath?.cnnVote, PPO: decisionPath?.ppoVote, TRANSFORMER: decisionPath?.transformerVote };
  const shadowVotes = { MAMBA: decisionPath?.mambaVote };

  if (!decisionPath || Object.keys(authorizedVotes).length === 0) {
    // Original throws here (a FATAL_EXPLAINABILITY_ERROR), not a normal
    // rejection — preserved as a real throw, not a result variant, since
    // the original never treated this as a recoverable path either.
    throw new Error(`[FATAL_EXPLAINABILITY_ERROR] Missing decisionPath for ${symbol}`);
  }

  return { ok: true, allocUsdt, leverage, currentPrice, quantity, decisionPath, authorizedVotes, shadowVotes };
}

/**
 * Mirror of evaluateLongEntry for handleShort's identical opening
 * section (same structure, SELL-side wording only).
 */
export function evaluateShortEntry(input: EntryEvaluationInput): EntryEvaluationResult {
  const { existing, aqeaDecision, riskProfile, symbol, maxConcurrent = 10, minConvictionThreshold = 0.68 } = input;

  if (existing) {
    return { ok: false, silent: false, reason: `Existing active position for ${symbol}` };
  }

  const sameSideCap = input.maxSameDirection ?? maxConcurrent;
  if (input.sameDirectionCount !== undefined && input.sameDirectionCount >= sameSideCap) {
    return { ok: false, silent: false, reason: `Correlated exposure cap reached (max ${sameSideCap} active SELL positions)` };
  }

  if (!aqeaDecision.riskApproved) {
    return { ok: false, silent: false, reason: `Risk parameters check failed` };
  }

  const rawConf = aqeaDecision.confidence ?? 0;
  const confNormalized = rawConf > 1 ? rawConf / 100 : rawConf;
  if (confNormalized < minConvictionThreshold) {
    return { ok: false, silent: false, reason: `AI conviction below minimum threshold (Score: ${Math.round(confNormalized * 100)}% < ${Math.round(minConvictionThreshold * 100)}%)` };
  }

  const regime = aqeaDecision.decisionPath?.regime || "";
  if (["TRENDING_BULL", "VOLATILE_BULL", "EXTREME_BULL"].includes(regime) && confNormalized < 0.75) {
    return { ok: false, silent: false, reason: `Counter-trend SELL rejected in BULLISH regime (${regime}) with sub-75% conviction (${Math.round(confNormalized * 100)}%)` };
  }

  // Mirror of the BUY overbought guard: don't short into an oversold low.
  const entryRsi = Number(aqeaDecision.meta?.indicators?.rsi14);
  const minShortRsi = input.minShortEntryRsi ?? 30;
  if (Number.isFinite(entryRsi) && entryRsi < minShortRsi) {
    return { ok: false, silent: false, reason: `Oversold: SELL skipped at RSI ${entryRsi.toFixed(1)} < ${minShortRsi} — waiting for a bounce` };
  }

  // Keep the short path identical: never replace an intentional zero size
  // with a fallback allocation.
  const allocUsdt = riskProfile?.positionSize !== undefined ? riskProfile.positionSize : aqeaDecision.positionSize;
  const leverage = riskProfile?.leverage !== undefined ? riskProfile.leverage : (aqeaDecision.leverage ?? 10);

  if (!allocUsdt || !Number.isFinite(allocUsdt) || allocUsdt <= 0 || !Number.isFinite(leverage) || leverage <= 0) {
    return { ok: false, silent: false, reason: `Invalid size or leverage configured` };
  }

  const currentPrice = aqeaDecision.meta?.indicators?.close || (aqeaDecision as any).currentPrice || (riskProfile as any)?.entry || (riskProfile as any)?.entryPrice;
  if (!currentPrice || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { ok: false, silent: false, reason: `Entry price could not be resolved` };
  }

  const quantity = allocUsdt / currentPrice;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, silent: true };
  }

  const decisionPath = aqeaDecision.decisionPath;
  const authorizedVotes = { CNN: decisionPath?.cnnVote, PPO: decisionPath?.ppoVote, TRANSFORMER: decisionPath?.transformerVote };
  const shadowVotes = { MAMBA: decisionPath?.mambaVote };

  if (!decisionPath || Object.keys(authorizedVotes).length === 0) {
    throw new Error(`[FATAL_EXPLAINABILITY_ERROR] Missing decisionPath for ${symbol}`);
  }

  return { ok: true, allocUsdt, leverage, currentPrice, quantity, decisionPath, authorizedVotes, shadowVotes };
}
