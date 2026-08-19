/*
 * ─── Bayesian Conviction Gate Regression Test ─────────────
 *
 * Regression for the ULTRA_CONVICTION_GATE fix: the 0.88 Bayesian
 * posterior threshold was internally inconsistent — even when all
 * other sub-thresholds passed (quality≥80, confidence≥80, ADX≥22),
 * the posterior only reached ~85% because the smartMoney dimension
 * uses synthetic scores (~50), giving a penalizing likelihood ratio.
 *
 * These tests verify:
 *   1. The Bayesian engine produces achievable posteriors when
 *      other quality gates pass (i.e., posterior ≥ 0.82).
 *   2. The engine still filters genuinely weak setups (posterior < 0.82).
 *   3. Excellent conditions produce very high posteriors (sanity check).
 */
import { BayesianProbabilityEngine } from "../../src/services/aqea/bayesianPredictor";

const FIXED_THRESHOLD = 0.82;

describe("BayesianProbabilityEngine — conviction gate regression", () => {
  test("TC-BAY-1: minimum-passing sub-thresholds with synthetic smartMoney should clear 0.82", () => {
    // quality=80 (min for non-overdrive), confidence=80 (min), adx=22 (min), htf=true, smartMoney=50 (synthetic default)
    const posterior = BayesianProbabilityEngine.calculatePosteriorWinProbability(
      0.785, // prior
      80,    // qualityScore (minimum passing)
      80,    // aiConfidence (minimum passing)
      22,    // adxTrendStrength (minimum passing)
      true,  // htfConsensus
      50     // smartMoneyScore (synthetic default)
    );
    // Before fix: posterior ≈ 0.849, threshold was 0.88 → BLOCKED
    // After fix: threshold is 0.82 → PASSES
    expect(posterior).toBeGreaterThanOrEqual(FIXED_THRESHOLD);
    expect(posterior).toBeLessThan(0.90); // Should NOT be artificially inflated
  });

  test("TC-BAY-2: slightly above minimum thresholds should pass comfortably", () => {
    const posterior = BayesianProbabilityEngine.calculatePosteriorWinProbability(
      0.785,
      85,    // quality slightly above min
      82,    // confidence slightly above min
      25,    // adx above min
      true,
      55     // smartMoney slightly above default
    );
    expect(posterior).toBeGreaterThanOrEqual(FIXED_THRESHOLD);
  });

  test("TC-BAY-3: excellent conditions should produce high posterior", () => {
    const posterior = BayesianProbabilityEngine.calculatePosteriorWinProbability(
      0.785,
      95,    // excellent quality
      90,    // excellent confidence
      30,    // strong trend
      true,
      70     // high smartMoney
    );
    expect(posterior).toBeGreaterThanOrEqual(0.95);
  });

  test("TC-BAY-4: weak setup should still be filtered (below 0.82)", () => {
    // Low quality, low confidence, low adx — should NOT pass
    const posterior = BayesianProbabilityEngine.calculatePosteriorWinProbability(
      0.785,
      60,    // weak quality
      60,    // weak confidence
      15,    // low adx (below 20)
      false, // htf misaligned
      40     // low smartMoney
    );
    expect(posterior).toBeLessThan(FIXED_THRESHOLD);
  });

  test("TC-BAY-5: htf misaligned with synthetic smartMoney should be filtered", () => {
    const posterior = BayesianProbabilityEngine.calculatePosteriorWinProbability(
      0.785,
      80,
      80,
      22,
      false, // HTF NOT aligned — penalizing lHtf = 0.3
      50     // synthetic default
    );
    // With htf=false, lHtf drops from 1.4 to 0.3, lossLikelihood jumps (1.6 vs 0.6)
    // This should be well below the threshold
    expect(posterior).toBeLessThan(FIXED_THRESHOLD);
  });

  test("TC-BAY-6: posterior is always between 0.001 and 0.999 (no extreme clamps)", () => {
    const posteriorHigh = BayesianProbabilityEngine.calculatePosteriorWinProbability(
      0.95, 100, 100, 50, true, 100
    );
    const posteriorLow = BayesianProbabilityEngine.calculatePosteriorWinProbability(
      0.10, 30, 30, 10, false, 20
    );
    expect(posteriorHigh).toBeLessThanOrEqual(0.999);
    expect(posteriorLow).toBeGreaterThanOrEqual(0.001);
  });

  test("TC-BAY-7: the old 0.88 threshold would reject minimum-passing conditions (regression guard)", () => {
    const OLD_THRESHOLD = 0.88;
    const posterior = BayesianProbabilityEngine.calculatePosteriorWinProbability(
      0.785, 80, 80, 22, true, 50
    );
    // This is the EXACT condition that was broken: sub-thresholds pass but
    // the composite Bayesian check blocked. This test ensures the posterior
    // is BELOW 0.88 (proving the old threshold was unreachable) but ABOVE
    // 0.82 (proving the new threshold works).
    expect(posterior).toBeLessThan(OLD_THRESHOLD);
    expect(posterior).toBeGreaterThanOrEqual(FIXED_THRESHOLD);
  });
});
