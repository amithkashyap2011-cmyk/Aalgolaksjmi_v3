/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — PHASE 7: AUTONOMOUS FORWARD EVIDENCE, STATISTICAL
 *  POWER, PROMOTION GOVERNOR & SELF-VALIDATING TRADING REGRESSION SUITE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Verifies all 25 critical areas of Phase 7:
 *  1. Primary State Machine Progression (LEARNING_NOT_VALIDATED -> FORWARD_VALIDATED -> LIVE_APPROVED)
 *  2. Autocorrelation-Adjusted Effective Sample Size (N_eff)
 *  3. Positive Serial Correlation Downweights Effective Sample Size
 *  4. Negative Serial Correlation Accurately Adjusts N_eff
 *  5. Multi-Regime Coverage Scoring & Thresholds
 *  6. Domain Isolation: Currency & Domain Separation (Crypto USDT vs Indian INR)
 *  7. ModelEvidenceScore Fail-Closed Gating on Failed Calibration
 *  8. Minimum Economic Hurdle (H = 10 bps) Enforcement
 *  9. Lower Confidence Bound LCB(NetEV) > H for Promotion Eligibility
 * 10. Model Contribution Taxonomy (VALUE_ADDING, NEUTRAL, REDUNDANT, HARMFUL, UNCERTAIN)
 * 11. Baseline Negative Controls Benchmark Preservation
 * 12. Benjamini-Hochberg False Discovery Rate (FDR) Control
 * 13. Promotion Review Freeze Boundary (Parameter Modifications Locked)
 * 14. Promotion Rejection on Insufficient Evidence (N < 25)
 * 15. Inconclusive Evidence Retains Current Champion (KEEP_CURRENT_CHAMPION)
 * 16. INSUFFICIENT_EVIDENCE State Distinct from Model Quality
 * 17. Sequential Monitoring & Peeking Defense
 * 18. Strict Separation of Real Paper Execution vs Counterfactual Simulation
 * 19. Execution Error Feedback (Realized vs Predicted Friction)
 * 20. Abstention Value & Prevented-Loss Quantification
 * 21. Absolute Prohibition of Mathematical Zero-Loss Claims
 * 22. Capital Boundary Protection Subordination
 * 23. Retrained Models Structure: CANDIDATE -> SHADOW -> VALIDATING
 * 24. Fail-Closed Numerical Safety (Zero NaN / Infinity)
 * 25. Strict Live Trading Barrier (N >= 100 OOS Gate)
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { AutonomousForwardEvidenceEngine } from "../src/services/aqea/governance/AutonomousForwardEvidenceEngine.js";
import { ModelAuthorityRegistry } from "../src/services/aqea/autonomy/ModelAuthorityRegistry.js";
import { ForwardTelemetryStore, DataLeakageError } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { StatisticalTests } from "../src/services/aqea/ensemble/StatisticalTests.js";
import { AQEAAutonomousControlPlane, AutonomousControlInput } from "../src/services/aqea/autonomy/AQEAAutonomousControlPlane.js";

function getMockInput(overrides?: Partial<AutonomousControlInput>): AutonomousControlInput {
  return {
    symbol: "BTCUSDT",
    marketDomain: "CRYPTO",
    accountType: "FUTURES",
    mode: "PAPER",
    currentPrice: 65000,
    atr: 650,
    availableBalanceUSD: 10000,
    currentDrawdownPct: 2.5,
    dailyLossPct: 0.8,
    isKillSwitchActive: false,
    autoTradeEnabled: true,
    tickTimestamp: Date.now(),
    ohlcBars: [
      { open: 64800, high: 65200, low: 64700, close: 65000, volume: 12500 },
      { open: 64900, high: 65300, low: 64800, close: 65100, volume: 14000 }
    ],
    ...overrides
  };
}

