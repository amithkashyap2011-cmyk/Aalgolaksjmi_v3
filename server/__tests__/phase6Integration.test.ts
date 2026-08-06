/*
 * ─── Phase 6 Server Tests · Integration + Health ──────
 *
 * TC-P6-S10 to TC-P6-S20  (11 tests)
 *
 * Covers:
 *   • Checklist spoke counts
 *   • Indicator bounds
 *   • ML/DL service stub shapes
 *   • Behaviour model weight normalization
 *
 * The original TC-P6-S01-S09 ("Agent Decision Pipeline") tested
 * agentService.ts's scoreLong/scoreExit/scoreNoTrade/decideAction and the
 * Decision/FusionMeta/Action types — all removed; agentService.ts now only
 * builds context, and AQEAEngine makes the actual decision (see
 * __tests__/agentService.test.ts for buildContext coverage, and
 * __tests__/aqea/engine.integration.test.ts for the decision pipeline).
 */
import {
  buildChecklist,
  type ChecklistInput,
  type ChecklistResult,
} from "../src/services/checklist.js";
import {
  computeSnapshot,
  type IndicatorSnapshot,
  type OHLC,
} from "../src/services/indicatorService.js";
import {
  normalizeWeights,
  blendAnimalScores,
  type NormalizedWeights,
  type AnimalContext,
} from "../src/services/behaviourModel.js";
import { STUB_ML_PREDICTION } from "../src/services/mlModelService.js";
import { STUB_DL_PREDICTION } from "../src/services/dlModelService.js";
import type { IRiskConfig, IBehaviorWeights } from "../src/models/Settings.js";
import { createMockRiskConfig } from "../src/utils/testHelpers";

/* ── Helpers ──────────────────────────────────────────── */

function makeSnapshot(override: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
  return {
    rsi14: 55,
    ema9: 101,
    ema21: 100,
    ema55: 99,
    sma200: 95,
    macd: { macd: 0.02, signal: 0.01, histogram: 0.01 },
    atr14: 1.8,
    adx14: null,
    bollinger: { upper: 108, middle: 100, lower: 92, bandwidth: 16 },
    stdDev20: 1.2,
    close: 101,
    changePercent: 0.3,
    ...override,
  };
}

function makeRisk(override: Partial<IRiskConfig> = {}): IRiskConfig {
  return createMockRiskConfig({
    trailingSL: 1.5,
    ...override,
  });
}

function makeWeights(): NormalizedWeights {
  // cow/spider/lion removed from scoring; their weight redistributed to eagle/aaryan/lakshmi_hybrid
  return normalizeWeights({
    eagle: 20,
    tiger: 8,
    cheetah: 7,
    fox: 6,
    tortoise: 6,
    dog: 5,
    owl: 8,
    om_chant: 5,
    gayatri_mantra: 5,
    aaryan: 17,
    aayush: 7,
    lakshmi_hybrid: 6,
  } as IBehaviorWeights);
}

function makeBars(n = 200): OHLC[] {
  const bars: OHLC[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const high = price + Math.random() * 2;
    const low = price - Math.random() * 2;
    price = price + (Math.random() - 0.48) * 1.5;
    const close = price;
    bars.push({ open, high, low, close });
  }
  return bars;
}

/* ═══════════════════════════════════════════════════════
 *  Tests
 * ═══════════════════════════════════════════════════════ */

