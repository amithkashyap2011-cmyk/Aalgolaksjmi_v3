import { resolvePeriod, productFor, widenStops, exitDeadline, positionalAllowed } from "../src/services/indianMarket/positional.js";

test("period and product mapping", () => {
  expect(resolvePeriod("positional")).toBe("POSITIONAL");
  expect(resolvePeriod(undefined)).toBe("INTRADAY");
  expect(resolvePeriod("junk")).toBe("INTRADAY");
  expect(productFor("INTRADAY", true)).toBe("MIS");
  expect(productFor("POSITIONAL", true)).toBe("NRML");
  expect(productFor("POSITIONAL", false)).toBe("CNC");
});

describe("widenStops", () => {
  test("equity long: distances ×2.5 on both sides", () => {
    expect(widenStops({ isLong: true, entry: 100, sl: 98, tp: 104, isOption: false })).toEqual({ sl: 95, tp: 110 });
  });
  test("equity short mirrors", () => {
    expect(widenStops({ isLong: false, entry: 100, sl: 102, tp: 96, isOption: false })).toEqual({ sl: 105, tp: 90 });
  });
  test("a long option's stop never risks more than half the premium", () => {
    const w = widenStops({ isLong: true, entry: 18.4, sl: 13.16, tp: 27.13, isOption: true });
    expect(w.sl).toBe(9.2);                       // capped at 50% of the premium, not 5.3
    expect(w.tp).toBeCloseTo(18.4 + 8.73 * 2.5, 1);
  });
});

describe("expiry rules", () => {
  test("exit 2 weekdays before expiry at 15:15 IST", () => {
    expect(exitDeadline("2026-10-27")).toBe("2026-10-23T09:45:00.000Z");   // Tue 27 → Fri 23 (skips the weekend), 15:15 IST
    expect(exitDeadline("2026-10-06")).toBe("2026-10-01T09:45:00.000Z");   // Tue 6 → Thu 1 (Mon 5; Fri 2 is a holiday)
    expect(exitDeadline(null)).toBeNull();
  });
  test("far expiry is allowed, a near one is refused with a reason", () => {
    const now = Date.parse("2026-09-30T06:00:00Z");
    expect(positionalAllowed("2026-10-27", now).ok).toBe(true);
    expect(positionalAllowed(null, now).ok).toBe(true);
    expect(positionalAllowed("2026-10-06", now).ok).toBe(true);            // Wed 30 Sep is 4 weekdays ahead
    const near = positionalAllowed("2026-10-02", now);                      // Fri 2 Oct: only 2 weekdays left
    expect(near.ok).toBe(false);
    expect((near as any).reason).toMatch(/POSITIONAL_TOO_CLOSE_TO_EXPIRY/);
  });
});
