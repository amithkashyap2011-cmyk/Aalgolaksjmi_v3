/*
 * ─── Indicator Service Unit Tests ──────────────────────
 *
 * Tests streaming EMA, SMA, RSI, MACD, ATR, Bollinger Bands,
 * StdDev, and the full computeSnapshot function.
 */
import {
  StreamingEMA,
  StreamingSMA,
  StreamingRSI,
  StreamingMACD,
  StreamingATR,
  StreamingBollinger,
  StreamingStdDev,
  computeSnapshot,
  ema,
  sma,
  rsi,
  type OHLC,
} from "../src/services/indicatorService.js";

/* ─────────── EMA ─────────── */
describe("StreamingEMA", () => {
  test("TC-11: first value seeds the EMA", () => {
    const e = new StreamingEMA(10);
    e.update(50);
    expect(e.value).toBe(50);
  });

  test("TC-12: two values apply exponential weighting", () => {
    const e = new StreamingEMA(10);
    e.update(50);
    e.update(60);
    // k = 2/(10+1) ≈ 0.1818
    const k = 2 / 11;
    expect(e.value).toBeCloseTo(50 + k * (60 - 50), 8);
  });

  test("TC-13: reset clears internal state", () => {
    const e = new StreamingEMA(5);
    e.update(10);
    e.reset();
    expect(e.value).toBeNull();
  });

  test("TC-14: batch ema() helper returns array of same length", () => {
    const prices = [1, 2, 3, 4, 5];
    const result = ema(prices, 3);
    expect(result).toHaveLength(5);
    // first value is the seed
    expect(result[0]).toBe(1);
  });
});

