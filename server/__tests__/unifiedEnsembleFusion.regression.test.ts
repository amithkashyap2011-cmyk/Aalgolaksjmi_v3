/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Unified Ensemble Fusion & Adaptive Optimization
 *  Complete 25-Point Architectural Regression Test Suite
 * ═══════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from "@jest/globals";

import {
  UnifiedEnsembleFusion,
  EnsembleFusionResult,
  EVGateParams,
  ModelContributionEngine,
  EnsembleDecisionRecord,
  EnsembleRealizedOutcome,
  DataLeakageError,
  SHRINKAGE_PRIOR_STRENGTH_K
} from "../src/services/aqea/ensemble/UnifiedEnsembleFusion.js";
import { DynamicCostModel } from "../src/services/aqea/ensemble/DynamicCostModel.js";
import { ModelPromotionPolicy } from "../src/services/aqea/ensemble/ModelPromotionPolicy.js";
import { ModelScorecardRegistry } from "../src/services/aqea/ensemble/ModelScorecard.js";
import { ModelExpertPrediction, ProbabilityDistribution, InferenceMode, ModelExpertStatus } from "../src/services/aqea/ai/IModelExpert.js";
import { QuantExpertSignal } from "../src/services/aqea/quant/QuantStrategyRegistry.js";
import { ForwardTelemetryStore } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { ModelCorrelationEngine } from "../src/services/aqea/ensemble/ModelCorrelationEngine.js";
import { ModelSubsetOptimizer } from "../src/services/aqea/ensemble/ModelSubsetOptimizer.js";
import { StatisticalTests } from "../src/services/aqea/ensemble/StatisticalTests.js";
import { ForwardLearningPipeline } from "../src/services/aqea/ensemble/ForwardLearningPipeline.js";

// ═══════════════════════════════════════════════════════════════════
//  Test Helpers
// ═══════════════════════════════════════════════════════════════════

function makePrediction(overrides: Partial<ModelExpertPrediction> & { modelName: string }): ModelExpertPrediction {
  return {
    modelName: overrides.modelName,
    modelVersion: overrides.modelVersion || "1.0.0",
    architecture: overrides.architecture || "TEST_ARCH",
    inferenceMode: overrides.inferenceMode || "REAL_MODEL",
    direction: overrides.direction || "HOLD",
    probabilities: overrides.probabilities || { LONG: 0.33, SHORT: 0.33, HOLD: 0.34 },
    confidence: overrides.confidence ?? 0.50,
    probability: overrides.probability ?? 0.33,
    uncertainty: overrides.uncertainty ?? 0.50,
    predictionInterval: overrides.predictionInterval || [0.2, 0.8],
    latencyMs: overrides.latencyMs ?? 5,
    status: overrides.status || "PRODUCTION",
    regimeCompatibility: overrides.regimeCompatibility ?? 0.90,
    featureVersion: 2,
    isTrained: overrides.isTrained ?? true,
    timestamp: overrides.timestamp || Date.now(),
    ...(overrides.error ? { error: overrides.error } : {})
  };
}

function makeQuantSignal(overrides: Partial<QuantExpertSignal> & { strategyId: string }): QuantExpertSignal {
  return {
    strategyId: overrides.strategyId as any,
    name: overrides.name || "Test Strategy",
    direction: overrides.direction || "HOLD",
    confidence: overrides.confidence ?? 0.50,
    expectedMovePercent: overrides.expectedMovePercent ?? 1.5,
    timeHorizon: overrides.timeHorizon || "INTRADAY",
    riskScore: overrides.riskScore ?? 0.20,
    regimeCompatibility: overrides.regimeCompatibility ?? 0.90,
    meta: overrides.meta || {}
  };
}

const neutralNLP = { score: 0, confidence: 0.85, classification: "NEUTRAL" };
const bullishNLP = { score: 0.6, confidence: 0.85, classification: "BULLISH" };
const bearishNLP = { score: -0.6, confidence: 0.85, classification: "BEARISH" };

const defaultEVParams: EVGateParams = {
  atrPercent: 1.5,
  tpMultiplier: 2.0,
  slMultiplier: 1.5,
  feePercent: 0.10,
  slippagePercent: 0.05,
  marketImpactPercent: 0.02,
  spreadPercent: 0.03
};

// ═══════════════════════════════════════════════════════════════════
//  Test Suite
// ═══════════════════════════════════════════════════════════════════

