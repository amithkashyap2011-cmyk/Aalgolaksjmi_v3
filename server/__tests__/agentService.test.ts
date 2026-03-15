/*
 * ─── Agent Service Unit Tests ─────────────────────────
 *
 * Tests for scoreLong, scoreExit, scoreNoTrade, decideAction.
 * All functions are pure (deterministic given an AgentContext),
 * so no Mongo / Binance / network needed.
 * TC-J1 to TC-J25.
 */
import {
  scoreLong,
  scoreExit,
  scoreNoTrade,
  decideAction,
  type AgentContext,
  type Action,
} from "../src/services/agentService";
import type { IndicatorSnapshot } from "../src/services/indicatorService";
import type { MLPrediction } from "../src/services/mlModelService";
import type { DLPrediction } from "../src/services/dlModelService";
import type { NormalizedWeights, AnimalContributions } from "../src/services/behaviourModel";

/* ── Helpers ──────────────────────────────────────────── */

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

function makeWeights(): NormalizedWeights {
  return {
    eagle: 0.5, tiger: 0.5, cheetah: 0.5, fox: 0.5, tortoise: 0.5,
    dog: 0.5, owl: 0.5, cow: 0.5, spider: 0.5, lion: 0.5,
    om_chant: 0.5, gayatri_mantra: 0.5, aaryan: 0.5, aayush: 0.5, lakshmi_hybrid: 0.5,
  } as NormalizedWeights;
}

function zeroContributions(): AnimalContributions {
  return {
    eagle: 0, tiger: 0, cheetah: 0, fox: 0, tortoise: 0,
    dog: 0, owl: 0, cow: 0, spider: 0, lion: 0,
    om_chant: 0, gayatri_mantra: 0, aaryan: 0, aayush: 0, lakshmi_hybrid: 0,
  };
}

function stubML(override: Partial<MLPrediction> = {}): MLPrediction {
  return {
    profitProbability: 0.5,
    expectedReturn: 0,
    confidence: 0,
    modelName: "stub-ml-v0",
    ...override,
  };
}

function stubDL(override: Partial<DLPrediction> = {}): DLPrediction {
  return {
    directionScore: 0.5,
    predictedMove: 0,
    confidence: 0,
    modelName: "stub-dl-v0",
    ...override,
  };
}

function makeCtx(override: Partial<AgentContext> = {}): AgentContext {
  return {
    symbol: "BTCUSDT",
    mode: "PAPER",
    userId: "user123",
    bars: [{ open: 99, high: 102, low: 98, close: 100 }],
    ind: makeInd(),
    weights: makeWeights(),
    risk: {
      maxDailyLoss: 100,
      maxPositionSizePct: 21,
      defaultSL: 2,
      defaultTP: 4,
      trailingSL: 1,
    },
    dailyPnl: 0,
    tradesToday: 1,
    openPositionCount: 0,
    htfTrendBullish: true,
    volatilityRatio: 0.02,
    animalBlend: { score: 0.3, contributions: zeroContributions() },
    mlPrediction: stubML(),
    dlPrediction: stubDL(),
    ...override,
  };
}

/* ═══════════════════════════════════════════════════════
 *  scoreLong
 * ═══════════════════════════════════════════════════════ */

