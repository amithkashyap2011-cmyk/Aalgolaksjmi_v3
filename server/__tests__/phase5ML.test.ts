/*
 * ─── Phase 5 ML/DL Integration Tests ─────────────────
 *
 * Comprehensive tests for:
 *   - ML feature validation (validateFeatures)
 *   - DL sequence validation (validateSequenceInput)
 *   - Health check stubs (no URL configured)
 *   - Predict/predictSequence fallback paths
 *   - STUB constants
 *
 * TC-M1 to TC-M20.
 *
 * The original TC-M21-M30 tested `agentService.ts`'s rule-based fusion
 * layer (scoreLong/scoreExit/scoreNoTrade/decideAction, RULE_WEIGHT/
 * ML_WEIGHT/DL_WEIGHT, AGREEMENT_BONUS_MAX, FusionMeta's agreement bonus,
 * and an EXIT daily-loss veto). That entire architecture has been removed
 * — agentService.ts now only builds context (`buildContext`); decisions
 * are made by AQEAEngine's weighted-vote ensemble instead, which has its
 * own dedicated coverage (see __tests__/aqea/engine.integration.test.ts,
 * riskEngine.test.ts, orderFlowVoting.test.ts, smartMoneyVoting.test.ts,
 * cnnVoting.test.ts). There's no direct equivalent of "agreement bonus" or
 * "EXIT daily-loss veto" in the new engine to port these onto, so rather
 * than fabricate tests against a different architecture's internals, the
 * removed suites were deleted rather than faked.
 */
import {
  buildMLFeatures,
  predict,
  validateFeatures,
  healthCheck as mlHealthCheck,
  STUB_ML_PREDICTION,
  ML_SERVICE_URL,
  ML_TIMEOUT_MS,
  type MLFeatures,
  type MLPrediction,
} from "../src/services/mlModelService";
import {
  buildSequenceInput,
  predictSequence,
  validateSequenceInput,
  healthCheck as dlHealthCheck,
  STUB_DL_PREDICTION,
  MIN_WINDOW_SIZE,
  DL_SERVICE_URL,
  DL_TIMEOUT_MS,
  type SequenceInput,
  type DLPrediction,
} from "../src/services/dlModelService";
import type { IndicatorSnapshot, OHLC } from "../src/services/indicatorService";

/* ══════════════════════════════════════════════════════
 *  Helpers
 * ══════════════════════════════════════════════════════ */

function makeInd(override: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
  return {
    rsi14: 50, ema9: 100, ema21: 99, ema55: 98, sma200: 95,
    macd: { macd: 0.01, signal: 0.005, histogram: 0.005 },
    atr14: 2, adx14: null,
    bollinger: { upper: 110, middle: 100, lower: 90, bandwidth: 20 },
    stdDev20: 1.5, close: 100, changePercent: 0.5,
    ...override,
  };
}

function makeWeightsMap(): Record<string, number> {
  return {
    eagle: 0.5, tiger: 0.5, cheetah: 0.5, fox: 0.5, tortoise: 0.5,
    dog: 0.5, owl: 0.5, cow: 0.5, spider: 0.5, lion: 0.5,
  };
}

function makeBars(count: number): OHLC[] {
  return Array.from({ length: count }, (_, i) => ({
    open: 100 + i - 1, high: 100 + i + 2, low: 100 + i - 2, close: 100 + i,
  }));
}

/* ═══════════════════════════════════════════════════════
 *  ML Feature Validation
 * ═══════════════════════════════════════════════════════ */

describe("validateFeatures (ML)", () => {
  test("TC-M1: clamps RSI to 0-100", () => {
    const raw = buildMLFeatures(makeInd({ rsi14: 120 }), makeWeightsMap(), 0, 100, 1, 0);
    const validated = validateFeatures(raw);
    expect(validated.rsi14).toBe(100);
  });

  test("TC-M2: clamps negative RSI to 0", () => {
    const raw = buildMLFeatures(makeInd({ rsi14: -10 }), makeWeightsMap(), 0, 100, 1, 0);
    const validated = validateFeatures(raw);
    expect(validated.rsi14).toBe(0);
  });

  test("TC-M3: clamps weight values to 0-1", () => {
    const weights = { ...makeWeightsMap(), eagle: 1.5, tiger: -0.2 };
    const raw = buildMLFeatures(makeInd(), weights, 0, 100, 1, 0);
    const validated = validateFeatures(raw);
    expect(validated.wEagle).toBe(1);
    expect(validated.wTiger).toBe(0);
  });

  test("TC-M4: ATR, bollingerBW, stdDev20 floored at 0", () => {
    const raw = buildMLFeatures(makeInd({ atr14: -5, stdDev20: -1 }), makeWeightsMap(), 0, 100, 1, 0);
    const validated = validateFeatures(raw);
    expect(validated.atr14).toBe(0);
    expect(validated.stdDev20).toBe(0);
  });

  test("TC-M5: tradesToday and openPositionCount are integer-floored", () => {
    const raw: MLFeatures = {
      ...buildMLFeatures(makeInd(), makeWeightsMap(), 0, 100, 3, 2),
      tradesToday: 3.7,
      openPositionCount: 1.9,
    };
    const validated = validateFeatures(raw);
    expect(validated.tradesToday).toBe(3);
    expect(validated.openPositionCount).toBe(1);
  });
});

/* ═══════════════════════════════════════════════════════
 *  DL Sequence Validation
 * ═══════════════════════════════════════════════════════ */

