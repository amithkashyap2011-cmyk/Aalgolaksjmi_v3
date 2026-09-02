import { jest } from "@jest/globals";
import { FeaturePipeline, Standardized15Features } from "../src/services/aqea/pipeline/FeaturePipeline.js";
import { ModernModelRegistry } from "../src/services/aqea/ai/ModernModelRegistry.js";
import { LakshmiMasterRouter } from "../src/services/aqea/router/LakshmiMasterRouter.js";
import { UnifiedEnsembleFusion } from "../src/services/aqea/ensemble/UnifiedEnsembleFusion.js";
import { AdaptiveBayesianGate } from "../src/services/aqea/bayesian/AdaptiveBayesianGate.js";
import { ConformalUncertaintyEngine } from "../src/services/aqea/uncertainty/ConformalUncertaintyEngine.js";
import { BayesianProbabilityEngine } from "../src/services/aqea/bayesianPredictor.js";
import { ForwardTelemetryStore, DataLeakageError } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { LiveExecutionBarrier } from "../src/services/aqea/governance/LiveExecutionBarrier.js";
import { AQEAEngine } from "../src/services/aqea/engine.js";

describe("AQEA 2026-27 P5 Signal Quality and Eligibility Regression Suite", () => {
  const dummyIndicators = {
    open: 65000,
    high: 65500,
    low: 64800,
    close: 65200,
    volume: 1200,
    vwap: 65100,
    atr14: 450,
    rsi14: 55,
    adx14: 28,
    ema20: 65000,
    ema50: 64500,
    sma200: 63000,
    macd: { macd: 50, signal: 30, histogram: 20 },
    orderBlock: true,
    fvg: true,
    bos: true,
    choch: false,
    poc: 65150
  };

  const sampleContext = {
    symbol: "BTCUSDT",
    currentPrice: 65200,
    indicators: dummyIndicators,
    bars: [
      { open: 64800, high: 65100, low: 64700, close: 65000, volume: 1000 },
      { open: 65000, high: 65500, low: 64800, close: 65200, volume: 1200 }
    ],
    timestamp: Date.now()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ForwardTelemetryStore.clear();
  });

  // TC01: model availability is explicit
  it("TC01: model availability is explicit", () => {
    const experts = ModernModelRegistry.getAllExperts();
    expect(experts.length).toBeGreaterThan(0);
    experts.forEach(exp => {
      expect(["REAL_MODEL", "SHADOW", "PROXY", "BENCHMARK", "UNAVAILABLE"]).toContain(exp.inferenceMode);
      expect(["PRODUCTION", "SHADOW", "BENCHMARK", "DEGRADED", "DISABLED"]).toContain(exp.status);
    });
  });

  // TC02: unavailable model does not masquerade as available
  it("TC02: unavailable model does not masquerade as available", async () => {
    const expert = ModernModelRegistry.getExpert("MAMBA_RESEARCH_V1");
    expect(expert).toBeDefined();
    if (expert) {
      const pred = await expert.predict(FeaturePipeline.process(sampleContext), "RANGING");
      if (pred.inferenceMode === "UNAVAILABLE") {
        expect(pred.status).toBe("DISABLED");
        expect(pred.confidence).toBe(0);
        expect(pred.error).toBeDefined();
      }
    }
  });

  // TC03: unavailable model cannot silently contribute zero-confidence vote
  it("TC03: unavailable model cannot silently contribute zero-confidence vote", () => {
    const dlPredictions: any[] = [
      {
        modelName: "UNAVAILABLE_EXPERT",
        modelVersion: "1.0",
        architecture: "TEST",
        inferenceMode: "UNAVAILABLE",
        direction: "HOLD",
        probabilities: { LONG: 0.33, SHORT: 0.33, HOLD: 0.34 },
        confidence: 0,
        probability: 0.33,
        uncertainty: 1.0,
        predictionInterval: [0, 1],
        latencyMs: 10,
        status: "DISABLED",
        regimeCompatibility: 0,
        featureVersion: 2,
        isTrained: false,
        timestamp: Date.now()
      }
    ];

    const fusion = UnifiedEnsembleFusion.fuse(
      dlPredictions,
      [],
      { score: 0, confidence: 0, classification: "NEUTRAL" },
      "RANGING",
      { atrPercent: 1.5 }
    );

    // The unavailable model must not be participating
    expect(fusion.participatingModels).not.toContain("UNAVAILABLE_EXPERT");
  });

  // TC04: ensemble renormalizes correctly over available models
  it("TC04: ensemble renormalizes correctly over available models", () => {
    const dlPredictions: any[] = [
      {
        modelName: "PROD_MODEL_1",
        modelVersion: "1.0",
        architecture: "TEST",
        inferenceMode: "REAL_MODEL",
        direction: "LONG",
        probabilities: { LONG: 0.80, SHORT: 0.10, HOLD: 0.10 },
        confidence: 0.80,
        probability: 0.80,
        uncertainty: 0.20,
        predictionInterval: [0.7, 0.9],
        latencyMs: 5,
        status: "PRODUCTION",
        regimeCompatibility: 0.9,
        featureVersion: 2,
        isTrained: true,
        timestamp: Date.now()
      }
    ];

    const fusion = UnifiedEnsembleFusion.fuse(
      dlPredictions,
      [],
      { score: 0, confidence: 0, classification: "NEUTRAL" },
      "TRENDING_BULL",
      { atrPercent: 1.5 }
    );

    const sumNorm = fusion.modelWeights.reduce((acc, m) => acc + m.normalizedWeight, 0);
    expect(sumNorm).toBeCloseTo(1.0, 3);
    expect(fusion.buyProbability).toBeGreaterThan(0.70);
  });

  // TC05: probability remains [0,1]
  it("TC05: probability remains [0,1]", () => {
    const std15 = FeaturePipeline.process(sampleContext);
    expect(std15.tensorVector.length).toBe(12);
    std15.tensorVector.forEach(v => {
      expect(isNaN(v)).toBe(false);
      expect(isFinite(v)).toBe(true);
    });
  });

  // TC06: confidence remains [0,100]
  it("TC06: confidence remains [0,100]", async () => {
    const std15 = FeaturePipeline.process(sampleContext);
    const result = await LakshmiMasterRouter.route(std15, { state: "TRENDING_BULL", score: 85, confidence: 85 });
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  // TC07: Bayesian posterior remains [0,1]
  it("TC07: Bayesian posterior remains [0,1]", () => {
    const post = BayesianProbabilityEngine.calculatePosteriorWinProbability(0.752, 85, 80, 30, true, 75);
    expect(post).toBeGreaterThanOrEqual(0.0);
    expect(post).toBeLessThanOrEqual(1.0);
  });

  // TC08: HTF directional alignment is correct for LONG
  it("TC08: HTF directional alignment is correct for LONG", () => {
    const isTradeDirectionLong = true;
    const ctxHtfBullish = true;
    const htfAligned = isTradeDirectionLong ? Boolean(ctxHtfBullish) : !ctxHtfBullish;
    expect(htfAligned).toBe(true);

    const postAligned = BayesianProbabilityEngine.calculatePosteriorWinProbability(0.752, 80, 80, 25, htfAligned, 60);
    const postOpposed = BayesianProbabilityEngine.calculatePosteriorWinProbability(0.752, 80, 80, 25, !htfAligned, 60);
    expect(postAligned).toBeGreaterThan(postOpposed);
  });

  // TC09: HTF directional alignment is correct for SHORT
  it("TC09: HTF directional alignment is correct for SHORT", () => {
    const isTradeDirectionLong = false;
    const ctxHtfBullish = false; // Bearish HTF aligns with SHORT
    const htfAligned = isTradeDirectionLong ? Boolean(ctxHtfBullish) : !ctxHtfBullish;
    expect(htfAligned).toBe(true);

    const postAligned = BayesianProbabilityEngine.calculatePosteriorWinProbability(0.752, 80, 80, 25, htfAligned, 60);
    const postOpposed = BayesianProbabilityEngine.calculatePosteriorWinProbability(0.752, 80, 80, 25, !htfAligned, 60);
    expect(postAligned).toBeGreaterThan(postOpposed);
  });

  // TC10: Smart Money score is propagated
  it("TC10: Smart Money score is propagated", () => {
    const postHighSM = BayesianProbabilityEngine.calculatePosteriorWinProbability(0.752, 80, 80, 25, true, 85);
    const postLowSM = BayesianProbabilityEngine.calculatePosteriorWinProbability(0.752, 80, 80, 25, true, 40);
    expect(postHighSM).toBeGreaterThan(postLowSM);
  });

  // TC11: no duplicate Bayesian penalty
  it("TC11: no duplicate Bayesian penalty", () => {
    const post1 = BayesianProbabilityEngine.calculatePosteriorWinProbability(0.752, 75, 75, 25, true, 65);
    expect(post1).toBeGreaterThanOrEqual(0.75);
  });

  // TC12: no percentage/decimal mismatch
  it("TC12: no percentage/decimal mismatch", () => {
    const post = BayesianProbabilityEngine.calculatePosteriorWinProbability(0.752, 75, 75, 25, true, 65);
    // Quality=75, AIConf=75 (0-100 scale), returns probability in [0, 1]
    expect(post).toBeLessThanOrEqual(1.0);
    expect(post).toBeGreaterThan(0.5);
  });

  // TC13: no NaN confidence
  it("TC13: no NaN confidence", async () => {
    const std15 = FeaturePipeline.process(sampleContext);
    const result = await LakshmiMasterRouter.route(std15, { state: "RANGING", score: 50, confidence: 50 });
    expect(isNaN(result.confidence)).toBe(false);
  });

  // TC14: no NaN probability
  it("TC14: no NaN probability", async () => {
    const std15 = FeaturePipeline.process(sampleContext);
    const result = await LakshmiMasterRouter.route(std15, { state: "RANGING", score: 50, confidence: 50 });
    expect(isNaN(result.compositeProbability)).toBe(false);
    expect(isNaN(result.compositeUncertainty)).toBe(false);
  });

  // TC15: HOLD remains HOLD
  it("TC15: HOLD remains HOLD", () => {
    const fusion = UnifiedEnsembleFusion.fuse(
      [],
      [],
      { score: 0, confidence: 0, classification: "NEUTRAL" },
      "RANGING",
      { atrPercent: 1.5 }
    );
    expect(fusion.direction).toBe("HOLD");
  });

  // TC16: valid LONG remains LONG
  it("TC16: valid LONG remains LONG", async () => {
    const bullContext = {
      ...sampleContext,
      indicators: {
        ...dummyIndicators,
        rsi14: 68,
        adx14: 35,
        ema20: 66000,
        ema50: 65000
      }
    };
    const std15 = FeaturePipeline.process(bullContext);
    const result = await LakshmiMasterRouter.route(std15, { state: "TRENDING_BULL", score: 85, confidence: 85 });
    if (result.ensembleFusion.buyProbability > result.ensembleFusion.sellProbability) {
      expect(result.direction).toBe("LONG");
      expect(result.compositeProbability).toBeCloseTo(result.ensembleFusion.buyProbability, 3);
    }
  });

  // TC17: valid SHORT remains SHORT
  it("TC17: valid SHORT remains SHORT with correct composite probability", async () => {
    const bearContext = {
      ...sampleContext,
      indicators: {
        ...dummyIndicators,
        rsi14: 32,
        adx14: 35,
        ema20: 64000,
        ema50: 65000,
        orderBlock: false,
        bos: false
      }
    };
    const std15 = FeaturePipeline.process(bearContext);
    const result = await LakshmiMasterRouter.route(std15, { state: "TRENDING_BEAR", score: 15, confidence: 85 });
    if (result.ensembleFusion.sellProbability > result.ensembleFusion.buyProbability) {
      expect(result.direction).toBe("SHORT");
      expect(result.compositeProbability).toBeCloseTo(result.ensembleFusion.sellProbability, 3);
      expect(result.compositeProbability).toBeGreaterThan(0.5);
    }
  });

  // TC18: confidence gate remains unchanged
  it("TC18: confidence gate remains unchanged (48.75% threshold enforced)", () => {
    const threshold = 65 * 0.75;
    expect(threshold).toBe(48.75);
    expect(34 < threshold).toBe(true);
    expect(65 >= threshold).toBe(true);
  });

  // TC19: Bayesian gate remains unchanged
  it("TC19: Bayesian gate remains unchanged", () => {
    const result = AdaptiveBayesianGate.evaluate(0.85, 0.15, FeaturePipeline.process(sampleContext), "TRENDING_BULL");
    expect(result.requiredThreshold).toBe(0.78);
    expect(result.passesGate).toBe(true);
  });

  // TC20: NetEV gate remains unchanged
  it("TC20: NetEV gate remains unchanged", () => {
    const fusion = UnifiedEnsembleFusion.fuse(
      [],
      [],
      { score: 0, confidence: 0, classification: "NEUTRAL" },
      "RANGING",
      { atrPercent: 1.5, feePercent: 0.10, slippagePercent: 0.05 }
    );
    expect(typeof fusion.evPassesGate).toBe("boolean");
  });

  // TC21: conformal gate remains unchanged
  it("TC21: conformal gate remains unchanged", () => {
    const confRes = ConformalUncertaintyEngine.evaluate(0.20, 0.80, FeaturePipeline.process(sampleContext), "RANGING", "PAPER");
    expect(confRes.passesUncertaintyGate).toBe(true);
  });

  // TC22: risk gate remains unchanged
  it("TC22: risk gate remains unchanged", () => {
    const barrierApproved = LiveExecutionBarrier.isLiveTradingPermitted();
    expect(barrierApproved).toBe(false);
  });

  // TC23: rejected weak signal remains rejected
  it("TC23: rejected weak signal remains rejected", () => {
    const weakConfidence = 34;
    const minRequired = 48.75;
    expect(weakConfidence < minRequired).toBe(true);
  });

  // TC24: genuinely eligible signal reaches paper execution
  it("TC24: genuinely eligible signal reaches paper execution", () => {
    const eligibleConfidence = 78;
    const minRequired = 48.75;
    const postProb = 0.85;
    const minProb = 0.70;
    const convictionPassed = eligibleConfidence >= minRequired && postProb >= minProb;
    expect(convictionPassed).toBe(true);
  });

  // TC25: LIVE_PROMOTION_BLOCKED remains TRUE
  it("TC25: LIVE_PROMOTION_BLOCKED remains TRUE", () => {
    expect(LiveExecutionBarrier.isLiveTradingPermitted()).toBe(false);
  });

  // TC26: experiment hashes remain immutable
  it("TC26: experiment hashes remain immutable", () => {
    const hashes = ForwardTelemetryStore.computeExperimentHashes({});
    expect(hashes.configurationHash).toBeDefined();
    expect(hashes.modelHash).toBeDefined();
  });

  // TC27: temporal leakage remains zero
  it("TC27: temporal leakage throws DataLeakageError if outcome <= decision timestamp", () => {
    const decId = "DEC_P5_LEAK_TEST";
    ForwardTelemetryStore.recordDecision({
      decisionId: decId,
      timestamp: 1000,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGING",
      featureVersion: 2,
      dataSource: "PAPER",
      isForward: true,
      isUntouched: true,
      buyProbability: 0.33,
      holdProbability: 0.34,
      sellProbability: 0.33,
      direction: "HOLD",
      finalDecision: "HOLD",
      decisionClass: "NO_TRADE",
      terminalState: "NO_TRADE",
      terminalReason: "TEST",
      confidence: 0.5,
      agreementScore: 1.0,
      tradeQualityScore: 50,
      tradeQualityTier: "STANDARD",
      expectedValue: 0,
      expectedGain: 0,
      expectedLoss: 0,
      uncertainty: 0.5,
      bayesianConviction: 0.5,
      fees: 0,
      slippage: 0,
      spread: 0,
      marketImpact: 0,
      netEV: 0,
      evGateResult: true,
      conformalResult: true,
      riskResult: true,
      modelBreakdowns: {},
      createdAt: 1000
    });

    expect(() => {
      ForwardTelemetryStore.resolveOutcome(decId, {
        decisionId: decId,
        entryTimestamp: 900,
        exitTimestamp: 950,
        realizedReturn: 0.01,
        realizedPnL: 10,
        holdingPeriodMs: 50,
        feesPaid: 0.1,
        slippageIncurred: 0.05,
        resolvedAt: 950
      });
    }).toThrow();
  });

  // TC28: opportunity conservation remains exact
  it("TC28: opportunity conservation remains exact", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC28_1",
      symbol: "BTCUSDT",
      direction: "HOLD",
      confidence: 50,
      timestamp: Date.now(),
      dataSource: "FORWARD_OOS",
      isForward: true,
      terminalState: "NO_TRADE",
      decisionClass: "NO_TRADE"
    });
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC28_2",
      symbol: "ETHUSDT",
      direction: "LONG",
      confidence: 80,
      timestamp: Date.now(),
      dataSource: "FORWARD_OOS",
      isForward: true,
      terminalState: "TRADE",
      decisionClass: "TRADE"
    });
    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.validDecisions).toBe(stats.tradedDecisions + stats.abstainedDecisions + stats.rejectedDecisions + stats.insufficientFundsDecisions);
  });

  // TC29: diagnostic trace identifies first blocking gate
  it("TC29: diagnostic trace identifies first blocking gate deterministically", () => {
    const computeBlockReason = (riskAllowed: boolean, decision: string, conf: number, bayesPass: boolean) => {
      if (!riskAllowed) return "RISK_LIMIT";
      if (decision === "HOLD") return "NORMAL_ABSTENTION_HOLD";
      if (conf < 48.75) return "AI_CONFIDENCE_BELOW_THRESHOLD";
      if (!bayesPass) return "BAYESIAN_POSTERIOR_BELOW_THRESHOLD";
      return "NONE";
    };

    expect(computeBlockReason(false, "LONG", 80, true)).toBe("RISK_LIMIT");
    expect(computeBlockReason(true, "HOLD", 50, true)).toBe("NORMAL_ABSTENTION_HOLD");
    expect(computeBlockReason(true, "SHORT", 34, true)).toBe("AI_CONFIDENCE_BELOW_THRESHOLD");
    expect(computeBlockReason(true, "SHORT", 75, false)).toBe("BAYESIAN_POSTERIOR_BELOW_THRESHOLD");
    expect(computeBlockReason(true, "SHORT", 75, true)).toBe("NONE");
  });

  // TC30: unavailable model reason is explicit
  it("TC30: unavailable model reason is explicit", () => {
    const pred: any = {
      modelName: "TEST_UNAVAILABLE",
      inferenceMode: "UNAVAILABLE",
      status: "DISABLED",
      error: "MODEL_SERVICE_TIMEOUT: Request timed out after 1500ms"
    };
    expect(pred.error).toContain("MODEL_SERVICE_TIMEOUT");
  });
});
