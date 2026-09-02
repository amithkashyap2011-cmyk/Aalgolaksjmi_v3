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
  const { existing, aqeaDecision, riskProfile, symbol, maxConcurrent = 10 } = input;

  if (existing) {
    return { ok: false, silent: false, reason: `Existing active position for ${symbol}` };
  }

  if (input.sameDirectionCount !== undefined && input.sameDirectionCount >= maxConcurrent) {
    return { ok: false, silent: false, reason: `Correlated exposure cap reached (max ${maxConcurrent} active BUY positions)` };
  }

  if (!aqeaDecision.riskApproved) {
    return { ok: false, silent: false, reason: `Risk parameters check failed` };
  }

  const rawConf = aqeaDecision.confidence ?? 0;
  const confNormalized = rawConf > 1 ? rawConf / 100 : rawConf;
  if (confNormalized < 0.68) {
    return { ok: false, silent: false, reason: `AI conviction below minimum threshold (Score: ${Math.round(confNormalized * 100)}% < 68%)` };
  }

  const regime = aqeaDecision.decisionPath?.regime || "";
  if (["TRENDING_BEAR", "VOLATILE_BEAR", "EXTREME_BEAR"].includes(regime) && confNormalized < 0.75) {
    return { ok: false, silent: false, reason: `Counter-trend BUY rejected in BEARISH regime (${regime}) with sub-75% conviction (${Math.round(confNormalized * 100)}%)` };
  }

  const allocUsdt = riskProfile.positionSize || aqeaDecision.positionSize;
  const leverage = riskProfile.leverage || aqeaDecision.leverage || 10;

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
  const { existing, aqeaDecision, riskProfile, symbol, maxConcurrent = 10 } = input;

  if (existing) {
    return { ok: false, silent: false, reason: `Existing active position for ${symbol}` };
  }

  if (input.sameDirectionCount !== undefined && input.sameDirectionCount >= maxConcurrent) {
    return { ok: false, silent: false, reason: `Correlated exposure cap reached (max ${maxConcurrent} active SELL positions)` };
  }

  if (!aqeaDecision.riskApproved) {
    return { ok: false, silent: false, reason: `Risk parameters check failed` };
  }

  const rawConf = aqeaDecision.confidence ?? 0;
  const confNormalized = rawConf > 1 ? rawConf / 100 : rawConf;
  if (confNormalized < 0.68) {
    return { ok: false, silent: false, reason: `AI conviction below minimum threshold (Score: ${Math.round(confNormalized * 100)}% < 68%)` };
  }

  const regime = aqeaDecision.decisionPath?.regime || "";
  if (["TRENDING_BULL", "VOLATILE_BULL", "EXTREME_BULL"].includes(regime) && confNormalized < 0.75) {
    return { ok: false, silent: false, reason: `Counter-trend SELL rejected in BULLISH regime (${regime}) with sub-75% conviction (${Math.round(confNormalized * 100)}%)` };
  }

  const allocUsdt = riskProfile.positionSize || aqeaDecision.positionSize;
  const leverage = riskProfile.leverage || aqeaDecision.leverage || 10;

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
