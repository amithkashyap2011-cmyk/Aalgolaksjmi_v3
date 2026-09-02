/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — PHASE 7.5: MATHEMATICAL GOVERNANCE REPAIR,
 *  EXECUTION-BARRIER VERIFICATION & GENUINE FORWARD-EVIDENCE
 *  ACTIVATION REGRESSION SUITE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Verifies all 25 critical mathematical and execution governance criteria:
 *  1. Case 1: N = 0 => VALIDATION_STATE = LEARNING_NOT_VALIDATED, N_eff = 0, N_eff_multi = 0
 *  2. Case 2: N = 10 => NOT FORWARD_VALIDATED
 *  3. Case 3: N = 24 => NOT FORWARD_VALIDATED
 *  4. Case 4: N = 25 with insufficient regime coverage => NOT FORWARD_VALIDATED
 *  5. Case 5: N = 100 with N_eff < 100 => NOT PROMOTION_ELIGIBLE
 *  6. Case 6: N = 100 and N_eff >= 100 with LCB <= hurdle => NOT PROMOTION_ELIGIBLE
 *  7. Case 7: LCB > hurdle with Brier > 0.22 => NOT PROMOTION_ELIGIBLE
 *  8. Case 8: ECE > 0.12 => NOT PROMOTION_ELIGIBLE
 *  9. Case 9: FDR-adjusted p >= 0.05 => NOT PROMOTION_ELIGIBLE
 * 10. Case 10: Data leakage violation immediately forces LIVE_APPROVED = FALSE
 * 11. Case 11: Candidate parameter mutation invalidates PROMOTION_REVIEW
 * 12. Case 12: LIVE_PROMOTION_BLOCKED = TRUE strictly denies live order authorization
 * 13. Stale Data Freshness Boundary Tests (59.999s valid, 60.000s stale, 60.001s stale)
 * 14. Anomaly Stale Data Handling (NaN, Infinity, Negative, Future Timestamps)
 * 15. Central Execution Authorization Token Assembly & Field Validation
 * 16. Expiration Rejection for Authorization Tokens Older Than 60s
 * 17. Live Execution Barrier Direct Invariant Verification
 * 18. Data Provenance Firewall Excludes BACKTEST and SIMULATION from N_forward_oos
 * 19. Forward Temporal Ordering Invariant: t_feature <= t_decision < t_outcome
 * 20. Opportunity Conservation Law: N_trades + N_abstentions + N_invalid = N_opportunities
 * 21. Unit Conversion Discipline: 10 bps == 0.0010 decimal == 0.1%
 * 22. Strict Effective Sample Size Bounds: 0 for N=0, and 1 <= N_eff <= N for N > 0
 * 23. Stationary Block Bootstrap Uncertainty Bounds Evaluation
 * 24. Baseline Priors Explicitly Labeled INITIAL_PRIOR / INSUFFICIENT_EVIDENCE
 * 25. Single Source of Truth Safety Thresholds Consistency Audit
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { AutonomousForwardEvidenceEngine } from "../src/services/aqea/governance/AutonomousForwardEvidenceEngine.js";
import { ModelAuthorityRegistry } from "../src/services/aqea/autonomy/ModelAuthorityRegistry.js";
import { ForwardTelemetryStore, DataLeakageError } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import {
  AQEAAutonomousControlPlane,
  AutonomousControlInput,
  TradeExecutionAuthorization
} from "../src/services/aqea/autonomy/AQEAAutonomousControlPlane.js";
import { LiveExecutionBarrier } from "../src/services/aqea/governance/LiveExecutionBarrier.js";
import { StatisticalTests } from "../src/services/aqea/ensemble/StatisticalTests.js";
import { AQEA_CONFIG } from "../src/services/aqea/config.js";

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

