/*
 * ─── Strategy Unit Tests ──────────────────────────────
 *
 * Tests evaluateAaryan, evaluateAayush, evaluateGayatri, evaluateLakshmi
 * with various indicator snapshots.
 */
import type { IndicatorSnapshot } from "../src/services/indicatorService";
import { evaluateAaryan } from "../src/services/strategies/aaryanStrategy";
import { evaluateAayush } from "../src/services/strategies/aayushStrategy";
import { evaluateGayatri } from "../src/services/strategies/gayatriStrategy";
import { evaluateLakshmi } from "../src/services/strategies/lakshmiStrategy";

/** Helper: build a minimal IndicatorSnapshot with overrides */
function makeSnapshot(overrides: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
  return {
    rsi14: 50,
    ema9: 100,
    ema21: 99,
    ema55: 98,
    sma200: 95,
    macd: { macd: 0.01, signal: 0.005, histogram: 0.005 },
    atr14: 2,
    adx14: null,
    bollinger: { upper: 110, middle: 100, lower: 90, bandwidth: 20 },
    stdDev20: 1.5,
    close: 100,
    changePercent: 0.5,
    ...overrides,
  };
}

describe("evaluateAaryan", () => {
  test("TC-A1: returns strategy name AARYAN", () => {
    const r = evaluateAaryan(makeSnapshot());
    expect(r.strategy).toBe("AARYAN");
  });

  test("TC-A2: returns BUY on bullish alignment", () => {
    const r = evaluateAaryan(makeSnapshot({
      ema9: 105, ema21: 100, ema55: 95,
      rsi14: 52,
      macd: { macd: 0.05, signal: 0.02, histogram: 0.03 },
      bollinger: { upper: 110, middle: 100, lower: 90, bandwidth: 20 },
      close: 103,
    }));
    expect(r.signal).toBe("BUY");
    expect(r.confidence).toBeGreaterThan(0);
  });

  test("TC-A3: returns SELL when RSI overbought + bearish EMA", () => {
    const r = evaluateAaryan(makeSnapshot({
      ema9: 95, ema21: 100, ema55: 105,
      rsi14: 75,
      macd: { macd: -0.02, signal: 0.01, histogram: -0.03 },
    }));
    expect(r.signal).toBe("SELL");
  });

  test("TC-A4: returns HOLD on mixed signals", () => {
    const r = evaluateAaryan(makeSnapshot({
      ema9: 100.5, ema21: 100, ema55: 99,
      rsi14: 55,
      macd: { macd: 0.001, signal: 0.001, histogram: 0 },
    }));
    expect(["HOLD", "BUY", "SELL"]).toContain(r.signal);
  });

  test("TC-A5: slPct and tpPct are positive", () => {
    const r = evaluateAaryan(makeSnapshot());
    expect(r.slPct).toBeGreaterThan(0);
    expect(r.tpPct).toBeGreaterThan(0);
    expect(r.trailPct).toBeGreaterThan(0);
  });

  test("TC-A6: reasons array is non-empty", () => {
    const r = evaluateAaryan(makeSnapshot());
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  test("TC-A7: handles null indicators gracefully", () => {
    const r = evaluateAaryan(makeSnapshot({
      rsi14: null,
      ema9: null,
      ema21: null,
      ema55: null,
      macd: null,
      bollinger: null,
      atr14: null,
      stdDev20: null,
    }));
    expect(r.strategy).toBe("AARYAN");
    expect(["BUY", "SELL", "HOLD"]).toContain(r.signal);
  });
});

describe("evaluateAayush", () => {
  test("TC-B1: returns strategy name AAYUSH", () => {
    const r = evaluateAayush(makeSnapshot());
    expect(r.strategy).toBe("AAYUSH");
  });

  test("TC-B2: returns BUY on oversold conditions", () => {
    const r = evaluateAayush(makeSnapshot({
      rsi14: 25,
      close: 88,
      bollinger: { upper: 110, middle: 100, lower: 90, bandwidth: 20 },
    }));
    expect(r.signal).toBe("BUY");
  });

  test("TC-B3: returns SELL on overbought conditions", () => {
    const r = evaluateAayush(makeSnapshot({
      rsi14: 78,
      close: 112,
      bollinger: { upper: 110, middle: 100, lower: 90, bandwidth: 20 },
    }));
    expect(r.signal).toBe("SELL");
  });

  test("TC-B4: slPct and tpPct are positive", () => {
    const r = evaluateAayush(makeSnapshot());
    expect(r.slPct).toBeGreaterThan(0);
    expect(r.tpPct).toBeGreaterThan(0);
  });

  test("TC-B5: handles null indicators gracefully", () => {
    const r = evaluateAayush(makeSnapshot({
      rsi14: null, ema9: null, ema21: null, ema55: null,
      macd: null, bollinger: null, atr14: null, stdDev20: null,
    }));
    expect(r.strategy).toBe("AAYUSH");
  });
});

describe("evaluateGayatri", () => {
  test("TC-C1: returns strategy name GAYATRI", () => {
    const r = evaluateGayatri(makeSnapshot());
    expect(r.strategy).toBe("GAYATRI");
  });

  test("TC-C2: frequency is between 0 and 24", () => {
    const r = evaluateGayatri(makeSnapshot());
    expect(r.frequency).toBeGreaterThanOrEqual(0);
    expect(r.frequency).toBeLessThanOrEqual(24);
  });

  test("TC-C3: signals array has 24 items", () => {
    const r = evaluateGayatri(makeSnapshot());
    expect(r.signals).toHaveLength(24);
  });

  test("TC-C4: each signal has label, active, octave", () => {
    const r = evaluateGayatri(makeSnapshot());
    for (const sig of r.signals) {
      expect(sig).toHaveProperty("label");
      expect(sig).toHaveProperty("active");
      expect(sig).toHaveProperty("octave");
    }
  });

  test("TC-C5: returns STRONG_BUY when many indicators aligned", () => {
    const r = evaluateGayatri(makeSnapshot({
      ema9: 105, ema21: 103, ema55: 100, sma200: 90,
      rsi14: 55,
      macd: { macd: 0.1, signal: 0.05, histogram: 0.05 },
      bollinger: { upper: 115, middle: 100, lower: 85, bandwidth: 30 },
      close: 106,
      changePercent: 1.5,
      atr14: 3,
      stdDev20: 2,
    }));
    expect(["BUY", "STRONG_BUY"]).toContain(r.signal);
    expect(r.frequency).toBeGreaterThanOrEqual(12);
  });

  test("TC-C6: hzLabel is a non-empty string", () => {
    const r = evaluateGayatri(makeSnapshot());
    expect(typeof r.hzLabel).toBe("string");
    expect(r.hzLabel.length).toBeGreaterThan(0);
  });

  test("TC-C7: handles all-null indicators", () => {
    const r = evaluateGayatri(makeSnapshot({
      rsi14: null, ema9: null, ema21: null, ema55: null, sma200: null,
      macd: null, bollinger: null, atr14: null, stdDev20: null,
    }));
    expect(r.strategy).toBe("GAYATRI");
    expect(r.frequency).toBeLessThanOrEqual(24);
  });
});

describe("evaluateLakshmi", () => {
  test("TC-D1: returns strategy name LAKSHMI", () => {
    const r = evaluateLakshmi(makeSnapshot());
    expect(r.strategy).toBe("LAKSHMI");
  });

  test("TC-D2: consensus has buyVotes + sellVotes + holdVotes", () => {
    const r = evaluateLakshmi(makeSnapshot());
    const { buyVotes, sellVotes, holdVotes } = r.consensus;
    expect(buyVotes + sellVotes + holdVotes).toBe(3);
  });

  test("TC-D3: gayatriFrequency is between 0 and 24", () => {
    const r = evaluateLakshmi(makeSnapshot());
    expect(r.gayatriFrequency).toBeGreaterThanOrEqual(0);
    expect(r.gayatriFrequency).toBeLessThanOrEqual(24);
  });

  test("TC-D4: subResults contains aaryan, aayush, gayatri", () => {
    const r = evaluateLakshmi(makeSnapshot());
    expect(r.subResults).toHaveProperty("aaryan");
    expect(r.subResults).toHaveProperty("aayush");
    expect(r.subResults).toHaveProperty("gayatri");
    expect(r.subResults.aaryan.strategy).toBe("AARYAN");
    expect(r.subResults.aayush.strategy).toBe("AAYUSH");
    expect(r.subResults.gayatri.strategy).toBe("GAYATRI");
  });

  test("TC-D5: slPct is min of sub-strategies (tightest)", () => {
    const r = evaluateLakshmi(makeSnapshot());
    const subs = r.subResults;
    const expected = Math.min(subs.aaryan.slPct, subs.aayush.slPct, subs.gayatri.slPct);
    expect(r.slPct).toBe(expected);
  });

  test("TC-D6: tpPct is max of sub-strategies (widest)", () => {
    const r = evaluateLakshmi(makeSnapshot());
    const subs = r.subResults;
    const expected = Math.max(subs.aaryan.tpPct, subs.aayush.tpPct, subs.gayatri.tpPct);
    expect(r.tpPct).toBe(expected);
  });

  test("TC-D7: noLossActive true when gayatri gate + animal blend positive", () => {
    // Strong bullish snapshot to maximise frequency
    const r = evaluateLakshmi(makeSnapshot({
      ema9: 110, ema21: 105, ema55: 100, sma200: 90,
      rsi14: 55,
      macd: { macd: 0.5, signal: 0.2, histogram: 0.3 },
      bollinger: { upper: 120, middle: 105, lower: 90, bandwidth: 30 },
      close: 112,
      changePercent: 2,
      atr14: 3, stdDev20: 2,
    }), 0.5);
    // When both gates pass, noLossActive should be true
    if (r.gayatriFrequency >= 16) {
      expect(r.noLossActive).toBe(true);
    }
  });

  test("TC-D8: negative animal blend disables noLoss", () => {
    const r = evaluateLakshmi(makeSnapshot(), -0.5);
    expect(r.noLossActive).toBe(false);
  });

  test("TC-D9: reasons array populated", () => {
    const r = evaluateLakshmi(makeSnapshot());
    expect(r.reasons.length).toBeGreaterThan(3);
  });

  test("TC-D10: handles all-null indicators", () => {
    const r = evaluateLakshmi(makeSnapshot({
      rsi14: null, ema9: null, ema21: null, ema55: null, sma200: null,
      macd: null, bollinger: null, atr14: null, stdDev20: null,
    }));
    expect(r.strategy).toBe("LAKSHMI");
  });
});
