/*
 * ─── ADX & VWAP Indicator Tests ───────────────────────
 *
 * Tests for StreamingADX and StreamingVWAP added in Phase 4.
 * TC-H1 to TC-H14.
 */
import {
  StreamingADX,
  StreamingVWAP,
  type OHLC,
  type OHLCVol,
} from "../src/services/indicatorService";

/* ── Helpers ──────────────────────────────────────────── */

function mkBar(close: number, spread = 4): OHLC {
  return { open: close - 1, high: close + spread / 2, low: close - spread / 2, close };
}

function mkVolBar(close: number, volume: number, spread = 4): OHLCVol {
  return { open: close - 1, high: close + spread / 2, low: close - spread / 2, close, volume };
}

/* ═══════════════════════════════════════════════════════
 *  StreamingADX
 * ═══════════════════════════════════════════════════════ */

describe("StreamingADX", () => {
  test("TC-H1: returns null before warmup period", () => {
    const adx = new StreamingADX(14);
    // Need at least period + 1 bars for first smoothed DM, then another period for ADX smoothing
    for (let i = 0; i < 10; i++) {
      adx.update(mkBar(100 + i));
    }
    expect(adx.value).toBeNull();
  });

  test("TC-H2: produces a numeric value after 2×period bars", () => {
    const adx = new StreamingADX(14);
    // Feed 30+ bars (need 2*14 = 28 bars minimum for ADX to have a value)
    for (let i = 0; i < 40; i++) {
      adx.update(mkBar(100 + Math.sin(i / 5) * 10));
    }
    expect(adx.value).not.toBeNull();
    expect(typeof adx.value).toBe("number");
  });

  test("TC-H3: ADX is between 0 and 100", () => {
    const adx = new StreamingADX(14);
    for (let i = 0; i < 50; i++) {
      adx.update(mkBar(100 + Math.sin(i / 5) * 10));
    }
    expect(adx.value).toBeGreaterThanOrEqual(0);
    expect(adx.value).toBeLessThanOrEqual(100);
  });

  test("TC-H4: strong uptrend produces higher ADX than flat market", () => {
    // Strong uptrend
    const adxTrend = new StreamingADX(14);
    for (let i = 0; i < 50; i++) {
      adxTrend.update(mkBar(100 + i * 2)); // steadily rising
    }

    // Flat / noisy market
    const adxFlat = new StreamingADX(14);
    for (let i = 0; i < 50; i++) {
      adxFlat.update(mkBar(100 + (i % 2 === 0 ? 0.1 : -0.1)));
    }

    expect(adxTrend.value).not.toBeNull();
    expect(adxFlat.value).not.toBeNull();
    expect(adxTrend.value!).toBeGreaterThan(adxFlat.value!);
  });

  test("TC-H5: reset clears ADX state", () => {
    const adx = new StreamingADX(14);
    for (let i = 0; i < 50; i++) {
      adx.update(mkBar(100 + i));
    }
    expect(adx.value).not.toBeNull();
    adx.reset();
    expect(adx.value).toBeNull();
  });

  test("TC-H6: short period ADX warms up faster", () => {
    const adx5 = new StreamingADX(5);
    for (let i = 0; i < 15; i++) {
      adx5.update(mkBar(100 + i));
    }
    expect(adx5.value).not.toBeNull();
  });

  test("TC-H7: first bar always returns null", () => {
    const adx = new StreamingADX(14);
    const result = adx.update(mkBar(100));
    expect(result).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════
 *  StreamingVWAP
 * ═══════════════════════════════════════════════════════ */

describe("StreamingVWAP", () => {
  test("TC-H8: returns null with zero volume", () => {
    const vwap = new StreamingVWAP();
    vwap.update(mkVolBar(100, 0));
    expect(vwap.value).toBeNull();
  });

  test("TC-H9: single bar VWAP equals typical price", () => {
    const vwap = new StreamingVWAP();
    const bar = mkVolBar(100, 1000, 4);
    vwap.update(bar);
    const expectedTP = (bar.high + bar.low + bar.close) / 3;
    expect(vwap.value).toBeCloseTo(expectedTP, 6);
  });

  test("TC-H10: VWAP with known values", () => {
    const vwap = new StreamingVWAP();
    // Bar 1: TP = (102+98+100)/3 = 100, vol = 100 → TPV = 10000
    vwap.update({ open: 99, high: 102, low: 98, close: 100, volume: 100 });
    // Bar 2: TP = (112+108+110)/3 = 110, vol = 200 → TPV = 22000
    vwap.update({ open: 109, high: 112, low: 108, close: 110, volume: 200 });
    // cumTPV = 10000 + 22000 = 32000, cumVol = 300
    // VWAP = 32000 / 300 = 106.6667
    expect(vwap.value).toBeCloseTo(32000 / 300, 4);
  });

  test("TC-H11: higher-volume bars dominate VWAP", () => {
    const vwap = new StreamingVWAP();
    // Low-price bar with low volume
    vwap.update({ open: 99, high: 102, low: 98, close: 100, volume: 10 });
    // High-price bar with huge volume
    vwap.update({ open: 199, high: 202, low: 198, close: 200, volume: 10000 });
    // VWAP should be much closer to 200 than to 100
    expect(vwap.value!).toBeGreaterThan(190);
  });

  test("TC-H12: reset clears VWAP state", () => {
    const vwap = new StreamingVWAP();
    vwap.update(mkVolBar(100, 500));
    expect(vwap.value).not.toBeNull();
    vwap.reset();
    expect(vwap.value).toBeNull();
  });

  test("TC-H13: VWAP stays constant with equal-price equal-volume bars", () => {
    const vwap = new StreamingVWAP();
    for (let i = 0; i < 10; i++) {
      vwap.update({ open: 99, high: 102, low: 98, close: 100, volume: 50 });
    }
    const tp = (102 + 98 + 100) / 3;
    expect(vwap.value).toBeCloseTo(tp, 6);
  });

  test("TC-H14: VWAP after reset starts fresh", () => {
    const vwap = new StreamingVWAP();
    vwap.update(mkVolBar(50, 100));
    const v1 = vwap.value;
    vwap.reset();
    vwap.update(mkVolBar(200, 100));
    const v2 = vwap.value;
    // After reset, VWAP should reflect only the second bar
    expect(v2).not.toBeCloseTo(v1!, 0);
    const expectedTP = (202 + 198 + 200) / 3;
    expect(v2).toBeCloseTo(expectedTP, 6);
  });
});
