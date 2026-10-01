import { describe, it, expect } from "@jest/globals";
import { heatPercent } from "../src/services/aqea/unifiedSizingEngine.js";
import { buildChecklist } from "../src/services/checklist.js";
import { createMockRiskConfig } from "../src/utils/testHelpers.js";

describe("capital heat uses total capital (free cash + deployed margin)", () => {
  it("$20 deployed with $80 free is 20%, not 25%", () => expect(heatPercent(20, 80)).toBeCloseTo(20, 6));
  it("$60 deployed with $20 free is 75%, not 300%", () => expect(heatPercent(60, 20)).toBeCloseTo(75, 6));
  it("never exceeds 100% and is 0 with nothing deployed or no capital", () => {
    expect(heatPercent(100, 0)).toBe(100);
    expect(heatPercent(0, 500)).toBe(0);
    expect(heatPercent(0, 0)).toBe(0);
    expect(heatPercent(10, -50)).toBe(100);
  });
});

describe("checklist R6 follows the user's max concurrent positions", () => {
  const ind: any = {
    rsi14: 50, ema9: 100, ema21: 99, ema55: 98, sma200: 95,
    macd: { macd: 0.01, signal: 0.005, histogram: 0.005 }, atr14: 2, adx14: 20,
    bollinger: { upper: 110, middle: 100, lower: 90, bandwidth: 20 }, stdDev20: 1.5, close: 100, changePercent: 0.5,
  };
  const weights: any = Object.fromEntries(["eagle", "tiger", "cheetah", "fox", "tortoise", "dog", "owl", "cow", "spider", "lion", "om_chant", "gayatri_mantra", "aaryan", "aayush", "lakshmi_hybrid"].map((k) => [k, 0.5]));
  const r6 = (open: number, max?: number) => buildChecklist({
    ind, risk: createMockRiskConfig({ maxPositionSizePct: 1.0 }), weights, dailyPnl: 0, tradesToday: 1,
    openPositionCount: open, maxOpenPositions: max, positionSizePct: 0.8, htfTrendBullish: true,
    animalBlendScore: 0.5, ohmSyncValue: 0.6, lastTradeMinutesAgo: 10,
  } as any).items.find((i: any) => i.spoke === "R6")!;

  it("allows 7 open when the user's limit is 10 (was blocked at 5)", () => expect(r6(7, 10).passed).toBe(true));
  it("blocks at the user's limit", () => expect(r6(10, 10).passed).toBe(false));
  it("keeps the old default of 5 when no limit is given", () => { expect(r6(4).passed).toBe(true); expect(r6(5).passed).toBe(false); });
});