/* ─────────── SMA ─────────── */
describe("StreamingSMA", () => {
  test("TC-15: returns null until window is full", () => {
    const s = new StreamingSMA(3);
    s.update(10);
    s.update(20);
    expect(s.value).toBeNull();
  });

  test("TC-16: returns correct average when window is full", () => {
    const s = new StreamingSMA(3);
    s.update(10);
    s.update(20);
    s.update(30);
    expect(s.value).toBeCloseTo(20, 8);
  });

  test("TC-17: slides window correctly", () => {
    const s = new StreamingSMA(3);
    [10, 20, 30, 40].forEach((p) => s.update(p));
    // window: [20, 30, 40]
    expect(s.value).toBeCloseTo(30, 8);
  });

  test("TC-18: batch sma() helper", () => {
    const result = sma([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(5);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2, 8);
  });
});

/* ─────────── RSI ─────────── */
describe("StreamingRSI", () => {
  test("TC-19: returns null for first bar (no delta)", () => {
    const r = new StreamingRSI(14);
    r.update(100);
    expect(r.value).toBeNull();
  });

  test("TC-20: all‑gains → RSI is very high (≥ 95)", () => {
    const r = new StreamingRSI(5);
    // 6 prices = 5 deltas = exactly 1 full period, all gains
    [100, 101, 102, 103, 104, 105].forEach((p) => r.update(p));
    // avgLoss=0 → RS=100 in our impl → RSI = 100 - 100/(1+100) ≈ 99.01
    expect(r.value).toBeGreaterThanOrEqual(95);
  });

  test("TC-21: all‑losses → RSI approaches 0", () => {
    const r = new StreamingRSI(5);
    [100, 99, 98, 97, 96, 95].forEach((p) => r.update(p));
    expect(r.value).toBeCloseTo(0, 0);
  });

  test("TC-22: alternating gains/losses → RSI near 50", () => {
    const r = new StreamingRSI(4);
    // 5 prices → 4 deltas: +1, -1, +1, -1
    [100, 101, 100, 101, 100].forEach((p) => r.update(p));
    // With Wilder's accumulation, symmetric +1/-1 gives RSI in [40,60] range
    expect(r.value).toBeGreaterThan(40);
    expect(r.value).toBeLessThan(60);
  });

  test("TC-23: reset clears state", () => {
    const r = new StreamingRSI(14);
    [100, 101].forEach((p) => r.update(p));
    r.reset();
    expect(r.value).toBeNull();
  });

  test("TC-24: batch rsi() helper", () => {
    const result = rsi([100, 101, 102], 14);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeNull(); // first bar
  });
});

/* ─────────── MACD ─────────── */
describe("StreamingMACD", () => {
  test("TC-25: after first bar, macd line is zero (fast == slow)", () => {
    const m = new StreamingMACD(12, 26, 9);
    m.update(100);
    const v = m.value;
    // EMA seeds with first price → fast == slow → macd = 0
    expect(v).not.toBeNull();
    expect(v!.macd).toBe(0);
    expect(v!.signal).toBe(0);
    expect(v!.histogram).toBe(0);
  });

  test("TC-26: macd diverges after trending input", () => {
    const m = new StreamingMACD(3, 6, 3);
    // feed enough bars for fast EMA to respond faster than slow
    [100, 102, 104, 106, 108, 110, 112].forEach((p) => m.update(p));
    const v = m.value!;
    expect(v.macd).toBeGreaterThan(0); // uptrend → fast > slow
  });

  test("TC-27: reset clears MACD", () => {
    const m = new StreamingMACD();
    m.update(100);
    m.reset();
    expect(m.value).toBeNull();
  });
});

/* ─────────── ATR ─────────── */
describe("StreamingATR", () => {
  const bar = (o: number, h: number, l: number, c: number): OHLC => ({
    open: o, high: h, low: l, close: c,
  });

  test("TC-28: returns null before period filled", () => {
    const a = new StreamingATR(3);
    a.update(bar(100, 110, 90, 105));
    expect(a.value).toBeNull();
  });

  test("TC-29: correct ATR after period bars", () => {
    const a = new StreamingATR(3);
    a.update(bar(100, 110, 90, 105)); // TR = 20
    a.update(bar(105, 115, 95, 110)); // TR = max(20, 10, 10) = 20
    a.update(bar(110, 120, 100, 115)); // TR = max(20, 10, 10) = 20
    expect(a.value).toBeCloseTo(20, 4);
  });

  test("TC-30: Wilder smoothing applies after period", () => {
    const a = new StreamingATR(2);
    a.update(bar(100, 110, 90, 105));  // TR = 20
    a.update(bar(105, 112, 98, 110));  // TR = max(14, 7, 7) = 14
    // ATR after 2 bars = (20+14)/2 = 17
    expect(a.value).toBeCloseTo(17, 4);
    a.update(bar(110, 118, 104, 115)); // TR = max(14, 8, 6) = 14
    // Wilder: (17*1 + 14) / 2 = 15.5
    expect(a.value).toBeCloseTo(15.5, 4);
  });

  test("TC-31: reset clears ATR", () => {
    const a = new StreamingATR(3);
    a.update(bar(100, 110, 90, 105));
    a.reset();
    expect(a.value).toBeNull();
  });
});

/* ─────────── Bollinger Bands ─────────── */
describe("StreamingBollinger", () => {
  test("TC-32: returns null before window fills", () => {
    const b = new StreamingBollinger(3, 2);
    b.update(100);
    b.update(101);
    expect(b.value).toBeNull();
  });

  test("TC-33: constant prices → zero bandwidth", () => {
    const b = new StreamingBollinger(3, 2);
    [100, 100, 100].forEach((p) => b.update(p));
    const v = b.value!;
    expect(v.middle).toBeCloseTo(100, 8);
    expect(v.upper).toBeCloseTo(100, 8);
    expect(v.lower).toBeCloseTo(100, 8);
    expect(v.bandwidth).toBeCloseTo(0, 8);
  });

  test("TC-34: bands widen with volatility", () => {
    const b = new StreamingBollinger(3, 2);
    [100, 200, 300].forEach((p) => b.update(p));
    const v = b.value!;
    expect(v.upper).toBeGreaterThan(v.middle);
    expect(v.lower).toBeLessThan(v.middle);
    expect(v.bandwidth).toBeGreaterThan(0);
  });

  test("TC-35: reset clears Bollinger", () => {
    const b = new StreamingBollinger(3, 2);
    [100, 100, 100].forEach((p) => b.update(p));
    b.reset();
    expect(b.value).toBeNull();
  });
});

/* ─────────── StdDev ─────────── */
describe("StreamingStdDev", () => {
  test("TC-36: returns null before window fills", () => {
    const sd = new StreamingStdDev(3);
    sd.update(10);
    expect(sd.value).toBeNull();
  });

  test("TC-37: constant values → stddev = 0", () => {
    const sd = new StreamingStdDev(3);
    [5, 5, 5].forEach((p) => sd.update(p));
    expect(sd.value).toBeCloseTo(0, 8);
  });

  test("TC-38: known stddev for [1,2,3]", () => {
    const sd = new StreamingStdDev(3);
    [1, 2, 3].forEach((p) => sd.update(p));
    // population stddev of [1,2,3] = sqrt(2/3) ≈ 0.8165
    expect(sd.value).toBeCloseTo(Math.sqrt(2 / 3), 4);
  });
});

/* ─────────── computeSnapshot ─────────── */
describe("computeSnapshot", () => {
  const mkBar = (close: number): OHLC => ({
    open: close - 1, high: close + 2, low: close - 2, close,
  });

  test("TC-38b: single bar produces a snapshot with close", () => {
    const snap = computeSnapshot([mkBar(100)]);
    expect(snap.close).toBe(100);
    expect(snap.changePercent).toBe(0); // only 1 bar
  });

  test("TC-38c: 250 bars fills all indicators", () => {
    const bars: OHLC[] = [];
    for (let i = 0; i < 250; i++) {
      bars.push(mkBar(100 + Math.sin(i / 10) * 10));
    }
    const snap = computeSnapshot(bars);
    expect(snap.rsi14).not.toBeNull();
    expect(snap.ema9).not.toBeNull();
    expect(snap.sma200).not.toBeNull();
    expect(snap.macd).not.toBeNull();
    expect(snap.atr14).not.toBeNull();
    expect(snap.adx14).not.toBeNull();
    expect(snap.bollinger).not.toBeNull();
    expect(snap.stdDev20).not.toBeNull();
  });
});