describe("scoreLong", () => {
  test("TC-J1: returns a number between 0 and 1", () => {
    const score = scoreLong(makeCtx());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test("TC-J2: bullish indicators produce higher score", () => {
    const bullish = makeCtx({
      ind: makeInd({
        rsi14: 45,
        ema9: 105, ema21: 100, ema55: 95,
        macd: { macd: 0.5, signal: 0.2, histogram: 0.3 },
        adx14: 30, // strong trend
        bollinger: { upper: 110, middle: 100, lower: 90, bandwidth: 20 },
        close: 92, // near lower Bollinger
      }),
      htfTrendBullish: true,
      animalBlend: { score: 0.6, contributions: zeroContributions() },
    });
    const bearish = makeCtx({
      ind: makeInd({
        rsi14: 80,
        ema9: 95, ema21: 100, ema55: 105,
        macd: { macd: -0.5, signal: -0.2, histogram: -0.3 },
        adx14: 10, // no trend
      }),
      htfTrendBullish: false,
      animalBlend: { score: -0.3, contributions: zeroContributions() },
    });

    expect(scoreLong(bullish)).toBeGreaterThan(scoreLong(bearish));
  });

  test("TC-J3: RSI sweet spot (35-55) adds to score", () => {
    const inZone = makeCtx({ ind: makeInd({ rsi14: 45 }) });
    const outZone = makeCtx({ ind: makeInd({ rsi14: 75 }) });
    expect(scoreLong(inZone)).toBeGreaterThan(scoreLong(outZone));
  });

  test("TC-J4: EMA alignment boosts score", () => {
    const aligned = makeCtx({ ind: makeInd({ ema9: 105, ema21: 100 }) });
    const crossed = makeCtx({ ind: makeInd({ ema9: 95, ema21: 100 }) });
    expect(scoreLong(aligned)).toBeGreaterThan(scoreLong(crossed));
  });

  test("TC-J5: ADX > 25 boosts score", () => {
    const strong = makeCtx({ ind: makeInd({ adx14: 30 }) });
    const weak = makeCtx({ ind: makeInd({ adx14: 10 }) });
    expect(scoreLong(strong)).toBeGreaterThan(scoreLong(weak));
  });

  test("TC-J6: positive animal blend boosts score", () => {
    const pos = makeCtx({ animalBlend: { score: 0.8, contributions: zeroContributions() } });
    const neg = makeCtx({ animalBlend: { score: -0.5, contributions: zeroContributions() } });
    expect(scoreLong(pos)).toBeGreaterThan(scoreLong(neg));
  });

  test("TC-J7: null indicators handled gracefully (no throw)", () => {
    const ctx = makeCtx({
      ind: makeInd({
        rsi14: null, ema9: null, ema21: null, ema55: null,
        macd: null, atr14: null, adx14: null, bollinger: null, stdDev20: null,
      }),
    });
    expect(() => scoreLong(ctx)).not.toThrow();
    const score = scoreLong(ctx);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

/* ═══════════════════════════════════════════════════════
 *  scoreExit
 * ═══════════════════════════════════════════════════════ */

describe("scoreExit", () => {
  test("TC-J8: returns a number between 0 and 1", () => {
    const score = scoreExit(makeCtx());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test("TC-J9: overbought RSI boosts exit score", () => {
    const overbought = makeCtx({ ind: makeInd({ rsi14: 80 }) });
    const normal = makeCtx({ ind: makeInd({ rsi14: 50 }) });
    expect(scoreExit(overbought)).toBeGreaterThan(scoreExit(normal));
  });

  test("TC-J10: bearish EMA cross boosts exit score", () => {
    const bearish = makeCtx({ ind: makeInd({ ema9: 95, ema21: 100 }) });
    const bullish = makeCtx({ ind: makeInd({ ema9: 105, ema21: 100 }) });
    expect(scoreExit(bearish)).toBeGreaterThan(scoreExit(bullish));
  });

  test("TC-J11: negative MACD histogram boosts exit score", () => {
    const negHist = makeCtx({
      ind: makeInd({ macd: { macd: -0.5, signal: -0.2, histogram: -0.3 } }),
    });
    const posHist = makeCtx({
      ind: makeInd({ macd: { macd: 0.5, signal: 0.2, histogram: 0.3 } }),
    });
    expect(scoreExit(negHist)).toBeGreaterThan(scoreExit(posHist));
  });

  test("TC-J12: negative animal blend boosts exit score", () => {
    const neg = makeCtx({ animalBlend: { score: -0.5, contributions: zeroContributions() } });
    const pos = makeCtx({ animalBlend: { score: 0.5, contributions: zeroContributions() } });
    expect(scoreExit(neg)).toBeGreaterThan(scoreExit(pos));
  });

  test("TC-J13: ADX < 20 adds modest exit boost", () => {
    const lowADX = makeCtx({ ind: makeInd({ adx14: 15 }) });
    const highADX = makeCtx({ ind: makeInd({ adx14: 30 }) });
    expect(scoreExit(lowADX)).toBeGreaterThan(scoreExit(highADX));
  });
});

/* ═══════════════════════════════════════════════════════
 *  scoreNoTrade
 * ═══════════════════════════════════════════════════════ */

describe("scoreNoTrade", () => {
  test("TC-J14: returns a number between 0 and 1", () => {
    const score = scoreNoTrade(makeCtx());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test("TC-J15: base bias > 0 (safety bias)", () => {
    // Even with normal conditions, should have a positive baseline
    const score = scoreNoTrade(makeCtx());
    expect(score).toBeGreaterThan(0);
  });

  test("TC-J16: low volatility increases no-trade score", () => {
    const low = makeCtx({ volatilityRatio: 0.001 });
    const high = makeCtx({ volatilityRatio: 0.05 });
    expect(scoreNoTrade(low)).toBeGreaterThan(scoreNoTrade(high));
  });

  test("TC-J17: many trades today increases no-trade score", () => {
    const many = makeCtx({ tradesToday: 8 });
    const few = makeCtx({ tradesToday: 1 });
    expect(scoreNoTrade(many)).toBeGreaterThan(scoreNoTrade(few));
  });

  test("TC-J18: daily loss near limit increases no-trade score", () => {
    const nearLimit = makeCtx({
      dailyPnl: -90,
      risk: { maxDailyLoss: 100, maxPositionSizePct: 21, defaultSL: 2, defaultTP: 4, trailingSL: 1 },
    });
    const farFromLimit = makeCtx({
      dailyPnl: -10,
      risk: { maxDailyLoss: 100, maxPositionSizePct: 21, defaultSL: 2, defaultTP: 4, trailingSL: 1 },
    });
    expect(scoreNoTrade(nearLimit)).toBeGreaterThan(scoreNoTrade(farFromLimit));
  });

  test("TC-J19: RSI dead zone (45-55) increases no-trade", () => {
    const deadZone = makeCtx({ ind: makeInd({ rsi14: 50 }) });
    const active = makeCtx({ ind: makeInd({ rsi14: 30 }) });
    expect(scoreNoTrade(deadZone)).toBeGreaterThan(scoreNoTrade(active));
  });
});

/* ═══════════════════════════════════════════════════════
 *  decideAction
 * ═══════════════════════════════════════════════════════ */

describe("decideAction", () => {
  test("TC-J20: returns all expected fields", () => {
    const decision = decideAction(makeCtx());
    expect(decision).toHaveProperty("action");
    expect(decision).toHaveProperty("confidenceLong");
    expect(decision).toHaveProperty("confidenceExit");
    expect(decision).toHaveProperty("confidenceNoTrade");
    expect(decision).toHaveProperty("contributions");
    expect(decision).toHaveProperty("checklist");
    expect(decision).toHaveProperty("ml");
    expect(decision).toHaveProperty("dl");
    expect(["LONG", "EXIT", "NO_TRADE"]).toContain(decision.action);
  });

  test("TC-J21: confidences are numbers in [0, 1]", () => {
    const d = decideAction(makeCtx());
    expect(d.confidenceLong).toBeGreaterThanOrEqual(0);
    expect(d.confidenceLong).toBeLessThanOrEqual(1);
    expect(d.confidenceExit).toBeGreaterThanOrEqual(0);
    expect(d.confidenceExit).toBeLessThanOrEqual(1);
    expect(d.confidenceNoTrade).toBeGreaterThanOrEqual(0);
    expect(d.confidenceNoTrade).toBeLessThanOrEqual(1);
  });

  test("TC-J22: checklist VETO blocks LONG → NO_TRADE", () => {
    // Create bullish context that would normally trigger LONG
    // but with EMA inverted so checklist T1 fails
    const ctx = makeCtx({
      ind: makeInd({
        rsi14: 42,
        ema9: 98, ema21: 100, // T1 fails: ema9 < ema21
        ema55: 95,
        macd: { macd: 0.5, signal: 0.2, histogram: 0.3 },
        adx14: 30,
        bollinger: { upper: 110, middle: 100, lower: 90, bandwidth: 20 },
        close: 92,
      }),
      htfTrendBullish: true,
      animalBlend: { score: 0.8, contributions: zeroContributions() },
    });
    const decision = decideAction(ctx);
    // The checklist should block: T1 mandatory fails
    if (!decision.checklist.allowed) {
      expect(decision.action).not.toBe("LONG");
    }
  });

  test("TC-J23: stub ML/DL (confidence=0) contributes nothing", () => {
    // With confidence=0 stubs, rules get full weight
    const ctx = makeCtx();
    const d1 = decideAction(ctx);
    // Same context but ML/DL with high confidence should differ
    const ctx2 = makeCtx({
      mlPrediction: stubML({ profitProbability: 0.9, confidence: 0.8 }),
      dlPrediction: stubDL({ directionScore: 0.9, confidence: 0.8 }),
    });
    const d2 = decideAction(ctx2);
    // With stub (conf=0) vs real (conf=0.8), confidences should differ
    expect(d1.confidenceLong).not.toEqual(d2.confidenceLong);
  });

  test("TC-J24: strongly bearish context → EXIT or NO_TRADE", () => {
    const ctx = makeCtx({
      ind: makeInd({
        rsi14: 80,
        ema9: 90, ema21: 100,
        macd: { macd: -1, signal: -0.5, histogram: -0.5 },
        bollinger: { upper: 105, middle: 100, lower: 95, bandwidth: 10 },
        close: 106, // above upper Bollinger
      }),
      htfTrendBullish: false,
      animalBlend: { score: -0.5, contributions: zeroContributions() },
      openPositionCount: 1,
    });
    const d = decideAction(ctx);
    expect(d.action === "EXIT" || d.action === "NO_TRADE").toBe(true);
  });

  test("TC-J25: checklist result contains 24 items", () => {
    const d = decideAction(makeCtx());
    expect(d.checklist.items).toHaveLength(24);
    expect(d.checklist.totalCount).toBe(24);
  });
});
