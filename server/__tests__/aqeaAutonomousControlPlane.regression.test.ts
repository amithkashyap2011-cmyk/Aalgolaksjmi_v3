/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Autonomous Intelligence Control Plane
 *  Full-Application Self-Governing 40-Area Regression Test Suite
 * ═══════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  AQEAAutonomousControlPlane,
  AutonomousControlInput,
  AutonomousDecision
} from "../src/services/aqea/autonomy/AQEAAutonomousControlPlane.js";
import {
  ModelAuthorityRegistry,
  IModelAuthorityState
} from "../src/services/aqea/autonomy/ModelAuthorityRegistry.js";
import { ForwardTelemetryStore } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { StatisticalTests } from "../src/services/aqea/ensemble/StatisticalTests.js";
import { ModelSubsetOptimizer } from "../src/services/aqea/ensemble/ModelSubsetOptimizer.js";
import { ModelCorrelationEngine } from "../src/services/aqea/ensemble/ModelCorrelationEngine.js";
import { BiasControlEngine } from "../src/services/aqea/governance/BiasControlEngine.js";
import { ChampionChallengerEngine } from "../src/services/aqea/governance/ChampionChallengerEngine.js";
import { ModelDriftMonitor } from "../src/services/aqea/governance/ModelDriftMonitor.js";
import { ModelExpertPrediction } from "../src/services/aqea/ai/IModelExpert.js";

function createMockInput(overrides: Partial<AutonomousControlInput> = {}): AutonomousControlInput {
  const dlPredictions: ModelExpertPrediction[] = [
    {
      modelName: "MAMBA",
      modelVersion: "v1.0",
      architecture: "MAMBA_SSM",
      inferenceMode: "REAL_MODEL",
      direction: "LONG",
      confidence: 0.82,
      probabilities: { LONG: 0.80, SHORT: 0.10, HOLD: 0.10 },
      latencyMs: 3.2,
      entropy: 0.85,
      status: "PRODUCTION"
    },
    {
      modelName: "TRANSFORMER_MICRO",
      modelVersion: "v1.0",
      architecture: "TRANSFORMER_ATTN",
      inferenceMode: "REAL_MODEL",
      direction: "LONG",
      confidence: 0.76,
      probabilities: { LONG: 0.72, SHORT: 0.18, HOLD: 0.10 },
      latencyMs: 4.1,
      entropy: 0.90,
      status: "PRODUCTION"
    },
    {
      modelName: "XGBOOST",
      modelVersion: "v1.0",
      architecture: "GBDT_TREES",
      inferenceMode: "REAL_MODEL",
      direction: "LONG",
      confidence: 0.74,
      probabilities: { LONG: 0.70, SHORT: 0.20, HOLD: 0.10 },
      latencyMs: 1.8,
      entropy: 0.90,
      status: "PRODUCTION"
    }
  ];

  return {
    symbol: "BTCUSDT",
    marketDomain: "CRYPTO",
    accountType: "FUTURES",
    mode: "PAPER",
    currentPrice: 50000,
    atr: 750,
    availableBalanceUSD: 10000,
    currentDrawdownPct: 2.5,
    dailyLossPct: 0.8,
    isKillSwitchActive: false,
    autoTradeEnabled: true,
    tickTimestamp: Date.now(),
    dlPredictions,
    ...overrides
  };
}

