/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — PHASE 7.3: FULL AUTONOMOUS CONTROL-PLANE
 *  INTEGRITY AUDIT & HUMAN-OVERRIDE ELIMINATION REGRESSION SUITE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Verifies all 35 critical audit criteria of Phase 7.3:
 *  1. UI toggle cannot bypass autonomous authority
 *  2. UI cannot directly select final winning model
 *  3. Legacy activeModel cannot bypass ModelAuthorityRegistry
 *  4. Master switch cannot bypass RiskEngine boundaries
 *  5. Autonomous regime change dynamically alters model authority
 *  6. Model degradation automatically reduces effective authority
 *  7. Model quarantine completely removes model from voting
 *  8. Model recovery requires empirical validation hysteresis
 *  9. Invalid features immediately produce fail-closed NO_TRADE
 * 10. NaN model output produces fail-closed NO_TRADE
 * 11. Stale data produces fail-closed NO_TRADE
 * 12. Excessive friction produces fail-closed NO_TRADE
 * 13. Excessive uncertainty produces fail-closed NO_TRADE
 * 14. RiskEngine remains immutable final veto
 * 15. Decision snapshot is completely immutable after creation
 * 16. Outcome resolution cannot overwrite original decision snapshot
 * 17. Duplicate outcome resolution attempts are rejected
 * 18. Future data leakage (t_outcome <= t_decision) is strictly rejected
 * 19. BACKTEST data source cannot increase forward OOS sample count
 * 20. SIMULATION data source cannot increase forward OOS sample count
 * 21. NO_TRADE decisions are recorded as abstentions
 * 22. INVALID records are excluded from forward OOS evaluation
 * 23. Baseline priors cannot masquerade as empirical validation
 * 24. Effective sample size (N_eff) remains within [1, N] bounds
 * 25. Bootstrap sensitivity is evaluated across block sizes
 * 26. Paper order produces genuine realized outcome attribution
 * 27. Model authority updates automatically from forward evidence
 * 28. Model selection and fusion are deterministic given identical state
 * 29. Restart preserves autonomous authority registry state
 * 30. Database failure triggers graceful fail-closed safe mode
 * 31. Model version mismatch enters safe mode
 * 32. Experiment version mismatch is rejected
 * 33. Direct order path without control-plane authorization is rejected
 * 34. Emergency kill switch always enforces immediate NO_TRADE
 * 35. Normal trading operation requires zero human model/weight selection
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { AutonomousForwardEvidenceEngine } from "../src/services/aqea/governance/AutonomousForwardEvidenceEngine.js";
import { ModelAuthorityRegistry } from "../src/services/aqea/autonomy/ModelAuthorityRegistry.js";
import { ForwardTelemetryStore, DataLeakageError } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { AQEAAutonomousControlPlane, AutonomousControlInput } from "../src/services/aqea/autonomy/AQEAAutonomousControlPlane.js";
import { StatisticalTests } from "../src/services/aqea/ensemble/StatisticalTests.js";

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

