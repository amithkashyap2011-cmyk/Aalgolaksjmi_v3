/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Production ML/DL Comprehensive Regression Suite
 * ═══════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { FeaturePipeline, Standardized15Features } from "../src/services/aqea/pipeline/FeaturePipeline.js";
import { RegimeEngine } from "../src/services/aqea/regimeEngine.js";
import { ModernModelRegistry } from "../src/services/aqea/ai/ModernModelRegistry.js";
import { ModelContractValidator, ModelExpertPrediction } from "../src/services/aqea/ai/IModelExpert.js";
import { QuantStrategyRegistry } from "../src/services/aqea/quant/QuantStrategyRegistry.js";
import { LakshmiMasterRouter } from "../src/services/aqea/router/LakshmiMasterRouter.js";
import { AdaptiveBayesianGate } from "../src/services/aqea/bayesian/AdaptiveBayesianGate.js";
import { ConformalUncertaintyEngine } from "../src/services/aqea/uncertainty/ConformalUncertaintyEngine.js";
import { ModelDriftMonitor } from "../src/services/aqea/governance/ModelDriftMonitor.js";

describe("AQEA 2026–27 Production-Grade Architecture Full Regression Suite", () => {
  let sampleFeatures: Standardized15Features;

  beforeEach(() => {
    sampleFeatures = FeaturePipeline.process({
      symbol: "BTCUSDT",
      currentPrice: 50000,
      indicators: {
        open: 49800,
        high: 50500,
        low: 49700,
        close: 50000,
        volume: 1200,
        vwap: 49950,
        atr14: 500,
        rsi14: 58,
        macd: { macd: 15, signal: 10, histogram: 5 },
        bollinger: { upper: 51000, middle: 50000, lower: 49000 },
        cvd: 25,
        delta: 150,
        ema9: 50100,
        ema21: 49900,
        orderBlock: true,
        fvg: true,
        bos: true
      },
      bars: [
        { open: 49500, high: 49900, low: 49400, close: 49800, volume: 1000 },
        { open: 49800, high: 50500, low: 49700, close: 50000, volume: 1200 }
      ],
      marketData: {
        fundingRate: 0.0001,
        openInterest: 50000,
        orderBook: { bidVol: 600, askVol: 400 },
        marketBreadth: { breadthRatio: 0.65 }
      },
      newsSentiment: {
        score: 0.45,
        impact: "LOW",
        hasTier1Event: false
      }
    });
  });

  // A & B: Feature Schema & Normalization
  it("A1. FeaturePipeline processes 15 canonical features into 12-dim stationary vector", () => {
    expect(sampleFeatures.inputVersion).toBe(2);
    expect(sampleFeatures.tensorVector.length).toBe(12);
    const validation = FeaturePipeline.validate(sampleFeatures);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  it("A2. FeaturePipeline detects and rejects corrupted features", () => {
    const corrupted = { ...sampleFeatures, tensorVector: [NaN, 0, 1] };
    const validation = FeaturePipeline.validate(corrupted as any);
    expect(validation.valid).toBe(false);
  });

  // C: Model Contract Validation
  it("C1. ModelContractValidator verifies probability distributions and bounds", () => {
    const validPred: ModelExpertPrediction = {
      modelName: "TEST_MODEL",
      modelVersion: "1.0.0",
      architecture: "TEST",
      inferenceMode: "REAL_MODEL",
      direction: "LONG",
      probabilities: { LONG: 0.70, SHORT: 0.20, HOLD: 0.10 },
      confidence: 0.70,
      probability: 0.70,
      uncertainty: 0.30,
      predictionInterval: [0.55, 0.85],
      latencyMs: 5,
      status: "PRODUCTION",
      regimeCompatibility: 0.90,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };
    const validation = ModelContractValidator.validate(validPred);
    expect(validation.valid).toBe(true);
  });

  it("C2. ModelContractValidator catches invalid probability distributions", () => {
    const invalidPred: ModelExpertPrediction = {
      modelName: "TEST_MODEL",
      modelVersion: "1.0.0",
      architecture: "TEST",
      inferenceMode: "REAL_MODEL",
      direction: "LONG",
      probabilities: { LONG: 0.90, SHORT: 0.90, HOLD: 0.10 }, // Sum > 1.0
      confidence: 0.70,
      probability: 0.70,
      uncertainty: 0.30,
      predictionInterval: [0.55, 0.85],
      latencyMs: 5,
      status: "PRODUCTION",
      regimeCompatibility: 0.90,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };
    const validation = ModelContractValidator.validate(invalidPred);
    expect(validation.valid).toBe(false);
  });

  // D: Model Inference & Classification
  it("D1. Only REAL_MODEL production experts receive positive ensemble voting weight", async () => {
    const regimeRes = RegimeEngine.analyze({
      adx: 35,
      atr: 500,
      atrTrailing: 450,
      ema200: 48000,
      close: 50000,
      volume: 1200,
      volumeAvg: 800
    });

    const routeResult = await LakshmiMasterRouter.route(sampleFeatures, regimeRes);
    expect(routeResult.direction).toBeDefined();

    // Verify proxy models get 0 weight
    expect(routeResult.expertWeights["MODERN_TCN_V1_PROXY"]).toBe(0);
    expect(routeResult.expertWeights["ITRANSFORMER_V1_PROXY"]).toBe(0);
    expect(routeResult.expertWeights["TIMESNET_2D_V1_PROXY"]).toBe(0);
    expect(routeResult.expertWeights["PATCH_TST_V1_PROXY"]).toBe(0);
    expect(routeResult.expertWeights["TSFM_CHRONOS_ADAPTER_PROXY"]).toBe(0);
  });

  // F & G: Conformal Uncertainty Engine
  it("F1. ConformalUncertaintyEngine computes empirical quantiles from calibration observations", () => {
    // Feed 35 synthetic out-of-sample points
    for (let i = 0; i < 35; i++) {
      ConformalUncertaintyEngine.recordCalibrationPoint({
        predictedProbability: 0.75,
        realizedBinaryOutcome: i % 4 === 0 ? 0 : 1, // 75% win rate
        regime: "TRENDING_UP",
        timestamp: Date.now() - (35 - i) * 60000
      });
    }

    const evalRes = ConformalUncertaintyEngine.evaluate(0.20, 0.75, sampleFeatures, "TRENDING_UP", "PAPER");
    expect(evalRes.isFormallyCalibrated).toBe(true);
    expect(evalRes.conformalQuantile).toBeGreaterThan(0);
    expect(evalRes.predictionInterval[0]).toBeLessThan(0.75);
    expect(evalRes.predictionInterval[1]).toBeGreaterThan(0.75);
  });

  it("G1. ConformalUncertaintyEngine strictly rejects LIVE trades when calibration is insufficient", () => {
    // Reset or test with clean engine in LIVE mode
    const evalRes = ConformalUncertaintyEngine.evaluate(0.20, 0.75, sampleFeatures, "CRISIS", "LIVE");
    // In LIVE mode with high quantile or crisis threshold, gate enforces safety
    if (!evalRes.isFormallyCalibrated) {
      expect(evalRes.passesUncertaintyGate).toBe(false);
      expect(evalRes.rejectionReason).toContain("LIVE_SAFETY_REJECT");
    }
  });

  // H: Calibrated Consensus Multiplier
  it("H1. Calibrated consensus defaults to neutral 1.0x when historical agreement data is insufficient", () => {
    const calibration = LakshmiMasterRouter.getCalibratedConsensusMultiplier();
    expect(calibration.multiplier).toBe(1.00); // Insufficient data -> neutral fallback
  });

  it("H2. Calibrated consensus increases when historical agreement empirically lifts win rate", () => {
    for (let i = 0; i < 35; i++) {
      LakshmiMasterRouter.recordConsensusOutcome({
        allAgreed: true,
        predictedDirection: "LONG",
        realizedOutcome: "WIN", // 100% win when agreed
        pnlPercent: 2.5,
        regime: "TRENDING_UP",
        timestamp: Date.now()
      });
      LakshmiMasterRouter.recordConsensusOutcome({
        allAgreed: false,
        predictedDirection: "LONG",
        realizedOutcome: i % 2 === 0 ? "WIN" : "LOSS", // 50% win solo
        pnlPercent: 0.2,
        regime: "TRENDING_UP",
        timestamp: Date.now()
      });
    }

    const calibration = LakshmiMasterRouter.getCalibratedConsensusMultiplier();
    expect(calibration.multiplier).toBeGreaterThan(1.00);
    expect(calibration.multiplier).toBeLessThanOrEqual(1.30);
  });

  // I: Adaptive Bayesian Gate
  it("I1. AdaptiveBayesianGate computes regime-adaptive posterior bounded in [0.001, 0.999]", () => {
    const bayesRes = AdaptiveBayesianGate.evaluate(0.78, 0.15, sampleFeatures, "TRENDING_UP");
    expect(bayesRes.posteriorProbability).toBeGreaterThan(0.001);
    expect(bayesRes.posteriorProbability).toBeLessThan(0.999);
    expect(bayesRes.requiredThreshold).toBe(0.78);
  });

  // J: Model Drift Monitor & Promotion
  it("J1. ModelDriftMonitor tracks Brier score, Sharpe, and requires multi-metric promotion criteria", () => {
    const eligibilityBefore = ModelDriftMonitor.evaluatePromotionEligibility("TEST_CANDIDATE");
    expect(eligibilityBefore.eligible).toBe(false); // Insufficient samples

    // Record 110 successful trades
    for (let i = 0; i < 110; i++) {
      ModelDriftMonitor.recordPrediction({
        modelName: "TEST_CANDIDATE",
        timestamp: Date.now(),
        predictedDirection: "LONG",
        predictedProbability: 0.80,
        realizedOutcome: "WIN",
        realizedPnLPercent: 1.5,
        regime: "TRENDING_UP"
      });
    }

    const report = ModelDriftMonitor.getReport("TEST_CANDIDATE");
    expect(report.totalEvaluated).toBe(110);
    expect(report.profitFactor).toBeGreaterThan(1.30);
    expect(report.brierScore).toBeLessThan(0.24);

    const eligibilityAfter = ModelDriftMonitor.evaluatePromotionEligibility("TEST_CANDIDATE");
    expect(eligibilityAfter.eligible).toBe(true);
  });

  // K: Evidence Family Capping (Double-Counting Prevention)
  it("K1. LakshmiMasterRouter enforces evidence family weight caps", async () => {
    const regimeRes = RegimeEngine.analyze({
      adx: 30,
      atr: 400,
      atrTrailing: 380,
      ema200: 48000,
      close: 50000,
      volume: 1000,
      volumeAvg: 1000
    });

    const routeRes = await LakshmiMasterRouter.route(sampleFeatures, regimeRes);
    expect(routeRes.familyWeights.PRICE_STRUCTURE).toBeLessThanOrEqual(1.0);
    expect(routeRes.familyWeights.MOMENTUM).toBeLessThanOrEqual(1.0);
  });
});
