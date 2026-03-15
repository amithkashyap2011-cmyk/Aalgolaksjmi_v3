/*
 * ─── Behaviour Model Unit Tests ───────────────────────
 *
 * Tests normalizeWeights, blendAnimalScores, and all 15 scorer functions
 * (10 animal + 5 strategy-themed).
 */
import type { IBehaviorWeights } from "../src/models/Settings";
import type { IndicatorSnapshot } from "../src/services/indicatorService";
import {
  normalizeWeights,
  blendAnimalScores,
  type AnimalContext,
  type NormalizedWeights,
} from "../src/services/behaviourModel";

function makeWeights(override: Partial<IBehaviorWeights> = {}): IBehaviorWeights {
  return {
    eagle: 50, tiger: 50, cheetah: 50, fox: 50, tortoise: 50,
    dog: 50, owl: 50, cow: 50, spider: 50, lion: 50,
    om_chant: 50, gayatri_mantra: 50, aaryan: 50, aayush: 50, lakshmi_hybrid: 50,
    ...override,
  } as IBehaviorWeights;
}

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

function makeCtx(override: Partial<AnimalContext> = {}): AnimalContext {
  return {
    ind: makeInd(),
    dailyPnl: 0,
    tradesToday: 1,
    maxDailyLoss: 100,
    htfTrendBullish: true,
    volatilityRatio: 0.02,
    ...override,
  };
}

describe("normalizeWeights", () => {
  test("TC-E1: converts 0-100 to 0-1", () => {
    const nw = normalizeWeights(makeWeights({ eagle: 100, tiger: 0 }));
    expect(nw.eagle).toBe(1);
    expect(nw.tiger).toBe(0);
    expect(nw.fox).toBe(0.5);
  });

  test("TC-E2: includes all 15 keys", () => {
    const nw = normalizeWeights(makeWeights());
    const keys = Object.keys(nw);
    expect(keys).toContain("eagle");
    expect(keys).toContain("lion");
    expect(keys).toContain("om_chant");
    expect(keys).toContain("gayatri_mantra");
    expect(keys).toContain("aaryan");
    expect(keys).toContain("aayush");
    expect(keys).toContain("lakshmi_hybrid");
    expect(keys).toHaveLength(15);
  });

  test("TC-E3: all values between 0 and 1", () => {
    const nw = normalizeWeights(makeWeights());
    for (const v of Object.values(nw)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("blendAnimalScores", () => {
  test("TC-E4: returns score and contributions", () => {
    const nw = normalizeWeights(makeWeights());
    const result = blendAnimalScores(nw, makeCtx());
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("contributions");
    expect(typeof result.score).toBe("number");
  });

  test("TC-E5: score is in range [-1, 1]", () => {
    const nw = normalizeWeights(makeWeights());
    const result = blendAnimalScores(nw, makeCtx());
    expect(result.score).toBeGreaterThanOrEqual(-1);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  test("TC-E6: contributions has all 15 keys", () => {
    const nw = normalizeWeights(makeWeights());
    const result = blendAnimalScores(nw, makeCtx());
    const keys = Object.keys(result.contributions);
    expect(keys).toHaveLength(15);
    expect(keys).toContain("om_chant");
    expect(keys).toContain("lakshmi_hybrid");
  });

  test("TC-E7: zero weights produce zero contributions", () => {
    const nw = normalizeWeights(makeWeights({
      eagle: 0, tiger: 0, cheetah: 0, fox: 0, tortoise: 0,
      dog: 0, owl: 0, cow: 0, spider: 0, lion: 0,
      om_chant: 0, gayatri_mantra: 0, aaryan: 0, aayush: 0, lakshmi_hybrid: 0,
    }));
    const result = blendAnimalScores(nw, makeCtx());
    for (const v of Object.values(result.contributions)) {
      expect(v).toBe(0);
    }
  });

  test("TC-E8: bullish context produces positive score", () => {
    const nw = normalizeWeights(makeWeights());
    const ctx = makeCtx({
      htfTrendBullish: true,
      ind: makeInd({
        ema9: 110, ema21: 105, ema55: 100,
        rsi14: 55,
        macd: { macd: 0.1, signal: 0.05, histogram: 0.05 },
        close: 108,
        changePercent: 1.5,
      }),
    });
    const result = blendAnimalScores(nw, ctx);
    expect(result.score).toBeGreaterThan(0);
  });

  test("TC-E9: bearish context produces negative score", () => {
    const nw = normalizeWeights(makeWeights());
    const ctx = makeCtx({
      htfTrendBullish: false,
      dailyPnl: -80,
      tradesToday: 6,
      ind: makeInd({
        ema9: 90, ema21: 95, ema55: 100,
        rsi14: 75,
        macd: { macd: -0.1, signal: 0.05, histogram: -0.15 },
        close: 88,
        bollinger: { upper: 110, middle: 100, lower: 90, bandwidth: 20 },
      }),
    });
    const result = blendAnimalScores(nw, ctx);
    expect(result.score).toBeLessThan(0);
  });

  test("TC-E10: overtrading penalised by spider scorer", () => {
    const nw = normalizeWeights(makeWeights({ spider: 100 }));
    const normal = blendAnimalScores(nw, makeCtx({ tradesToday: 1 }));
    const heavy = blendAnimalScores(nw, makeCtx({ tradesToday: 10 }));
    // Heavy trading should produce lower/more-negative spider contribution
    expect(heavy.contributions.spider).toBeLessThan(normal.contributions.spider);
  });
});