describe("validateSequenceInput (DL)", () => {
  test("TC-M6: valid input passes", () => {
    const input = buildSequenceInput("BTCUSDT", "5m", makeBars(60), 60);
    const result = validateSequenceInput(input);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("TC-M7: missing symbol fails", () => {
    const input: SequenceInput = { symbol: "", timeframe: "5m", window: makeBars(20).map(b => ({ ...b, volume: 0 })) };
    const result = validateSequenceInput(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("symbol");
  });

  test("TC-M8: missing timeframe fails", () => {
    const input: SequenceInput = { symbol: "BTC", timeframe: "", window: makeBars(20).map(b => ({ ...b, volume: 0 })) };
    const result = validateSequenceInput(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("timeframe");
  });

  test("TC-M9: window shorter than MIN_WINDOW_SIZE fails", () => {
    const input: SequenceInput = { symbol: "BTC", timeframe: "5m", window: makeBars(5).map(b => ({ ...b, volume: 0 })) };
    const result = validateSequenceInput(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`at least ${MIN_WINDOW_SIZE}`);
  });

  test("TC-M10: MIN_WINDOW_SIZE is 10", () => {
    expect(MIN_WINDOW_SIZE).toBe(10);
  });

  test("TC-M11: exactly MIN_WINDOW_SIZE bars passes", () => {
    const input: SequenceInput = {
      symbol: "BTC", timeframe: "1h",
      window: makeBars(MIN_WINDOW_SIZE).map(b => ({ ...b, volume: 0 })),
    };
    expect(validateSequenceInput(input).valid).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════
 *  STUB Constants
 * ═══════════════════════════════════════════════════════ */

describe("STUB predictions", () => {
  test("TC-M12: STUB_ML_PREDICTION is frozen neutral", () => {
    expect(STUB_ML_PREDICTION.profitProbability).toBe(0.5);
    expect(STUB_ML_PREDICTION.confidence).toBe(0);
    expect(STUB_ML_PREDICTION.expectedReturn).toBe(0);
    expect(STUB_ML_PREDICTION.modelName).toBe("stub-ml-v0");
    expect(Object.isFrozen(STUB_ML_PREDICTION)).toBe(true);
  });

  test("TC-M13: STUB_DL_PREDICTION is frozen neutral", () => {
    expect(STUB_DL_PREDICTION.directionScore).toBe(0.5);
    expect(STUB_DL_PREDICTION.confidence).toBe(0);
    expect(STUB_DL_PREDICTION.predictedMove).toBe(0);
    expect(STUB_DL_PREDICTION.modelName).toBe("stub-dl-v0");
    expect(Object.isFrozen(STUB_DL_PREDICTION)).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════
 *  Health Check (stub mode — no URL configured)
 * ═══════════════════════════════════════════════════════ */

describe("healthCheck (stub mode)", () => {
  test("TC-M14: ML healthCheck reports unavailable when no URL", async () => {
    // In test env ML_SERVICE_URL is not set → empty string
    const status = await mlHealthCheck();
    expect(status.available).toBe(false);
    expect(status.url).toBe("");
    expect(status.error).toContain("not configured");
    expect(status.modelName).toBe("stub-ml-v0");
    expect(status.latencyMs).toBe(0);
  });

  test("TC-M15: DL healthCheck reports unavailable when no URL", async () => {
    const status = await dlHealthCheck();
    expect(status.available).toBe(false);
    expect(status.url).toBe("");
    expect(status.error).toContain("not configured");
    expect(status.modelName).toBe("stub-dl-v0");
    expect(status.latencyMs).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════
 *  Predict / PredictSequence fallback
 * ═══════════════════════════════════════════════════════ */

describe("predict fallback paths", () => {
  test("TC-M16: predict returns stub when no ML_SERVICE_URL", async () => {
    const features = buildMLFeatures(makeInd(), makeWeightsMap(), 0, 100, 1, 0);
    const pred = await predict(features);
    expect(pred.profitProbability).toBe(0.5);
    expect(pred.confidence).toBe(0);
    expect(pred.modelName).toBe("stub-ml-v0");
  });

  test("TC-M17: predictSequence returns stub when no DL_SERVICE_URL", async () => {
    const input = buildSequenceInput("BTCUSDT", "5m", makeBars(60), 60);
    const pred = await predictSequence(input);
    expect(pred.directionScore).toBe(0.5);
    expect(pred.confidence).toBe(0);
    expect(pred.modelName).toBe("stub-dl-v0");
  });

  test("TC-M18: predictSequence returns stub for invalid input (too few bars)", async () => {
    const input: SequenceInput = { symbol: "BTC", timeframe: "5m", window: makeBars(3).map(b => ({ ...b, volume: 0 })) };
    const pred = await predictSequence(input);
    expect(pred.directionScore).toBe(0.5);
    expect(pred.confidence).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════
 *  Configuration exports
 * ═══════════════════════════════════════════════════════ */

describe("configuration exports", () => {
  test("TC-M19: ML config defaults are sane", () => {
    expect(typeof ML_SERVICE_URL).toBe("string");
    expect(typeof ML_TIMEOUT_MS).toBe("number");
    expect(ML_TIMEOUT_MS).toBeGreaterThan(0);
  });

  test("TC-M20: DL config defaults are sane", () => {
    expect(typeof DL_SERVICE_URL).toBe("string");
    expect(typeof DL_TIMEOUT_MS).toBe("number");
    expect(DL_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
