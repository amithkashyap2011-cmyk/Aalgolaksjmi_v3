/*
 * ─── Property-based tests: computeUnrealisedPnl ────────
 *
 * This function is documented as "the single source of truth for
 * unrealised PnL" across the dashboard and positions pages — and had
 * zero test coverage of any kind before this file. Pure function, no
 * mocking needed.
 */
import fc from 'fast-check';
import { computeUnrealisedPnl, TAKER_FEE } from "../src/services/pnlService";

const priceArb = fc.double({ min: 0.00001, max: 1_000_000, noNaN: true });
const qtyArb = fc.double({ min: 0.00001, max: 100_000, noNaN: true });

// The generator ranges above span 11 orders of magnitude — at the extremes
// (e.g. price ~200,000 with qty ~0.00001), IEEE-754 double rounding at the
// 15th-16th significant digit is expected and not a real defect, so
// equality checks here use relative error rather than a fixed decimal
// count (toBeCloseTo assumes values are all roughly the same magnitude,
// which doesn't hold across this range).
function expectRelativelyClose(actual: number, expected: number, relTolerance = 1e-9) {
  const scale = Math.max(Math.abs(actual), Math.abs(expected), 1e-9);
  expect(Math.abs(actual - expected) / scale).toBeLessThan(relTolerance);
}

describe("computeUnrealisedPnl — property invariants", () => {
  test("returns exactly 0 when entryPrice, quantity, or markPrice is zero/falsy", () => {
    fc.assert(
      fc.property(priceArb, qtyArb, fc.constantFrom("BUY", "SELL"), (price, qty, side) => {
        expect(computeUnrealisedPnl({ side, entryPrice: 0, quantity: qty }, price)).toBe(0);
        expect(computeUnrealisedPnl({ side, entryPrice: price, quantity: 0 }, price)).toBe(0);
        expect(computeUnrealisedPnl({ side, entryPrice: price, quantity: qty }, 0)).toBe(0);
      }),
      { numRuns: 500 }
    );
  });

  test("BUY: profitable when markPrice > entryPrice by more than the round-trip fee cost", () => {
    fc.assert(
      fc.property(priceArb, qtyArb, fc.double({ min: 0.01, max: 2, noNaN: true }), (entryPrice, qty, upside) => {
        // Move the price up by a factor comfortably larger than 2×TAKER_FEE
        // so fees can never flip a genuinely large favorable move negative.
        const markPrice = entryPrice * (1 + upside + 0.01);
        const pnl = computeUnrealisedPnl({ side: "BUY", entryPrice, quantity: qty }, markPrice);
        expect(pnl).toBeGreaterThan(0);
      }),
      { numRuns: 500 }
    );
  });

  test("SELL: profitable when markPrice < entryPrice by more than the round-trip fee cost", () => {
    fc.assert(
      fc.property(priceArb, qtyArb, fc.double({ min: 0.01, max: 0.9, noNaN: true }), (entryPrice, qty, downside) => {
        const markPrice = entryPrice * (1 - downside - 0.01);
        if (markPrice <= 0) return; // skip invalid generated combos
        const pnl = computeUnrealisedPnl({ side: "SELL", entryPrice, quantity: qty }, markPrice);
        expect(pnl).toBeGreaterThan(0);
      }),
      { numRuns: 500 }
    );
  });

  test("BUY and SELL are mirror images at the same entry/mark/qty (gross PnL sign flips)", () => {
    fc.assert(
      fc.property(priceArb, priceArb, qtyArb, (entryPrice, markPrice, qty) => {
        const buyPnl = computeUnrealisedPnl({ side: "BUY", entryPrice, quantity: qty }, markPrice);
        const sellPnl = computeUnrealisedPnl({ side: "SELL", entryPrice, quantity: qty }, markPrice);
        // buyPnl = gross, sellPnl = -gross => buyPnl + sellPnl = 0
        expectRelativelyClose(buyPnl + sellPnl, 0);
      }),
      { numRuns: 1000 }
    );
  });

  test("no price movement at all books 0.00 gross unrealized PnL at trade entry (entryPrice === markPrice)", () => {
    fc.assert(
      fc.property(priceArb, qtyArb, fc.constantFrom("BUY", "SELL"), (price, qty, side) => {
        const pnl = computeUnrealisedPnl({ side, entryPrice: price, quantity: qty }, price);
        expectRelativelyClose(pnl, 0);
      }),
      { numRuns: 500 }
    );
  });

  test("PnL magnitude scales linearly with quantity for a fixed price move", () => {
    fc.assert(
      fc.property(priceArb, priceArb, qtyArb, fc.double({ min: 1.5, max: 10, noNaN: true }), (entryPrice, markPrice, qty, multiplier) => {
        const pnl1 = computeUnrealisedPnl({ side: "BUY", entryPrice, quantity: qty }, markPrice);
        const pnl2 = computeUnrealisedPnl({ side: "BUY", entryPrice, quantity: qty * multiplier }, markPrice);
        expectRelativelyClose(pnl2, pnl1 * multiplier);
      }),
      { numRuns: 500 }
    );
  });
});