describe("Phase 6 · Checklist Integration", () => {
  it("TC-P6-S10  buildChecklist returns 24 items", () => {
    const ind = makeSnapshot();
    const risk = makeRisk();
    const input: ChecklistInput = {
      ind,
      risk,
      weights: makeWeights(),
      dailyPnl: 0,
      tradesToday: 0,
      openPositionCount: 0,
      positionSizePct: 5,
      htfTrendBullish: true,
      animalBlendScore: 0.65,
      ohmSyncValue: 0.8,
      lastTradeMinutesAgo: 30,
    };
    const result = buildChecklist(input);
    expect(result.items).toHaveLength(24);
  });

  it("TC-P6-S11  Checklist item categories are TREND, RISK, BEHAVIOUR", () => {
    const input: ChecklistInput = {
      ind: makeSnapshot(),
      risk: makeRisk(),
      weights: makeWeights(),
      dailyPnl: 0,
      tradesToday: 0,
      openPositionCount: 0,
      positionSizePct: 5,
      htfTrendBullish: true,
      animalBlendScore: 0.65,
      ohmSyncValue: 0.8,
      lastTradeMinutesAgo: 30,
    };
    const result = buildChecklist(input);
    const categories = [...new Set(result.items.map((i: any) => i.category))];
    expect(categories).toContain("TREND");
    expect(categories).toContain("RISK");
    expect(categories).toContain("BEHAVIOUR");
  });

  it("TC-P6-S12  Checklist passedCount + remaining = totalCount (24)", () => {
    const input: ChecklistInput = {
      ind: makeSnapshot(),
      risk: makeRisk(),
      weights: makeWeights(),
      dailyPnl: 0,
      tradesToday: 0,
      openPositionCount: 0,
      positionSizePct: 5,
      htfTrendBullish: true,
      animalBlendScore: 0.65,
      ohmSyncValue: 0.8,
      lastTradeMinutesAgo: 30,
    };
    const result = buildChecklist(input);
    expect(result.totalCount).toBe(24);
    expect(result.passedCount).toBeLessThanOrEqual(24);
    expect(result.passedCount).toBeGreaterThanOrEqual(0);
  });
});

describe("Phase 6 · Indicator Bounds", () => {
  it("TC-P6-S13  computeSnapshot produces valid RSI [0,100]", () => {
    const bars = makeBars(200);
    const snap = computeSnapshot(bars);
    expect(snap.rsi14).toBeGreaterThanOrEqual(0);
    expect(snap.rsi14).toBeLessThanOrEqual(100);
  });

  it("TC-P6-S14  computeSnapshot bollinger has upper > lower", () => {
    const snap = computeSnapshot(makeBars(200));
    expect(snap.bollinger).not.toBeNull();
    expect(snap.bollinger!.upper).toBeGreaterThan(snap.bollinger!.lower);
  });

  it("TC-P6-S15  ATR is always positive", () => {
    const snap = computeSnapshot(makeBars(200));
    expect(snap.atr14).toBeGreaterThan(0);
  });
});

describe("Phase 6 · Behaviour Model", () => {
  it("TC-P6-S16  normalizeWeights sums to 1.0", () => {
    const w = makeWeights();
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("TC-P6-S17  blendAnimalScores returns score in [0,1]", () => {
    const ind = makeSnapshot();
    const ctx: AnimalContext = {
      ind,
      dailyPnl: 0,
      tradesToday: 0,
      maxDailyLoss: 100,
      htfTrendBullish: true,
      volatilityRatio: 0.5,
    };
    const result = blendAnimalScores(makeWeights(), ctx);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("TC-P6-S18  blendAnimalScores returns contributions object", () => {
    const ind = makeSnapshot();
    const ctx: AnimalContext = {
      ind,
      dailyPnl: 0,
      tradesToday: 0,
      maxDailyLoss: 100,
      htfTrendBullish: true,
      volatilityRatio: 0.5,
    };
    const result = blendAnimalScores(makeWeights(), ctx);
    expect(result.contributions).toBeDefined();
    expect(typeof result.contributions).toBe("object");
  });
});

describe("Phase 6 · ML/DL Type Contracts", () => {
  it("TC-P6-S19  STUB_ML_PREDICTION has zero confidence", () => {
    expect(STUB_ML_PREDICTION.confidence).toBe(0);
    expect(STUB_ML_PREDICTION.profitProbability).toBe(0.5);
    expect(STUB_ML_PREDICTION.modelName).toContain("stub");
  });

  it("TC-P6-S20  STUB_DL_PREDICTION has zero confidence", () => {
    expect(STUB_DL_PREDICTION.confidence).toBe(0);
    expect(STUB_DL_PREDICTION.directionScore).toBe(0.5);
    expect(STUB_DL_PREDICTION.modelName).toContain("stub");
  });
});
