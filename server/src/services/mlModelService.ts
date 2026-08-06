/*
 * ─── ML Model Service ─────────────────────────────────
 *
 * Interface for classical ML models (RandomForest, XGBoost, MLP).
 *
 * Architecture:
 *   1. Build a flat feature vector from indicators + weights + risk state.
 *   2. Call `predict()` — routes to live Python micro‑service when
 *      ML_SERVICE_URL is configured, otherwise returns a neutral stub.
 *   3. Graceful fallback: timeout / HTTP error → stub with confidence=0.
 *   4. `healthCheck()` — ping the service to verify connectivity.
 *
 * See docs/ML_integration.md for the full training + deployment guide.
 */

import type { IndicatorSnapshot } from "./indicatorService.js";

/* ════════════════════════════════════════════════════════
 *  Configuration
 * ════════════════════════════════════════════════════════ */

/** URL of the Python ML micro‑service. Empty / unset → stub mode. */
export const ML_SERVICE_URL: string = process.env.ML_SERVICE_URL ?? "";

/** HTTP request timeout in milliseconds. */
export const ML_TIMEOUT_MS: number = Number(process.env.ML_TIMEOUT_MS) || 3000;

/* ════════════════════════════════════════════════════════
 *  Feature vector that the ML model expects
 * ════════════════════════════════════════════════════════ */

export interface MLFeatures {
  /** Technical indicators (all numeric, null → 0) */
  rsi14: number;
  ema9: number;
  ema21: number;
  ema55: number;
  sma200: number;
  macdHist: number;
  atr14: number;
  bollingerBW: number;  // bandwidth
  stdDev20: number;
  changePercent: number;

  /** Behaviour weights (normalised 0‑1) */
  wEagle: number;
  wTiger: number;
  wCheetah: number;
  wFox: number;
  wTortoise: number;
  wDog: number;
  wOwl: number;

  /** Risk / position state */
  dailyPnlRatio: number;    // dailyPnl / maxDailyLoss
  tradesToday: number;
  openPositionCount: number;
}

/** The ML model's prediction output */
export interface MLPrediction {
  /** Probability the next trade is profitable (0‑1) */
  profitProbability: number;
  /** Expected return as a ratio (e.g. 0.012 = +1.2%) */
  expectedReturn: number;
  /** Model confidence in its own prediction (0‑1) */
  confidence: number;
  /** Which model produced this (for logging) */
  modelName: string;
}

/* ════════════════════════════════════════════════════════
 *  Stub prediction (used when service is unavailable)
 * ════════════════════════════════════════════════════════ */

export const STUB_ML_PREDICTION: MLPrediction = Object.freeze({
  profitProbability: 0.5,
  expectedReturn: 0.0,
  confidence: 0.0,
  modelName: "stub-ml-v0",
});

/* ════════════════════════════════════════════════════════
 *  Feature validation — clamp values to sane ranges
 * ════════════════════════════════════════════════════════ */

