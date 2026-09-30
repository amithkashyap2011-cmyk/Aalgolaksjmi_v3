import { stockTrail, extendTarget, MAX_TARGET_EXTENSIONS } from "../src/services/indianMarket/dynamicExits.js";

// KOTAKBANK-like long: entry 414.90, stop 407.43 (R = 7.47), target 429.84 (2R)
const base = { isLong: true, entry: 414.9, sl: 407.43, initialSl: 407.43 };

describe("stockTrail (R-multiple tiers for cash equities)", () => {
  test("no move → no change", () => expect(stockTrail({ ...base, highest: 415, lowest: 414 })).toBeNull());
  test("+0.75R → breakeven plus a small buffer", () => {
    const t = stockTrail({ ...base, highest: 414.9 + 0.8 * 7.47, lowest: 414 })!;
    expect(t.stage).toBe("STOCK_BREAKEVEN");
    expect(t.sl).toBeCloseTo(414.9 + 0.1 * 7.47, 2);
  });
  test("+1.25R → locks half an R", () => {
    const t = stockTrail({ ...base, highest: 414.9 + 1.3 * 7.47, lowest: 414 })!;
    expect(t.stage).toBe("STOCK_LOCK_0_5R");
    expect(t.sl).toBeCloseTo(414.9 + 0.5 * 7.47, 2);
  });
  test("+2R and beyond → trails at 60% of the peak gain", () => {
    const t = stockTrail({ ...base, highest: 414.9 + 3 * 7.47, lowest: 414 })!;
    expect(t.stage).toBe("STOCK_TRAIL_60PCT");
    expect(t.sl).toBeCloseTo(414.9 + 0.6 * 3 * 7.47, 2);
  });
  test("never loosens an already tighter stop", () => {
    expect(stockTrail({ ...base, sl: 420, highest: 414.9 + 0.8 * 7.47, lowest: 414 })).toBeNull();
  });
  test("a stop that is not below entry (already trailed) is left alone", () => {
    expect(stockTrail({ ...base, initialSl: 415, highest: 430, lowest: 414 })).toBeNull();
  });
  test("shorts mirror longs", () => {
    const t = stockTrail({ isLong: false, entry: 100, sl: 102, initialSl: 102, highest: 101, lowest: 98.3 })!; // R=2, peak 1.7 = 0.85R
    expect(t.stage).toBe("STOCK_BREAKEVEN");
    expect(t.sl).toBeCloseTo(99.8, 2);
  });
});

describe("extendTarget (dynamic profit)", () => {
  const inp = { isLong: true, entry: 100, sl: 90, tp: 120, initialTpDistance: 20, extensions: 0 };
  test("far from target → untouched", () => expect(extendTarget({ ...inp, ltp: 110 }).extended).toBe(false));
  test("within 10% of target → target +50% of original distance, stop locks half the gain", () => {
    const r = extendTarget({ ...inp, ltp: 118 });
    expect(r).toEqual({ tp: 130, sl: 109, extensions: 1, extended: true });
  });
  test("a gap through the target extends repeatedly, up to the cap", () => {
    const r = extendTarget({ ...inp, ltp: 500 });
    expect(r.extensions).toBe(MAX_TARGET_EXTENSIONS);
    expect(r.tp).toBe(150);
  });
  test("after the cap the original exit-at-target behaviour returns", () => {
    const r = extendTarget({ ...inp, tp: 150, extensions: MAX_TARGET_EXTENSIONS, ltp: 149 });
    expect(r.extended).toBe(false);
  });
  test("the stop is never loosened", () => {
    expect(extendTarget({ ...inp, sl: 115, ltp: 118 }).sl).toBe(115);
  });
  test("shorts mirror longs", () => {
    const r = extendTarget({ isLong: false, entry: 100, sl: 110, tp: 80, ltp: 82, initialTpDistance: 20, extensions: 0 });
    expect(r).toEqual({ tp: 70, sl: 91, extensions: 1, extended: true });
  });
});