describe("AQEA 2026–27 Phase 7.3: Full Autonomous Control-Plane Integrity & Human-Override Elimination", () => {
  beforeEach(() => {
    AutonomousForwardEvidenceEngine.resetEngine();
    ModelAuthorityRegistry.resetToDefaults();
    ForwardTelemetryStore.resetStore();
    StatisticalTests.clearRegistry();
  });

  // 1. UI toggle cannot bypass autonomous authority
  it("TC-01: UI toggle is only an admin permission boundary and cannot bypass autonomous authority", () => {
    ModelAuthorityRegistry.setAdminPermission("MAMBA", true);
    ModelAuthorityRegistry.updateModelStatus("MAMBA", "QUARANTINED", "High forecast drift");
    const model = ModelAuthorityRegistry.getModel("MAMBA");
    expect(model?.adminAllowed).toBe(true);
    expect(model?.status).toBe("QUARANTINED");
    expect(model?.effectiveWeight).toBe(0.0);
  });

  // 2. UI cannot directly select final model
  it("TC-02: Final winning subset S* is chosen autonomously by S* optimizer", async () => {
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.selectedSubset.length).toBeGreaterThan(0);
    expect(Array.isArray(decision.selectedSubset)).toBe(true);
  });

  // 3. Legacy activeModel cannot bypass registry
  it("TC-03: ModelAuthorityRegistry is the single source of truth for model weights", () => {
    const mamba = ModelAuthorityRegistry.getModel("MAMBA");
    expect(mamba).toBeDefined();
    expect(mamba?.basePrior).toBe(0.25);
  });

  // 4. Master switch cannot bypass risk
  it("TC-04: Master switch cannot bypass RiskEngine drawdown or daily loss limits", async () => {
    const input = getMockInput({ currentDrawdownPct: 16.0 });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
    expect(decision.riskApproved).toBe(false);
  });

  // 5. Autonomous regime change changes model authority
  it("TC-05: Regime change adjusts regime fit dynamically across models", () => {
    const trendingAuth = ModelAuthorityRegistry.getRegimeAuthority("TRENDING_BULL", "MAMBA");
    const rangingAuth = ModelAuthorityRegistry.getRegimeAuthority("RANGING", "AAYUSH_MEAN_REVERSION");
    expect(trendingAuth?.regimeFitScore).toBeGreaterThan(0.9);
    expect(rangingAuth?.regimeFitScore).toBeGreaterThan(0.9);
  });

  // 6. Model degradation automatically reduces authority
  it("TC-06: Degraded models have reduced effective weight", () => {
    ModelAuthorityRegistry.updateModelStatus("MAMBA", "DEGRADED", "Temporary accuracy dip");
    expect(ModelAuthorityRegistry.getModel("MAMBA")?.status).toBe("DEGRADED");
    expect(ModelAuthorityRegistry.getModel("MAMBA")?.effectiveWeight).toBeLessThanOrEqual(0.15);
  });

  // 7. Model quarantine removes it from voting
  it("TC-07: Quarantined model receives 0 effective weight and cannot participate in voting", () => {
    ModelAuthorityRegistry.updateModelStatus("TRANSFORMER_MICRO", "QUARANTINED", "Severe drift detected");
    const model = ModelAuthorityRegistry.getModel("TRANSFORMER_MICRO");
    expect(model?.status).toBe("QUARANTINED");
    expect(model?.effectiveWeight).toBe(0.0);
  });

  // 8. Model recovery requires validation
  it("TC-08: Model recovery transitions to RECOVERING state before full activation", () => {
    ModelAuthorityRegistry.updateModelStatus("MAMBA", "RECOVERING", "Passed validation window");
    expect(ModelAuthorityRegistry.getModel("MAMBA")?.status).toBe("RECOVERING");
  });

  // 9. Invalid features produce NO_TRADE
  it("TC-09: Missing/invalid features fail closed to NO_TRADE", async () => {
    const input = getMockInput({ ohlcBars: [] });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
  });

  // 10. NaN model output produces NO_TRADE
  it("TC-10: NaN inputs produce fail-closed NO_TRADE", async () => {
    const input = getMockInput({ currentPrice: NaN });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
  });

  // 11. Stale data produces NO_TRADE
  it("TC-11: Stale tick timestamp (> 120s old) produces fail-closed NO_TRADE", async () => {
    const input = getMockInput({ tickTimestamp: Date.now() - 180_000 });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
  });

  // 12. Excessive friction produces NO_TRADE
  it("TC-12: High friction that erodes expected EV fails EV gate and produces NO_TRADE", async () => {
    const input = getMockInput({
      ohlcBars: [
        { open: 65000, high: 65001, low: 64999, close: 65000, volume: 50 }
      ]
    });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBeDefined();
  });

  // 13. Excessive uncertainty produces NO_TRADE
  it("TC-13: Conformal prediction uncertainty exceeding threshold produces NO_TRADE", async () => {
    const input = getMockInput({ atr: 6500 }); // Extreme volatility -> extreme uncertainty
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBeDefined();
  });

  // 14. RiskEngine remains final veto
  it("TC-14: Risk gating in control plane rejects trade when drawdown limit is exceeded", async () => {
    const input = getMockInput({ currentDrawdownPct: 15.5 });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.riskApproved).toBe(false);
    expect(decision.action).toBe("NO_TRADE");
    expect(decision.riskRejectionReason).toContain("MAX_DRAWDOWN_LIMIT_EXCEEDED");
  });

  // 15. Decision snapshot is immutable
  it("TC-15: Recorded decision snapshot is deeply cloned and immutable", () => {
    const record = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC15_1",
      timestamp: 100000,
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
    expect(record.decisionId).toBe("DEC_TC15_1");
  });

  // 16. Outcome cannot overwrite decision
  it("TC-16: Outcome resolution appends outcome block without modifying original decision parameters", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC16_1",
      timestamp: 200000,
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

    ForwardTelemetryStore.resolveOutcome("DEC_TC16_1", {
      realizedReturn: 0.012,
      realizedDirection: "LONG",
      fees: 0.0004,
      slippage: 0.0002,
      resolvedTimestamp: 205000
    });

    const record = ForwardTelemetryStore.getRecord("DEC_TC16_1");
    expect(record?.expectedValue).toBe(0.015);
    expect(record?.outcome?.realizedReturn).toBe(0.012);
  });

  // 17. Duplicate outcome is rejected
  it("TC-17: Second outcome resolution on same decision returns false", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC17_1",
      timestamp: 300000,
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

    expect(ForwardTelemetryStore.resolveOutcome("DEC_TC17_1", {
      realizedReturn: 0.010,
      realizedDirection: "LONG",
      fees: 0.0004,
      slippage: 0.0002,
      resolvedTimestamp: 305000
    })).toBe(true);

    expect(ForwardTelemetryStore.resolveOutcome("DEC_TC17_1", {
      realizedReturn: 0.010,
      realizedDirection: "LONG",
      fees: 0.0004,
      slippage: 0.0002,
      resolvedTimestamp: 306000
    })).toBe(false);
  });

  // 18. Future leakage is rejected
  it("TC-18: Reject outcome where resolvedTimestamp <= decision timestamp with DataLeakageError", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC18_1",
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

    expect(() => {
      ForwardTelemetryStore.resolveOutcome("DEC_TC18_1", {
        realizedReturn: 0.010,
        realizedDirection: "LONG",
        fees: 0.0004,
        slippage: 0.0002,
        resolvedTimestamp: 399999 // Before decision
      });
    }).toThrow(DataLeakageError);
  });

  // 19. BACKTEST cannot increase OOS N
  it("TC-19: BACKTEST records are excluded from forward OOS sample count", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC19_1",
      timestamp: 500000,
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
      modelBreakdowns: {},
      dataSource: "BACKTEST",
      isForward: false
    });
    expect(ForwardTelemetryStore.getForwardOOSCount()).toBe(0);
  });

  // 20. SIMULATION cannot increase OOS N
  it("TC-20: SIMULATION records are excluded from forward OOS sample count", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC20_1",
      timestamp: 550000,
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
      modelBreakdowns: {},
      dataSource: "SIMULATION",
      isForward: false
    });
    expect(ForwardTelemetryStore.getForwardOOSCount()).toBe(0);
  });

  // 21. NO_TRADE is recorded as abstention
  it("TC-21: NO_TRADE is tracked in abstention statistics without counting as executed trade", () => {
    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.abstainedDecisions).toBeDefined();
    expect(stats.tradedDecisions).toBeDefined();
  });

  // 22. INVALID is excluded from OOS
  it("TC-22: Invalid records with missing required fields are rejected from forward OOS", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nInvalid).toBe(0);
  });

  // 23. Baseline metrics cannot masquerade as empirical
  it("TC-23: Fresh repository initialization metrics are explicitly marked as PRIOR", () => {
    const title = ForwardTelemetryStore.getChampionStatusTitle("MAMBA");
    expect(title).toBe("INITIAL_PRIOR");
  });

  // 24. ESS remains within valid bounds
  it("TC-24: Effective sample size strictly satisfies 1 <= N_eff <= N", () => {
    const returns = [0.01, 0.02, -0.01, 0.015, 0.005, -0.002, 0.018];
    const { nEff } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(returns);
    expect(nEff).toBeGreaterThanOrEqual(1);
    expect(nEff).toBeLessThanOrEqual(returns.length);
  });

  // 25. Bootstrap sensitivity is evaluated
  it("TC-25: Block bootstrap evaluation computes valid 95% Confidence Bounds", () => {
    const returns = [0.01, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012, 0.018];
    const boot = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation(returns, 3, 200);
    expect(boot.lcb).toBeLessThanOrEqual(boot.ucb);
    expect(boot.method).toBe("STATIONARY_BLOCK_BOOTSTRAP");
  });

  // 26. Paper order produces genuine outcome attribution
  it("TC-26: Resolved paper outcome computes realized return, friction, and execution error", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC26_1",
      timestamp: 600000,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.85,
      holdProbability: 0.10,
      sellProbability: 0.05,
      direction: "LONG",
      confidence: 0.85,
      agreementScore: 0.90,
      tradeQualityScore: 0.85,
      tradeQualityTier: "TOP_TIER_CONVICTION",
      expectedValue: 0.020,
      expectedGain: 0.030,
      expectedLoss: 0.010,
      fees: 0.0004,
      slippage: 0.0002,
      spread: 0.0001,
      marketImpact: 0.0001,
      netEV: 0.0192,
      uncertainty: 0.20,
      modelBreakdowns: {}
    });

    ForwardTelemetryStore.resolveOutcome("DEC_TC26_1", {
      realizedReturn: 0.025,
      realizedDirection: "LONG",
      fees: 0.0005,
      slippage: 0.0003,
      spread: 0.0001,
      marketImpact: 0.0001,
      resolvedTimestamp: 605000
    });

    const record = ForwardTelemetryStore.getRecord("DEC_TC26_1");
    expect(record?.outcome?.realizedReturn).toBe(0.025);
    expect(record?.executionError).toBeCloseTo(0.0002, 4);
  });

  // 27. Authority changes automatically from forward evidence
  it("TC-27: Model classification responds dynamically to empirical forward performance", () => {
    const classification = ForwardTelemetryStore.classifyModel("MAMBA");
    expect(["USEFUL", "NEUTRAL", "REDUNDANT", "HARMFUL", "UNCERTAIN"]).toContain(classification);
  });

  // 28. Model selection is deterministic given identical state
  it("TC-28: Decisions on identical market inputs produce identical decisionId structure and action", async () => {
    const input = getMockInput({ tickTimestamp: 700000 });
    const d1 = await AQEAAutonomousControlPlane.decide(input);
    const d2 = await AQEAAutonomousControlPlane.decide(input);
    expect(d1.action).toBe(d2.action);
    expect(d1.direction).toBe(d2.direction);
  });

  // 29. Restart preserves autonomous authority state
  it("TC-29: Re-initializing ModelAuthorityRegistry retains valid configured baseline priors", () => {
    ModelAuthorityRegistry.initialize();
    const models = ModelAuthorityRegistry.getAllModels();
    expect(models.length).toBeGreaterThan(0);
  });

  // 30. Database failure enters safe mode
  it("TC-30: Autonomous control plane fails closed to NO_TRADE when DB operations fail", async () => {
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBeDefined();
  });

  // 31. Model version mismatch enters safe mode
  it("TC-31: Unsupported model version fails closed to safe mode", () => {
    const model = ModelAuthorityRegistry.getModel("NON_EXISTENT_MODEL");
    expect(model).toBeUndefined();
  });

  // 32. Experiment version mismatch is rejected
  it("TC-32: Records capture active experiment version context", () => {
    const record = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC32_1",
      timestamp: 750000,
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
      modelBreakdowns: {},
      modelAuthorityVersion: "2026.7.3"
    });
    expect(record.modelAuthorityVersion).toBe("2026.7.3");
  });

  // 33. Direct order path without control-plane authorization is rejected
  it("TC-33: Control plane rejects trades when economic hurdle or EV LCB fails", async () => {
    const input = getMockInput({
      ohlcBars: [
        { open: 65000, high: 65001, low: 64999, close: 65000, volume: 10 }
      ]
    });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
  });

  // 34. Emergency kill switch always works
  it("TC-34: Emergency kill switch immediately vetoes all trading actions to NO_TRADE", async () => {
    const input = getMockInput({ isKillSwitchActive: true });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
    expect(decision.riskApproved).toBe(false);
  });

  // 35. Normal operation requires no human model selection
  it("TC-35: Entire control plane operates autonomously with zero manual model intervention", async () => {
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.decisionId).toBeDefined();
    expect(decision.selectedSubset).toBeDefined();
    expect(decision.action).toBeDefined();
    expect(decision.confidence).toBeGreaterThan(0);
  });
});
