/*
 * ─── ML / DL Stub Unit Tests ──────────────────────────
 *
 * Tests for mlModelService (buildMLFeatures, predict)
 * and dlModelService (buildSequenceInput, predictSequence).
 * TC-K1 to TC-K14.
 */
import {
  buildMLFeatures,
  predict,
  type MLFeatures,
  type MLPrediction,
} from "../src/services/mlModelService";
import {
  buildSequenceInput,
  predictSequence,
  type SequenceInput,
  type DLPrediction,
} from "../src/services/dlModelService";
import type { IndicatorSnapshot, OHLC } from "../src/services/indicatorService";

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

function makeWeightsMap(): Record<string, number> {
  return {
    eagle: 0.5, tiger: 0.5, cheetah: 0.5, fox: 0.5, tortoise: 0.5,
    dog: 0.5, owl: 0.5, cow: 0.5, spider: 0.5, lion: 0.5,
  };
}

function makeBars(count: number): OHLC[] {
  return Array.from({ length: count }, (_, i) => ({
    open: 100 + i - 1,
    high: 100 + i + 2,
    low: 100 + i - 2,
    close: 100 + i,
  }));
}

/* ═══════════════════════════════════════════════════════
 *  buildMLFeatures
 * ═══════════════════════════════════════════════════════ */

describe("buildMLFeatures", () => {
  test("TC-K1: returns all expected feature fields", () => {
    const features = buildMLFeatures(makeInd(), makeWeightsMap(), 0, 100, 1, 0);
    const expectedKeys: (keyof MLFeatures)[] = [
      "rsi14", "ema9", "ema21", "ema55", "sma200",
      "macdHist", "atr14", "bollingerBW", "stdDev20", "changePercent",
      "wEagle", "wTiger", "wCheetah", "wFox", "wTortoise",
      "wDog", "wOwl", "wCow", "wSpider", "wLion",
      "dailyPnlRatio", "tradesToday", "openPositionCount",
    ];
    for (const key of expectedKeys) {
      expect(features).toHaveProperty(key);
      expect(typeof features[key]).toBe("number");
    }
  });

  test("TC-K2: null indicators fall back to defaults", () => {
    const features = buildMLFeatures(
      makeInd({ rsi14: null, ema9: null, macd: null, bollinger: null, stdDev20: null }),
      makeWeightsMap(), 0, 100, 1, 0,
    );
    expect(features.rsi14).toBe(50);                // null → 50
    expect(features.ema9).toBe(100);                 // null → close
    expect(features.macdHist).toBe(0);               // null → 0
    expect(features.bollingerBW).toBe(0);            // null → 0
    expect(features.stdDev20).toBe(0);               // null → 0
  });

  test("TC-K3: dailyPnlRatio computed correctly", () => {
    const features = buildMLFeatures(makeInd(), makeWeightsMap(), -50, 100, 1, 0);
    expect(features.dailyPnlRatio).toBeCloseTo(-0.5);
  });

  test("TC-K4: zero maxDailyLoss → dailyPnlRatio = 0", () => {
    const features = buildMLFeatures(makeInd(), makeWeightsMap(), -50, 0, 1, 0);
    expect(features.dailyPnlRatio).toBe(0);
  });

  test("TC-K5: weight values propagate correctly", () => {
    const weights = { eagle: 0.8, tiger: 0.2, cheetah: 0.5, fox: 0.5, tortoise: 0.5,
      dog: 0.5, owl: 0.5, cow: 0.5, spider: 0.5, lion: 0.5 };
    const features = buildMLFeatures(makeInd(), weights, 0, 100, 1, 0);
    expect(features.wEagle).toBe(0.8);
    expect(features.wTiger).toBe(0.2);
  });
});

/* ═══════════════════════════════════════════════════════
 *  predict (stub)
 * ═══════════════════════════════════════════════════════ */

