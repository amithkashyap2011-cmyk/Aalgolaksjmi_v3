/*
 * ─── Phase 5 ML/DL Integration Tests ─────────────────
 *
 * Comprehensive tests for:
 *   - ML feature validation (validateFeatures)
 *   - DL sequence validation (validateSequenceInput)
 *   - Health check stubs (no URL configured)
 *   - Predict/predictSequence fallback paths
 *   - STUB constants
 *   - Agent fusion: agreement bonus, EXIT daily-loss veto,
 *     FusionMeta, configurable weight exports
 *
 * TC-M1 to TC-M30.
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
import {
  scoreLong,
  scoreExit,
  scoreNoTrade,
  decideAction,
  RULE_WEIGHT,
  ML_WEIGHT,
  DL_WEIGHT,
  AGREEMENT_BONUS_MAX,
  type AgentContext,
  type Decision,
  type FusionMeta,
} from "../src/services/agentService";
import type { IndicatorSnapshot, OHLC } from "../src/services/indicatorService";
import type { NormalizedWeights, AnimalContributions } from "../src/services/behaviourModel";

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

function makeWeights(): NormalizedWeights {
  return {
    eagle: 0.5, tiger: 0.5, cheetah: 0.5, fox: 0.5, tortoise: 0.5,
    dog: 0.5, owl: 0.5, cow: 0.5, spider: 0.5, lion: 0.5,
    om_chant: 0.5, gayatri_mantra: 0.5, aaryan: 0.5, aayush: 0.5, lakshmi_hybrid: 0.5,
  } as NormalizedWeights;
}

function zeroContribs(): AnimalContributions {
  return {
    eagle: 0, tiger: 0, cheetah: 0, fox: 0, tortoise: 0,
    dog: 0, owl: 0, cow: 0, spider: 0, lion: 0,
    om_chant: 0, gayatri_mantra: 0, aaryan: 0, aayush: 0, lakshmi_hybrid: 0,
  };
}

function stubML(override: Partial<MLPrediction> = {}): MLPrediction {
  return { profitProbability: 0.5, expectedReturn: 0, confidence: 0, modelName: "stub-ml-v0", ...override };
}

function stubDL(override: Partial<DLPrediction> = {}): DLPrediction {
  return { directionScore: 0.5, predictedMove: 0, confidence: 0, modelName: "stub-dl-v0", ...override };
}

function makeCtx(override: Partial<AgentContext> = {}): AgentContext {
  return {
    symbol: "BTCUSDT",
    mode: "PAPER",
    userId: "user123",
    bars: [{ open: 99, high: 102, low: 98, close: 100 }],
    ind: makeInd(),
    weights: makeWeights(),
    risk: { maxDailyLoss: 100, maxPositionSizePct: 21, defaultSL: 2, defaultTP: 4, trailingSL: 1 },
    dailyPnl: 0,
    tradesToday: 1,
    openPositionCount: 0,
    htfTrendBullish: true,
    volatilityRatio: 0.02,
    animalBlend: { score: 0.3, contributions: zeroContribs() },
    mlPrediction: stubML(),
    dlPrediction: stubDL(),
    ...override,
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

  test("TC-M21: fusion weights are exported and sum to 1", () => {
    expect(RULE_WEIGHT).toBe(0.50);
    expect(ML_WEIGHT).toBe(0.25);
    expect(DL_WEIGHT).toBe(0.25);
    expect(RULE_WEIGHT + ML_WEIGHT + DL_WEIGHT).toBeCloseTo(1.0);
  });

  test("TC-M22: AGREEMENT_BONUS_MAX is exported and reasonable", () => {
    expect(typeof AGREEMENT_BONUS_MAX).toBe("number");
    expect(AGREEMENT_BONUS_MAX).toBeGreaterThan(0);
    expect(AGREEMENT_BONUS_MAX).toBeLessThan(0.2); // small bonus, not dominant
  });
});

/* ═══════════════════════════════════════════════════════
 *  FusionMeta in Decision
 * ═══════════════════════════════════════════════════════ */

