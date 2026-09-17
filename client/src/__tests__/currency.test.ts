/*
 * ─── Regression: compact currency formatting must not contradict itself ───
 *
 * Found live: the TopBar's "Daily P&L" metric showed "+$0 (₹4)" for a tiny
 * non-zero P&L (~$0.042). Compact USD rounded to the nearest whole dollar
 * (toFixed(0)) while compact INR always kept whole-rupee precision — both
 * "correctly" rounded, but at wildly different granularity, so a small but
 * genuinely non-zero amount looked like "$0" next to a visibly non-zero
 * rupee figure.
 */
import { describe, test, expect } from "vitest";
import { formatUsdWithInr, formatInrWithUsd } from "../lib/currency";

describe("formatUsdWithInr — compact mode small-value precision", () => {
  test("a small non-zero USD amount never renders as literal $0 next to a non-zero INR figure", () => {
    const inrRate = 95.6;
    const dailyPnl = 4 / inrRate; // ≈ $0.0418, matches ₹4 at this rate
    const result = formatUsdWithInr(dailyPnl, inrRate, true);
    expect(result).not.toMatch(/^\$0(?!\.)/); // not a bare "$0" (but "$0.04" is fine)
    expect(result).toBe("$0.04 (₹4)");
  });

  test("still compact for larger amounts (no decimal clutter)", () => {
    expect(formatUsdWithInr(427.5, 95.6, true)).toBe("$428 (₹40,869)");
  });

  test("still uses k-notation above $1000", () => {
    expect(formatUsdWithInr(2500, 95.6, true)).toBe("$2.5k (₹2.39L)");
  });

  test("zero is still exactly zero, not a rounding artifact", () => {
    expect(formatUsdWithInr(0, 95.6, true)).toBe("$0.00 (₹0)");
  });
});

describe("formatInrWithUsd — compact mode small-value precision (same bug, other direction)", () => {
  test("a small non-zero INR amount never renders as literal $0", () => {
    const result = formatInrWithUsd(4, 95.6, true);
    expect(result).not.toMatch(/\(\$0\)$/);
    expect(result).toBe("₹4 ($0.04)");
  });
});
