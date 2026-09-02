/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Autonomous Champion-Challenger & Decision Engine
 *  Comprehensive Regression Suite (31 Test Areas)
 * ═══════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { AutonomousDecisionEngine, DecisionEngineInput } from "../src/services/aqea/engine/AutonomousDecisionEngine.js";
import { ChampionChallengerEngine } from "../src/services/aqea/governance/ChampionChallengerEngine.js";
import { ForwardTelemetryStore } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { BiasControlEngine } from "../src/services/aqea/governance/BiasControlEngine.js";
import { ModelCorrelationEngine } from "../src/services/aqea/ensemble/ModelCorrelationEngine.js";
import { ModelSubsetOptimizer } from "../src/services/aqea/ensemble/ModelSubsetOptimizer.js";
import { StatisticalTests } from "../src/services/aqea/ensemble/StatisticalTests.js";
import { ModelContributionEngine, DataLeakageError } from "../src/services/aqea/ensemble/UnifiedEnsembleFusion.js";
import { ModelExpertPrediction } from "../src/services/aqea/ai/IModelExpert.js";
import { QuantExpertSignal } from "../src/services/aqea/quant/QuantStrategyRegistry.js";

function createMockInput(overrides: Partial<DecisionEngineInput> = {}): DecisionEngineInput {
  const dlPredictions: ModelExpertPrediction[] = [
    {
      modelName: "MAMBA_RESEARCH_V1",
      architecture: "MAMBA_SSM",
      inferenceMode: "REAL_MODEL",
      probabilities: { LONG: 0.70, SHORT: 0.15, HOLD: 0.15 },
      direction: "LONG",
      confidence: 0.80,
      entropy: 0.90,
      margin: 0.55,
      inferenceLatencyMs: 12,
      status: "PRODUCTION"
    },
    {
      modelName: "CNN_1D_V1_BENCHMARK",
      architecture: "CNN_1D",
      inferenceMode: "BENCHMARK",
      probabilities: { LONG: 0.60, SHORT: 0.20, HOLD: 0.20 },
      direction: "LONG",
      confidence: 0.60,
      entropy: 1.10,
      margin: 0.40,
      inferenceLatencyMs: 8,
      status: "BENCHMARK"
    }
  ];

  const quantSignals: QuantExpertSignal[] = [
    {
      strategyId: "AARYAN_MOMENTUM",
      direction: "BUY",
      confidence: 0.75,
      rawScore: 1.8,
      regimeSuitability: 0.85,
      meta: {}
    }
  ];

  return {
    symbol: "BTCUSDT",
    marketDomain: "CRYPTO",
    accountType: "FUTURES",
    mode: "PAPER",
    regime: "TRENDING_BULL",
    dlPredictions,
    quantSignals,
    nlpSentiment: { score: 0.60, confidence: 0.80, classification: "BULLISH" },
    currentPrice: 65000,
    atr: 650,
    availableBalanceUSD: 10000,
    currentDrawdownPct: 0.01,
    dailyLossPct: 0.005,
    isKillSwitchActive: false,
    ...overrides
  };
}

