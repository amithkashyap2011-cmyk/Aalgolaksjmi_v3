/*
 * ─── DL Model Service ─────────────────────────────────
 *
 * Interface for deep‑learning sequence models
 * (LSTM, GRU, Transformer / Temporal Fusion Transformer).
 *
 * Architecture:
 *   1. Build a sliding window of enriched OHLCV bars via `buildSequenceInput()`.
 *   2. Call `predictSequence()` — routes to live Python micro‑service when
 *      DL_SERVICE_URL is configured, otherwise returns a neutral stub.
 *   3. Graceful fallback: timeout / HTTP error → stub with confidence=0.
 *   4. `healthCheck()` — ping the service to verify connectivity.
 *
 * See docs/ML_integration.md for the full training + deployment guide.
 */

/* ════════════════════════════════════════════════════════
 *  Configuration
 * ════════════════════════════════════════════════════════ */

/** URL of the Python DL micro‑service. Empty / unset → stub mode. */
export const DL_SERVICE_URL: string = process.env.DL_SERVICE_URL ?? "";

/** HTTP request timeout in milliseconds. */
export const DL_TIMEOUT_MS: number = Number(process.env.DL_TIMEOUT_MS) || 5000;

/* ════════════════════════════════════════════════════════
 *  Input: a sliding window of recent bar features
 * ════════════════════════════════════════════════════════ */

export interface SequenceBar {
  /** Normalised OHLCV — each value typically z‑scored or min‑max scaled */
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Optional extra features appended per timestep */
  rsi?: number;
  ema9?: number;
  ema21?: number;
  macdHist?: number;
}

/**
 * Window shape: (seqLen, featureDim).
 * The Python side expects a 2‑D tensor; we send it as an
 * array of SequenceBar objects that the service reshapes.
 */
export interface SequenceInput {
  /** Symbol being predicted */
  symbol: string;
  /** Timeframe of the bars (e.g. "5m") */
  timeframe: string;
  /** Sequence of bars, oldest → newest. Recommended length: 60–120 */
  window: SequenceBar[];
}

/* ════════════════════════════════════════════════════════
 *  Output
 * ════════════════════════════════════════════════════════ */

export interface DLPrediction {
  /** Predicted direction score: >0.5 bullish, <0.5 bearish */
  directionScore: number;
  /** Predicted magnitude of next move (e.g. +0.8% → 0.008) */
  predictedMove: number;
  /** Model confidence in its prediction (0‑1) */
  confidence: number;
  /** Attention / importance weights per timestep (optional) */
  attentionWeights?: number[];
  /** Model identifier */
  modelName: string;
}

/* ════════════════════════════════════════════════════════
 *  Stub prediction (used when service is unavailable)
 * ════════════════════════════════════════════════════════ */

export const STUB_DL_PREDICTION: DLPrediction = Object.freeze({
  directionScore: 0.5,
  predictedMove: 0.0,
  confidence: 0.0,
  modelName: "stub-dl-v0",
});

/* ════════════════════════════════════════════════════════
 *  Sequence validation
 * ════════════════════════════════════════════════════════ */

/** Minimum bars required for a meaningful prediction. */
export const MIN_WINDOW_SIZE = 10;

export function validateSequenceInput(input: SequenceInput): { valid: boolean; error?: string } {
  if (!input.symbol) return { valid: false, error: "symbol is required" };
  if (!input.timeframe) return { valid: false, error: "timeframe is required" };
  if (!input.window || input.window.length < MIN_WINDOW_SIZE) {
    return { valid: false, error: `window must have at least ${MIN_WINDOW_SIZE} bars, got ${input.window?.length ?? 0}` };
  }
  return { valid: true };
}

/* ════════════════════════════════════════════════════════
 *  Helper: build sequence window from OHLC bars + indicators
 * ════════════════════════════════════════════════════════ */