describe("predict (ML stub)", () => {
  test("TC-K6: returns neutral prediction", async () => {
    const features = buildMLFeatures(makeInd(), makeWeightsMap(), 0, 100, 1, 0);
    const pred = await predict(features);
    expect(pred.profitProbability).toBe(0.5);
    expect(pred.expectedReturn).toBe(0);
    expect(pred.confidence).toBe(0);
    expect(pred.modelName).toBe("stub-ml-v0");
  });

  test("TC-K7: prediction matches MLPrediction interface", async () => {
    const features = buildMLFeatures(makeInd(), makeWeightsMap(), 0, 100, 1, 0);
    const pred: MLPrediction = await predict(features);
    expect(typeof pred.profitProbability).toBe("number");
    expect(typeof pred.expectedReturn).toBe("number");
    expect(typeof pred.confidence).toBe("number");
    expect(typeof pred.modelName).toBe("string");
  });
});

/* ═══════════════════════════════════════════════════════
 *  buildSequenceInput
 * ═══════════════════════════════════════════════════════ */

describe("buildSequenceInput", () => {
  test("TC-K8: returns SequenceInput with correct symbol and timeframe", () => {
    const input = buildSequenceInput("BTCUSDT", "5m", makeBars(100), 60);
    expect(input.symbol).toBe("BTCUSDT");
    expect(input.timeframe).toBe("5m");
  });

  test("TC-K9: window is capped to windowSize", () => {
    const input = buildSequenceInput("ETHUSDT", "5m", makeBars(200), 60);
    expect(input.window).toHaveLength(60);
  });

  test("TC-K10: window equals bars length if fewer than windowSize", () => {
    const input = buildSequenceInput("BTCUSDT", "5m", makeBars(30), 60);
    expect(input.window).toHaveLength(30);
  });

  test("TC-K11: each bar in window has OHLCV + indicator fields", () => {
    const input = buildSequenceInput("BTCUSDT", "5m", makeBars(100), 60);
    const bar = input.window[input.window.length - 1]; // last bar has most indicator data
    expect(typeof bar.open).toBe("number");
    expect(typeof bar.high).toBe("number");
    expect(typeof bar.low).toBe("number");
    expect(typeof bar.close).toBe("number");
    expect(typeof bar.volume).toBe("number");
    // After enough bars, indicators should be defined
    expect(bar.rsi).toBeDefined();
    expect(bar.ema9).toBeDefined();
    expect(bar.ema21).toBeDefined();
  });

  test("TC-K12: uses last N bars from enriched array", () => {
    const bars = makeBars(100);
    const input = buildSequenceInput("BTCUSDT", "5m", bars, 10);
    // Last bar in window should correspond to last bar in input
    const lastWindow = input.window[input.window.length - 1];
    const lastBar = bars[bars.length - 1];
    expect(lastWindow.close).toBe(lastBar.close);
  });
});

/* ═══════════════════════════════════════════════════════
 *  predictSequence (DL stub)
 * ═══════════════════════════════════════════════════════ */

describe("predictSequence (DL stub)", () => {
  test("TC-K13: returns neutral prediction", async () => {
    const input = buildSequenceInput("BTCUSDT", "5m", makeBars(60), 60);
    const pred = await predictSequence(input);
    expect(pred.directionScore).toBe(0.5);
    expect(pred.predictedMove).toBe(0);
    expect(pred.confidence).toBe(0);
    expect(pred.modelName).toBe("stub-dl-v0");
  });

  test("TC-K14: prediction matches DLPrediction interface", async () => {
    const input = buildSequenceInput("BTCUSDT", "5m", makeBars(60), 60);
    const pred: DLPrediction = await predictSequence(input);
    expect(typeof pred.directionScore).toBe("number");
    expect(typeof pred.predictedMove).toBe("number");
    expect(typeof pred.confidence).toBe("number");
    expect(typeof pred.modelName).toBe("string");
  });
});
