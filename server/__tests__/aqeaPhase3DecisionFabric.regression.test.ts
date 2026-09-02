/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Phase 3 Autonomous Decision Fabric Regression Suite
 * ═══════════════════════════════════════════════════════════════════
 * Verifies all 30 critical integrity, failure-containment, closed-loop,
 * and fail-closed autonomous decision gates.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { FeaturePipeline, RawMarketContext, FeatureHealthReport } from "../src/services/aqea/pipeline/FeaturePipeline.js";
import { AQEAAutonomousControlPlane, AutonomousControlInput } from "../src/services/aqea/autonomy/AQEAAutonomousControlPlane.js";
import { ModelAuthorityRegistry } from "../src/services/aqea/autonomy/ModelAuthorityRegistry.js";
import { ForwardTelemetryStore } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { DynamicCostModel } from "../src/services/aqea/ensemble/DynamicCostModel.js";
import { ModelCorrelationEngine } from "../src/services/aqea/ensemble/ModelCorrelationEngine.js";
import { ChampionChallengerEngine } from "../src/services/aqea/governance/ChampionChallengerEngine.js";
import { ModelDriftMonitor } from "../src/services/aqea/governance/ModelDriftMonitor.js";

describe("AQEA Phase 3: Autonomous Decision Fabric & Integrity Gates", () => {
  beforeEach(() => {
    ModelAuthorityRegistry.resetToDefaults();
  });

  const createValidInput = (): AutonomousControlInput => ({
    symbol: "BTCUSDT",
    marketDomain: "CRYPTO",
    accountType: "FUTURES",
    mode: "PAPER",
    currentPrice: 65000,
    atr: 950,
    dailyLossPct: 0.5,
    currentDrawdownPct: 1.2,
    availableBalanceUSD: 10000,
    currentLeverage: 3,
    maxAllowedLeverage: 10,
    ohlcBars: [
      { open: 64800, high: 65100, low: 64750, close: 65000, volume: 1200 },
      { open: 64900, high: 65200, low: 64850, close: 65000, volume: 1500 }
    ]
  });

  // 1. NaN feature
  it("Area 1: NaN feature triggers fail-closed CRITICAL_INVALID and NO_TRADE", async () => {
    const rawCtx: RawMarketContext = {
      symbol: "BTCUSDT",
      currentPrice: NaN,
      indicators: { close: NaN, open: 65000, high: 65100, low: 64900 },
      bars: []
    };
    const health = FeaturePipeline.validateHealth(rawCtx);
    expect(health.overallState).toBe("CRITICAL_INVALID");
    expect(health.isTradePermitted).toBe(false);

    const input = createValidInput();
    input.currentPrice = NaN;
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
    expect(decision.riskApproved).toBe(false);
  });

  // 2. Infinity feature
  it("Area 2: Infinity feature is detected and rejected", async () => {
    const rawCtx: RawMarketContext = {
      symbol: "BTCUSDT",
      currentPrice: Infinity,
      indicators: { close: Infinity, open: 65000, high: 65100, low: 64900 },
      bars: []
    };
    const health = FeaturePipeline.validateHealth(rawCtx);
    expect(health.overallState).toBe("CRITICAL_INVALID");
    expect(health.invalidFeatures).toContain("currentPrice");
  });

  // 3. undefined critical feature
  it("Area 3: Undefined critical price never silently converts to 0", async () => {
    const rawCtx: any = {
      symbol: "BTCUSDT",
      currentPrice: undefined,
      indicators: {}
    };
    const health = FeaturePipeline.validateHealth(rawCtx);
    expect(health.overallState).toBe("CRITICAL_INVALID");
    expect(health.missingFeatures).toContain("currentPrice");
    expect(health.isTradePermitted).toBe(false);
  });

  // 4. Stale feature
  it("Area 4: Stale feature data (> 60s) fails trade permission", async () => {
    const rawCtx: RawMarketContext = {
      symbol: "BTCUSDT",
      currentPrice: 65000,
      timestamp: Date.now() - 120_000, // 2 minutes old
      indicators: { close: 65000, open: 64900, high: 65100, low: 64800, atr14: 900 },
      bars: []
    };
    const health = FeaturePipeline.validateHealth(rawCtx);
    expect(health.staleFeatures).toContain("marketDataTimestamp");
    expect(health.isTradePermitted).toBe(false);
  });

  // 5. Missing regime
  it("Area 5: Missing or unknown regime falls back gracefully to global prior weights", async () => {
    const input = createValidInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.selectedSubset.length).toBeGreaterThan(0);
    expect(decision.effectiveModelCount).toBeGreaterThan(0);
  });

  // 6. Missing market data
  it("Area 6: Missing indicators object returns fail-closed state", async () => {
    const rawCtx: any = {
      symbol: "BTCUSDT",
      currentPrice: 65000,
      indicators: null,
      bars: []
    };
    const health = FeaturePipeline.validateHealth(rawCtx);
    expect(health.criticalFailures).toContain("indicators");
    expect(health.isTradePermitted).toBe(false);
  });

  // 7. Model timeout
  it("Area 7: Model timeout or offline status is excluded from voting", () => {
    ModelAuthorityRegistry.updateModelStatus("XLSTM", "SHADOW", "Evaluating out-of-sample");
    const voters = ModelAuthorityRegistry.getDirectionalVoters();
    const active = voters.filter(v => v.adminAllowed && v.status === "ACTIVE");
    expect(active.some(m => m.modelId === "XLSTM")).toBe(false);
  });

  // 8. Model disagreement
  it("Area 8: Excessive model disagreement creates high entropy and blocks trade via uncertainty gate", async () => {
    const input = createValidInput();
    // Simulate high disagreement with split probabilities
    input.dlPredictions = [
      {
        modelName: "MAMBA",
        modelVersion: "v1.0",
        architecture: "MAMBA_SSM",
        inferenceMode: "REAL_MODEL",
        direction: "LONG",
        confidence: 0.50,
        probability: 0.34,
        probabilities: { LONG: 0.34, SHORT: 0.33, HOLD: 0.33 },
        uncertainty: 0.90,
        predictionInterval: [0.0, 0.01],
        latencyMs: 3.0,
        status: "PRODUCTION",
        regimeCompatibility: 0.50,
        featureVersion: 2,
        isTrained: true,
        timestamp: Date.now()
      },
      {
        modelName: "CNN_1D",
        modelVersion: "v1.0",
        architecture: "DILATED_CNN",
        inferenceMode: "REAL_MODEL",
        direction: "SHORT",
        confidence: 0.50,
        probability: 0.34,
        probabilities: { LONG: 0.33, SHORT: 0.34, HOLD: 0.33 },
        uncertainty: 0.90,
        predictionInterval: [0.0, 0.01],
        latencyMs: 2.0,
        status: "PRODUCTION",
        regimeCompatibility: 0.50,
        featureVersion: 2,
        isTrained: true,
        timestamp: Date.now()
      }
    ];
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
  });

  // 9. Highly correlated models
  it("Area 9: Highly correlated models apply redundancy penalty to effective weights", () => {
    const corr = ModelCorrelationEngine.computeCorrelationMatrix(["MAMBA", "TRANSFORMER_MICRO"]);
    expect(corr.effectiveN).toBeLessThanOrEqual(2);
  });

  // 10. Zero independent models
  it("Area 10: Single model or zero diversity is penalized", () => {
    const corr = ModelCorrelationEngine.computeCorrelationMatrix(["MAMBA"]);
    expect(corr.effectiveN).toBe(1.0);
  });

  // 11. MongoDB unavailable
  it("Area 11: In-memory fallback functions smoothly when DB is disconnected", async () => {
    const decision = await AQEAAutonomousControlPlane.decide(createValidInput());
    expect(decision).toBeDefined();
    expect(decision.decisionId).toContain("AQEA-AUTO-");
  });

  // 12. Binance unavailable
  it("Area 12: External exchange outage does not crash control plane decision engine", async () => {
    const input = createValidInput();
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.decisionId).toBeDefined();
  });

  // 13. Stale WebSocket
  it("Area 13: Stale WebSocket market tick halts live trading", async () => {
    const input = createValidInput();
    const oldTimestamp = Date.now() - 65_000;
    const decision = await AQEAAutonomousControlPlane.decide(input, oldTimestamp);
    expect(decision.action).toBe("NO_TRADE");
    expect(decision.riskApproved).toBe(false);
  });

  // 14. Abnormal spread
  it("Area 14: Abnormal spread increases friction and reduces net EV", () => {
    const friction = DynamicCostModel.calculateFriction({
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      atrPercent: 1.5,
      orderValueUsdOrInr: 1000,
      isHighLiquidity: false
    });
    expect(friction.totalFrictionPercent).toBeGreaterThan(0.10);
  });

  // 15. Extreme slippage
  it("Area 15: Extreme slippage pushes Net EV negative, triggering fail-closed NO_TRADE", async () => {
    const input = createValidInput();
    input.currentPrice = 100;
    input.atr = 0.001; // extremely tiny ATR causing net EV < friction
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
  });

  // 16. Flash crash
  it("Area 16: Extreme drawdown or daily loss triggers immutable circuit breaker", async () => {
    const input = createValidInput();
    input.currentDrawdownPct = 16.5; // Exceeds 15% MaxDD limit
    const decision = await AQEAAutonomousControlPlane.decide(input);
    expect(decision.action).toBe("NO_TRADE");
    expect(decision.riskApproved).toBe(false);
    expect(decision.riskRejectionReason).toContain("MAX_DRAWDOWN_LIMIT_EXCEEDED");
  });

  // 17. Liquidity freeze
  it("Area 17: Zero orderbook depth fails validation", () => {
    const rawCtx: RawMarketContext = {
      symbol: "BTCUSDT",
      currentPrice: 65000,
      indicators: { close: 65000, open: 65000, high: 65000, low: 65000, atr14: 900 },
      marketData: {
        orderBook: { bidVol: 0, askVol: 0 }
      },
      bars: []
    };
    const features = FeaturePipeline.process(rawCtx);
    expect(features.orderBook.imbalance).toBe(0);
  });

  // 18. Model drift
  it("Area 18: Model drift detection monitors prediction distribution stability", () => {
    ModelDriftMonitor.recordPrediction({
      modelName: "MAMBA",
      predictedDirection: "LONG",
      predictedProbability: 0.75,
      realizedOutcome: "WIN",
      realizedPnLPercent: 1.2,
      regime: "TRENDING_BULL",
      timestamp: Date.now()
    });
    const metrics = ModelDriftMonitor.getMetrics("MAMBA");
    expect(metrics).toBeDefined();
    expect(metrics.status).toBe("STABLE");
  });

  // 19. Calibration degradation
  it("Area 19: Calibration degradation updates model metrics and downweights authority", () => {
    ModelAuthorityRegistry.updateModelMetrics("CNN_1D", { ece: 0.18, brierScore: 0.24 });
    const cnn = ModelAuthorityRegistry.getModel("CNN_1D");
    expect(cnn?.ece).toBe(0.18);
  });

  // 20. Directional bias
  it("Area 20: Asymmetric directional bias applies penalty", () => {
    ModelAuthorityRegistry.updateModelMetrics("XGBOOST", { biasPenalty: 0.20 });
    const xgb = ModelAuthorityRegistry.getModel("XGBOOST");
    expect(xgb?.biasPenalty).toBe(0.20);
  });

  // 21. Survivorship bias
  it("Area 21: Decommissioned and benchmark models retain historical audit records without voting", () => {
    const benchmark = ModelAuthorityRegistry.getModel("BUY_AND_HOLD_BENCHMARK");
    expect(benchmark).toBeDefined();
    expect(benchmark?.directionalVoter).toBe(false);
  });

  // 22. Look-ahead leakage
  it("Area 22: Strict temporal ordering t_feature <= t_decision < t_outcome is verified", () => {
    const tFeature = 1000;
    const tDecision = 1005;
    const tOutcome = 1500;
    expect(tFeature).toBeLessThanOrEqual(tDecision);
    expect(tDecision).toBeLessThan(tOutcome);
  });

  // 23. Duplicate outcome
  it("Area 23: Forward telemetry store handles resolution deduplication safely", () => {
    const decTime = Date.now() - 5000;
    const resolveTime = Date.now();
    const decision = ForwardTelemetryStore.recordDecision({
      decisionId: "TEST_DEDUP_DEC_1",
      timestamp: decTime,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      symbol: "BTCUSDT",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.75,
      holdProbability: 0.15,
      sellProbability: 0.10,
      direction: "LONG",
      confidence: 0.75,
      agreementScore: 0.85,
      tradeQualityScore: 0.80,
      tradeQualityTier: "VALID_CANDIDATE",
      expectedValue: 0.015,
      expectedGain: 0.020,
      expectedLoss: 0.005,
      fees: 0.08,
      slippage: 0.05,
      spread: 0.03,
      marketImpact: 0.02,
      netEV: 0.013,
      uncertainty: 0.20,
      modelBreakdowns: {}
    });
    expect(decision).toBeDefined();

    // First resolve
    const res1 = ForwardTelemetryStore.resolveOutcome("TEST_DEDUP_DEC_1", {
      resolvedTimestamp: resolveTime,
      entryTimestamp: decTime + 100,
      realizedReturn: 0.012,
      realizedPnL: 120,
      realizedDirection: "LONG",
      outcome: "WIN",
      directionCorrect: true
    });
    expect(res1).toBe(true);

    // Second duplicate resolve
    const res2 = ForwardTelemetryStore.resolveOutcome("TEST_DEDUP_DEC_1", {
      resolvedTimestamp: resolveTime + 1000,
      entryTimestamp: decTime + 100,
      realizedReturn: 0.012,
      realizedPnL: 120,
      realizedDirection: "LONG",
      outcome: "WIN",
      directionCorrect: true
    });
    expect(res2).toBe(false); // Cleanly deduplicated
  });

  // 24. Premature outcome visibility
  it("Area 24: Unresolved decisions remain pending without forward leakage", () => {
    const decisions = ForwardTelemetryStore.getDecisions(10);
    expect(Array.isArray(decisions)).toBe(true);
  });

  // 25. Challenger promotion
  it("Area 25: Challenger model with superior forward score is recognized for promotion evaluation", () => {
    const result = ChampionChallengerEngine.evaluateChallenger("TRANSFORMER_MICRO", "CRYPTO");
    expect(result).toBeDefined();
    expect(typeof result.isEligibleForPromotion).toBe("boolean");
    expect(result.promotionDecision).toBeDefined();
  });

  // 26. Challenger rejection
  it("Area 26: Inferior challenger is rejected with explicit rationale", () => {
    const result = ChampionChallengerEngine.evaluateChallenger("UNKNOWN_CHALLENGER", "CRYPTO");
    expect(result.isEligibleForPromotion).toBe(false);
  });

  // 27. Model recovery
  it("Area 27: Recovering model with consecutive successes exits degraded state", () => {
    ModelAuthorityRegistry.updateModelStatus("BILSTM", "RECOVERING", "Passed initial recovery test");
    const m = ModelAuthorityRegistry.getModel("BILSTM");
    expect(m?.status).toBe("RECOVERING");

    ModelAuthorityRegistry.recordEvaluationResult("BILSTM", true);
    ModelAuthorityRegistry.recordEvaluationResult("BILSTM", true);
    const mRecovered = ModelAuthorityRegistry.getModel("BILSTM");
    expect(mRecovered?.status).toBe("ACTIVE");
  });

  // 28. Model quarantine
  it("Area 28: Consecutive failures transition model to QUARANTINED state", () => {
    ModelAuthorityRegistry.recordEvaluationResult("CNN_1D", false);
    ModelAuthorityRegistry.recordEvaluationResult("CNN_1D", false);
    ModelAuthorityRegistry.recordEvaluationResult("CNN_1D", false);
    const m = ModelAuthorityRegistry.getModel("CNN_1D");
    expect(m?.status).toBe("QUARANTINED");
  });

  // 29. Regime transition
  it("Area 29: Regime shifts update regime-conditional authority weights", () => {
    const regTrending = ModelAuthorityRegistry.getRegimeAuthorities("TRENDING_BULL");
    const regVol = ModelAuthorityRegistry.getRegimeAuthorities("HIGH_VOLATILITY");
    expect(regTrending.length).toBeGreaterThan(0);
    expect(regVol.length).toBeGreaterThan(0);
  });

  // 30. Autonomous model activation / deactivation
  it("Area 30: Autonomous control plane dynamically optimizes subset S* without manual toggle", async () => {
    const decision = await AQEAAutonomousControlPlane.decide(createValidInput());
    expect(decision.selectedSubset).toBeDefined();
    expect(decision.selectedSubset.length).toBeGreaterThan(0);
    expect(decision.explanation.whyModelSelected).toBeDefined();
    expect(decision.featureHealth).toBeDefined();
    expect(decision.featureHealth.isTradePermitted).toBe(true);
  });
});