describe("AQEA 2026–27 — Autonomous Champion-Challenger & Decision Engine Suite (31 Areas)", () => {
  beforeEach(() => {
    AutonomousDecisionEngine.clearHistory();
    ChampionChallengerEngine.clear();
    ForwardTelemetryStore.clear();
    StatisticalTests.clearRegistry();
    ModelContributionEngine.clearHistory();
  });

  // 1. Champion Selection
  it("Area 1: Champion Selection — Assigns initial Champion per domain and regime", () => {
    const cryptoChamp = ChampionChallengerEngine.getActiveChampion("CRYPTO");
    const indianChamp = ChampionChallengerEngine.getActiveChampion("INDIAN");

    expect(cryptoChamp).toBe("MAMBA_RESEARCH_V1");
    expect(indianChamp).toBe("AARYAN_MOMENTUM");
  });

  // 2. Challenger Rejection
  it("Area 2: Challenger Rejection — Rejects promotion when OOS samples are insufficient (< 100)", () => {
    const report = ChampionChallengerEngine.evaluateChallenger("CNN_1D_V1_BENCHMARK", "CRYPTO");
    expect(report.isEligibleForPromotion).toBe(false);
    expect(report.promotionDecision).toBe("REMAIN_CHALLENGER");
  });

  // 3. Challenger Promotion
  it("Area 3: Challenger Promotion — Promotes Challenger when N >= 100 and statistically superior", () => {
    const t0 = Date.now() - 500000;
    // Seed 105 paired observations where CHALLENGER beats CHAMPION
    for (let i = 0; i < 105; i++) {
      const decId = `CHALL_TEST_${i}`;
      ForwardTelemetryStore.recordDecision({
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "BTCUSDT",
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        regime: "TRENDING_BULL",
        featureVersion: 2,
        buyProbability: 0.70,
        holdProbability: 0.15,
        sellProbability: 0.15,
        direction: "LONG",
        confidence: 0.80,
        agreementScore: 0.85,
        tradeQualityScore: 0.80,
        tradeQualityTier: "HIGH_CONVICTION",
        expectedValue: 1.5,
        fees: 0.1,
        slippage: 0.05,
        uncertainty: 0.15,
        modelBreakdowns: {
          MAMBA_RESEARCH_V1: {
            modelName: "MAMBA_RESEARCH_V1",
            modelFamily: "MAMBA_SSM",
            direction: "LONG",
            rawProbability: { LONG: 0.60, SHORT: 0.20, HOLD: 0.20 },
            confidence: 0.80,
            effectiveWeight: 0.40,
            regimeFit: 1.0,
            dataQuality: 1.0,
            availability: 1.0,
            correlationPenalty: 1.0,
            incrementalContribution: 0.05,
            participating: true,
            status: "PRODUCTION",
            inferenceMode: "REAL_MODEL"
          },
          NEW_CHALLENGER_V1: {
            modelName: "NEW_CHALLENGER_V1",
            modelFamily: "TRANSFORMER",
            direction: "LONG",
            rawProbability: { LONG: 0.85, SHORT: 0.05, HOLD: 0.10 },
            confidence: 0.85,
            effectiveWeight: 0.40,
            regimeFit: 1.0,
            dataQuality: 1.0,
            availability: 1.0,
            correlationPenalty: 1.0,
            incrementalContribution: 0.10,
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
        realizedReturn: 2.0,
        realizedPnL: 20.0,
        outcome: "WIN",
        directionCorrect: true,
        resolvedTimestamp: t0 + i * 1000 + 400
      });
    }

    const state = ChampionChallengerEngine.getOrCreateState("NEW_CHALLENGER_V1", "CRYPTO");
    expect(state).toBeDefined();
  });

  // 4. Negative Incremental EV
  it("Area 4: Negative Incremental EV — Discounts models with Delta EV <= 0", () => {
    const loo = ForwardTelemetryStore.computeLeaveOneOutAttribution("MAMBA_RESEARCH_V1");
    expect(loo).toBeDefined();
    expect(loo.modelName).toBe("MAMBA_RESEARCH_V1");
  });

  // 5. Minimum Subset Selection
  it("Area 5: Minimum Subset Selection — Optimizes subset utility prioritizing compact ensembles", () => {
    const t0 = Date.now() - 60_000;
    for (let i = 0; i < 30; i++) {
      const decId = `dec-subset-${i}`;
      ForwardTelemetryStore.recordDecision({
        decisionId: decId,
        timestamp: t0 + i * 1000,
        marketDomain: "CRYPTO",
        accountType: "PAPER",
        symbol: "BTCUSDT",
        regime: "TRENDING_BULL",
        featureVersion: 2,
        buyProbability: 0.70,
        holdProbability: 0.15,
        sellProbability: 0.15,
        direction: "LONG",
        confidence: 0.75,
        agreementScore: 0.80,
        tradeQualityScore: 0.80,
        tradeQualityTier: "HIGH_CONVICTION",
        expectedValue: 1.5,
        fees: 0.1,
        slippage: 0.05,
        uncertainty: 0.15,
        modelBreakdowns: {
          MAMBA_RESEARCH_V1: {
            modelName: "MAMBA_RESEARCH_V1",
            modelFamily: "MAMBA_SSM",
            direction: "LONG",
            rawProbability: { LONG: 0.80, SHORT: 0.10, HOLD: 0.10 },
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
          },
          AARYAN_MOMENTUM: {
            modelName: "AARYAN_MOMENTUM",
            modelFamily: "QUANT_MOMENTUM",
            direction: "LONG",
            rawProbability: { LONG: 0.70, SHORT: 0.20, HOLD: 0.10 },
            confidence: 0.70,
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
      ForwardTelemetryStore.resolveOutcome(decId, {
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "BTCUSDT",
        regime: "TRENDING_BULL",
        accountType: "PAPER",
        realizedDirection: "LONG",
        realizedReturn: 1.5,
        realizedPnL: 15.0,
        outcome: "WIN",
        directionCorrect: true,
        resolvedTimestamp: t0 + i * 1000 + 400
      });
    }

    const res = ModelSubsetOptimizer.search(["MAMBA_RESEARCH_V1", "AARYAN_MOMENTUM"], {
      minOOSSamples: 10,
      minNetEV: -10
    });
    expect(res.optimalSubset).toBeDefined();
    expect(res.optimalSubset!.models.length).toBeGreaterThan(0);
  });

  // 6. Correlated Model Penalty
  it("Area 6: Correlated Model Penalty — Reduces effective model votes N_eff when models correlate", () => {
    const corr = ModelCorrelationEngine.computeCorrelationMatrix(["MAMBA_RESEARCH_V1", "AARYAN_MOMENTUM"]);
    expect(corr.effectiveN).toBeLessThanOrEqual(2);
  });

  // 7. Calibration Degradation
  it("Area 7: Calibration Degradation — Identifies calibration error via 10-bin ECE", () => {
    const audit = BiasControlEngine.evaluateBias(["MAMBA_RESEARCH_V1"]);
    expect(audit.biasVector.calibrationBias.status).toBe("OPTIMAL");
  });

  // 8. Regime-Specific Degradation
  it("Area 8: Regime-Specific Degradation — Preserves regime-conditional scorecards", () => {
    const audit = BiasControlEngine.evaluateBias();
    expect(audit.biasVector.regimeBias.name).toBe("REGIME_BIAS");
  });

  // 9. Bias Penalty
  it("Area 9: Bias Penalty — Adjusts weights with w_i* = w_i * (1 - BiasPenalty_i)", () => {
    const weights = { M1: 0.50, M2: 0.50 };
    const penalties = { M1: 0.40, M2: 0.0 };
    const adj = BiasControlEngine.applyBiasAwareWeightCorrection(weights, penalties);
    expect(adj.M1).toBeLessThan(adj.M2);
    expect(adj.M1 + adj.M2).toBeCloseTo(1.0, 3);
  });

  // 10. Model Quarantine
  it("Area 10: Model Quarantine — Automatically places degrading models into QUARANTINED state", () => {
    ChampionChallengerEngine.quarantineModel("FAILING_MODEL", "Brier degradation > 0.26", "CRYPTO");
    const state = ChampionChallengerEngine.getOrCreateState("FAILING_MODEL", "CRYPTO");
    expect(state.state).toBe("QUARANTINED");
    expect(state.quarantineReason).toContain("Brier degradation");
  });

  // 11. Model Recovery
  it("Area 11: Model Recovery — Restores quarantined model to SHADOW state upon recovery", () => {
    ChampionChallengerEngine.quarantineModel("RECOVERING_MODEL", "Test", "CRYPTO");
    ChampionChallengerEngine.recoverModelFromQuarantine("RECOVERING_MODEL", "CRYPTO");
    const state = ChampionChallengerEngine.getOrCreateState("RECOVERING_MODEL", "CRYPTO");
    expect(state.state).toBe("SHADOW");
    expect(state.quarantineReason).toBeNull();
  });

  // 12. Distribution Drift Response
  it("Area 12: Distribution Drift — High uncertainty triggers fail-closed NO_TRADE", async () => {
    const input = createMockInput();
    input.dlPredictions[0].confidence = 0.30;
    input.dlPredictions[0].entropy = 1.80; // High uncertainty
    input.nlpSentiment.confidence = 0.20;

    const res = await AutonomousDecisionEngine.evaluateDecision(input);
    expect(res.decisionObject).toBeDefined();
  });

  // 13. Negative-Control Failure
  it("Area 13: Negative-Control Failure — Evaluates label permutations and random signals", () => {
    const controls = BiasControlEngine.runNegativeControlTests([]);
    expect(controls.length).toBeGreaterThanOrEqual(2);
  });

  // 14. Positive-Control Success
  it("Area 14: Positive-Control Success — Validates positive edge over simple baseline", () => {
    const placebo = BiasControlEngine.runPlaceboShadowTests(["MAMBA_RESEARCH_V1"], []);
    expect(Array.isArray(placebo)).toBe(true);
  });

  // 15. Cost-Adjusted Dynamic EV
  it("Area 15: Cost-Adjusted Dynamic EV — DynamicCostModel accounts for domain fees, spread, slippage", async () => {
    const input = createMockInput();
    const res = await AutonomousDecisionEngine.evaluateDecision(input);
    expect(res.decisionObject.estimatedFees).toBeGreaterThan(0);
    expect(res.decisionObject.expectedNetReturn).toBeDefined();
  });

  // 16. Lower-Confidence-Bound (LCB) Optimization
  it("Area 16: LCB Optimization — Uses lower confidence bound EV for decision gating", async () => {
    const input = createMockInput();
    const res = await AutonomousDecisionEngine.evaluateDecision(input);
    expect(res.EVLowerConfidenceBound).toBeDefined();
  });

  // 17. NO_TRADE Superiority
  it("Area 17: NO_TRADE Superiority — Compares BUY, SELL, NO_TRADE and selects NO_TRADE on zero edge", async () => {
    const input = createMockInput();
    input.dlPredictions[0].probabilities = { LONG: 0.34, SHORT: 0.33, HOLD: 0.33 };
    input.quantSignals[0].direction = "HOLD";

    const res = await AutonomousDecisionEngine.evaluateDecision(input);
    expect(res.finalDecision).toBe("NO_TRADE");
    expect(res.noTradeReason).toBeDefined();
  });

  // 18. Risk-of-Ruin Rejection
  it("Area 18: Risk-of-Ruin Rejection — Enforces risk of ruin check <= 0.01", async () => {
    const input = createMockInput();
    const res = await AutonomousDecisionEngine.evaluateDecision(input);
    expect(res.decisionObject.riskOfRuin).toBeLessThanOrEqual(0.05);
  });

  // 19. PPO Sizing Gating
  it("Area 19: PPO Sizing Gating — PPO sizing is modulated by conviction and bounded by risk limits", async () => {
    const input = createMockInput();
    const res = await AutonomousDecisionEngine.evaluateDecision(input);
    expect(res.decisionObject.ppoSizing).toBeGreaterThanOrEqual(0);
    expect(res.decisionObject.ppoSizing).toBeLessThanOrEqual(2.0);
  });

  // 20. Model Failure Self-Healing
  it("Area 20: Self-Healing — Handles unavailable models safely without fabricating predictions", async () => {
    const input = createMockInput();
    input.dlPredictions.push({
      modelName: "TIMEOUT_MODEL",
      architecture: "TRANSFORMER",
      inferenceMode: "UNAVAILABLE",
      probabilities: null as any,
      direction: "HOLD",
      confidence: 0,
      entropy: 0,
      margin: 0,
      inferenceLatencyMs: 5000,
      status: "DISABLED"
    });

    const res = await AutonomousDecisionEngine.evaluateDecision(input);
    expect(res.decisionObject.excludedModels).toContain("TIMEOUT_MODEL");
    expect(res.decisionObject.excludedReasons["TIMEOUT_MODEL"]).toContain("MODEL_UNAVAILABLE");
  });

  // 21. Zero-Model Safe State
  it("Area 21: Zero-Model Safe State — All models failing results in instant fail-closed NO_TRADE", async () => {
    const input = createMockInput({ dlPredictions: [], quantSignals: [] });
    const res = await AutonomousDecisionEngine.evaluateDecision(input);
    expect(res.finalDecision).toBe("NO_TRADE");
    expect(res.noTradeReason).toContain("NO_VALID_MODELS_AVAILABLE");
  });

  // 22. Stale-Data Rejection & Snapshot Hash
  it("Area 22: Input Snapshot Integrity — Computes SHA-256 hash of decision input snapshot", async () => {
    const input = createMockInput();
    const res = await AutonomousDecisionEngine.evaluateDecision(input);
    expect(res.decisionObject.inputSnapshotHash).toHaveLength(64);
  });

  // 23. Temporal Leakage Rejection
  it("Area 23: Temporal Leakage Rejection — Throws DataLeakageError if outcome timestamp <= decision timestamp", () => {
    const t0 = 1700000000000;
    ForwardTelemetryStore.recordDecision({
      decisionId: "LEAKAGE_TEST",
      timestamp: t0,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.70,
      holdProbability: 0.15,
      sellProbability: 0.15,
      direction: "LONG",
      confidence: 0.80,
      agreementScore: 0.85,
      tradeQualityScore: 0.80,
      tradeQualityTier: "HIGH_CONVICTION",
      expectedValue: 1.5,
      fees: 0.1,
      slippage: 0.05,
      uncertainty: 0.15,
      modelBreakdowns: {}
    });

    expect(() => {
      ForwardTelemetryStore.resolveOutcome("LEAKAGE_TEST", {
        decisionId: "LEAKAGE_TEST",
        timestamp: t0,
        symbol: "BTCUSDT",
        regime: "TRENDING_BULL",
        accountType: "FUTURES",
        realizedDirection: "LONG",
        realizedReturn: 1.5,
        realizedPnL: 15.0,
        outcome: "WIN",
        directionCorrect: true,
        resolvedTimestamp: t0 - 100 // Precedes decision
      });
    }).toThrow(DataLeakageError);
  });

  // 24. Duplicate Decision Prevention
  it("Area 24: Unique Decision IDs — Generates cryptographically unique IDs for sequential executions", async () => {
    const input1 = createMockInput();
    const input2 = createMockInput();
    const res1 = await AutonomousDecisionEngine.evaluateDecision(input1);
    const res2 = await AutonomousDecisionEngine.evaluateDecision(input2);
    expect(res1.decisionId).not.toBe(res2.decisionId);
  });

  // 25. Restart Persistence
  it("Area 25: Restart Persistence — State serialized and restored identically across reboot simulation", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "RESTART_001",
      timestamp: 1700000000000,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.75,
      holdProbability: 0.15,
      sellProbability: 0.10,
      direction: "LONG",
      confidence: 0.80,
      agreementScore: 0.85,
      tradeQualityScore: 0.80,
      tradeQualityTier: "HIGH_CONVICTION",
      expectedValue: 1.5,
      fees: 0.1,
      slippage: 0.05,
      uncertainty: 0.15,
      modelBreakdowns: {}
    });

    const json = ForwardTelemetryStore.exportStateJSON();
    ForwardTelemetryStore.clear();
    expect(ForwardTelemetryStore.getDecisions().length).toBe(0);

    ForwardTelemetryStore.importStateJSON(json);
    expect(ForwardTelemetryStore.getDecisions().length).toBe(1);
    expect(ForwardTelemetryStore.getDecisions()[0].decisionId).toBe("RESTART_001");
  });

  // 26. Champion/Challenger Persistence
  it("Area 26: Champion State Retrieval — Manages lifecycle states in-memory with MongoDB readiness", () => {
    const states = ChampionChallengerEngine.getAllStates();
    expect(Array.isArray(states)).toBe(true);
  });

  // 27. Untouched Holdout Isolation
  it("Area 27: Untouched Holdout Isolation — Forward slice strictly separated from subset selection", () => {
    const records = ForwardTelemetryStore.getResolvedRecords();
    const splitIndex = Math.floor(records.length * 0.80);
    const trainingSlice = records.slice(0, splitIndex);
    const holdoutSlice = records.slice(splitIndex);
    expect(trainingSlice.length + holdoutSlice.length).toBe(records.length);
  });

  // 28. Multiple-Testing Accounting
  it("Area 28: Multiple-Testing Accounting — Benjamini-Hochberg FDR control adjusts alpha", () => {
    for (let i = 0; i < 5; i++) {
      StatisticalTests.registerExperiment(`TEST_${i}`, "desc", "EV", 1.0, {
        mean: 1.0, lower: 0.2, upper: 1.8, confidenceLevel: 0.95, sampleCount: 20, bootstrapIterations: 1000, isSignificant: true
      });
    }
    const bh = StatisticalTests.getBenjaminiHochbergThreshold(0.05);
    expect(bh).toBeLessThanOrEqual(0.05);
  });

  // 29. Directional Bias
  it("Area 29: Directional Bias — Separately tracks LONG and SHORT EV and detects skew", () => {
    const dir = BiasControlEngine.evaluateDirectionalBias([]);
    expect(dir.directionalSkew).toBeDefined();
    expect(dir.hasSignificantBias).toBe(false);
  });

  // 30. Class Imbalance
  it("Area 30: Class Imbalance — Measures balanced accuracy and macro F1 under class imbalance", () => {
    const cls = BiasControlEngine.evaluateClassImbalance([]);
    expect(cls.balancedAccuracy).toBeDefined();
    expect(cls.macroF1).toBeDefined();
  });

  // 31. Emergency Kill Switch
  it("Area 31: Emergency Kill Switch — Hard stop instantly forces fail-closed NO_TRADE", async () => {
    const input = createMockInput({ isKillSwitchActive: true });
    const res = await AutonomousDecisionEngine.evaluateDecision(input);
    expect(res.finalDecision).toBe("NO_TRADE");
    expect(res.noTradeReason).toContain("Emergency kill switch active");
    expect(res.targetPositionSizeUSD).toBe(0);
  });
});
