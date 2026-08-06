/*
 * ─── Property-based tests: position-averaging math ─────
 *
 * Extracts the exact weighted-average formula used in trading.ts's
 * "averaging up/down" branch (existing.quantity/entryPrice + incoming
 * quantity/price → new weighted entryPrice) and checks two invariants
 * that must hold for ANY random combination of quantities/prices:
 *   1. The resulting average entry price is always within [min(prices),
 *      max(prices)] — a weighted average can never fall outside its
 *      inputs' range.
 *   2. Total notional value is conserved: sum(qty_i * price_i) equals
 *      finalQty * finalEntryPrice, within floating-point tolerance.
 * This is pure math with no DB/mocking — a fast, cheap, high-value check
 * on the exact formula this session's concurrency fix depends on being
 * correct under repeated application.
 */
import fc from 'fast-check';

function averageIn(existingQty: number, existingPrice: number, addQty: number, addPrice: number) {
  const totalValue = existingQty * existingPrice + addQty * addPrice;
  const finalQty = existingQty + addQty;
  const finalEntry = totalValue / finalQty;
  return { finalQty, finalEntry };
}

describe("Position averaging math — property invariants", () => {
  test("weighted average entry price is always within [min, max] of the input prices", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.0001, max: 1000, noNaN: true }),
        fc.double({ min: 0.01, max: 100000, noNaN: true }),
        fc.double({ min: 0.0001, max: 1000, noNaN: true }),
        fc.double({ min: 0.01, max: 100000, noNaN: true }),
        (existingQty, existingPrice, addQty, addPrice) => {
          const { finalEntry } = averageIn(existingQty, existingPrice, addQty, addPrice);
          const lo = Math.min(existingPrice, addPrice);
          const hi = Math.max(existingPrice, addPrice);
          // Small epsilon for floating-point rounding at the boundary.
          expect(finalEntry).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(finalEntry).toBeLessThanOrEqual(hi + 1e-9);
        }
      ),
      { numRuns: 2000 }
    );
  });

  test("total notional value is conserved across an average-in operation", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.0001, max: 1000, noNaN: true }),
        fc.double({ min: 0.01, max: 100000, noNaN: true }),
        fc.double({ min: 0.0001, max: 1000, noNaN: true }),
        fc.double({ min: 0.01, max: 100000, noNaN: true }),
        (existingQty, existingPrice, addQty, addPrice) => {
          const inputNotional = existingQty * existingPrice + addQty * addPrice;
          const { finalQty, finalEntry } = averageIn(existingQty, existingPrice, addQty, addPrice);
          const outputNotional = finalQty * finalEntry;
          // Relative tolerance rather than absolute — these values span
          // many orders of magnitude across the generated range.
          const relError = Math.abs(outputNotional - inputNotional) / Math.max(inputNotional, 1e-9);
          expect(relError).toBeLessThan(1e-9);
        }
      ),
      { numRuns: 2000 }
    );
  });

  test("repeated averaging (chained) never produces NaN or Infinity for any sequence of valid inputs", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.double({ min: 0.0001, max: 1000, noNaN: true }),
            fc.double({ min: 0.01, max: 100000, noNaN: true }),
          ),
          { minLength: 1, maxLength: 20 }
        ),
        (fills) => {
          let qty = 0, price = 0;
          for (const [fillQty, fillPrice] of fills) {
            const result = averageIn(qty, price, fillQty, fillPrice);
            qty = result.finalQty;
            price = result.finalEntry;
            expect(Number.isFinite(qty)).toBe(true);
            expect(Number.isFinite(price)).toBe(true);
          }
        }
      ),
      { numRuns: 1000 }
    );
  });
});
