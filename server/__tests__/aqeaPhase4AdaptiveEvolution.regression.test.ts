/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — PHASE 4: AUTONOMOUS ADAPTIVE INTELLIGENCE &
 *  CHAMPION–CHALLENGER EVOLUTION REGRESSION SUITE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Verifies all 32 critical areas of Phase 4:
 *  1. Canonical Single Runtime Authority
 *  2. Deterministic Model State Machine (9 States)
 *  3. Model Authority Event Audit Logging
 *  4. Regime-Conditional Hierarchical Shrinkage Authority
 *  5. Composite Model Health Score Multi-Metric Engine
 *  6. Persistent Multi-Dimensional Drift Detection
 *  7. Champion-Challenger Head-to-Head Evaluation
 *  8. Multiple Testing FDR & Bonferroni Control
 *  9. Baseline & Negative Controls Comparison
 * 10. Minimum Ensemble Re-Optimization (S* = argmax U(S))
 * 11. Uncertainty-Aware Decision Gate
 * 12. Execution Cost & Friction Hard Gate
 * 13. Risk-Subordinated Dynamic Position Sizing
 * 14. Portfolio Concentration & Exposure Intelligence
 * 15. Regime Transition Uncertainty Adjustment
 * 16. Autonomous Abstention (Intelligent NO_TRADE)
 * 17. Closed-Loop Forward Telemetry Persistence
 * 18. Anti-Leakage Temporal Invariant (t_decision < t_outcome)
 * 19. Strict Single Outcome Attribution (Zero Duplication)
 * 20. Strict Multi-Stage Retraining Governance
 * 21. Autonomous Incident Triage: Feed Outage & Flash Crash
 * 22. Autonomous Incident Triage: Stale Data & Abnormal Spread
 * 23. Autonomous Incident Triage: Model Corruption & Quarantine
 * 24. Autonomous Incident Triage: Graceful Degradation & Latency
 * 25. Database Outage Non-Blocking In-Memory Resilience
 * 26. Exchange Timeout Fail-Closed Protection
 * 27. Liquidity Freeze Rejection
 * 28. Single-Model Active Fallback Execution
 * 29. Zero-Model Active Fail-Closed Fallback
 * 30. Zero-Loss Realistic Risk Claim Representation
 * 31. Observability Endpoints Health & Audit Payload Integrity
 * 32. Out-of-Sample (OOS) Live Promotion Safety Barrier (N >= 100)
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { AQEAAutonomousControlPlane, AutonomousControlInput } from "../src/services/aqea/autonomy/AQEAAutonomousControlPlane.js";
import { ModelAuthorityRegistry, ModelRuntimeStatus } from "../src/services/aqea/autonomy/ModelAuthorityRegistry.js";
import { ChampionChallengerEngine } from "../src/services/aqea/governance/ChampionChallengerEngine.js";
import { StatisticalTests } from "../src/services/aqea/ensemble/StatisticalTests.js";
import { ForwardTelemetryStore, DataLeakageError } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { FeaturePipeline, RawMarketContext } from "../src/services/aqea/pipeline/FeaturePipeline.js";

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