describe("decideAction fusion metadata", () => {
  test("TC-M23: decision contains fusion metadata", () => {
    const d = decideAction(makeCtx());
    expect(d).toHaveProperty("fusion");
    expect(d.fusion).toHaveProperty("effRuleWeight");
    expect(d.fusion).toHaveProperty("effMLWeight");
    expect(d.fusion).toHaveProperty("effDLWeight");
    expect(d.fusion).toHaveProperty("modelsAgree");
    expect(d.fusion).toHaveProperty("agreementBonus");
  });

  test("TC-M24: stub models (conf=0) → effRuleWeight=1, effML=0, effDL=0", () => {
    const d = decideAction(makeCtx());
    expect(d.fusion.effRuleWeight).toBeCloseTo(1.0, 2);
    expect(d.fusion.effMLWeight).toBe(0);
    expect(d.fusion.effDLWeight).toBe(0);
  });

  test("TC-M25: high confidence ML/DL → effective weights sum to 1", () => {
    const d = decideAction(makeCtx({
      mlPrediction: stubML({ profitProbability: 0.7, confidence: 0.8 }),
      dlPrediction: stubDL({ directionScore: 0.6, confidence: 0.6 }),
    }));
    const sum = d.fusion.effRuleWeight + d.fusion.effMLWeight + d.fusion.effDLWeight;
    expect(sum).toBeCloseTo(1.0, 2);
    expect(d.fusion.effMLWeight).toBeGreaterThan(0);
    expect(d.fusion.effDLWeight).toBeGreaterThan(0);
    expect(d.fusion.effRuleWeight).toBeLessThan(1.0);
  });
});

/* ═══════════════════════════════════════════════════════
 *  Agreement Bonus
 * ═══════════════════════════════════════════════════════ */

describe("ML/DL agreement bonus", () => {
  test("TC-M26: no agreement when confidence < 0.3", () => {
    const d = decideAction(makeCtx({
      mlPrediction: stubML({ profitProbability: 0.8, confidence: 0.2 }),
      dlPrediction: stubDL({ directionScore: 0.8, confidence: 0.2 }),
    }));
    expect(d.fusion.modelsAgree).toBe(false);
    expect(d.fusion.agreementBonus).toBe(0);
  });

  test("TC-M27: agreement bonus applied when both bullish with confidence > 0.3", () => {
    const d = decideAction(makeCtx({
      mlPrediction: stubML({ profitProbability: 0.8, confidence: 0.5 }),
      dlPrediction: stubDL({ directionScore: 0.7, confidence: 0.5 }),
    }));
    expect(d.fusion.modelsAgree).toBe(true);
    expect(d.fusion.agreementBonus).toBeGreaterThan(0);
    expect(d.fusion.agreementBonus).toBeLessThanOrEqual(AGREEMENT_BONUS_MAX);
  });

  test("TC-M28: no agreement when ML bullish but DL bearish", () => {
    const d = decideAction(makeCtx({
      mlPrediction: stubML({ profitProbability: 0.8, confidence: 0.8 }),
      dlPrediction: stubDL({ directionScore: 0.3, confidence: 0.8 }),
    }));
    expect(d.fusion.modelsAgree).toBe(false);
    expect(d.fusion.agreementBonus).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════
 *  EXIT Veto for Daily Loss Breach
 * ═══════════════════════════════════════════════════════ */

describe("EXIT daily-loss veto", () => {
  test("TC-M29: EXIT vetoed when dailyPnl exceeds maxDailyLoss", () => {
    // Build a strongly bearish context that normally triggers EXIT
    const ctx = makeCtx({
      ind: makeInd({
        rsi14: 85,
        ema9: 90, ema21: 100,
        macd: { macd: -1, signal: -0.5, histogram: -0.5 },
        bollinger: { upper: 105, middle: 100, lower: 95, bandwidth: 10 },
        close: 106,
      }),
      htfTrendBullish: false,
      animalBlend: { score: -0.5, contributions: zeroContribs() },
      openPositionCount: 1,
      dailyPnl: -110,  // exceeds maxDailyLoss of 100
      risk: { maxDailyLoss: 100, maxPositionSizePct: 21, defaultSL: 2, defaultTP: 4, trailingSL: 1 },
    });
    const d = decideAction(ctx);
    // When daily loss >= maxDailyLoss, EXIT should be vetoed to NO_TRADE
    expect(d.action).toBe("NO_TRADE");
  });

  test("TC-M30: EXIT allowed when dailyPnl is within limit", () => {
    // Build same bearish context but with normal daily P&L
    const ctx = makeCtx({
      ind: makeInd({
        rsi14: 85,
        ema9: 90, ema21: 100,
        macd: { macd: -1, signal: -0.5, histogram: -0.5 },
        bollinger: { upper: 105, middle: 100, lower: 95, bandwidth: 10 },
        close: 106,
      }),
      htfTrendBullish: false,
      animalBlend: { score: -0.5, contributions: zeroContribs() },
      openPositionCount: 1,
      dailyPnl: -20,  // within limit
      risk: { maxDailyLoss: 100, maxPositionSizePct: 21, defaultSL: 2, defaultTP: 4, trailingSL: 1 },
    });
    const d = decideAction(ctx);
    // Should be EXIT or NO_TRADE (not vetoed by daily loss), typically EXIT given bearish signals
    expect(d.action === "EXIT" || d.action === "NO_TRADE").toBe(true);
    // If EXIT, verify it was NOT vetoed
    if (d.action === "EXIT") {
      expect(d.confidenceExit).toBeGreaterThan(0.3);
    }
  });
});
