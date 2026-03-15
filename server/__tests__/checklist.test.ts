/*
 * ─── Checklist Unit Tests (24 Spokes) ─────────────────
 *
 * Tests buildChecklist — the 24-spoke pre-trade checklist.
 * Categories: TREND (T1-T8), RISK (R1-R8), BEHAVIOUR (B1-B8).
 * TC-I1 to TC-I18.
 */
import {
  buildChecklist,
  type ChecklistInput,
  type ChecklistResult,
} from "../src/services/checklist";
import type { IndicatorSnapshot } from "../src/services/indicatorService";
import type { IRiskConfig } from "../src/models/Settings";
import type { NormalizedWeights } from "../src/services/behaviourModel";

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

function makeRisk(override: Partial<IRiskConfig> = {}): IRiskConfig {
  return {
    maxDailyLoss: 100,
    maxPositionSizePct: 21,
    defaultSL: 2,
    defaultTP: 4,
    trailingSL: 1,
    ...override,
  };
}

function makeWeights(override: Partial<NormalizedWeights> = {}): NormalizedWeights {
  return {
    eagle: 0.5, tiger: 0.5, cheetah: 0.5, fox: 0.5, tortoise: 0.5,
    dog: 0.5, owl: 0.5, cow: 0.5, spider: 0.5, lion: 0.5,
    om_chant: 0.5, gayatri_mantra: 0.5, aaryan: 0.5, aayush: 0.5, lakshmi_hybrid: 0.5,
    ...override,
  } as NormalizedWeights;
}

/** Build a ChecklistInput where all mandatory checks should PASS */
function makePassingInput(override: Partial<ChecklistInput> = {}): ChecklistInput {
  return {
    ind: makeInd(),
    risk: makeRisk(),
    weights: makeWeights(),
    dailyPnl: 0,
    tradesToday: 1,
    openPositionCount: 1,
    positionSizePct: 10,
    htfTrendBullish: true,
    animalBlendScore: 0.5,   // positive and > 0.15
    ohmSyncValue: 0.6,
    lastTradeMinutesAgo: 10,
    ...override,
  };
}

/* ═══════════════════════════════════════════════════════
 *  Structure & Basic Properties
 * ═══════════════════════════════════════════════════════ */