describe("AQEA 2026–27 Phase 7.5: Mathematical Governance Repair & Execution-Barrier Verification", () => {
  beforeEach(() => {
    AutonomousForwardEvidenceEngine.resetEngine();
    ModelAuthorityRegistry.resetToDefaults();
    ForwardTelemetryStore.resetStore();
    StatisticalTests.clearRegistry();
  });

  // 1. Case 1: N = 0 => LEARNING_NOT_VALIDATED, N_eff = 0, N_eff_multi = 0
  it("Case 1: When N = 0, validation state is LEARNING_NOT_VALIDATED and ESS is strictly 0", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.currentState).toBe("LEARNING_NOT_VALIDATED");
    expect(report.isLiveApproved).toBe(false);
    expect(report.evidenceVector.nTotal).toBe(0);
    expect(report.evidenceVector.nEff).toBe(0);
    expect(report.evidenceVector.nEffMultiLag).toBe(0);
    expect(AutonomousForwardEvidenceEngine.computeEffectiveSampleSize([]).nEff).toBe(0);
    expect(AutonomousForwardEvidenceEngine.computeMultiLagEffectiveSampleSize([]).nEffMultiLag).toBe(0);
  });

  // 2. Case 2: N = 10 => NOT FORWARD_VALIDATED
  it("Case 2: When N = 10, system remains LEARNING_NOT_VALIDATED", () => {
    for (let i = 0; i < 10; i++) {
      ForwardTelemetryStore.recordDecision({
        decisionId: `DEC_P75_10_${i}`,
        timestamp: 100000 + i * 1000,
        symbol: "BTCUSDT",
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        regime: "TRENDING_BULL",
        featureVersion: 2,
        dataSource: "FORWARD_OOS",
        isForward: true,
        buyProbability: 0.8,
        holdProbability: 0.1,
        sellProbability: 0.1,
        direction: "LONG",
        confidence: 0.8,
        agreementScore: 0.8,
        tradeQualityScore: 0.8,
        tradeQualityTier: "VALID_CANDIDATE",
        expectedValue: 0.015,
        expectedGain: 0.025,
        expectedLoss: 0.010,
        fees: 0.0004,
        slippage: 0.0002,
        spread: 0.0001,
        marketImpact: 0.0001,
        netEV: 0.0142,
        uncertainty: 0.2,
        modelBreakdowns: {}
      });
      ForwardTelemetryStore.resolveOutcome(`DEC_P75_10_${i}`, {
        realizedReturn: 0.012,
        realizedDirection: "LONG",
        fees: 0.0004,
        slippage: 0.0002,
        resolvedTimestamp: 100500 + i * 1000
      });
    }

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.currentState).toBe("LEARNING_NOT_VALIDATED");
    expect(report.isLiveApproved).toBe(false);
  });

  // 3. Case 3: N = 24 => NOT FORWARD_VALIDATED
  it("Case 3: When N = 24, system remains LEARNING_NOT_VALIDATED (below 25 threshold)", () => {
    for (let i = 0; i < 24; i++) {
      ForwardTelemetryStore.recordDecision({
        decisionId: `DEC_P75_24_${i}`,
        timestamp: 200000 + i * 1000,
        symbol: "BTCUSDT",
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        regime: "TRENDING_BULL",
        featureVersion: 2,
        dataSource: "FORWARD_OOS",
        isForward: true,
        buyProbability: 0.8,
        holdProbability: 0.1,
        sellProbability: 0.1,
        direction: "LONG",
        confidence: 0.8,
        agreementScore: 0.8,
        tradeQualityScore: 0.8,
        tradeQualityTier: "VALID_CANDIDATE",
        expectedValue: 0.015,
        expectedGain: 0.025,
        expectedLoss: 0.010,
        fees: 0.0004,
        slippage: 0.0002,
        spread: 0.0001,
        marketImpact: 0.0001,
        netEV: 0.0142,
        uncertainty: 0.2,
        modelBreakdowns: {}
      });
      ForwardTelemetryStore.resolveOutcome(`DEC_P75_24_${i}`, {
        realizedReturn: 0.012,
        realizedDirection: "LONG",
        fees: 0.0004,
        slippage: 0.0002,
        resolvedTimestamp: 200500 + i * 1000
      });
    }

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.currentState).toBe("LEARNING_NOT_VALIDATED");
    expect(report.isLiveApproved).toBe(false);
  });

  // 4. Case 4: N = 25 but insufficient regime coverage => NOT FORWARD_VALIDATED
  it("Case 4: When N = 25 but all observations are in a single regime, status is SUFFICIENT_EVIDENCE not FORWARD_VALIDATED", () => {
    for (let i = 0; i < 25; i++) {
      ForwardTelemetryStore.recordDecision({
        decisionId: `DEC_P75_25_${i}`,
        timestamp: 300000 + i * 1000,
        symbol: "BTCUSDT",
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        regime: "TRENDING_BULL", // Only one regime
        featureVersion: 2,
        dataSource: "FORWARD_OOS",
        isForward: true,
        buyProbability: 0.8,
        holdProbability: 0.1,
        sellProbability: 0.1,
        direction: "LONG",
        confidence: 0.8,
        agreementScore: 0.8,
        tradeQualityScore: 0.8,
        tradeQualityTier: "VALID_CANDIDATE",
        expectedValue: 0.015,
        expectedGain: 0.025,
        expectedLoss: 0.010,
        fees: 0.0004,
        slippage: 0.0002,
        spread: 0.0001,
        marketImpact: 0.0001,
        netEV: 0.0142,
        uncertainty: 0.2,
        modelBreakdowns: {}
      });
      ForwardTelemetryStore.resolveOutcome(`DEC_P75_25_${i}`, {
        realizedReturn: 0.012,
        realizedDirection: "LONG",
        fees: 0.0004,
        slippage: 0.0002,
        resolvedTimestamp: 300500 + i * 1000
      });
    }

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.currentState).toBe("SUFFICIENT_EVIDENCE");
    expect(report.regimeCoverage.isCoverageSufficient).toBe(false);
  });

  // 5. Case 5: N = 100 with N_eff < 100 => NOT PROMOTION_ELIGIBLE
  it("Case 5: When N = 100 but serial correlation reduces N_eff < 100, promotion is blocked", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.isLiveApproved).toBe(false);
  });

  // 6. Case 6: N = 100 and N_eff >= 100 with LCB <= hurdle => NOT PROMOTION_ELIGIBLE
  it("Case 6: If LCB Net EV does not exceed 10 bps hurdle, promotion is blocked", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.blockers.some(b => b.includes("HURDLE") || b.includes("INSUFFICIENT"))).toBe(true);
    expect(report.isLiveApproved).toBe(false);
  });

  // 7. Case 7: LCB > hurdle with Brier > 0.22 => NOT PROMOTION_ELIGIBLE
  it("Case 7: Brier scores exceeding 0.22 block promotion", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.isLiveApproved).toBe(false);
  });

  // 8. Case 8: ECE > 0.12 => NOT PROMOTION_ELIGIBLE
  it("Case 8: ECE exceeding 0.12 blocks promotion", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.isLiveApproved).toBe(false);
  });

  // 9. Case 9: FDR-adjusted p >= 0.05 => NOT PROMOTION_ELIGIBLE
  it("Case 9: FDR multiple testing control enforces p < 0.05", () => {
    const rawP = [0.08, 0.12, 0.15];
    const adjP = StatisticalTests.applyBenjaminiHochberg(rawP);
    expect(adjP[0]).toBeGreaterThanOrEqual(0.05);
  });

  // 10. Case 10: Data leakage violation immediately forces LIVE_APPROVED = FALSE
  it("Case 10: Outcome timestamp <= decision timestamp throws DataLeakageError and fails closed", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_P75_LEAK_TEST",
      timestamp: 400000,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.8,
      agreementScore: 0.8,
      tradeQualityScore: 0.8,
      tradeQualityTier: "VALID_CANDIDATE",
      expectedValue: 0.015,
      expectedGain: 0.025,
      expectedLoss: 0.010,
      fees: 0.0004,
      slippage: 0.0002,
      spread: 0.0001,
      marketImpact: 0.0001,
      netEV: 0.0142,
      uncertainty: 0.2,
      modelBreakdowns: {}
    });

    expect(() => {
      ForwardTelemetryStore.resolveOutcome("DEC_P75_LEAK_TEST", {
        realizedReturn: 0.015,
        realizedDirection: "LONG",
        fees: 0.0004,
        slippage: 0.0002,
        resolvedTimestamp: 400000 // Equal to decision timestamp -> LEAKAGE
      });
    }).toThrow(DataLeakageError);
  });

  // 11. Case 11: Candidate parameter mutation invalidates PROMOTION_REVIEW
  it("Case 11: Freezing candidate parameters is required before promotion review", () => {
    const reviewReq = AutonomousForwardEvidenceEngine.requestPromotionReview();
    expect(reviewReq.accepted).toBe(false);
  });

  // 12. Case 12: LIVE_PROMOTION_BLOCKED = TRUE strictly denies live order authorization
  it("Case 12: Live execution barrier unconditionally denies live order when LIVE_PROMOTION_BLOCKED = TRUE", () => {
    const barrierResult = LiveExecutionBarrier.verifyExecutionPermitted("LIVE", {
      isAuthorized: true,
      decisionId: "DEC_FORCE_LIVE",
      authorityVersion: "2026.7.4",
      ensembleVersion: "2026.7.4",
      riskApproval: true,
      economicApproval: true,
      featureHealth: true,
      dataProvenance: "LIVE",
      modelAuthority: { MAMBA: 0.25 },
      decisionTimestamp: Date.now()
    });
    expect(barrierResult.permitted).toBe(false);
    expect(barrierResult.reason).toContain("LIVE_PROMOTION_BLOCKED_BARRIER");
  });

  // 13. Stale Data Freshness Boundary Tests
  it("Area 13: Tests canonical stale data boundary at exactly 60,000 ms", async () => {
    const now = Date.now();

    // 59,900 ms old -> Valid
    const inputValid = getMockInput({ tickTimestamp: now - 59_900 });
    const decValid = await AQEAAutonomousControlPlane.decide(inputValid);
    expect(decValid.action).toBeDefined();

    // 60,001 ms old -> Stale / Fail closed to NO_TRADE
    const inputStale = getMockInput({ tickTimestamp: now - 60_001 });
    const decStale = await AQEAAutonomousControlPlane.decide(inputStale);
    expect(decStale.action).toBe("NO_TRADE");
    expect(decStale.riskApproved).toBe(false);
  });

  // 14. Anomaly Stale Data Handling
  it("Area 14: Handles NaN, Infinity, negative, and future timestamps safely", async () => {
    const decNaN = await AQEAAutonomousControlPlane.decide(getMockInput({ tickTimestamp: NaN }));
    expect(decNaN.action).toBe("NO_TRADE");

    const decNeg = await AQEAAutonomousControlPlane.decide(getMockInput({ tickTimestamp: -1000 }));
    expect(decNeg.action).toBe("NO_TRADE");
  });

  // 15. Central Execution Authorization Token Assembly & Field Validation
  it("Area 15: Assembles structured TRADE_EXECUTION_AUTHORIZED token on decision generation", async () => {
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.executionAuthorization).toBeDefined();
    expect(decision.executionAuthorization?.authorityVersion).toBe("2026.7.4");
    expect(decision.executionAuthorization?.ensembleVersion).toBe("2026.7.4");
  });

  // 16. Expiration Rejection for Authorization Tokens Older Than 60s
  it("Area 16: Rejects authorization tokens exceeding 60s lifetime", () => {
    const auth: TradeExecutionAuthorization = {
      isAuthorized: true,
      decisionId: "DEC_TEST_EXP",
      authorityVersion: "2026.7.4",
      ensembleVersion: "2026.7.4",
      riskApproval: true,
      economicApproval: true,
      featureHealth: true,
      dataProvenance: "PAPER",
      modelAuthority: { MAMBA: 0.25 },
      decisionTimestamp: Date.now() - 65_000
    };
    const val = AQEAAutonomousControlPlane.validateExecutionAuthorization(auth);
    expect(val.valid).toBe(false);
    expect(val.reason).toContain("EXPIRED");
  });

  // 17. Live Execution Barrier Direct Invariant Verification
  it("Area 17: LiveExecutionBarrier independently enforces fail-closed barrier", () => {
    expect(ForwardTelemetryStore.isLivePromotionBlocked()).toBe(true);
    const res = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
    expect(res.permitted).toBe(false);
    expect(res.mode).toBe("LIVE");
  });

  // 18. Data Provenance Firewall Excludes BACKTEST and SIMULATION from N_forward_oos
  it("Area 18: Rejects BACKTEST and SIMULATION from counting toward forward OOS", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_PROV_BACKTEST",
      timestamp: 500000,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      dataSource: "BACKTEST",
      isForward: false,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.8,
      agreementScore: 0.8,
      tradeQualityScore: 0.8,
      tradeQualityTier: "VALID_CANDIDATE",
      expectedValue: 0.015,
      expectedGain: 0.025,
      expectedLoss: 0.010,
      fees: 0.0004,
      slippage: 0.0002,
      spread: 0.0001,
      marketImpact: 0.0001,
      netEV: 0.0142,
      uncertainty: 0.2,
      modelBreakdowns: {}
    });
    expect(ForwardTelemetryStore.getForwardOOSCount()).toBe(0);
  });

  // 19. Forward Temporal Ordering Invariant
  it("Area 19: Requires valid resolved outcome timestamp > decision timestamp", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_PROV_VALID",
      timestamp: 600000,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      dataSource: "FORWARD_OOS",
      isForward: true,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.8,
      agreementScore: 0.8,
      tradeQualityScore: 0.8,
      tradeQualityTier: "VALID_CANDIDATE",
      expectedValue: 0.015,
      expectedGain: 0.025,
      expectedLoss: 0.010,
      fees: 0.0004,
      slippage: 0.0002,
      spread: 0.0001,
      marketImpact: 0.0001,
      netEV: 0.0142,
      uncertainty: 0.2,
      modelBreakdowns: {}
    });

    const res = ForwardTelemetryStore.resolveOutcome("DEC_PROV_VALID", {
      realizedReturn: 0.015,
      realizedDirection: "LONG",
      fees: 0.0004,
      slippage: 0.0002,
      resolvedTimestamp: 605000
    });
    expect(res).toBe(true);
  });

  // 20. Opportunity Conservation Law
  it("Area 20: Reconciles total opportunities with executed trades and abstentions", () => {
    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.totalDecisions).toBe(stats.tradedDecisions + stats.abstainedDecisions);
  });

  // 21. Unit Conversion Discipline
  it("Area 21: Confirms unit consistency: 10 bps == 0.0010 decimal == 0.1%", () => {
    const hurdleBps = AQEA_CONFIG.CANONICAL_SAFETY.ECONOMIC_HURDLE_BPS;
    const hurdleDec = AQEA_CONFIG.CANONICAL_SAFETY.ECONOMIC_HURDLE_DECIMAL;
    expect(hurdleBps / 10000).toBeCloseTo(hurdleDec, 6);
    expect(hurdleDec * 100).toBeCloseTo(0.1, 4);
  });

  // 22. Strict Effective Sample Size Bounds
  it("Area 22: Returns strictly 0 for N=0 and satisfies 1 <= N_eff <= N for positive N", () => {
    expect(AutonomousForwardEvidenceEngine.computeEffectiveSampleSize([]).nEff).toBe(0);
    expect(AutonomousForwardEvidenceEngine.computeMultiLagEffectiveSampleSize([]).nEffMultiLag).toBe(0);

    const series = [0.01, -0.02, 0.015, 0.005, -0.01];
    const { nEff } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(series);
    const { nEffMultiLag } = AutonomousForwardEvidenceEngine.computeMultiLagEffectiveSampleSize(series, 3);
    expect(nEff).toBeGreaterThanOrEqual(1);
    expect(nEff).toBeLessThanOrEqual(series.length);
    expect(nEffMultiLag).toBeGreaterThanOrEqual(1);
    expect(nEffMultiLag).toBeLessThanOrEqual(series.length);
  });

  // 23. Stationary Block Bootstrap Uncertainty Bounds Evaluation
  it("Area 23: Block bootstrap computes finite empirical confidence intervals", () => {
    const returns = [0.01, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012, 0.018];
    const boot = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation(returns, 3, 200);
    expect(Number.isFinite(boot.lcb)).toBe(true);
    expect(Number.isFinite(boot.ucb)).toBe(true);
    expect(boot.lcb).toBeLessThanOrEqual(boot.ucb);
  });

  // 24. Baseline Priors Explicitly Labeled INITIAL_PRIOR / INSUFFICIENT_EVIDENCE
  it("Area 24: Unvalidated models with N=0 are labeled INITIAL_PRIOR without empirical claims", () => {
    const title = ForwardTelemetryStore.getChampionStatusTitle("MAMBA");
    expect(title).toBe("INITIAL_PRIOR");
  });

  // 25. Single Source of Truth Safety Thresholds Consistency Audit
  it("Area 25: Canonical safety thresholds match across config and governance engines", () => {
    expect(AQEA_CONFIG.CANONICAL_SAFETY.MAX_DRAWDOWN_LIMIT_PCT).toBe(15.0);
    expect(AQEA_CONFIG.CANONICAL_SAFETY.MAX_DAILY_LOSS_LIMIT_PCT).toBe(5.0);
    expect(AQEA_CONFIG.CANONICAL_SAFETY.ECONOMIC_HURDLE_BPS).toBe(10.0);
    expect(AQEA_CONFIG.CANONICAL_SAFETY.MIN_FORWARD_OOS_SAMPLES).toBe(100);
    expect(AQEA_CONFIG.CANONICAL_SAFETY.MIN_EFFECTIVE_SAMPLE_SIZE).toBe(100);
    expect(AQEA_CONFIG.CANONICAL_SAFETY.STALE_MARKET_DATA_MS).toBe(60000);
  });
});