import type { OHLC } from "./indicatorService.js";
import { StreamingEMA, StreamingRSI, StreamingMACD } from "./indicatorService.js";

export function buildSequenceInput(
  symbol: string,
  timeframe: string,
  bars: OHLC[],
  windowSize = 60,
): SequenceInput {
  // Compute per‑bar indicators for the enriched sequence
  const rsiCalc = new StreamingRSI(14);
  const ema9Calc = new StreamingEMA(9);
  const ema21Calc = new StreamingEMA(21);
  const macdCalc = new StreamingMACD();

  const enriched: SequenceBar[] = bars.map((b) => {
    const rsi = rsiCalc.update(b.close);
    const e9 = ema9Calc.update(b.close);
    const e21 = ema21Calc.update(b.close);
    const macd = macdCalc.update(b.close);
    return {
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: 0, // volume not in OHLC type; set 0 or extend later
      rsi: rsi ?? undefined,
      ema9: e9 ?? undefined,
      ema21: e21 ?? undefined,
      macdHist: macd?.histogram ?? undefined,
    };
  });

  // Take the last `windowSize` bars
  const window = enriched.slice(-windowSize);

  return { symbol, timeframe, window };
}

/* ════════════════════════════════════════════════════════
 *  predictSequence()  —  Hybrid: live service or stub fallback
 *
 *  When DL_SERVICE_URL is set:
 *    POST <url>/predict  with JSON body = SequenceInput
 *    Expects back: { directionScore, predictedMove, confidence, modelName }
 *    On timeout/error → graceful fallback to stub (confidence=0)
 *
 *  When DL_SERVICE_URL is empty:
 *    Returns stub immediately.
 * ════════════════════════════════════════════════════════ */

export async function predictSequence(input: SequenceInput): Promise<DLPrediction> {
  // Validate input regardless of mode
  const validation = validateSequenceInput(input);
  if (!validation.valid) {
    console.warn(`[dl] invalid input: ${validation.error} — returning stub`);
    return { ...STUB_DL_PREDICTION };
  }

  if (!DL_SERVICE_URL) {
    return { ...STUB_DL_PREDICTION };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DL_TIMEOUT_MS);

    const res = await fetch(`${DL_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[dl] HTTP ${res.status} from DL service — falling back to stub`);
      return { ...STUB_DL_PREDICTION };
    }

    const data = (await res.json()) as Partial<DLPrediction>;
    return {
      directionScore: clamp(data.directionScore ?? 0.5, 0, 1),
      predictedMove:  data.predictedMove ?? 0,
      confidence:     clamp(data.confidence ?? 0, 0, 1),
      modelName:      data.modelName ?? "unknown-dl",
      attentionWeights: data.attentionWeights,
    };
  } catch (err) {
    console.warn(`[dl] predictSequence error — falling back to stub:`, (err as Error).message);
    return { ...STUB_DL_PREDICTION };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/* ════════════════════════════════════════════════════════
 *  healthCheck()  —  Verify DL service connectivity
 * ════════════════════════════════════════════════════════ */

export interface HealthStatus {
  available: boolean;
  url: string;
  latencyMs: number;
  modelName: string | null;
  error: string | null;
}

export async function healthCheck(): Promise<HealthStatus> {
  if (!DL_SERVICE_URL) {
    return { available: false, url: "", latencyMs: 0, modelName: "stub-dl-v0", error: "DL_SERVICE_URL not configured" };
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DL_TIMEOUT_MS);

    const res = await fetch(`${DL_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);

    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { available: false, url: DL_SERVICE_URL, latencyMs, modelName: null, error: `HTTP ${res.status}` };
    }

    const body = (await res.json()) as { modelName?: string };
    return { available: true, url: DL_SERVICE_URL, latencyMs, modelName: body.modelName ?? "unknown", error: null };
  } catch (err) {
    return { available: false, url: DL_SERVICE_URL, latencyMs: Date.now() - start, modelName: null, error: (err as Error).message };
  }
}