describe("buildChecklist — structure", () => {
  test("TC-I1: returns exactly 24 items", () => {
    const result = buildChecklist(makePassingInput());
    expect(result.items).toHaveLength(24);
    expect(result.totalCount).toBe(24);
  });

  test("TC-I2: items have sequential IDs 1-24", () => {
    const result = buildChecklist(makePassingInput());
    const ids = result.items.map((i) => i.id);
    expect(ids).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  test("TC-I3: 8 TREND items, 8 RISK items, 8 BEHAVIOUR items", () => {
    const result = buildChecklist(makePassingInput());
    const trend = result.items.filter((i) => i.category === "TREND");
    const risk = result.items.filter((i) => i.category === "RISK");
    const behaviour = result.items.filter((i) => i.category === "BEHAVIOUR");
    expect(trend).toHaveLength(8);
    expect(risk).toHaveLength(8);
    expect(behaviour).toHaveLength(8);
  });

  test("TC-I4: each item has required properties", () => {
    const result = buildChecklist(makePassingInput());
    for (const item of result.items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("spoke");
      expect(item).toHaveProperty("label");
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("mandatory");
      expect(item).toHaveProperty("passed");
      expect(item).toHaveProperty("detail");
      expect(typeof item.detail).toBe("string");
    }
  });

  test("TC-I5: spokes follow T1-T8, R1-R8, B1-B8 naming", () => {
    const result = buildChecklist(makePassingInput());
    const spokes = result.items.map((i) => i.spoke);
    expect(spokes).toContain("T1");
    expect(spokes).toContain("T8");
    expect(spokes).toContain("R1");
    expect(spokes).toContain("R8");
    expect(spokes).toContain("B1");
    expect(spokes).toContain("B8");
  });
});

/* ═══════════════════════════════════════════════════════
 *  Mandatory Gates — all pass scenario
 * ═══════════════════════════════════════════════════════ */

describe("buildChecklist — all pass", () => {
  test("TC-I6: all mandatory checks pass → allowed = true", () => {
    const result = buildChecklist(makePassingInput());
    expect(result.mandatoryPassed).toBe(true);
    expect(result.allowed).toBe(true);
  });

  test("TC-I7: passedCount ≥ number of mandatory checks", () => {
    const result = buildChecklist(makePassingInput());
    const mandatoryCount = result.items.filter((i) => i.mandatory).length;
    expect(result.passedCount).toBeGreaterThanOrEqual(mandatoryCount);
  });
});

/* ═══════════════════════════════════════════════════════
 *  Mandatory Gate Failures — each one blocks allowed
 * ═══════════════════════════════════════════════════════ */

describe("buildChecklist — mandatory gates", () => {
  test("TC-I8: T1 fails — EMA9 < EMA21 → allowed = false", () => {
    const result = buildChecklist(makePassingInput({
      ind: makeInd({ ema9: 98, ema21: 100 }),
    }));
    const t1 = result.items.find((i) => i.spoke === "T1")!;
    expect(t1.passed).toBe(false);
    expect(result.allowed).toBe(false);
  });

  test("TC-I9: T3 fails — RSI outside 30-70 → allowed = false", () => {
    const result = buildChecklist(makePassingInput({
      ind: makeInd({ rsi14: 75 }),
    }));
    const t3 = result.items.find((i) => i.spoke === "T3")!;
    expect(t3.passed).toBe(false);
    expect(result.allowed).toBe(false);
  });

  test("TC-I10: T6 fails — HTF not bullish → allowed = false", () => {
    const result = buildChecklist(makePassingInput({
      htfTrendBullish: false,
    }));
    const t6 = result.items.find((i) => i.spoke === "T6")!;
    expect(t6.passed).toBe(false);
    expect(result.allowed).toBe(false);
  });

  test("TC-I11: R1 fails — position size > max → allowed = false", () => {
    const result = buildChecklist(makePassingInput({
      positionSizePct: 50,
      risk: makeRisk({ maxPositionSizePct: 21 }),
    }));
    const r1 = result.items.find((i) => i.spoke === "R1")!;
    expect(r1.passed).toBe(false);
    expect(result.allowed).toBe(false);
  });

  test("TC-I12: R2 fails — daily loss exceeds limit → allowed = false", () => {
    const result = buildChecklist(makePassingInput({
      dailyPnl: -150,
      risk: makeRisk({ maxDailyLoss: 100 }),
    }));
    const r2 = result.items.find((i) => i.spoke === "R2")!;
    expect(r2.passed).toBe(false);
    expect(result.allowed).toBe(false);
  });

  test("TC-I13: R3 fails — defaultSL is 0 → allowed = false", () => {
    const result = buildChecklist(makePassingInput({
      risk: makeRisk({ defaultSL: 0 }),
    }));
    const r3 = result.items.find((i) => i.spoke === "R3")!;
    expect(r3.passed).toBe(false);
    expect(result.allowed).toBe(false);
  });

  test("TC-I14: R5 fails — R:R < 1.5 → allowed = false", () => {
    const result = buildChecklist(makePassingInput({
      risk: makeRisk({ defaultSL: 2, defaultTP: 2 }), // R:R = 1:1 < 1.5
    }));
    const r5 = result.items.find((i) => i.spoke === "R5")!;
    expect(r5.passed).toBe(false);
    expect(result.allowed).toBe(false);
  });

  test("TC-I15: R6 fails — open positions ≥ 5 → allowed = false", () => {
    const result = buildChecklist(makePassingInput({
      openPositionCount: 5,
    }));
    const r6 = result.items.find((i) => i.spoke === "R6")!;
    expect(r6.passed).toBe(false);
    expect(result.allowed).toBe(false);
  });

  test("TC-I16: B1 fails — animalBlendScore ≤ 0 → allowed = false", () => {
    const result = buildChecklist(makePassingInput({
      animalBlendScore: -0.1,
    }));
    const b1 = result.items.find((i) => i.spoke === "B1")!;
    expect(b1.passed).toBe(false);
    expect(result.allowed).toBe(false);
  });

  test("TC-I17: B2 fails — tradesToday ≥ 8 → allowed = false", () => {
    const result = buildChecklist(makePassingInput({
      tradesToday: 10,
    }));
    const b2 = result.items.find((i) => i.spoke === "B2")!;
    expect(b2.passed).toBe(false);
    expect(result.allowed).toBe(false);
  });

  test("TC-I18: B8 fails — animalBlendScore ≤ 0.15 → allowed = false", () => {
    const result = buildChecklist(makePassingInput({
      animalBlendScore: 0.10,
    }));
    const b8 = result.items.find((i) => i.spoke === "B8")!;
    expect(b8.passed).toBe(false);
    expect(result.allowed).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════
 *  Non-mandatory checks — don't block allowed
 * ═══════════════════════════════════════════════════════ */

describe("buildChecklist — non-mandatory", () => {
  test("TC-I19: optional T2 fails but allowed still true", () => {
    const result = buildChecklist(makePassingInput({
      ind: makeInd({ ema21: 97, ema55: 99 }), // ema21 < ema55 → T2 fails
    }));
    const t2 = result.items.find((i) => i.spoke === "T2")!;
    expect(t2.mandatory).toBe(false);
    expect(t2.passed).toBe(false);
    expect(result.allowed).toBe(true); // still allowed since T2 is optional
  });

  test("TC-I20: optional B3 cooldown fails but allowed still true", () => {
    const result = buildChecklist(makePassingInput({
      lastTradeMinutesAgo: 2, // < 5 min → B3 fails
    }));
    const b3 = result.items.find((i) => i.spoke === "B3")!;
    expect(b3.mandatory).toBe(false);
    expect(b3.passed).toBe(false);
    expect(result.allowed).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════
 *  Edge: null indicators
 * ═══════════════════════════════════════════════════════ */

describe("buildChecklist — null indicators", () => {
  test("TC-I21: all-null indicators → mandatory trend checks fail → allowed = false", () => {
    const result = buildChecklist(makePassingInput({
      ind: makeInd({
        rsi14: null, ema9: null, ema21: null, ema55: null, sma200: null,
        macd: null, atr14: null, adx14: null, bollinger: null, stdDev20: null,
      }),
    }));
    expect(result.allowed).toBe(false);
  });
});
