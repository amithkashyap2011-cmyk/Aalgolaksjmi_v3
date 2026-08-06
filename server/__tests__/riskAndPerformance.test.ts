/*
 * ─── Risk & Performance Tests ──────────────────────────
 *
 * This file originally covered five areas via a `SaraswatiReasoning`
 * service and the removed `decideAction`/`AgentContext` pipeline. Only
 * section 4 (indicator caching) survives — here's why the rest doesn't:
 *
 *   1. Funding Rate Impact, 3. Sudden Wick Rejection, 5. Leverage-Aware SL
 *      Floors — all called `SaraswatiReasoning.analyze()`. That module
 *      (server/src/services/saraswatiReasoning.ts) does not exist anywhere
 *      in git history — it was never committed, unlike checklist.ts (which
 *      *was* committed and got recovered from git). No other service in
 *      the codebase implements the same funding-rate-drag penalty or
 *      leverage-tiered stop-loss-floor logic these tests describe (checked:
 *      no match for "Funding Rate Drag" anywhere in server/src). This is a
 *      genuine missing production feature, not a renamed one — fabricating
 *      a new implementation from the test assertions alone would mean
 *      inventing risk-management thresholds (e.g. "0.55% SL floor at 5x
 *      leverage") with no technical basis, which is a product decision, not
 *      a test-maintenance one. Flagged as a real gap rather than faked.
 *
 *   2. Correlation between Multiple Assets — asserted a checklist R6 spoke
 *      that blocks entries once same-side correlated positions reach 3,
 *      with a "Correlated LONG=N" detail message. The current, git-
 *      recoverable checklist.ts (see __tests__/checklist.test.ts, its own
 *      dedicated and passing suite) defines R6 differently: a flat
 *      "openPositionCount < 5" check with an "Open=N" message. These two
 *      contradict each other, and checklist.test.ts is the authoritative,
 *      verified-correct spec for that spoke — rebuilding a correlation-
 *      counting R6 here would silently regress the already-fixed checklist.
 */
import type { OHLC } from "../src/services/indicatorService.js";
import { computeSnapshot } from "../src/services/indicatorService.js";

describe("Risk & Performance Optimizations", () => {
  describe("API Data Delay / Stale Indicators Caching", () => {
    it("should return an equivalent snapshot when OHLC bars have not changed", () => {
      const bars: OHLC[] = [];
      for (let i = 0; i < 200; i++) {
        bars.push({ open: 100, high: 101, low: 99, close: 100, volume: 100 } as any);
      }

      const snap1 = computeSnapshot(bars);
      const snap2 = computeSnapshot(bars);

      expect(snap1).toEqual(snap2);
    });

    it("should recompute when bars change", () => {
      const bars: OHLC[] = [];
      for (let i = 0; i < 200; i++) {
        bars.push({ open: 100, high: 101, low: 99, close: 100, volume: 100 } as any);
      }

      const snap1 = computeSnapshot(bars);

      const updatedBars = [...bars];
      updatedBars[199] = { open: 100, high: 101.5, low: 99, close: 101, volume: 150 } as any;

      const snap2 = computeSnapshot(updatedBars);

      expect(snap1.close).toBe(100);
      expect(snap2.close).toBe(101);
      expect(snap1).not.toEqual(snap2);
    });
  });
});