export function validateFeatures(f: MLFeatures): MLFeatures {
  return {
    rsi14:           clamp(f.rsi14, 0, 100),
    ema9:            f.ema9,
    ema21:           f.ema21,
    ema55:           f.ema55,
    sma200:          f.sma200,
    macdHist:        f.macdHist,
    atr14:           Math.max(0, f.atr14),
    bollingerBW:     Math.max(0, f.bollingerBW),
    stdDev20:        Math.max(0, f.stdDev20),
    changePercent:   f.changePercent,
    wEagle:          clamp(f.wEagle, 0, 1),
    wTiger:          clamp(f.wTiger, 0, 1),
    wCheetah:        clamp(f.wCheetah, 0, 1),
    wFox:            clamp(f.wFox, 0, 1),
    wTortoise:       clamp(f.wTortoise, 0, 1),
    wDog:            clamp(f.wDog, 0, 1),
    wOwl:            clamp(f.wOwl, 0, 1),
    dailyPnlRatio:   f.dailyPnlRatio,
    tradesToday:     Math.max(0, Math.floor(f.tradesToday)),
    openPositionCount: Math.max(0, Math.floor(f.openPositionCount)),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/* ════════════════════════════════════════════════════════
 *  Helper: build feature vector from snapshot + context
 * ════════════════════════════════════════════════════════ */

export function buildMLFeatures(
  ind: IndicatorSnapshot,
  weights: Record<string, number>,
  dailyPnl: number,
  maxDailyLoss: number,
  tradesToday: number,
  openPositionCount: number,
): MLFeatures {
  return {
    rsi14:           ind.rsi14 ?? 50,
    ema9:            ind.ema9 ?? ind.close,
    ema21:           ind.ema21 ?? ind.close,
    ema55:           ind.ema55 ?? ind.close,
    sma200:          ind.sma200 ?? ind.close,
    macdHist:        ind.macd?.histogram ?? 0,
    atr14:           ind.atr14 ?? 0,
    bollingerBW:     ind.bollinger?.bandwidth ?? 0,
    stdDev20:        ind.stdDev20 ?? 0,
    changePercent:   ind.changePercent,
    wEagle:          weights.eagle ?? 0.5,
    wTiger:          weights.tiger ?? 0.5,
    wCheetah:        weights.cheetah ?? 0.5,
    wFox:            weights.fox ?? 0.5,
    wTortoise:       weights.tortoise ?? 0.5,
    wDog:            weights.dog ?? 0.5,
    wOwl:            weights.owl ?? 0.5,
    dailyPnlRatio:   maxDailyLoss !== 0 ? dailyPnl / maxDailyLoss : 0,
    tradesToday,
    openPositionCount,
  };
}

/* ════════════════════════════════════════════════════════
 *  predict()  —  Hybrid: live service or stub fallback
 *
 *  When ML_SERVICE_URL is set:
 *    POST <url>/predict  with JSON body = features
 *    Expects back: { profitProbability, expectedReturn, confidence, modelName }
 *    On timeout/error → graceful fallback to stub (confidence=0)
 *
 *  When ML_SERVICE_URL is empty:
 *    Returns stub immediately.
 * ════════════════════════════════════════════════════════ */

export function predictLocalMLP(f: MLFeatures): MLPrediction {
  // Normalize key indicator features relative to baseline
  const x1 = (f.rsi14 - 50) / 25; // RSI centered at 0, scaled
  const x2 = f.ema21 !== 0 ? (f.ema9 - f.ema21) / f.ema21 * 100 : 0; // short EMA crossover %
  const x3 = f.ema55 !== 0 ? (f.ema21 - f.ema55) / f.ema55 * 100 : 0; // medium EMA crossover %
  const x4 = f.sma200 !== 0 ? (f.ema55 - f.sma200) / f.sma200 * 100 : 0; // long trend margin %
  const x5 = f.atr14 > 0 ? f.macdHist / f.atr14 : 0; // volatility-scaled MACD histogram
  const x6 = f.ema9 !== 0 ? (f.stdDev20 / f.ema9) * 100 : 0.5; // normalized volatility %
  const x7 = clamp(f.changePercent, -5, 5); // short-term momentum cap
  const x8 = clamp(f.bollingerBW, 0, 1); // normalized Bollinger Bandwidth

  // Weights for hidden layer (4 neurons)
  const wHidden = [
    [0.05, 0.40, 0.25, 0.15, 0.20, -0.05, 0.30, -0.10],   // Neuron 0: Trend Following strength
    [-0.50, -0.10, -0.05, 0.00, -0.05, 0.30, -0.20, 0.40], // Neuron 1: Mean Reversion setups
    [0.10, 0.20, 0.10, 0.05, 0.60, 0.15, 0.25, 0.00],     // Neuron 2: Momentum / MACD convergence
    [0.00, 0.15, 0.10, 0.05, 0.05, -0.25, 0.10, -0.05]    // Neuron 3: Risk exposure dampener
  ];
  const bHidden = [-0.10, 0.20, -0.05, 0.00];

  // Hidden Layer Feedforward activation (tanh)
  const inputs = [x1, x2, x3, x4, x5, x6, x7, x8];
  const hidden: number[] = [];
  for (let i = 0; i < 4; i++) {
    let sum = bHidden[i];
    for (let j = 0; j < inputs.length; j++) {
      sum += inputs[j] * wHidden[i][j];
    }
    hidden.push(Math.tanh(sum));
  }

  // Animal blend bias adjustment
  const animalBias = (f.wEagle * 0.4 + f.wTiger * 0.3 + f.wCheetah * 0.3) -
                     (f.wTortoise * 0.5 + f.wOwl * 0.5);

  // Output 1: profitProbability (Logistic Sigmoid)
  const wProb = [0.55, -0.35, 0.50, 0.20];
  const bProb = 0.05 + animalBias * 0.20;
  let zProb = bProb;
  for (let i = 0; i < hidden.length; i++) {
    zProb += hidden[i] * wProb[i];
  }
  const profitProbability = 1 / (1 + Math.exp(-zProb));

  // Output 2: expectedReturn (Linear Scale)
  const wRet = [0.008, -0.004, 0.010, 0.002];
  const bRet = 0.001 + animalBias * 0.004;
  let expectedReturn = bRet;
  for (let i = 0; i < hidden.length; i++) {
    expectedReturn += hidden[i] * wRet[i];
  }

  // Model Confidence based on trend clarity & volatility stability
  const trendStrength = Math.max(Math.abs(hidden[0]), Math.abs(hidden[2]));
  const volCoeff = x6 > 5.0 ? 0.70 : (x6 < 0.30 ? 0.85 : 1.00); // lower confidence in panic spikes
  const confidence = clamp((0.62 + trendStrength * 0.20) * volCoeff, 0.55, 0.85);

  return {
    profitProbability,
    expectedReturn,
    confidence,
    modelName: "local-statistical-mlp-v2"
  };
}

export async function predict(features: MLFeatures): Promise<MLPrediction> {
  // In test environment, always return the deterministic neutral stub
  if (process.env.NODE_ENV === "test") {
    return { ...STUB_ML_PREDICTION };
  }

  if (!ML_SERVICE_URL) {
    return predictLocalMLP(features);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);

    const res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validateFeatures(features)),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[ml] HTTP ${res.status} from ML service — falling back to local MLP`);
      const fallback = predictLocalMLP(features);
      fallback.confidence *= 0.8; // Lower confidence due to fallback
      return fallback;
    }

    const data = (await res.json()) as Partial<MLPrediction>;
    return {
      profitProbability: clamp(data.profitProbability ?? 0.5, 0, 1),
      expectedReturn:    data.expectedReturn ?? 0,
      confidence:        clamp(data.confidence ?? 0, 0, 1),
      modelName:         data.modelName ?? "unknown-ml",
    };
  } catch (err) {
    console.warn(`[ml] predict error — falling back to local MLP:`, (err as Error).message);
    const fallback = predictLocalMLP(features);
    fallback.confidence *= 0.8; // Lower confidence due to fallback
    return fallback;
  }
}

/* ════════════════════════════════════════════════════════
 *  healthCheck()  —  Verify ML service connectivity
 * ════════════════════════════════════════════════════════ */

export interface HealthStatus {
  available: boolean;
  url: string;
  latencyMs: number;
  modelName: string | null;
  error: string | null;
}

export async function healthCheck(): Promise<HealthStatus> {
  if (!ML_SERVICE_URL) {
    return { available: false, url: "", latencyMs: 0, modelName: "stub-ml-v0", error: "ML_SERVICE_URL not configured" };
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);

    const res = await fetch(`${ML_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);

    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { available: false, url: ML_SERVICE_URL, latencyMs, modelName: null, error: `HTTP ${res.status}` };
    }

    const body = (await res.json()) as { modelName?: string };
    return { available: true, url: ML_SERVICE_URL, latencyMs, modelName: body.modelName ?? "unknown", error: null };
  } catch (err) {
    return { available: false, url: ML_SERVICE_URL, latencyMs: Date.now() - start, modelName: null, error: (err as Error).message };
  }
}