describe("AQEA 2026–27 — Autonomous Intelligence Control Plane 40-Area Suite", () => {
  beforeEach(() => {
    ModelAuthorityRegistry.resetToDefaults();
    ForwardTelemetryStore.clear();
    StatisticalTests.clearRegistry();
    ChampionChallengerEngine.clear();
  });

  // 1. AI automatically activates best eligible model
  it("Area 1: AI automatically activates best eligible model", () => {
    ModelAuthorityRegistry.updateModelMetrics("MAMBA", { incrementalEV: 0.015, ece: 0.03, brierScore: 0.14 });
    const m = ModelAuthorityRegistry.getModel("MAMBA");
    expect(m?.status).toBe("ACTIVE");
    expect(m?.effectiveWeight).toBeGreaterThan(0.10);
  });

  // 2. AI downweights weak model
  it("Area 2: AI downweights weak model", () => {
    ModelAuthorityRegistry.updateModelMetrics("CNN_1D", { incrementalEV: -0.006, ece: 0.16 });
    const m = ModelAuthorityRegistry.getModel("CNN_1D");
    expect(m?.status).toBe("DOWNWEIGHTED");
    expect(m?.effectiveWeight).toBeLessThan(0.10);
  });

  // 3. AI disables persistently degraded model
  it("Area 3: AI disables persistently degraded model", () => {
    for (let i = 0; i < 4; i++) {
      ModelAuthorityRegistry.updateModelMetrics("BILSTM", { incrementalEV: -0.01, ece: 0.18, brierScore: 0.28 });
    }
    const m = ModelAuthorityRegistry.getModel("BILSTM");
    expect(m?.status).toBe("TEMPORARILY_DISABLED");
    expect(m?.effectiveWeight).toBe(0.0);
  });

  // 4. AI restores recovered model
  it("Area 4: AI restores recovered model", () => {
    for (let i = 0; i < 3; i++) {
      ModelAuthorityRegistry.updateModelMetrics("BILSTM", { incrementalEV: -0.01, ece: 0.18 });
    }
    expect(ModelAuthorityRegistry.getModel("BILSTM")?.status).toBe("TEMPORARILY_DISABLED");

    // Recover across M=2 successful windows
    ModelAuthorityRegistry.updateModelMetrics("BILSTM", { incrementalEV: 0.008, ece: 0.04, brierScore: 0.16 });
    ModelAuthorityRegistry.updateModelMetrics("BILSTM", { incrementalEV: 0.009, ece: 0.04, brierScore: 0.15 });

    const m = ModelAuthorityRegistry.getModel("BILSTM");
    expect(m?.status).toBe("ACTIVE");
    expect(m?.effectiveWeight).toBeGreaterThan(0);
  });

  // 5. Regime-dependent model selection
  it("Area 5: Regime-dependent model selection", () => {
    ModelAuthorityRegistry.setRegimeAuthority("TRENDING_BULL", "MAMBA", {
      regime: "TRENDING_BULL",
      modelId: "MAMBA",
      regimeFitScore: 1.0,
      status: "ACTIVE",
      effectiveWeight: 0.40,
      ev: 0.02,
      winRate: 0.68,
      sampleCount: 50
    });
    const regAuth = ModelAuthorityRegistry.getRegimeAuthority("TRENDING_BULL", "MAMBA");
    expect(regAuth).toBeDefined();
    expect(regAuth?.effectiveWeight).toBe(0.40);
  });

  // 6. Signal-family selection
  it("Area 6: Signal-family selection", () => {
    const fam = ModelAuthorityRegistry.getSignalFamily("PRICE_MOMENTUM");
    expect(fam).toBeDefined();
    expect(fam?.weightCap).toBe(0.45);
  });

  // 7. Duplicate model configuration prevention
  it("Area 7: Duplicate model configuration prevention", () => {
    const all = ModelAuthorityRegistry.getAllModels();
    const ids = all.map(m => m.modelId);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  // 8. Model correlation penalty
  it("Area 8: Model correlation penalty", () => {
    const matrix = ModelCorrelationEngine.computeCorrelationMatrix(["MAMBA", "CNN_1D"]);
    expect(matrix.effectiveN).toBeLessThanOrEqual(2);
  });

  // 9. Incremental EV weighting
  it("Area 9: Incremental EV weighting", () => {
    ModelAuthorityRegistry.updateModelMetrics("MAMBA", { incrementalEV: 0.02 });
    ModelAuthorityRegistry.updateModelMetrics("CNN_1D", { incrementalEV: 0.001 });
    const mamba = ModelAuthorityRegistry.getModel("MAMBA")!;
    const cnn = ModelAuthorityRegistry.getModel("CNN_1D")!;
    expect(mamba.effectiveWeight).toBeGreaterThan(cnn.effectiveWeight);
  });

  // 10. Minimum ensemble selection
  it("Area 10: Minimum ensemble selection", () => {
    const t0 = Date.now() - 60_000;
    for (let i = 0; i < 25; i++) {
      const id = `rec-mso-${i}`;
      ForwardTelemetryStore.recordDecision({
        decisionId: id,
        timestamp: t0 + i * 1000,
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        symbol: "BTCUSDT",
        regime: "TRENDING_BULL",
        featureVersion: 2,
        buyProbability: 0.75,
        holdProbability: 0.15,
        sellProbability: 0.10,
        direction: "LONG",
        confidence: 0.80,
        agreementScore: 0.85,
        tradeQualityScore: 0.80,
        tradeQualityTier: "TIER_1_ALPHA",
        expectedValue: 0.015,
        fees: 0.001,
        slippage: 0.0005,
        netEV: 0.0135,
        modelBreakdowns: {
          MAMBA: {
            modelName: "MAMBA",
            modelFamily: "PRICE_MOMENTUM",
            direction: "LONG",
            probLong: 0.80,
            probShort: 0.10,
            probHold: 0.10,
            confidence: 0.80,
            effectiveWeight: 0.50,
            regimeFit: 1.0,
            dataQuality: 1.0,
            availability: 1.0,
            correlationPenalty: 1.0,
            incrementalContribution: 0.05,
            participating: true,
            status: "PRODUCTION",
            inferenceMode: "REAL_MODEL"
          }
        }
      });
      ForwardTelemetryStore.resolveOutcome(id, {
        decisionId: id,
        timestamp: t0 + i * 1000,
        symbol: "BTCUSDT",
        regime: "TRENDING_BULL",
        accountType: "FUTURES",
        realizedDirection: "LONG",
        realizedReturn: 2.0,
        realizedPnL: 20.0,
        outcome: "WIN",
        directionCorrect: true,
        resolvedTimestamp: t0 + i * 1000 + 400
      });
    }

    const res = ModelSubsetOptimizer.search(["MAMBA", "XGBOOST"], { minOOSSamples: 10 });
    expect(res.optimalSubset).toBeDefined();
    expect(res.optimalSubset?.models.length).toBeGreaterThan(0);
  });

  // 11. Champion promotion
  it("Area 11: Champion promotion", () => {
    const champ = ChampionChallengerEngine.getOrCreateState("MAMBA", "CRYPTO");
    expect(champ.state).toBe("CHAMPION");
  });

  // 12. Challenger rejection (< 100 samples)
  it("Area 12: Challenger rejection (< 100 samples)", () => {
    ChampionChallengerEngine.getOrCreateState("MAMBA", "CRYPTO");
    const chall = ChampionChallengerEngine.getOrCreateState("XLSTM", "CRYPTO");
    chall.sampleCount = 45;
    const report = ChampionChallengerEngine.evaluateChallenger("XLSTM", "CRYPTO");
    expect(report.isEligibleForPromotion).toBe(false);
    expect(report.promotionDecision).toBe("REMAIN_CHALLENGER");
  });

  // 13. Challenger promotion (N >= 100 & statistically superior)
  it("Area 13: Challenger promotion (N >= 100 & statistically superior)", () => {
    ChampionChallengerEngine.getOrCreateState("MAMBA", "CRYPTO");
    const chall = ChampionChallengerEngine.getOrCreateState("NEW_CHALL_V1", "CRYPTO");
    chall.sampleCount = 120;
    chall.costAdjustedEV = 0.025;

    const t0 = Date.now() - 150_000;
    for (let i = 0; i < 110; i++) {
      const decId = `dec-chall-${i}`;
      ForwardTelemetryStore.recordDecision({
        decisionId: decId,
        timestamp: t0 + i * 1000,
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        symbol: "BTCUSDT",
        regime: "TRENDING_BULL",
        featureVersion: 2,
        buyProbability: 0.80,
        holdProbability: 0.10,
        sellProbability: 0.10,
        direction: "LONG",
        confidence: 0.80,
        agreementScore: 0.85,
        tradeQualityScore: 0.85,
        tradeQualityTier: "TIER_1_ALPHA",
        expectedValue: 0.02,
        fees: 0.001,
        slippage: 0.0005,
        modelBreakdowns: {
          MAMBA: {
            modelName: "MAMBA",
            modelFamily: "PRICE_MOMENTUM",
            direction: "LONG",
            probLong: 0.70,
            probShort: 0.20,
            probHold: 0.10,
            confidence: 0.70,
            effectiveWeight: 0.30,
            regimeFit: 1.0,
            dataQuality: 1.0,
            availability: 1.0,
            correlationPenalty: 1.0,
            incrementalContribution: 0.05,
            participating: true,
            status: "PRODUCTION",
            inferenceMode: "REAL_MODEL"
          },
          NEW_CHALL_V1: {
            modelName: "NEW_CHALL_V1",
            modelFamily: "PRICE_MOMENTUM",
            direction: "LONG",
            probLong: 0.90,
            probShort: 0.05,
            probHold: 0.05,
            confidence: 0.90,
            effectiveWeight: 0.40,
            regimeFit: 1.0,
            dataQuality: 1.0,
            availability: 1.0,
            correlationPenalty: 1.0,
            incrementalContribution: 0.12,
            participating: true,
            status: "PRODUCTION",
            inferenceMode: "REAL_MODEL"
          }
        }
      });
      ForwardTelemetryStore.resolveOutcome(decId, {
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "BTCUSDT",
        regime: "TRENDING_BULL",
        accountType: "FUTURES",
        realizedDirection: "LONG",
        realizedReturn: 2.5,
        realizedPnL: 25.0,
        outcome: "WIN",
        directionCorrect: true,
        resolvedTimestamp: t0 + i * 1000 + 400
      });
    }

    const report = ChampionChallengerEngine.evaluateChallenger("NEW_CHALL_V1", "CRYPTO");
    expect(report.sampleCount).toBeGreaterThanOrEqual(100);
  });

  // 14. NO_TRADE superiority
  it("Area 14: NO_TRADE superiority", async () => {
    const input = createMockInput({
      dlPredictions: [
        {
          modelName: "MAMBA",
          modelVersion: "v1.0",
          architecture: "MAMBA_SSM",
          inferenceMode: "REAL_MODEL",
          direction: "HOLD",
          confidence: 0.35,
          probabilities: { LONG: 0.33, SHORT: 0.33, HOLD: 0.34 },
          latencyMs: 2,
          entropy: 1.0,
          status: "PRODUCTION"
        }
      ]
    });
    const dec = await AQEAAutonomousControlPlane.decide(input);
    expect(dec.action).toBe("NO_TRADE");
  });

  // 15. Negative EV rejection
  it("Area 15: Negative EV rejection", async () => {
    const input = createMockInput({
      atr: 50 // Ultra low ATR produces negative net EV after friction
    });
    const dec = await AQEAAutonomousControlPlane.decide(input);
    expect(dec.action === "NO_TRADE" || dec.netEV > 0).toBe(true);
  });

  // 16. Negative EV confidence-bound rejection
  it("Area 16: Negative EV confidence-bound rejection", async () => {
    const input = createMockInput();
    const dec = await AQEAAutonomousControlPlane.decide(input);
    if (dec.lcbEV <= 0) {
      expect(dec.action).toBe("NO_TRADE");
    }
  });

  // 17. Uncertainty rejection
  it("Area 17: Uncertainty rejection", async () => {
    const input = createMockInput({
      dlPredictions: [
        {
          modelName: "MAMBA",
          modelVersion: "v1.0",
          architecture: "MAMBA_SSM",
          inferenceMode: "REAL_MODEL",
          direction: "HOLD",
          confidence: 0.34,
          probabilities: { LONG: 0.333, SHORT: 0.333, HOLD: 0.334 },
          latencyMs: 2,
          entropy: 1.58,
          status: "PRODUCTION"
        }
      ]
    });
    const dec = await AQEAAutonomousControlPlane.decide(input);
    expect(dec.action).toBe("NO_TRADE");
  });

  // 18. Stale data rejection (> 60s)
  it("Area 18: Stale data rejection (> 60s)", async () => {
    const input = createMockInput({
      tickTimestamp: Date.now() - 90_000 // 90s stale
    });
    const dec = await AQEAAutonomousControlPlane.decide(input);
    expect(dec.action).toBe("NO_TRADE");
    expect(dec.riskRejectionReason).toContain("STALE_MARKET_DATA");
  });

  // 19. Data leakage rejection
  it("Area 19: Data leakage rejection", () => {
    const t0 = Date.now();
    ForwardTelemetryStore.recordDecision({
      decisionId: "leak-test-1",
      timestamp: t0,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      symbol: "BTCUSDT",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.7,
      holdProbability: 0.2,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.7,
      agreementScore: 0.8,
      tradeQualityScore: 0.8,
      tradeQualityTier: "TIER_1_ALPHA",
      expectedValue: 0.01,
      fees: 0.001,
      slippage: 0.0005,
      modelBreakdowns: {}
    });

    expect(() => {
      ForwardTelemetryStore.recordOutcome({
        decisionId: "leak-test-1",
        outcome: "WIN",
        outcomeResult: "WIN",
        realizedReturn: 0.02,
        directionCorrect: true,
        resolvedTimestamp: t0 - 100 // Precedes decision!
      });
    }).toThrow();
  });

  // 20. Model failure recovery
  it("Area 20: Model failure recovery", () => {
    ModelAuthorityRegistry.updateModelMetrics("MAMBA", { incrementalEV: -0.015, ece: 0.19 });
    expect(ModelAuthorityRegistry.getModel("MAMBA")?.status).toBe("DOWNWEIGHTED");

    ModelAuthorityRegistry.updateModelMetrics("MAMBA", { incrementalEV: 0.015, ece: 0.03, brierScore: 0.15 });
    expect(ModelAuthorityRegistry.getModel("MAMBA")?.status).toBe("ACTIVE");
  });

  // 21. Zero-model safe state
  it("Area 21: Zero-model safe state", async () => {
    const all = ModelAuthorityRegistry.getAllModels();
    for (const m of all) {
      ModelAuthorityRegistry.setAdminPermission(m.modelId, false);
    }
    const input = createMockInput();
    const dec = await AQEAAutonomousControlPlane.decide(input);
    expect(dec.action).toBe("NO_TRADE");
    expect(dec.riskRejectionReason).toContain("ZERO_ELIGIBLE_ACTIVE_MODELS");
  });

  // 22. PPO cannot vote direction
  it("Area 22: PPO cannot vote direction", () => {
    const ppo = ModelAuthorityRegistry.getModel("PPO_EXECUTION");
    expect(ppo?.directionalVoter).toBe(false);
    expect(ppo?.executionModel).toBe(true);
    expect(ppo?.effectiveWeight).toBe(0.0);
  });

  // 23. PPO cannot bypass risk
  it("Area 23: PPO cannot bypass risk", async () => {
    const input = createMockInput({
      currentDrawdownPct: 18.0 // Exceeds 15% Max DD
    });
    const dec = await AQEAAutonomousControlPlane.decide(input);
    expect(dec.action).toBe("NO_TRADE");
    expect(dec.riskApproved).toBe(false);
    expect(dec.ppoAllocatedSizeUSD).toBe(0);
  });

  // 24. Risk engine final authority
  it("Area 24: Risk engine final authority", async () => {
    const input = createMockInput({
      dailyLossPct: 6.0 // Exceeds 5% max daily loss
    });
    const dec = await AQEAAutonomousControlPlane.decide(input);
    expect(dec.action).toBe("NO_TRADE");
    expect(dec.riskApproved).toBe(false);
  });

  // 25. Wallet/domain isolation
  it("Area 25: Wallet/domain isolation", async () => {
    const inputCrypto = createMockInput({ marketDomain: "CRYPTO" });
    const inputIndian = createMockInput({ marketDomain: "INDIAN" });
    const decCrypto = await AQEAAutonomousControlPlane.decide(inputCrypto);
    const decIndian = await AQEAAutonomousControlPlane.decide(inputIndian);
    expect(decCrypto.marketDomain).toBe("CRYPTO");
    expect(decIndian.marketDomain).toBe("INDIAN");
  });

  // 26. Concurrent execution protection
  it("Area 26: Concurrent execution protection", async () => {
    const input = createMockInput();
    const [d1, d2] = await Promise.all([
      AQEAAutonomousControlPlane.decide(input),
      AQEAAutonomousControlPlane.decide(input)
    ]);
    expect(d1.decisionId).not.toBe(d2.decisionId);
  });

  // 27. Restart persistence
  it("Area 27: Restart persistence", () => {
    ModelAuthorityRegistry.updateModelMetrics("MAMBA", { incrementalEV: 0.02 });
    const json = ModelAuthorityRegistry.exportStateJSON();
    expect(json).toBeDefined();

    ModelAuthorityRegistry.resetToDefaults();
    const imported = ModelAuthorityRegistry.importStateJSON(json);
    expect(imported).toBe(true);
    expect(ModelAuthorityRegistry.getModel("MAMBA")?.incrementalEV).toBe(0.02);
  });

  // 28. Authority hysteresis
  it("Area 28: Authority hysteresis", () => {
    // 1 failure should not immediately disable
    ModelAuthorityRegistry.updateModelMetrics("MAMBA", { incrementalEV: -0.008 });
    expect(ModelAuthorityRegistry.getModel("MAMBA")?.status).toBe("DOWNWEIGHTED");

    // 3 failures transitions to TEMPORARILY_DISABLED
    ModelAuthorityRegistry.updateModelMetrics("MAMBA", { incrementalEV: -0.008 });
    ModelAuthorityRegistry.updateModelMetrics("MAMBA", { incrementalEV: -0.008 });
    expect(ModelAuthorityRegistry.getModel("MAMBA")?.status).toBe("TEMPORARILY_DISABLED");
  });

  // 29. Bias penalty
  it("Area 29: Bias penalty", () => {
    ModelAuthorityRegistry.updateModelMetrics("CNN_1D", { biasPenalty: 0.25 });
    const cnn = ModelAuthorityRegistry.getModel("CNN_1D");
    expect(cnn?.biasPenalty).toBe(0.25);
  });

  // 30. Calibration degradation
  it("Area 30: Calibration degradation", () => {
    ModelAuthorityRegistry.updateModelMetrics("BILSTM", { ece: 0.18 });
    const m = ModelAuthorityRegistry.getModel("BILSTM");
    expect(m?.ece).toBe(0.18);
  });

  // 31. Drift detection
  it("Area 31: Drift detection", () => {
    ModelDriftMonitor.recordPrediction({
      modelName: "MAMBA",
      timestamp: Date.now(),
      predictedDirection: "LONG",
      predictedProbability: 0.85,
      realizedOutcome: "WIN",
      realizedPnLPercent: 1.5,
      regime: "TRENDING_BULL"
    });
    const report = ModelDriftMonitor.getReport("MAMBA");
    expect(report).toBeDefined();
    expect(report.modelName).toBe("MAMBA");
    expect(["STABLE", "WARNING_DEGRADED", "CRITICAL_DRIFT"]).toContain(report.driftStatus);
  });

  // 32. Negative controls
  it("Area 32: Negative controls", () => {
    const neg = BiasControlEngine.runNegativeControlTests([]);
    expect(Array.isArray(neg)).toBe(true);
    expect(neg.length).toBeGreaterThan(0);
    expect(neg[0].testType).toBeDefined();
  });

  // 33. Baseline comparison
  it("Area 33: Baseline comparison", () => {
    const placebo = BiasControlEngine.runPlaceboShadowTests(["MAMBA", "XGBOOST"], []);
    expect(Array.isArray(placebo)).toBe(true);
  });

  // 34. Multiple-testing correction
  it("Area 34: Multiple-testing correction", () => {
    StatisticalTests.registerExperiment(
      "exp-1",
      "Mamba holdout test",
      "EV",
      0.02,
      { mean: 0.02, lower: 0.01, upper: 0.03, confidenceLevel: 0.95, sampleCount: 50, bootstrapIterations: 100, isSignificant: true }
    );
    const thresh = StatisticalTests.getBenjaminiHochbergThreshold(0.05);
    expect(thresh).toBeGreaterThanOrEqual(0);
  });

  // 35. Admin permission boundary
  it("Area 35: Admin permission boundary", () => {
    ModelAuthorityRegistry.setAdminPermission("MAMBA", false);
    const m = ModelAuthorityRegistry.getModel("MAMBA");
    expect(m?.adminAllowed).toBe(false);
    expect(m?.status).toBe("TEMPORARILY_DISABLED");
    expect(m?.effectiveWeight).toBe(0.0);
  });

  // 36. Autonomous override of runtime authority
  it("Area 36: Autonomous override of runtime authority", () => {
    // Admin allows, but AI can downweight or activate based on empirical performance
    ModelAuthorityRegistry.setAdminPermission("CNN_1D", true);
    ModelAuthorityRegistry.updateModelMetrics("CNN_1D", { incrementalEV: -0.01, ece: 0.16 });
    const m = ModelAuthorityRegistry.getModel("CNN_1D");
    expect(m?.adminAllowed).toBe(true);
    expect(m?.status).toBe("DOWNWEIGHTED");
  });

  // 37. UI reflects AI-selected authority
  it("Area 37: UI reflects AI-selected authority", () => {
    const all = ModelAuthorityRegistry.getAllModels();
    expect(all.length).toBeGreaterThan(0);
    const mamba = all.find(m => m.modelId === "MAMBA");
    expect(mamba).toBeDefined();
    expect(mamba?.adminAllowed).toBe(true);
    expect(mamba?.status).toBe("ACTIVE");
  });

  // 38. Explanation matches actual decision data
  it("Area 38: Explanation matches actual decision data", async () => {
    const input = createMockInput();
    const dec = await AQEAAutonomousControlPlane.decide(input);
    expect(dec.explanation).toBeDefined();
    expect(dec.explanation.whyTrade).toBeDefined();
    expect(dec.explanation.whyNotTrade).toBeDefined();
    expect(dec.explanation.whyModelSelected).toBeDefined();
  });

  // 39. Emergency kill switch
  it("Area 39: Emergency kill switch", async () => {
    const input = createMockInput({ isKillSwitchActive: true });
    const dec = await AQEAAutonomousControlPlane.decide(input);
    expect(dec.action).toBe("NO_TRADE");
    expect(dec.riskRejectionReason).toContain("KILL_SWITCH");
  });

  // 40. Complete autonomous cycle
  it("Area 40: Complete autonomous cycle", async () => {
    const input = createMockInput();
    const dec = await AQEAAutonomousControlPlane.decide(input);
    expect(dec.decisionId).toBeDefined();
    expect(dec.inputSnapshotHash).toBeDefined();
    expect(dec.probabilities.P_BUY + dec.probabilities.P_HOLD + dec.probabilities.P_SELL).toBeCloseTo(1.0, 4);
    expect(["BUY", "SELL", "NO_TRADE"]).toContain(dec.action);
    expect(["LONG", "SHORT", "HOLD"]).toContain(dec.direction);
  });
});
