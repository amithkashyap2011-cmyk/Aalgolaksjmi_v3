/*
 * ─── Phase 6 Server Tests · Integration + Health ──────
 *
 * TC-P6-S01 to TC-P6-S20  (20 tests)
 *
 * Covers:
 *   • Agent decision types & FusionMeta shape
 *   • Checklist spoke counts
 *   • Indicator bounds
 *   • ML/DL service stub shapes
 *   • Behaviour model weight normalization
 *   • End-to-end decision pipeline with mock context
 */
import {
  type AgentContext,
  type Decision,
  type FusionMeta,
  type Action,
  scoreLong,
  scoreExit,
  scoreNoTrade,
  decideAction,
} from "../src/services/agentService.js";
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
import { type MLPrediction, STUB_ML_PREDICTION } from "../src/services/mlModelService.js";
import { type DLPrediction, STUB_DL_PREDICTION } from "../src/services/dlModelService.js";
import type { IRiskConfig, IBehaviorWeights } from "../src/models/Settings.js";

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
  return {
    maxDailyLoss: 100,
    maxPositionSizePct: 21,
    defaultSL: 2,
    defaultTP: 4,
    trailingSL: 1.5,
    ...override,
  };
}

function makeWeights(): NormalizedWeights {
  return normalizeWeights({
    eagle: 10,
    tiger: 8,
    cheetah: 7,
    fox: 6,
    tortoise: 6,
    dog: 5,
    owl: 8,
    cow: 5,
    spider: 5,
    lion: 10,
    om_chant: 5,
    gayatri_mantra: 5,
    aaryan: 7,
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

function makeMLPrediction(override: Partial<MLPrediction> = {}): MLPrediction {
  return {
    profitProbability: 0.65,
    expectedReturn: 0.012,
    confidence: 0.7,
    modelName: "test-ml-v1",
    ...override,
  };
}

function makeDLPrediction(override: Partial<DLPrediction> = {}): DLPrediction {
  return {
    directionScore: 0.7,
    predictedMove: 0.008,
    confidence: 0.65,
    modelName: "test-dl-v1",
    ...override,
  };
}

function makeCtx(override: Partial<AgentContext> = {}): AgentContext {
  const bars = makeBars(200);
  const ind = makeSnapshot();
  return {
    symbol: "DOGEUSDT",
    mode: "PAPER",
    userId: "test-user",
    bars,
    ind,
    weights: makeWeights(),
    risk: makeRisk(),
    dailyPnl: 0,
    tradesToday: 0,
    openPositionCount: 0,
    htfTrendBullish: true,
    volatilityRatio: 0.5,
    animalBlend: { score: 0.65, contributions: {} as any },
    mlPrediction: makeMLPrediction(),
    dlPrediction: makeDLPrediction(),
    ...override,
  };
}

/* ═══════════════════════════════════════════════════════
 *  Tests
 * ═══════════════════════════════════════════════════════ */

describe("Phase 6 · Agent Decision Pipeline", () => {
  it("TC-P6-S01  scoreLong returns 0-1 range", () => {
    const ctx = makeCtx();
    const s = scoreLong(ctx);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("TC-P6-S02  scoreExit returns 0-1 range", () => {
    const s = scoreExit(makeCtx());
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("TC-P6-S03  scoreNoTrade returns 0-1 range", () => {
    const s = scoreNoTrade(makeCtx());
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("TC-P6-S04  decideAction returns valid Action enum", () => {
    const d = decideAction(makeCtx());
    expect(["LONG", "EXIT", "NO_TRADE"]).toContain(d.action);
  });

  it("TC-P6-S05  Decision includes FusionMeta with all fields", () => {
    const d = decideAction(makeCtx());
    expect(d.fusion).toBeDefined();
    expect(typeof d.fusion.effRuleWeight).toBe("number");
    expect(typeof d.fusion.effMLWeight).toBe("number");
    expect(typeof d.fusion.effDLWeight).toBe("number");
    expect(typeof d.fusion.modelsAgree).toBe("boolean");
    expect(typeof d.fusion.agreementBonus).toBe("number");
  });

  it("TC-P6-S06  Fusion weights sum to ≈1", () => {
    const d = decideAction(makeCtx());
    const sum = d.fusion.effRuleWeight + d.fusion.effMLWeight + d.fusion.effDLWeight;
    expect(sum).toBeCloseTo(1.0, 1);
  });

  it("TC-P6-S07  Decision ML/DL fields propagated", () => {
    const d = decideAction(makeCtx());
    expect(d.ml).toBeDefined();
    expect(d.dl).toBeDefined();
    expect(typeof d.ml.profitProbability).toBe("number");
    expect(typeof d.dl.directionScore).toBe("number");
  });

  it("TC-P6-S08  Overbought RSI pushes toward EXIT", () => {
    const base = decideAction(makeCtx({ ind: makeSnapshot({ rsi14: 50 }) }));
    const ob = decideAction(makeCtx({ ind: makeSnapshot({ rsi14: 85 }) }));
    expect(ob.confidenceExit).toBeGreaterThanOrEqual(base.confidenceExit);
  });

  it("TC-P6-S09  Oversold RSI keeps confidenceLong > 0", () => {
    const os = decideAction(makeCtx({ ind: makeSnapshot({ rsi14: 22 }) }));
    expect(os.confidenceLong).toBeGreaterThan(0);
  });
});

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
