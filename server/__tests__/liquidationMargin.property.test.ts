/*
 * ─── Property-based tests: liquidation proximity & margin math ──
 *
 * Scope note: this codebase does not compute its own liquidation price —
 * Binance provides that directly for LIVE futures positions
 * (FuturesPosition.liquidationPrice from /fapi/v2/positionRisk). What IS
 * real, pure, exported, and previously untested is
 * `checkLiquidationProximity` in binanceService.ts (visibility-only
 * distance-to-liquidation calculation). The PAPER-mode 90%-margin
 * liquidation trigger in sentinelAuditor.ts is inline within a larger
 * async function with real I/O side effects (Trade.updateOne, wallet
 * writes, Alert.create) — not extracted this pass (would need the same
 * mechanical-extraction treatment as autoTradeEngine.decisionLogic.ts;
 * flagged as a roadmap item rather than rushed). Its underlying formula
 * (initialMargin = qty*entryPrice/leverage, liquidate when pnl <=
 * -0.9*initialMargin) is still verified here as pure math, independent of
 * the side-effecting code that currently houses it.
 */
import fc from 'fast-check';
import { checkLiquidationProximity } from "../src/services/binanceService";

const priceArb = fc.double({ min: 0.01, max: 1_000_000, noNaN: true });

describe("checkLiquidationProximity — property invariants", () => {
  test("returns null for any non-finite or non-positive liquidationPrice/currentPrice", () => {
    fc.assert(
      fc.property(priceArb, fc.constantFrom(0, -1, NaN, Infinity, -Infinity), fc.boolean(), (validPrice, badValue, badIsLiq) => {
        const liq = badIsLiq ? badValue : validPrice;
        const cur = badIsLiq ? validPrice : badValue;
        expect(checkLiquidationProximity(liq, cur)).toBeNull();
      }),
      { numRuns: 500 }
    );
  });

  test("distancePct is always >= 0 for valid inputs", () => {
    fc.assert(
      fc.property(priceArb, priceArb, (liq, cur) => {
        const result = checkLiquidationProximity(liq, cur);
        expect(result).not.toBeNull();
        expect(result!.distancePct).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 1000 }
    );
  });

  test("distancePct is exactly 0 when currentPrice equals liquidationPrice", () => {
    fc.assert(
      fc.property(priceArb, (price) => {
        const result = checkLiquidationProximity(price, price);
        expect(result!.distancePct).toBe(0);
        expect(result!.warning).toBe(true); // 0 <= any non-negative threshold
      }),
      { numRuns: 300 }
    );
  });

  test("warning is true if and only if distancePct <= threshold (default 0.10)", () => {
    fc.assert(
      fc.property(priceArb, priceArb, (liq, cur) => {
        const result = checkLiquidationProximity(liq, cur)!;
        expect(result.warning).toBe(result.distancePct <= 0.10);
      }),
      { numRuns: 1000 }
    );
  });

  test("warning respects a custom threshold", () => {
    fc.assert(
      fc.property(priceArb, priceArb, fc.double({ min: 0, max: 1, noNaN: true }), (liq, cur, threshold) => {
        const result = checkLiquidationProximity(liq, cur, threshold)!;
        expect(result.warning).toBe(result.distancePct <= threshold);
      }),
      { numRuns: 1000 }
    );
  });

  test("distancePct is symmetric in direction — moving equally far above or below liquidation price yields the same distance, scaled by currentPrice", () => {
    fc.assert(
      fc.property(priceArb, fc.double({ min: 0.001, max: 0.5, noNaN: true }), (currentPrice, fraction) => {
        const liqBelow = currentPrice * (1 - fraction);
        const liqAbove = currentPrice * (1 + fraction);
        const below = checkLiquidationProximity(liqBelow, currentPrice)!;
        const above = checkLiquidationProximity(liqAbove, currentPrice)!;
        expect(below.distancePct).toBeCloseTo(above.distancePct, 9);
        expect(below.distancePct).toBeCloseTo(fraction, 9);
      }),
      { numRuns: 500 }
    );
  });
});

describe("Paper-mode liquidation math (pure formula, independent of sentinelAuditor.ts's I/O) — property invariants", () => {
  function initialMargin(quantity: number, entryPrice: number, leverage: number) {
    return (quantity * entryPrice) / (leverage || 1);
  }
  function isPaperLiquidated(pnl: number, margin: number) {
    return pnl <= -0.9 * margin;
  }

  const qtyArb = fc.double({ min: 0.00001, max: 1000, noNaN: true });
  const leverageArb = fc.double({ min: 1, max: 125, noNaN: true });

  test("initialMargin scales inversely with leverage — doubling leverage halves required margin", () => {
    fc.assert(
      fc.property(qtyArb, priceArb, leverageArb, (qty, price, leverage) => {
        const m1 = initialMargin(qty, price, leverage);
        const m2 = initialMargin(qty, price, leverage * 2);
        expect(m2).toBeCloseTo(m1 / 2, 6);
      }),
      { numRuns: 500 }
    );
  });

  test("a loss of exactly 90% of margin triggers liquidation; 89.9999% does not", () => {
    fc.assert(
      fc.property(qtyArb, priceArb, leverageArb, (qty, price, leverage) => {
        const margin = initialMargin(qty, price, leverage);
        expect(isPaperLiquidated(-0.9 * margin, margin)).toBe(true);
        expect(isPaperLiquidated(-0.899999 * margin, margin)).toBe(false);
      }),
      { numRuns: 500 }
    );
  });

  test("liquidation threshold is monotonic in leverage — for a fixed absolute loss, higher leverage (smaller margin) liquidates at a smaller loss magnitude", () => {
    fc.assert(
      fc.property(qtyArb, priceArb, fc.double({ min: 1, max: 60, noNaN: true }), (qty, price, leverage) => {
        const lowLevMargin = initialMargin(qty, price, leverage);
        const highLevMargin = initialMargin(qty, price, leverage * 2);
        // The loss magnitude that triggers liquidation at high leverage is
        // always <= the threshold at low leverage (smaller margin cushion).
        expect(0.9 * highLevMargin).toBeLessThanOrEqual(0.9 * lowLevMargin);
      }),
      { numRuns: 500 }
    );
  });
});
