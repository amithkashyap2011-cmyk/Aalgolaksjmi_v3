/*
 * ─── Regression: "Kelly Criterion" shown in Forecast Center must ──────
 * ─── actually compute the Kelly criterion ──────────────────────────────
 *
 * computeRiskSizing's kellyPct used to be
 *   clamp((overallWin - 0.5) / max(0.05, 1 - overallWin), 0.01, 0.10)
 * which doesn't match the standard Kelly formula f* = W - (1-W)/R under
 * any payoff ratio R, and silently discarded its own expectedReturn
 * parameter — despite being displayed to users as "Kelly Criterion" in
 * ForecastCenter.tsx. Fixed to use the real formula, deriving the payoff
 * ratio R from two quantities the ensemble already computes per symbol:
 * expectedReturn (weighted favorable move) and expectedDrawdown
 * (weighted adverse move).
 */
import { computeRiskSizing } from "../src/services/ensembleService";

function standardKelly(winProb: number, payoffRatio: number): number {
  return winProb - (1 - winProb) / payoffRatio;
}

describe("computeRiskSizing — kellyPct matches the standard Kelly formula", () => {
  test("matches W - (1-W)/R for a representative favorable setup", () => {
    const overallWin = 0.55;
    const expectedReturn = 0.02;   // 2% expected favorable move
    const expectedDrawdown = 0.02; // 2% expected adverse move -> payoff ratio 1.0
    const payoffRatio = expectedReturn / expectedDrawdown;

    const result = computeRiskSizing(overallWin, expectedReturn, 0.05, false, expectedDrawdown);

    expect(result.kellyPct).toBeCloseTo(standardKelly(overallWin, payoffRatio), 10);
  });

  test("does NOT match the old non-standard formula (overallWin - 0.5) / max(0.05, 1 - overallWin)", () => {
    const overallWin = 0.62;
    const expectedReturn = 0.03;
    const expectedDrawdown = 0.02;
    const oldFormulaValue = (overallWin - 0.5) / Math.max(0.05, 1 - overallWin);

    const result = computeRiskSizing(overallWin, expectedReturn, 0.05, false, expectedDrawdown);

    expect(result.kellyPct).not.toBeCloseTo(oldFormulaValue, 4);
  });

  test("a poor payoff ratio (small expected win vs. large expected drawdown) can push Kelly to 0, not stay positive", () => {
    // Win probability barely above coin-flip, but the downside dwarfs the
    // upside (R << 1) — a real Kelly criterion should reject sizing this
    // at all. The old formula floored at 0.01 regardless of R since R was
    // never part of its computation.
    const result = computeRiskSizing(0.52, 0.005, 0.05, false, 0.15);
    expect(result.kellyPct).toBe(0);
  });

  test("kellyPct stays within the [0, 0.25] bound regardless of extreme inputs", () => {
    const veryFavorable = computeRiskSizing(0.95, 0.10, 0.01, false, 0.001);
    expect(veryFavorable.kellyPct).toBeLessThanOrEqual(0.25);
    expect(veryFavorable.kellyPct).toBeGreaterThanOrEqual(0);

    const veryUnfavorable = computeRiskSizing(0.05, 0.001, 0.01, false, 10);
    expect(veryUnfavorable.kellyPct).toBe(0);
  });

  test("zero/negative expectedDrawdown falls back to a neutral 1:1 payoff ratio instead of dividing by zero", () => {
    const overallWin = 0.6;
    const result = computeRiskSizing(overallWin, 0.02, 0.05, false, 0);
    expect(Number.isFinite(result.kellyPct)).toBe(true);
    expect(result.kellyPct).toBeCloseTo(standardKelly(overallWin, 1), 10);
  });
});