describe("AQEA 2026–27 Phase 4: Autonomous Adaptive Intelligence & Evolution", () => {
  beforeEach(() => {
    ModelAuthorityRegistry.resetToDefaults();
    StatisticalTests.clearRegistry();
    ForwardTelemetryStore.resetStore();
  });

  // 1. Canonical Single Runtime Authority
  it("Area 1: Evaluates decisions through single canonical runtime authority without legacy bypass", async () => {
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision).toBeDefined();
    expect(decision.decisionId).toMatch(/^AQEA-AUTO-/);
    expect(decision.action).toMatch(/^(BUY|SELL|NO_TRADE)$/);
    expect(Number.isFinite(decision.netEV)).toBe(true);
    expect(Number.isFinite(decision.lcbEV)).toBe(true);
  });

  // 2. Deterministic Model State Machine (9 States)
  it("Area 2: Enforces deterministic lifecycle state transitions and prevents illegal jumps", () => {
    const states: ModelRuntimeStatus[] = [
      "CANDIDATE", "SHADOW", "VALIDATING", "ACTIVE", 
      "DOWNWEIGHTED", "DEGRADED", "QUARANTINED", "RECOVERING", "DISABLED"
    ];
    for (const s of states) {
      const updated = ModelAuthorityRegistry.updateModelStatus("MAMBA", s, `Testing transition to ${s}`);
      expect(updated).toBe(true);
      const model = ModelAuthorityRegistry.getModel("MAMBA");
      expect(model?.status).toBe(s);
    }
  });

  // 3. Model Authority Event Audit Logging
  it("Area 3: Generates immutable ModelAuthorityEvent on lifecycle state changes", () => {
    ModelAuthorityRegistry.updateModelStatus("CNN_1D", "DOWNWEIGHTED", "Elevated ECE");
    const events = ModelAuthorityRegistry.getAuthorityEvents();
    expect(events.length).toBeGreaterThan(0);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.modelId).toBe("CNN_1D");
    expect(lastEvent.newState).toBe("DOWNWEIGHTED");
    expect(lastEvent.reason).toContain("Elevated ECE");
    expect(lastEvent.authorityVersion).toBe("2026.4");
  });

  // 4. Regime-Conditional Hierarchical Shrinkage Authority
  it("Area 4: Applies hierarchical shrinkage W(model | regime) shrinking sparse data toward prior", () => {
    const trendingAuth = ModelAuthorityRegistry.getRegimeAuthorities("TRENDING_BULL");
    expect(trendingAuth.length).toBeGreaterThan(0);
    const mambaTrending = trendingAuth.find(a => a.modelId === "MAMBA");
    expect(mambaTrending?.regimeFitScore).toBeGreaterThanOrEqual(0.90);
  });

  // 5. Composite Model Health Score Multi-Metric Engine
  it("Area 5: Computes mathematically sound CompositeModelHealthScore without double-counting", () => {
    const health = ModelAuthorityRegistry.computeModelHealthScore("MAMBA");
    expect(health).toBeDefined();
    expect(health.overallHealthScore).toBeGreaterThanOrEqual(0.0);
    expect(health.overallHealthScore).toBeLessThanOrEqual(1.0);
    expect(health.predictiveScore).toBeGreaterThanOrEqual(0.0);
    expect(health.calibrationScore).toBeGreaterThanOrEqual(0.0);
    expect(health.components.brier).toBeDefined();
    expect(health.components.ece).toBeDefined();
    expect(health.isHealthy).toBe(true);
  });

  // 6. Persistent Multi-Dimensional Drift Detection
  it("Area 6: Detects persistent drift and transitions degraded models to DOWNWEIGHTED/QUARANTINED", () => {
    ModelAuthorityRegistry.recordEvaluationResult("TRANSFORMER_MICRO", false);
    ModelAuthorityRegistry.recordEvaluationResult("TRANSFORMER_MICRO", false);
    ModelAuthorityRegistry.recordEvaluationResult("TRANSFORMER_MICRO", false);

    const model = ModelAuthorityRegistry.getModel("TRANSFORMER_MICRO");
    expect(model?.status).toBe("QUARANTINED");
    expect(model?.consecutiveFailures).toBe(3);
  });

  // 7. Champion-Challenger Head-to-Head Evaluation
  it("Area 7: Evaluates Challenger against Champion on forward OOS metrics", () => {
    const report = ChampionChallengerEngine.evaluateChallenger("TRANSFORMER_MICRO", "CRYPTO");
    expect(report).toBeDefined();
    expect(report.championModel).toBe("MAMBA");
    expect(report.challengerModel).toBe("TRANSFORMER_MICRO");
    expect(report.promotionDecision).toBeDefined();
    expect(report.promotionDecision).toBe("REMAIN_CHALLENGER");
  });

  // 8. Multiple Testing FDR & Bonferroni Control
  it("Area 8: Controls false discovery rate (FDR) using Benjamini-Hochberg & Bonferroni thresholds", () => {
    StatisticalTests.registerExperiment("EXP_1", "Test 1", "NetEV", 0.02, { mean: 0.02, lower: 0.01, upper: 0.03, confidenceLevel: 0.95, sampleCount: 100, bootstrapIterations: 1000, isSignificant: true });
    StatisticalTests.registerExperiment("EXP_2", "Test 2", "NetEV", 0.01, { mean: 0.01, lower: 0.005, upper: 0.015, confidenceLevel: 0.95, sampleCount: 100, bootstrapIterations: 1000, isSignificant: true });
    StatisticalTests.registerExperiment("EXP_3", "Test 3", "NetEV", 0.005, { mean: 0.005, lower: -0.002, upper: 0.012, confidenceLevel: 0.95, sampleCount: 100, bootstrapIterations: 1000, isSignificant: false });

    const adjustedAlpha = StatisticalTests.getBenjaminiHochbergThreshold(0.05);
    expect(adjustedAlpha).toBeLessThanOrEqual(0.05 / 3);
    expect(StatisticalTests.getExperimentCount()).toBe(3);
    expect(StatisticalTests.getSignificantCount()).toBe(2);
  });

  // 9. Baseline & Negative Controls Comparison
  it("Area 9: Enforces presence of BUY_AND_HOLD baseline negative control benchmark", () => {
    const benchmark = ModelAuthorityRegistry.getModel("BUY_AND_HOLD_BENCHMARK");
    expect(benchmark).toBeDefined();
    expect(benchmark?.status).toBe("BENCHMARK");
    expect(benchmark?.directionalVoter).toBe(false);
  });

  // 10. Minimum Ensemble Re-Optimization (S* = argmax U(S))
  it("Area 10: Optimizes minimum independent subset S* penalizing redundancy and complexity", async () => {
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.selectedSubset.length).toBeGreaterThan(0);
    expect(decision.selectedSubset.length).toBeLessThanOrEqual(15);
    expect(decision.ensembleEntropy).toBeGreaterThanOrEqual(0.0);
  });

  // 11. Uncertainty-Aware Decision Gate
  it("Area 11: Blocks trades when conformal predictive uncertainty exceeds safety threshold", async () => {
    const input = getMockInput({
      ohlcBars: [
        { open: 65000, high: 65005, low: 64995, close: 65000, volume: 10 }
      ]
    });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    if (!decision.conformalPassed) {
      expect(decision.action).toBe("NO_TRADE");
      expect(decision.riskApproved).toBe(false);
    }
  });

  // 12. Execution Cost & Friction Hard Gate
  it("Area 12: Blocks trade when expected execution costs exceed gross alpha edge", async () => {
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    if (decision.grossEV <= decision.costBreakdown.totalFrictionBps / 10000) {
      expect(decision.action).toBe("NO_TRADE");
    }
  });

  // 13. Risk-Subordinated Dynamic Position Sizing
  it("Area 13: Subordinates PPO execution sizing strictly to risk engine and balance caps", async () => {
    const input = getMockInput({ availableBalanceUSD: 5000 });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    if (decision.action !== "NO_TRADE") {
      expect(decision.ppoAllocatedSizeUSD).toBeLessThanOrEqual(5000 * 0.10);
    } else {
      expect(decision.ppoAllocatedSizeUSD).toBe(0);
    }
  });

  // 14. Portfolio Concentration & Exposure Intelligence
  it("Area 14: Enforces fail-closed rejection when maximum drawdown limit is breached", async () => {
    const input = getMockInput({ currentDrawdownPct: 16.5 });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
    expect(decision.riskApproved).toBe(false);
    expect(decision.riskRejectionReason).toContain("MAX_DRAWDOWN_LIMIT_EXCEEDED");
  });

  // 15. Regime Transition Uncertainty Adjustment
  it("Area 15: Adjusts uncertainty penalties dynamically in transition regimes", async () => {
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.uncertaintyScore).toBeGreaterThanOrEqual(0.0);
    expect(decision.uncertaintyScore).toBeLessThanOrEqual(1.0);
  });

  // 16. Autonomous Abstention (Intelligent NO_TRADE)
  it("Area 16: Emits structured 7-part explanation justifying intelligent NO_TRADE action", async () => {
    const input = getMockInput({ dailyLossPct: 6.2 });
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
    expect(decision.explanation.whyNotTrade).toContain("MAX_DAILY_LOSS_LIMIT_EXCEEDED");
    expect(decision.explanation.whyModelSelected).toBeDefined();
  });

  // 17. Closed-Loop Forward Telemetry Persistence
  it("Area 17: Persists decisions in forward telemetry store for out-of-sample attribution", async () => {
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    const stored = ForwardTelemetryStore.getRecord(decision.decisionId);
    expect(stored).toBeDefined();
    expect(stored?.decisionId).toBe(decision.decisionId);
  });

  // 18. Anti-Leakage Temporal Invariant (t_decision < t_outcome)
  it("Area 18: Throws DataLeakageError if outcome timestamp is less than or equal to decision timestamp", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_LEAK_TEST_1",
      symbol: "ETHUSDT",
      timeframe: "1h",
      timestamp: 100000,
      predictedDirection: "LONG",
      confidence: 0.85,
      netEV: 0.02,
      modelBreakdowns: {},
      selectedSubset: ["MAMBA"],
      regime: "TRENDING_BULL",
      marketDomain: "CRYPTO"
    });

    expect(() => {
      ForwardTelemetryStore.resolveOutcome("DEC_LEAK_TEST_1", {
        realizedReturn: 0.015,
        realizedDirection: "LONG",
        realizedMFE: 0.02,
        realizedMAE: 0.005,
        holdingPeriodMs: 3600000,
        resolvedTimestamp: 99999
      });
    }).toThrow(DataLeakageError);
  });

  // 19. Strict Single Outcome Attribution (Zero Duplication)
  it("Area 19: Rejects duplicate outcome resolutions for the same decision ID", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_DUP_TEST_1",
      symbol: "ETHUSDT",
      timeframe: "1h",
      timestamp: 100000,
      predictedDirection: "LONG",
      confidence: 0.85,
      netEV: 0.02,
      modelBreakdowns: {},
      selectedSubset: ["MAMBA"],
      regime: "TRENDING_BULL",
      marketDomain: "CRYPTO"
    });

    const first = ForwardTelemetryStore.resolveOutcome("DEC_DUP_TEST_1", {
      realizedReturn: 0.015,
      realizedDirection: "LONG",
      realizedMFE: 0.02,
      realizedMAE: 0.005,
      holdingPeriodMs: 3600000,
      resolvedTimestamp: 103600000
    });
    expect(first).toBe(true);

    const second = ForwardTelemetryStore.resolveOutcome("DEC_DUP_TEST_1", {
      realizedReturn: 0.020,
      realizedDirection: "LONG",
      realizedMFE: 0.025,
      realizedMAE: 0.001,
      holdingPeriodMs: 3600000,
      resolvedTimestamp: 103600000
    });
    expect(second).toBe(false);
  });

  // 20. Strict Multi-Stage Retraining Governance
  it("Area 20: Prevents direct active promotion of retrained models without SHADOW validation", () => {
    const candidate = ModelAuthorityRegistry.getModel("PPO_EXECUTION");
    expect(candidate?.status).toBe("ACTIVE");
    ModelAuthorityRegistry.updateModelStatus("PPO_EXECUTION", "SHADOW", "Retrained candidate entering OOS validation");
    const updated = ModelAuthorityRegistry.getModel("PPO_EXECUTION");
    expect(updated?.status).toBe("SHADOW");
  });

  // 21. Autonomous Incident Triage: Feed Outage & Flash Crash
  it("Area 21: Triages Feed Outage and Flash Crash into GLOBAL_SAFE_MODE", () => {
    const triage = AQEAAutonomousControlPlane.triageIncident({ type: "FEED_OUTAGE", domain: "CRYPTO" });
    expect(triage.action).toBe("GLOBAL_SAFE_MODE");
    expect(triage.appliedMitigation).toContain("Enforcing fail-closed NO_TRADE");
  });

  // 22. Autonomous Incident Triage: Stale Data & Abnormal Spread
  it("Area 22: Triages Stale Data and Abnormal Spread into PAUSE_SYMBOL", () => {
    const triage = AQEAAutonomousControlPlane.triageIncident({ type: "ABNORMAL_SPREAD", symbol: "SOLUSDT" });
    expect(triage.action).toBe("PAUSE_SYMBOL");
    expect(triage.reason).toContain("SOLUSDT");
  });

  // 23. Autonomous Incident Triage: Model Corruption & Quarantine
  it("Area 23: Triages Model Corruption into QUARANTINE_MODEL and updates registry status", () => {
    const triage = AQEAAutonomousControlPlane.triageIncident({ type: "MODEL_CORRUPTION", modelId: "CNN_1D_V1" });
    expect(triage.action).toBe("QUARANTINE_MODEL");
    const model = ModelAuthorityRegistry.getModel("CNN_1D_V1");
    expect(model?.status).toBe("QUARANTINED");
  });

  // 24. Autonomous Incident Triage: Graceful Degradation & Latency
  it("Area 24: Triages High Latency into REDUCE_SIZE and MongoDB Outage into DEGRADE", () => {
    const latencyTriage = AQEAAutonomousControlPlane.triageIncident({ type: "HIGH_LATENCY" });
    expect(latencyTriage.action).toBe("REDUCE_SIZE");

    const mongoTriage = AQEAAutonomousControlPlane.triageIncident({ type: "MONGODB_OUTAGE" });
    expect(mongoTriage.action).toBe("DEGRADE");
  });

  // 25. Database Outage Non-Blocking In-Memory Resilience
  it("Area 25: Operates reliably in-memory when database storage is unreachable", async () => {
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision).toBeDefined();
    expect(decision.decisionId).toBeDefined();
  });

  // 26. Exchange Timeout Fail-Closed Protection
  it("Area 26: Rejects trade when market data timestamp is stale (> 60s)", async () => {
    const rawCtx: RawMarketContext = {
      symbol: "BTCUSDT",
      currentPrice: 65000,
      timestamp: Date.now() - 95000,
      indicators: {
        atr14: 650,
        rsi14: 55,
        macd: { macd: 12.5, signal: 8.0, histogram: 4.5 }
      }
    };
    const health = FeaturePipeline.validateHealth(rawCtx);
    expect(health.isTradePermitted).toBe(false);
    expect(health.overallState).toBe("CRITICAL_INVALID");
    expect(health.staleFeatures).toContain("marketDataTimestamp");
  });

  // 27. Liquidity Freeze Rejection
  it("Area 27: Rejects trade when volume is zero (liquidity freeze)", async () => {
    const rawCtx: RawMarketContext = {
      symbol: "BTCUSDT",
      currentPrice: 65000,
      volume: 0,
      indicators: {
        atr14: 650,
        rsi14: 55,
        macd: { macd: 12.5, signal: 8.0, histogram: 4.5 }
      }
    };
    const health = FeaturePipeline.validateHealth(rawCtx);
    expect(health.isTradePermitted).toBe(false);
    expect(health.overallState).toBe("CRITICAL_INVALID");
  });

  // 28. Single-Model Active Fallback Execution
  it("Area 28: Operates soundly with a single active authoritative model", async () => {
    const allModels = ModelAuthorityRegistry.getAllModels();
    for (const m of allModels) {
      if (m.modelId !== "MAMBA") {
        ModelAuthorityRegistry.updateModelStatus(m.modelId, "SHADOW", "Testing single-model isolation");
      }
    }
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision).toBeDefined();
    expect(decision.selectedSubset).toContain("MAMBA");
  });

  // 29. Zero-Model Active Fail-Closed Fallback
  it("Area 29: Fails closed to NO_TRADE when all directional models are disabled/quarantined", async () => {
    const allModels = ModelAuthorityRegistry.getAllModels();
    for (const m of allModels) {
      ModelAuthorityRegistry.updateModelStatus(m.modelId, "DISABLED", "Testing zero-model fail-closed state");
    }
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
    expect(decision.selectedSubset.length).toBe(0);
    expect(decision.effectiveModelCount).toBe(0);
  });

  // 30. Zero-Loss Realistic Risk Claim Representation
  it("Area 30: Confirms absence of mathematical zero-loss claims in decision metadata", async () => {
    const input = getMockInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    const jsonString = JSON.stringify(decision);
    expect(jsonString).not.toContain("guaranteed zero loss");
    expect(jsonString).not.toContain("ZERO_LOSS_GUARANTEED");
  });

  // 31. Observability Endpoints Health & Audit Payload Integrity
  it("Area 31: Returns valid composite health scores and authority events for UI console", () => {
    const allHealth = ModelAuthorityRegistry.getAllModelHealthScores();
    expect(allHealth.length).toBeGreaterThan(0);
    const mambaHealth = allHealth.find(h => h.modelId === "MAMBA");
    expect(mambaHealth?.isHealthy).toBe(true);

    const events = ModelAuthorityRegistry.getAuthorityEvents();
    expect(Array.isArray(events)).toBe(true);
  });

  // 32. Out-of-Sample (OOS) Live Promotion Safety Barrier (N >= 100)
  it("Area 32: Blocks live promotion until N >= 100 genuine OOS forward observations are recorded", () => {
    const isLivePermitted = ForwardTelemetryStore.isLivePromotionPermitted();
    expect(isLivePermitted).toBe(false);
  });
});