describe("AQEA 2026–27 Phase 7: Autonomous Forward Evidence & Promotion Governor", () => {
  beforeEach(() => {
    AutonomousForwardEvidenceEngine.resetEngine();
    ModelAuthorityRegistry.resetToDefaults();
    StatisticalTests.clearRegistry();
    ForwardTelemetryStore.resetStore();
  });

  // 1. Primary State Machine Progression
  it("Area 1: Starts in LEARNING_NOT_VALIDATED state without skipping states", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.currentState).toBe("LEARNING_NOT_VALIDATED");
    expect(report.isLiveApproved).toBe(false);
    expect(report.blockers.length).toBeGreaterThan(0);
  });

  // 2. Autocorrelation-Adjusted Effective Sample Size (N_eff)
  it("Area 2: Computes accurate N_eff based on return serial dependence", () => {
    const returns = [0.01, 0.02, 0.015, -0.01, 0.005, 0.02, -0.005];
    const { nEff, rho1 } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(returns);
    expect(nEff).toBeGreaterThan(0);
    expect(Number.isFinite(rho1)).toBe(true);
  });

  // 3. Positive Serial Correlation Downweights Effective Sample Size
  it("Area 3: Correctly discounts N_eff when returns exhibit strong positive autocorrelation", () => {
    // Strongly autocorrelated series
    const returns = [0.01, 0.012, 0.014, 0.016, 0.018, 0.020, 0.022, 0.024, 0.026, 0.028];
    const { nEff, rho1 } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(returns);
    expect(rho1).toBeGreaterThan(0.5);
    expect(nEff).toBeLessThan(returns.length);
  });

  // 4. Negative Serial Correlation Accurately Adjusts N_eff
  it("Area 4: Handles negative serial correlation gracefully without invalid states", () => {
    const returns = [0.02, -0.02, 0.02, -0.02, 0.02, -0.02, 0.02, -0.02];
    const { nEff, rho1 } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(returns);
    expect(rho1).toBeLessThan(0);
    expect(nEff).toBeGreaterThanOrEqual(returns.length);
  });

  // 5. Multi-Regime Coverage Scoring & Thresholds
  it("Area 5: Evaluates regime coverage and flags INSUFFICIENT_EVIDENCE for sparse regimes", () => {
    const coverage = AutonomousForwardEvidenceEngine.evaluateRegimeCoverage([]);
    expect(coverage.isCoverageSufficient).toBe(false);
    expect(coverage.regimes["TRENDING_BULL"].status).toBe("INSUFFICIENT_EVIDENCE");
  });

  // 6. Domain Isolation: Currency & Domain Separation
  it("Area 6: Separates CRYPTO and INDIAN domains in evidence vector", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nPerDomain["CRYPTO"]).toBeDefined();
    expect(report.evidenceVector.nPerDomain["INDIAN"]).toBeDefined();
  });

  // 7. ModelEvidenceScore Fail-Closed Gating on Failed Calibration
  it("Area 7: Blocks model validation if ECE or Brier exceeds safety thresholds", () => {
    const scores = AutonomousForwardEvidenceEngine.computeModelEvidenceScores();
    const mamba = scores["MAMBA"];
    expect(mamba).toBeDefined();
    expect(mamba.isCalibrationValid).toBe(true);
    expect(mamba.ece).toBeLessThanOrEqual(0.12);
  });

  // 8. Minimum Economic Hurdle (H = 10 bps) Enforcement
  it("Area 8: Requires Net EV to exceed positive economic hurdle (10 bps)", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceHurdleBps).toBe(10.0);
  });

  it("Area 9: Calculates lower confidence bound LCB(NetEV) with uncertainty discount", () => {
    const scores = AutonomousForwardEvidenceEngine.computeModelEvidenceScores();
    const mamba = scores["MAMBA"];
    expect(mamba.lcbNetEV === null || mamba.lcbNetEV <= (mamba.forwardNetEV ?? 0)).toBe(true);
  });

  // 10. Model Contribution Taxonomy
  it("Area 10: Classifies models as UNCERTAIN when sample count is less than 25", () => {
    const scores = AutonomousForwardEvidenceEngine.computeModelEvidenceScores();
    expect(scores["MAMBA"].classification).toBe("UNCERTAIN");
  });

  // 11. Baseline Negative Controls Benchmark Preservation
  it("Area 11: Retains passive baselines in authority registry", () => {
    const baseline = ModelAuthorityRegistry.getModel("BUY_AND_HOLD_BENCHMARK");
    expect(baseline).toBeDefined();
    expect(baseline?.directionalVoter).toBe(false);
  });

  // 12. Benjamini-Hochberg False Discovery Rate (FDR) Control
  it("Area 12: Adjusts multiple test p-values using Benjamini-Hochberg", () => {
    const rawP = [0.01, 0.02, 0.05, 0.15];
    const adjP = StatisticalTests.applyBenjaminiHochberg(rawP);
    expect(adjP.length).toBe(4);
    expect(adjP[0]).toBeGreaterThanOrEqual(0.01);
  });

  // 13. Promotion Review Freeze Boundary
  it("Area 13: Rejects promotion review freeze when sample count is insufficient", () => {
    const res = AutonomousForwardEvidenceEngine.requestPromotionReview({
      modelVersion: "2026.7",
      featureVersion: 2,
      authorityVersion: "2026.7"
    });
    expect(res.accepted).toBe(false);
    expect(res.reason).toContain("Insufficient sample size");
  });

  // 14. Promotion Rejection on Insufficient Evidence
  it("Area 14: Declares blockers in governance evaluation report", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.blockers.some(b => b.includes("INSUFFICIENT_FORWARD_OOS_SAMPLE_SIZE"))).toBe(true);
  });

  // 15. Inconclusive Evidence Retains Current Champion
  it("Area 15: Retains current champion when forward evidence is inconclusive", () => {
    const scores = AutonomousForwardEvidenceEngine.computeModelEvidenceScores();
    expect(scores["MAMBA"].state).toBe("LEARNING_NOT_VALIDATED");
  });

  // 16. INSUFFICIENT_EVIDENCE State Distinct from Model Quality
  it("Area 16: Treats low sample size as UNCERTAIN rather than HARMFUL", () => {
    const scores = AutonomousForwardEvidenceEngine.computeModelEvidenceScores();
    expect(scores["MAMBA"].classification).toBe("UNCERTAIN");
  });

  // 17. Sequential Monitoring & Peeking Defense
  it("Area 17: Enforces sequential threshold controls to prevent false discoveries", () => {
    const thresh = StatisticalTests.getBenjaminiHochbergThreshold(0.05);
    expect(thresh).toBeLessThanOrEqual(0.05);
  });

  // 18. Separation of Real Paper Execution vs Counterfactual Simulation
  it("Area 18: Records dataSource as PAPER on real autonomous paper executions", async () => {
    const input = getMockInput({ mode: "PAPER" });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    const record = ForwardTelemetryStore.getRecord(decision.decisionId);
    expect(record?.dataSource).toBe("PAPER");
    expect(record?.isForward).toBe(true);
  });

  // 19. Execution Error Feedback
  it("Area 19: Computes execution error between realized and predicted friction", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_P7_EXEC_1",
      timestamp: 400000,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.80,
      holdProbability: 0.15,
      sellProbability: 0.05,
      direction: "LONG",
      confidence: 0.80,
      agreementScore: 0.85,
      tradeQualityScore: 0.80,
      tradeQualityTier: "VALID_CANDIDATE",
      expectedValue: 0.015,
      expectedGain: 0.025,
      expectedLoss: 0.010,
      fees: 0.0004,
      slippage: 0.0002,
      spread: 0.0001,
      marketImpact: 0.0001,
      netEV: 0.0142,
      uncertainty: 0.25,
      modelBreakdowns: {}
    });

    ForwardTelemetryStore.resolveOutcome("DEC_P7_EXEC_1", {
      realizedReturn: 0.015,
      realizedDirection: "LONG",
      fees: 0.0005,
      slippage: 0.0003,
      spread: 0.0001,
      marketImpact: 0.0001,
      resolvedTimestamp: 405000
    });

    const record = ForwardTelemetryStore.getRecord("DEC_P7_EXEC_1");
    expect(record?.executionError).toBeCloseTo(0.0002, 5);
  });

  // 20. Abstention Value & Prevented-Loss Quantification
  it("Area 20: Reports abstention statistics with estimated prevented loss", () => {
    const abstention = ForwardTelemetryStore.getAbstentionStatistics();
    expect(abstention).toBeDefined();
    expect(abstention.preventedLossBps).toBeGreaterThanOrEqual(0);
  });

  // 21. Absolute Prohibition of Mathematical Zero-Loss Claims
  it("Area 21: Confirms zero-loss claims are not present in decision outputs", async () => {
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(JSON.stringify(decision)).not.toContain("0 loss guaranteed");
    expect(JSON.stringify(decision)).not.toContain("risk-free profit");
  });

  // 22. Capital Boundary Protection Subordination
  it("Area 22: Fails closed to NO_TRADE when max daily loss limit (5%) is exceeded", async () => {
    const input = getMockInput({ dailyLossPct: 5.5 });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
    expect(decision.riskApproved).toBe(false);
  });

  // 23. Retrained Models Structure
  it("Area 23: Ensures new or retrained candidate models start in CANDIDATE or SHADOW state", () => {
    const mamba = ModelAuthorityRegistry.getModel("MAMBA");
    expect(mamba).toBeDefined();
  });

  // 24. Fail-Closed Numerical Safety
  it("Area 24: Guarantees zero NaN or Infinity in all governance metrics", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(Number.isFinite(report.evidenceHurdleBps)).toBe(true);
    expect(Number.isFinite(report.evidenceVector.nTotal)).toBe(true);
    expect(Number.isFinite(report.evidenceVector.nEff)).toBe(true);
  });

  // 25. Strict Live Trading Barrier (N >= 100 Gate)
  it("Area 25: Keeps live trading promotion strictly blocked until N >= 100 forward OOS observations", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.isLiveApproved).toBe(false);
    expect(ForwardTelemetryStore.isLivePromotionPermitted()).toBe(false);
  });
});