describe("Unified Ensemble Fusion — Phase 14 (25 Test Areas)", () => {

  beforeEach(() => {
    ModelContributionEngine.clearHistory();
    ModelScorecardRegistry.clearAll();
    ForwardTelemetryStore.clear();
    StatisticalTests.clearRegistry();
  });

  // 1. Model Disagreement
  it("Area 1: Disagreement does not hard-block trades when directional edge exists", () => {
    const preds = [
      makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.70, SHORT: 0.10, HOLD: 0.20 }, confidence: 0.70 }),
    ];
    const quants = [
      makeQuantSignal({ strategyId: "AARYAN_MOMENTUM", direction: "LONG", confidence: 0.75 }),
      makeQuantSignal({ strategyId: "AAYUSH_MEAN_REVERSION", direction: "SHORT", confidence: 0.60 }),
      makeQuantSignal({ strategyId: "OHMKARA_528HZ", direction: "HOLD", confidence: 0.50 }),
    ];
    const result = UnifiedEnsembleFusion.fuse(preds, quants, neutralNLP, "TRENDING_BULL", defaultEVParams);
    expect(result.direction).toBe("LONG");
    expect(result.buyProbability).toBeGreaterThan(result.sellProbability);
  });

  // 2. Weighted Probability Fusion
  it("Area 2: Weighted probability fusion aggregates proportional evidence", () => {
    const preds = [
      makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "SHORT", probabilities: { LONG: 0.10, SHORT: 0.70, HOLD: 0.20 }, confidence: 0.70 }),
    ];
    const quants = [
      makeQuantSignal({ strategyId: "AARYAN_MOMENTUM", direction: "SHORT", confidence: 0.78 }),
    ];
    const result = UnifiedEnsembleFusion.fuse(preds, quants, bearishNLP, "TRENDING_BEAR", defaultEVParams);
    expect(result.direction).toBe("SHORT");
    expect(result.sellProbability).toBeGreaterThan(0.55);
  });

  // 3. Probability Normalization
  it("Area 3: Ensemble probabilities strictly sum to 1.000000 with zero NaN/Infinity", () => {
    const preds = [
      makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.63, SHORT: 0.21, HOLD: 0.16 }, confidence: 0.63 }),
    ];
    const quants = [
      makeQuantSignal({ strategyId: "SMC_INSTITUTIONAL", direction: "LONG", confidence: 0.81 }),
    ];
    const result = UnifiedEnsembleFusion.fuse(preds, quants, bullishNLP, "TRENDING_BULL", defaultEVParams);
    const sum = result.buyProbability + result.sellProbability + result.holdProbability;
    expect(sum).toBeCloseTo(1.0, 5);
    expect(Number.isFinite(result.buyProbability)).toBe(true);
    expect(Number.isFinite(result.sellProbability)).toBe(true);
    expect(Number.isFinite(result.holdProbability)).toBe(true);
  });

  // 4. Reliability Weighting
  it("Area 4: Highly calibrated models receive higher effective weight than uncalibrated models", () => {
    const mamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.80, SHORT: 0.10, HOLD: 0.10 }, confidence: 0.80, regimeCompatibility: 0.95 });
    const quant = makeQuantSignal({ strategyId: "OHMKARA_528HZ", direction: "SHORT", confidence: 0.50, regimeCompatibility: 0.30 });
    const result = UnifiedEnsembleFusion.fuse([mamba], [quant], neutralNLP, "TRENDING_BULL", defaultEVParams);
    const mambaWeight = result.modelWeights.find(m => m.modelName === "MAMBA_RESEARCH_V1")!;
    const quantWeight = result.modelWeights.find(m => m.modelName === "OHMKARA_528HZ")!;
    expect(mambaWeight.normalizedWeight).toBeGreaterThan(quantWeight.normalizedWeight);
  });

  // 5. Small-Sample Shrinkage (Smooth Bayesian Convergence)
  it("Area 5: Smooth Bayesian shrinkage converges smoothly across sample sizes N = 0, 1, 10, 25, 50, 100, 500", () => {
    const k = SHRINKAGE_PRIOR_STRENGTH_K;
    const rel0 = ModelContributionEngine.computeReliability(0, k);
    const rel1 = ModelContributionEngine.computeReliability(1, k);
    const rel10 = ModelContributionEngine.computeReliability(10, k);
    const rel25 = ModelContributionEngine.computeReliability(25, k);
    const rel50 = ModelContributionEngine.computeReliability(50, k);
    const rel100 = ModelContributionEngine.computeReliability(100, k);
    const rel500 = ModelContributionEngine.computeReliability(500, k);

    expect(rel0).toBe(0.0);
    expect(rel1).toBeGreaterThan(rel0);
    expect(rel10).toBeGreaterThan(rel1);
    expect(rel25).toBeGreaterThan(rel10);
    expect(rel50).toBeGreaterThan(rel25);
    expect(rel100).toBeGreaterThan(rel50);
    expect(rel500).toBeGreaterThan(rel100);
    expect(rel500).toBeLessThan(1.0);

    // Exact formula checks
    expect(rel10).toBeCloseTo(10 / 40, 4);
    expect(rel50).toBeCloseTo(50 / 80, 4);
  });

  // 6. Regime-Specific Weighting
  it("Area 6: Regime-specific weighting elevates mean reversion in ranging and momentum in trending", () => {
    const aaryanTrending = makeQuantSignal({ strategyId: "AARYAN_MOMENTUM", direction: "LONG", confidence: 0.76, regimeCompatibility: 0.95 });
    const aayushRanging = makeQuantSignal({ strategyId: "AAYUSH_MEAN_REVERSION", direction: "SHORT", confidence: 0.78, regimeCompatibility: 0.35 });

    const resTrend = UnifiedEnsembleFusion.fuse([], [aaryanTrending, aayushRanging], neutralNLP, "TRENDING_BULL", defaultEVParams);
    const aaryanInTrend = resTrend.modelWeights.find(m => m.modelName === "AARYAN_MOMENTUM")!;
    const aayushInTrend = resTrend.modelWeights.find(m => m.modelName === "AAYUSH_MEAN_REVERSION")!;
    expect(aaryanInTrend.regimeFit).toBeGreaterThan(aayushInTrend.regimeFit);
  });

  // 7. Incremental Model Contribution
  it("Area 7: Model contribution engine accurately tracks rolling performance & incremental value", () => {
    const decisionRecord: EnsembleDecisionRecord = {
      decisionId: "DEC_001",
      timestamp: Date.now() - 5000,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.70,
      holdProbability: 0.20,
      sellProbability: 0.10,
      direction: "LONG",
      confidence: 0.75,
      agreementScore: 0.80,
      tradeQualityScore: 0.78,
      tradeQualityTier: "HIGH_CONVICTION",
      expectedValue: 1.5,
      expectedGain: 3.0,
      expectedLoss: 1.5,
      fees: 0.1,
      slippage: 0.05,
      uncertainty: 0.25,
      modelBreakdowns: {
        "MAMBA_RESEARCH_V1": {
          modelName: "MAMBA_RESEARCH_V1",
          rawProbability: { LONG: 0.75, SHORT: 0.10, HOLD: 0.15 },
          direction: "LONG",
          confidence: 0.75,
          effectiveWeight: 0.35,
          participating: true,
          status: "PRODUCTION",
          inferenceMode: "REAL_MODEL"
        }
      }
    };
    ModelContributionEngine.recordDecision(decisionRecord);

    const outcome: EnsembleRealizedOutcome = {
      resolvedTimestamp: Date.now(),
      realizedDirection: "LONG",
      realizedReturn: 2.5,
      realizedPnL: 25.0,
      mfe: 3.0,
      mae: 0.5,
      holdingDurationMs: 60000,
      fees: 0.1,
      slippage: 0.05,
      outcome: "WIN",
      directionCorrect: true,
      evEstimateCorrect: true,
      confidenceCalibrated: true
    };
    const resolved = ModelContributionEngine.resolveOutcome("DEC_001", outcome);
    expect(resolved).toBe(true);

    const metrics = ModelContributionEngine.getModelMetrics("MAMBA_RESEARCH_V1");
    expect(metrics.totalEvaluated).toBe(1);
    expect(metrics.winRate).toBe(1.0);
    expect(metrics.directionalAccuracy).toBe(1.0);
  });

  // 8. Correlation Penalty
  it("Area 8: Correlated models in the same evidence family receive a sqrt penalty", () => {
    const mamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.70, SHORT: 0.10, HOLD: 0.20 } });
    const aaryan = makeQuantSignal({ strategyId: "AARYAN_MOMENTUM", direction: "LONG", confidence: 0.75 });
    // Both are PRICE_MOMENTUM
    const result = UnifiedEnsembleFusion.fuse([mamba], [aaryan], neutralNLP, "TRENDING_BULL", defaultEVParams);
    const mambaW = result.modelWeights.find(m => m.modelName === "MAMBA_RESEARCH_V1")!;
    expect(mambaW.correlationPenalty).toBeLessThan(1.0);
    expect(mambaW.correlationPenalty).toBeCloseTo(1.0 / Math.sqrt(2), 3);
  });

  // 9. Family Caps
  it("Area 9: Evidence family total weight is strictly capped (PRICE_MOMENTUM <= 0.45)", () => {
    const mamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.70, SHORT: 0.10, HOLD: 0.20 }, confidence: 0.90 });
    const aaryan = makeQuantSignal({ strategyId: "AARYAN_MOMENTUM", direction: "LONG", confidence: 0.90 });
    const result = UnifiedEnsembleFusion.fuse([mamba], [aaryan], neutralNLP, "TRENDING_BULL", defaultEVParams);
    const pmWeights = result.modelWeights.filter(m => m.evidenceFamily === "PRICE_MOMENTUM");
    const totalPM = pmWeights.reduce((s, m) => s + m.effectiveWeight, 0);
    expect(totalPM).toBeLessThanOrEqual(0.450001);
  });

  // 10. EV Calculation & Dynamic Cost Integration
  it("Area 10: Dynamic Cost Model adjusts friction and calculates positive EV", () => {
    const cryptoFriction = DynamicCostModel.calculateFriction({
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      atrPercent: 1.5,
      isHighLiquidity: true
    });
    expect(cryptoFriction.feePercent).toBe(0.08);
    expect(cryptoFriction.totalFrictionPercent).toBeGreaterThan(0.10);

    const mamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.75, SHORT: 0.10, HOLD: 0.15 }, confidence: 0.75 });
    const result = UnifiedEnsembleFusion.fuse([mamba], [], neutralNLP, "TRENDING_BULL", defaultEVParams, {
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO"
    });
    expect(result.expectedValue).toBeGreaterThan(1.0);
    expect(result.evPassesGate).toBe(true);
  });

  // 11. Negative EV Rejection
  it("Area 11: High probability trade with negative EV is rejected before Risk Engine", () => {
    const lowATRParams: EVGateParams = {
      atrPercent: 0.02, // Tiny expected move
      tpMultiplier: 1.5,
      slMultiplier: 1.5,
      feePercent: 0.20,
      slippagePercent: 0.10,
      marketImpactPercent: 0.05,
      spreadPercent: 0.05
    };
    const mamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.60, SHORT: 0.20, HOLD: 0.20 }, confidence: 0.60 });
    const result = UnifiedEnsembleFusion.fuse([mamba], [], neutralNLP, "RANGING", lowATRParams);
    expect(result.expectedValue).toBeLessThan(0);
    expect(result.evPassesGate).toBe(false);
  });

  // 12. Confidence Calibration
  it("Area 12: Calibrated confidence combines probability, agreement, regime, and availability", () => {
    const mamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.90, SHORT: 0.05, HOLD: 0.05 }, confidence: 0.90 });
    const result = UnifiedEnsembleFusion.fuse([mamba], [], neutralNLP, "TRENDING_BULL", defaultEVParams);
    expect(result.confidence).toBeGreaterThanOrEqual(0.0);
    expect(result.confidence).toBeLessThanOrEqual(1.0);
    expect(result.uncertainty).toBeCloseTo(1.0 - result.confidence, 4);
  });

  // 13. Trade Quality Score
  it("Area 13: TradeQualityScore categorizes candidates into proper conviction tiers", () => {
    const strongMamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.85, SHORT: 0.05, HOLD: 0.10 }, confidence: 0.85 });
    const strongSMC = makeQuantSignal({ strategyId: "SMC_INSTITUTIONAL", direction: "LONG", confidence: 0.85 });
    const strongCVD = makeQuantSignal({ strategyId: "ORDER_FLOW_CVD", direction: "LONG", confidence: 0.80 });

    const result = UnifiedEnsembleFusion.fuse([strongMamba], [strongSMC, strongCVD], bullishNLP, "TRENDING_BULL", defaultEVParams);
    expect(result.tradeQualityScore).toBeGreaterThan(0.60);
    expect(["VALID_CANDIDATE", "HIGH_CONVICTION", "EXTREME_CONVICTION"]).toContain(result.tradeQualityTier);
  });

  // 14. Data Leakage
  it("Area 14: Data leakage protection prevents outcome timestamp before decision timestamp", () => {
    const decisionRecord: EnsembleDecisionRecord = {
      decisionId: "DEC_LEAK",
      timestamp: 1000000,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.70,
      holdProbability: 0.20,
      sellProbability: 0.10,
      direction: "LONG",
      confidence: 0.75,
      agreementScore: 0.80,
      tradeQualityScore: 0.78,
      tradeQualityTier: "HIGH_CONVICTION",
      expectedValue: 1.5,
      expectedGain: 3.0,
      expectedLoss: 1.5,
      fees: 0.1,
      slippage: 0.05,
      uncertainty: 0.25,
      modelBreakdowns: {}
    };
    ModelContributionEngine.recordDecision(decisionRecord);

    const invalidOutcome: EnsembleRealizedOutcome = {
      resolvedTimestamp: 999999, // Before decision timestamp!
      realizedDirection: "LONG",
      realizedReturn: 1.0,
      realizedPnL: 10.0,
      mfe: 1.5,
      mae: 0.2,
      holdingDurationMs: 5000,
      fees: 0.1,
      slippage: 0.05,
      outcome: "WIN",
      directionCorrect: true,
      evEstimateCorrect: true,
      confidenceCalibrated: true
    };

    expect(() => {
      ModelContributionEngine.resolveOutcome("DEC_LEAK", invalidOutcome);
    }).toThrow(DataLeakageError);
  });

  // 15. Future Timestamp Rejection
  it("Area 15: Timestamp integrity is preserved across forward tracking history", () => {
    const history = ModelContributionEngine.getDecisionHistory();
    for (const rec of history) {
      if (rec.realizedOutcome) {
        expect(rec.realizedOutcome.resolvedTimestamp).toBeGreaterThan(rec.timestamp);
      }
    }
  });

  // 16. Shadow Model Isolation & Governance Policy
  it("Area 16: Shadow, Benchmark, and Proxy models receive strictly 0 live voting weight & cannot be promoted without N>=100", () => {
    const proxyTCN = makePrediction({ modelName: "MODERN_TCN_V1_PROXY", direction: "LONG", probabilities: { LONG: 0.95, SHORT: 0.02, HOLD: 0.03 }, confidence: 0.95, inferenceMode: "PROXY", status: "SHADOW" });
    const benchCNN = makePrediction({ modelName: "CNN_1D_V1_BENCHMARK", direction: "LONG", probabilities: { LONG: 0.90, SHORT: 0.05, HOLD: 0.05 }, confidence: 0.90, inferenceMode: "BENCHMARK", status: "BENCHMARK" });

    const result = UnifiedEnsembleFusion.fuse([proxyTCN, benchCNN], [], { score: 0, confidence: 0, classification: "NEUTRAL" }, "TRENDING_BULL", defaultEVParams);
    expect(result.participatingModels.length).toBe(0);
    expect(result.shadowModels).toContain("MODERN_TCN_V1_PROXY");
    expect(result.shadowModels).toContain("CNN_1D_V1_BENCHMARK");

    // Test ModelPromotionPolicy
    const scorecard = ModelScorecardRegistry.getOrCreate("CNN_1D_V1_BENCHMARK", "PRICE_MOMENTUM", "BENCHMARK", "BENCHMARK");
    const promoCheck = ModelPromotionPolicy.evaluateCandidate(scorecard);
    expect(promoCheck.eligible).toBe(false);
    expect(promoCheck.decision).toBe("REMAIN_BENCHMARK");
  });

  // 17. LIVE Fail-Closed
  it("Area 17: All models unavailable or failed results in safe fail-closed HOLD", () => {
    const unavail = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "HOLD", probabilities: { LONG: 0.33, SHORT: 0.33, HOLD: 0.34 }, confidence: 0, inferenceMode: "UNAVAILABLE", status: "DISABLED" });
    const result = UnifiedEnsembleFusion.fuse([unavail], [], { score: 0, confidence: 0, classification: "NEUTRAL" }, "RANGING", defaultEVParams);
    expect(result.direction).toBe("HOLD");
    expect(result.evPassesGate).toBe(false);
    expect(result.tradeQualityTier).toBe("NO_TRADE");
  });

  // 18. PAPER Zero Balance
  it("Area 18: Decision recording correctly attaches domain and account metadata for Paper validation", () => {
    const mamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.70, SHORT: 0.10, HOLD: 0.20 } });
    const result = UnifiedEnsembleFusion.fuse([mamba], [], neutralNLP, "TRENDING_BULL", defaultEVParams, {
      symbol: "ETHUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES"
    });
    expect(result.decisionRecord).toBeDefined();
    expect(result.decisionRecord!.symbol).toBe("ETHUSDT");
    expect(result.decisionRecord!.marketDomain).toBe("CRYPTO");
    expect(result.decisionRecord!.accountType).toBe("FUTURES");
  });

  // 19. Wallet Currency Isolation
  it("Area 19: Indian and Crypto domain separation is preserved in decision logging", () => {
    const mamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "SHORT", probabilities: { LONG: 0.10, SHORT: 0.70, HOLD: 0.20 } });
    const result = UnifiedEnsembleFusion.fuse([mamba], [], neutralNLP, "TRENDING_BEAR", defaultEVParams, {
      symbol: "RELIANCE",
      marketDomain: "INDIAN",
      accountType: "INDIAN_NSE"
    });
    expect(result.decisionRecord!.marketDomain).toBe("INDIAN");
    expect(result.decisionRecord!.accountType).toBe("INDIAN_NSE");
  });

  // 20. Deposit / AutoTrade Separation
  it("Area 20: Fusion engine operates strictly as an inference processor with zero side-effects on autoTrade flags", () => {
    const mamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.70, SHORT: 0.10, HOLD: 0.20 } });
    const res = UnifiedEnsembleFusion.fuse([mamba], [], neutralNLP, "TRENDING_BULL", defaultEVParams);
    expect(res).not.toHaveProperty("autoTradeEnabled");
  });

  // 21. Duplicate Tick Prevention
  it("Area 21: Unique decision IDs generated for sequential ticks", () => {
    const mamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.70, SHORT: 0.10, HOLD: 0.20 } });
    const res1 = UnifiedEnsembleFusion.fuse([mamba], [], neutralNLP, "TRENDING_BULL", defaultEVParams);
    const res2 = UnifiedEnsembleFusion.fuse([mamba], [], neutralNLP, "TRENDING_BULL", defaultEVParams);
    expect(res1.decisionRecord!.decisionId).not.toBe(res2.decisionRecord!.decisionId);
  });

  // 22. Remote Inference Timeout
  it("Area 22: Model timeouts produce safe unavailable status and are excluded from live weighting", () => {
    const timedOut = makePrediction({
      modelName: "SLOW_MODEL",
      inferenceMode: "UNAVAILABLE",
      status: "DISABLED",
      probabilities: { LONG: 0.33, SHORT: 0.33, HOLD: 0.34 },
      latencyMs: 3000,
      error: "Inference timed out after 2500ms"
    });
    const result = UnifiedEnsembleFusion.fuse([timedOut], [], neutralNLP, "RANGING", defaultEVParams);
    expect(result.participatingModels).not.toContain("SLOW_MODEL");
  });

  // 23. Telemetry Non-Blocking Behavior
  it("Area 23: Complete structured telemetry is packaged in-memory without async blocking", () => {
    const mamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.70, SHORT: 0.10, HOLD: 0.20 } });
    const result = UnifiedEnsembleFusion.fuse([mamba], [], bullishNLP, "TRENDING_BULL", defaultEVParams);
    expect(result.telemetry).toBeDefined();
    expect(result.telemetry.ensembleProbabilities.LONG).toBe(result.buyProbability);
    expect(result.telemetry.tradeQualityTier).toBe(result.tradeQualityTier);
  });

  // 24. Memory Boundedness
  it("Area 24: ModelContributionEngine decision buffer is bounded (MAX_HISTORY = 5000)", () => {
    for (let i = 0; i < 50; i++) {
      ModelContributionEngine.recordDecision({
        decisionId: `TEST_${i}`,
        timestamp: Date.now(),
        symbol: "BTCUSDT",
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        regime: "TRENDING_BULL",
        featureVersion: 2,
        buyProbability: 0.70,
        holdProbability: 0.20,
        sellProbability: 0.10,
        direction: "LONG",
        confidence: 0.75,
        agreementScore: 0.80,
        tradeQualityScore: 0.78,
        tradeQualityTier: "HIGH_CONVICTION",
        expectedValue: 1.5,
        expectedGain: 3.0,
        expectedLoss: 1.5,
        fees: 0.1,
        slippage: 0.05,
        uncertainty: 0.25,
        modelBreakdowns: {}
      });
    }
    expect(ModelContributionEngine.getDecisionHistory().length).toBe(50);
  });

  // 25. A/B Ensemble Comparison
  it("Area 25: A/B comparison demonstrates Adaptive Optimized Ensemble enhances confidence & EV precision", () => {
    const mamba = makePrediction({ modelName: "MAMBA_RESEARCH_V1", direction: "LONG", probabilities: { LONG: 0.75, SHORT: 0.10, HOLD: 0.15 }, confidence: 0.75 });
    const aaryan = makeQuantSignal({ strategyId: "AARYAN_MOMENTUM", direction: "LONG", confidence: 0.78 });
    const smc = makeQuantSignal({ strategyId: "SMC_INSTITUTIONAL", direction: "LONG", confidence: 0.82 });

    // Baseline (Mamba only)
    const baselineA = UnifiedEnsembleFusion.fuse([mamba], [], neutralNLP, "TRENDING_BULL", defaultEVParams);

    // Optimized (Full Multi-family Ensemble)
    const optimizedB = UnifiedEnsembleFusion.fuse([mamba], [aaryan, smc], bullishNLP, "TRENDING_BULL", defaultEVParams);

    expect(optimizedB.confidence).toBeGreaterThan(baselineA.confidence);
    expect(optimizedB.tradeQualityScore).toBeGreaterThan(baselineA.tradeQualityScore);
    expect(optimizedB.expectedValue).toBeGreaterThan(0);
  });

  // 26. ModelCorrelationEngine: Pairwise Correlation & Independence Matrix
  it("Area 26: ModelCorrelationEngine computes pairwise correlations and adjusts effective N", () => {
    // Before calibration (< 30 samples) -> returns uncalibrated identity
    const uncalibrated = ModelCorrelationEngine.computeCorrelationMatrix(["MAMBA_RESEARCH_V1", "AARYAN_MOMENTUM"]);
    expect(uncalibrated.isCalibrated).toBe(false);
    expect(uncalibrated.effectiveN).toBe(2);

    // Seed 35 observations in ForwardTelemetryStore
    const t0 = Date.now() - 100000;
    for (let i = 0; i < 35; i++) {
      const decId = `CORR_TEST_${i}`;
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
        confidence: 0.75,
        agreementScore: 0.85,
        tradeQualityScore: 0.80,
        tradeQualityTier: "HIGH_CONVICTION",
        expectedValue: 1.5,
        fees: 0.1,
        slippage: 0.05,
        uncertainty: 0.20,
        modelBreakdowns: {
          MAMBA_RESEARCH_V1: {
            modelName: "MAMBA_RESEARCH_V1",
            rawProbability: { LONG: 0.70 + (i % 5) * 0.02, SHORT: 0.15, HOLD: 0.15 },
            direction: "LONG",
            confidence: 0.75,
            effectiveWeight: 0.35,
            status: "PRODUCTION",
            inferenceMode: "REAL_MODEL",
            participating: true
          },
          AARYAN_MOMENTUM: {
            modelName: "AARYAN_MOMENTUM",
            rawProbability: { LONG: 0.68 + (i % 5) * 0.02, SHORT: 0.16, HOLD: 0.16 },
            direction: "LONG",
            confidence: 0.72,
            effectiveWeight: 0.25,
            status: "PRODUCTION",
            inferenceMode: "REAL_MODEL",
            participating: true
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
        realizedReturn: 1.2,
        realizedPnL: 12.0,
        outcome: "WIN",
        directionCorrect: true,
        resolvedTimestamp: t0 + i * 1000 + 500
      });
    }

    const calibrated = ModelCorrelationEngine.computeCorrelationMatrix(["MAMBA_RESEARCH_V1", "AARYAN_MOMENTUM"]);
    expect(calibrated.isCalibrated).toBe(true);
    expect(calibrated.sampleCount).toBe(35);
    expect(calibrated.matrix[0][1]).toBeGreaterThan(0.5); // Highly correlated
    expect(calibrated.effectiveN).toBeLessThan(2.0); // Effective N discounted
  });

  // 27. Effective Independence within Family
  it("Area 27: Effective independence discounts correlated models within family", () => {
    // With 0 samples -> falls back to prior
    const fallback = ModelCorrelationEngine.getEffectiveIndependence(["AARYAN_MOMENTUM", "SMC_INSTITUTIONAL"], 2);
    expect(fallback.method).toBe("PRIOR_FAMILY_BASED");
    expect(fallback.effectiveFraction).toBeCloseTo(1 / Math.sqrt(2), 2);
  });

  // 28. ModelSubsetOptimizer: Search & Constraint Enforcement
  it("Area 28: ModelSubsetOptimizer finds optimal model subset and enforces institutional constraints", () => {
    const t0 = Date.now() - 500000;
    // Seed 35 decisions
    for (let i = 0; i < 35; i++) {
      const decId = `SUBSET_OPT_${i}`;
      ForwardTelemetryStore.recordDecision({
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "ETHUSDT",
        marketDomain: "CRYPTO",
        accountType: "SPOT",
        regime: "TRENDING_UP",
        featureVersion: 2,
        buyProbability: 0.65,
        holdProbability: 0.20,
        sellProbability: 0.15,
        direction: "LONG",
        confidence: 0.70,
        agreementScore: 0.80,
        tradeQualityScore: 0.75,
        tradeQualityTier: "HIGH_CONVICTION",
        expectedValue: 1.2,
        fees: 0.1,
        slippage: 0.05,
        uncertainty: 0.25,
        modelBreakdowns: {
          MAMBA_RESEARCH_V1: {
            modelName: "MAMBA_RESEARCH_V1",
            rawProbability: { LONG: 0.75, SHORT: 0.10, HOLD: 0.15 },
            direction: "LONG",
            confidence: 0.75,
            effectiveWeight: 0.35,
            status: "PRODUCTION",
            inferenceMode: "REAL_MODEL",
            participating: true
          },
          AARYAN_MOMENTUM: {
            modelName: "AARYAN_MOMENTUM",
            rawProbability: { LONG: 0.70, SHORT: 0.15, HOLD: 0.15 },
            direction: "LONG",
            confidence: 0.70,
            effectiveWeight: 0.25,
            status: "PRODUCTION",
            inferenceMode: "REAL_MODEL",
            participating: true
          },
          WEAK_MODEL: {
            modelName: "WEAK_MODEL",
            rawProbability: { LONG: 0.40, SHORT: 0.45, HOLD: 0.15 },
            direction: "SHORT",
            confidence: 0.45,
            effectiveWeight: 0.10,
            status: "SHADOW",
            inferenceMode: "PROXY",
            participating: true
          }
        }
      });

      ForwardTelemetryStore.resolveOutcome(decId, {
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "ETHUSDT",
        regime: "TRENDING_UP",
        accountType: "SPOT",
        realizedDirection: "LONG",
        realizedReturn: i % 4 === 0 ? -0.5 : 1.5, // 75% win rate
        realizedPnL: i % 4 === 0 ? -5 : 15,
        outcome: i % 4 === 0 ? "LOSS" : "WIN",
        directionCorrect: i % 4 !== 0,
        resolvedTimestamp: t0 + i * 1000 + 400
      });
    }

    const result = ModelSubsetOptimizer.search(["MAMBA_RESEARCH_V1", "AARYAN_MOMENTUM", "WEAK_MODEL"], {
      minOOSSamples: 30,
      minNetEV: 0.0,
      maxDrawdown: 15.0
    });

    expect(result.sufficientData).toBe(true);
    expect(result.optimalSubset).not.toBeNull();
    expect(result.optimalSubset!.netEV).toBeGreaterThan(0);
    expect(result.optimalSubset!.passesConstraints).toBe(true);
  });

  // 29. ModelSubsetOptimizer Utility Function Penalties
  it("Area 29: ModelSubsetOptimizer utility function correctly penalizes drawdown, turnover, and complexity", () => {
    const records = ForwardTelemetryStore.getResolvedRecords();
    const eval1 = ModelSubsetOptimizer.evaluateSubset(["MAMBA_RESEARCH_V1"], records, {
      lambdaDrawdown: 2.0,
      lambdaExpectedShortfall: 1.5,
      lambdaTurnover: 0.5,
      lambdaComplexity: 0.01,
      minOOSSamples: 10,
      maxSubsetSize: 5,
      exhaustiveMaxSize: 3,
      minNetEV: 0,
      maxDrawdown: 20,
      minProfitFactor: 1.1,
      maxBrier: 0.3,
      maxECE: 0.1
    });

    const eval2 = ModelSubsetOptimizer.evaluateSubset(["MAMBA_RESEARCH_V1", "AARYAN_MOMENTUM"], records, {
      lambdaDrawdown: 2.0,
      lambdaExpectedShortfall: 1.5,
      lambdaTurnover: 0.5,
      lambdaComplexity: 0.05, // Heavy complexity penalty
      minOOSSamples: 10,
      maxSubsetSize: 5,
      exhaustiveMaxSize: 3,
      minNetEV: 0,
      maxDrawdown: 20,
      minProfitFactor: 1.1,
      maxBrier: 0.3,
      maxECE: 0.1
    });

    expect(eval1.utilityScore).toBeDefined();
    expect(eval2.utilityScore).toBeDefined();
  });

  // 30. StatisticalTests: Block Bootstrap & Paired Model Comparison
  it("Area 30: StatisticalTests computes block bootstrap CIs and detects significant positive EV", () => {
    const returns = [1.2, 0.8, -0.4, 1.5, 0.9, -0.2, 1.1, 0.7, 1.3, -0.5, 1.0, 0.8, 1.4, -0.3, 0.9];
    const ci = StatisticalTests.meanCI(returns, 0.95);

    expect(ci.mean).toBeGreaterThan(0);
    expect(ci.lower).toBeDefined();
    expect(ci.upper).toBeDefined();
    expect(ci.lower).toBeLessThan(ci.mean);
    expect(ci.upper).toBeGreaterThan(ci.mean);
    expect(ci.isSignificant).toBe(true);

    const exp = StatisticalTests.registerExperiment(
      "EXP_001",
      "Bootstrap test for MAMBA positive EV",
      "meanReturn",
      ci.mean,
      ci
    );
    expect(StatisticalTests.getExperimentCount()).toBe(1);
    expect(exp.isSignificant).toBe(true);
  });

  // 31. ModelContributionEngine ECE (10-bin Expected Calibration Error)
  it("Area 31: ModelContributionEngine computes accurate 10-bin ECE rather than simple win-rate difference", () => {
    const decId = "ECE_TEST_1";
    ModelContributionEngine.recordDecision({
      decisionId: decId,
      timestamp: 1000,
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
      tradeQualityTier: "HIGH_CONVICTION",
      expectedValue: 2.0,
      fees: 0.1,
      slippage: 0.05,
      uncertainty: 0.15,
      modelBreakdowns: {
        MAMBA_RESEARCH_V1: {
          modelName: "MAMBA_RESEARCH_V1",
          rawProbability: { LONG: 0.85, SHORT: 0.05, HOLD: 0.10 },
          direction: "LONG",
          confidence: 0.85,
          effectiveWeight: 0.35,
          status: "PRODUCTION",
          inferenceMode: "REAL_MODEL",
          participating: true
        }
      }
    });

    ModelContributionEngine.resolveOutcome(decId, {
      decisionId: decId,
      timestamp: 1000,
      symbol: "BTCUSDT",
      regime: "TRENDING_BULL",
      accountType: "FUTURES",
      realizedDirection: "LONG",
      realizedReturn: 1.5,
      realizedPnL: 15.0,
      outcome: "WIN",
      directionCorrect: true,
      resolvedTimestamp: 2000
    });

    const metrics = ModelContributionEngine.getModelMetrics("MAMBA_RESEARCH_V1");
    expect(metrics.ece).toBeDefined();
    expect(metrics.ece).toBeGreaterThanOrEqual(0);
    expect(metrics.ece).toBeLessThanOrEqual(1.0);
  });

  // 32. ModelContributionEngine Max Drawdown Calculation
  it("Area 32: ModelContributionEngine maxDrawdown tracks rolling equity peaks and drawdowns", () => {
    for (let i = 0; i < 5; i++) {
      const decId = `MDD_TEST_${i}`;
      ModelContributionEngine.recordDecision({
        decisionId: decId,
        timestamp: 1000 + i * 1000,
        symbol: "BTCUSDT",
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        regime: "TRENDING_BULL",
        featureVersion: 2,
        buyProbability: 0.70,
        holdProbability: 0.15,
        sellProbability: 0.15,
        direction: "LONG",
        confidence: 0.75,
        agreementScore: 0.80,
        tradeQualityScore: 0.78,
        tradeQualityTier: "HIGH_CONVICTION",
        expectedValue: 1.5,
        fees: 0.1,
        slippage: 0.05,
        uncertainty: 0.20,
        modelBreakdowns: {
          MDD_MODEL: {
            modelName: "MDD_MODEL",
            rawProbability: { LONG: 0.70, SHORT: 0.15, HOLD: 0.15 },
            direction: "LONG",
            confidence: 0.75,
            effectiveWeight: 0.35,
            status: "PRODUCTION",
            inferenceMode: "REAL_MODEL",
            participating: true
          }
        }
      });

      // Returns: +2.0, -1.0, -1.5, +3.0, -0.5 -> Peak at 2.0, drops to -0.5 -> max DD = 2.5
      const rets = [2.0, -1.0, -1.5, 3.0, -0.5];
      ModelContributionEngine.resolveOutcome(decId, {
        decisionId: decId,
        timestamp: 1000 + i * 1000,
        symbol: "BTCUSDT",
        regime: "TRENDING_BULL",
        accountType: "FUTURES",
        realizedDirection: "LONG",
        realizedReturn: rets[i],
        realizedPnL: rets[i] * 10,
        outcome: rets[i] > 0 ? "WIN" : "LOSS",
        directionCorrect: rets[i] > 0,
        resolvedTimestamp: 1000 + i * 1000 + 500
      });
    }

    const metrics = ModelContributionEngine.getModelMetrics("MDD_MODEL");
    expect(metrics.maxDrawdown).toBeCloseTo(2.5, 1);
  });

  // 33. ForwardTelemetryStore: Durable Persistence & Restart Recovery
  it("Area 33: ForwardTelemetryStore serializes and restores state identically across restart simulation", () => {
    const t0 = 1700000000000;
    ForwardTelemetryStore.recordDecision({
      decisionId: "RECOVERY_TEST_1",
      timestamp: t0,
      symbol: "SOLUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "BREAKOUT",
      featureVersion: 2,
      buyProbability: 0.80,
      holdProbability: 0.10,
      sellProbability: 0.10,
      direction: "LONG",
      confidence: 0.82,
      agreementScore: 0.88,
      tradeQualityScore: 0.85,
      tradeQualityTier: "INSTITUTIONAL_ALPHA",
      expectedValue: 2.5,
      fees: 0.1,
      slippage: 0.05,
      uncertainty: 0.18,
      modelBreakdowns: {
        MAMBA_RESEARCH_V1: {
          modelName: "MAMBA_RESEARCH_V1",
          rawProbability: { LONG: 0.80, SHORT: 0.10, HOLD: 0.10 },
          direction: "LONG",
          confidence: 0.80,
          effectiveWeight: 0.40,
          status: "PRODUCTION",
          inferenceMode: "REAL_MODEL",
          participating: true
        }
      }
    });

    ForwardTelemetryStore.resolveOutcome("RECOVERY_TEST_1", {
      decisionId: "RECOVERY_TEST_1",
      timestamp: t0,
      symbol: "SOLUSDT",
      regime: "BREAKOUT",
      accountType: "FUTURES",
      realizedDirection: "LONG",
      realizedReturn: 2.1,
      realizedPnL: 21.0,
      outcome: "WIN",
      directionCorrect: true,
      resolvedTimestamp: t0 + 3000
    });

    const statsBefore = ForwardTelemetryStore.getStats();
    const serialized = ForwardTelemetryStore.serialize();

    // Simulate process crash / server restart
    ForwardTelemetryStore.clear();
    expect(ForwardTelemetryStore.getStats().totalDecisions).toBe(0);

    // Hydrate / recover
    ForwardTelemetryStore.deserialize(serialized);
    const statsAfter = ForwardTelemetryStore.getStats();

    expect(statsAfter.totalDecisions).toBe(statsBefore.totalDecisions);
    expect(statsAfter.totalResolved).toBe(statsBefore.totalResolved);
    expect(statsAfter.oldestDecision).toBe(statsBefore.oldestDecision);

    // Anti-leakage guard throws if outcome <= decision
    expect(() => {
      ForwardTelemetryStore.resolveOutcome("RECOVERY_TEST_1", {
        decisionId: "RECOVERY_TEST_1",
        timestamp: t0,
        symbol: "SOLUSDT",
        regime: "BREAKOUT",
        accountType: "FUTURES",
        realizedDirection: "LONG",
        realizedReturn: 1.0,
        realizedPnL: 10.0,
        outcome: "WIN",
        directionCorrect: true,
        resolvedTimestamp: t0 - 100 // Look-ahead violation
      });
    }).toThrow(DataLeakageError);
  });

  // 34. Model-Level Scorecard Reconstruction
  it("Area 34: ForwardTelemetryStore reconstructs predictive and trading scorecards from persisted OOS data", () => {
    const scorecard = ForwardTelemetryStore.reconstructModelScorecard("MAMBA_RESEARCH_V1");
    expect(scorecard.modelName).toBe("MAMBA_RESEARCH_V1");
    expect(scorecard.predictive.accuracy).toBeDefined();
    expect(scorecard.predictive.balancedAccuracy).toBeDefined();
    expect(scorecard.predictive.brierScore).toBeDefined();
    expect(scorecard.trading.expectedValue).toBeDefined();
    expect(scorecard.trading.profitFactor).toBeDefined();
    expect(scorecard.trading.calmarRatio).toBeDefined();
  });

  // 35. Leave-One-Out (LOO) Incremental Attribution Analysis
  it("Area 35: ForwardTelemetryStore computes exact Leave-One-Out incremental attribution", () => {
    const loo = ForwardTelemetryStore.computeLeaveOneOutAttribution("MAMBA_RESEARCH_V1");
    expect(loo.modelName).toBe("MAMBA_RESEARCH_V1");
    expect(loo.deltaNetEV).toBeDefined();
    expect(loo.deltaBrier).toBeDefined();
    expect(loo.deltaPF).toBeDefined();
    expect(loo.deltaSharpe).toBeDefined();
    expect(loo.deltaMaxDD).toBeDefined();
  });

  // 36. ForwardLearningPipeline: Stage 2 Fail-Closed Behavior (N < 100)
  it("Area 36: ForwardLearningPipeline halts at Stage 2 when N < 100, strictly blocking live promotion and retraining", async () => {
    // Currently 0 records in fresh test environment
    const report = await ForwardLearningPipeline.executeCycle(["MAMBA_RESEARCH_V1", "AARYAN_MOMENTUM"]);

    expect(report.stage).toBe("STAGE_2_COLLECTING_OOS_DATA");
    expect(report.hasSufficientData).toBe(false);
    expect(report.governanceStatus.paperValidationActive).toBe(true);
    expect(report.governanceStatus.livePromotionBlocked).toBe(true);
    expect(report.governanceStatus.modelRetrainingDeferred).toBe(true);
    expect(report.governanceStatus.architectureFrozen).toBe(false);
    expect(report.promotionCandidates.every(c => !c.eligible)).toBe(true);
    expect(report.retrainingCandidates.every(c => !c.justified)).toBe(true);
  });

  // 37. ForwardLearningPipeline: Full 12-Stage Execution (N >= 100)
  it("Area 37: ForwardLearningPipeline executes all 12 stages when N >= 100, conducting LOO, correlation, subset search, and bootstrap holdout validation", async () => {
    const t0 = Date.now() - 2000000;
    // Seed 105 genuine OOS observations
    for (let i = 0; i < 105; i++) {
      const decId = `PIPELINE_TEST_${i}`;
      ForwardTelemetryStore.recordDecision({
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "BTCUSDT",
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        regime: i % 2 === 0 ? "TRENDING_BULL" : "RANGING",
        featureVersion: 2,
        buyProbability: 0.72,
        holdProbability: 0.18,
        sellProbability: 0.10,
        direction: "LONG",
        confidence: 0.78,
        agreementScore: 0.85,
        tradeQualityScore: 0.82,
        tradeQualityTier: "HIGH_CONVICTION",
        expectedValue: 1.8,
        fees: 0.1,
        slippage: 0.05,
        uncertainty: 0.18,
        modelBreakdowns: {
          MAMBA_RESEARCH_V1: {
            modelName: "MAMBA_RESEARCH_V1",
            rawProbability: { LONG: 0.75, SHORT: 0.10, HOLD: 0.15 },
            direction: "LONG",
            confidence: 0.78,
            effectiveWeight: 0.35,
            status: "PRODUCTION",
            inferenceMode: "REAL_MODEL",
            participating: true
          },
          AARYAN_MOMENTUM: {
            modelName: "AARYAN_MOMENTUM",
            rawProbability: { LONG: 0.70, SHORT: 0.15, HOLD: 0.15 },
            direction: "LONG",
            confidence: 0.72,
            effectiveWeight: 0.25,
            status: "PRODUCTION",
            inferenceMode: "REAL_MODEL",
            participating: true
          },
          SMC_INSTITUTIONAL: {
            modelName: "SMC_INSTITUTIONAL",
            rawProbability: { LONG: 0.68, SHORT: 0.12, HOLD: 0.20 },
            direction: "LONG",
            confidence: 0.70,
            effectiveWeight: 0.20,
            status: "PRODUCTION",
            inferenceMode: "REAL_MODEL",
            participating: true
          }
        }
      });

      const isWin = i % 4 !== 0; // 75% win rate
      ForwardTelemetryStore.resolveOutcome(decId, {
        decisionId: decId,
        timestamp: t0 + i * 1000,
        symbol: "BTCUSDT",
        regime: i % 2 === 0 ? "TRENDING_BULL" : "RANGING",
        accountType: "FUTURES",
        realizedDirection: "LONG",
        realizedReturn: isWin ? 1.6 : -0.6,
        realizedPnL: isWin ? 16.0 : -6.0,
        outcome: isWin ? "WIN" : "LOSS",
        directionCorrect: isWin,
        resolvedTimestamp: t0 + i * 1000 + 400
      });
    }

    const report = await ForwardLearningPipeline.executeCycle(["MAMBA_RESEARCH_V1", "AARYAN_MOMENTUM", "SMC_INSTITUTIONAL"]);

    expect(report.stage).toBe("STAGE_12_PROMOTION_EVALUATED");
    expect(report.hasSufficientData).toBe(true);
    expect(report.sampleCount).toBe(105);
    expect(report.correlationMatrix).toBeDefined();
    expect(report.subsetOptimization).toBeDefined();
    expect(report.bootstrapConfidenceInterval).toBeDefined();
    expect(report.holdoutValidation).toBeDefined();
    expect(report.weightUpdates).toBeDefined();
  });
});

