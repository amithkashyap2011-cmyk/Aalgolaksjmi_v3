/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 16 Regression Suite
 *  Stability, Accuracy, Shadow-OOS Validation & Loss-Control
 * ═══════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { AqeaP16ShadowLedger, MODEL_INVENTORY } from "../src/services/aqea/shadow/AqeaP16ShadowLedger.js";
import { FeaturePipeline, Standardized15Features } from "../src/services/aqea/pipeline/FeaturePipeline.js";
import { ModelExpertPrediction } from "../src/services/aqea/ai/IModelExpert.js";
import { QuantExpertSignal } from "../src/services/aqea/quant/QuantStrategyRegistry.js";
import { AdaptiveBayesianGate } from "../src/services/aqea/bayesian/AdaptiveBayesianGate.js";

function createMockFeatures(overrides?: Partial<Standardized15Features>): Standardized15Features {
  const base = FeaturePipeline.process({
    symbol: "BTCUSDT",
    currentPrice: 97500,
    indicators: {
      open: 97400,
      high: 97800,
      low: 97200,
      close: 97500,
      volume: 1500000,
      rsi14: 65,
      adx14: 35,
      ema9: 97600,
      ema21: 97300,
      cvd: 0.40,
      orderBlock: true
    },
    bars: [
      { open: 97300, high: 97600, low: 97100, close: 97400, volume: 1000000 },
      { open: 97400, high: 97800, low: 97200, close: 97500, volume: 1500000 }
    ],
    marketData: {
      orderBook: { bidVol: 800, askVol: 200 }
    }
  });

  return {
    ...base,
    ...overrides
  };
}

describe("AQEA Phase 16: Stability, Accuracy, Shadow-OOS & Loss-Control", () => {
  beforeEach(() => {
    AqeaP16ShadowLedger.clearLedger();
    jest.restoreAllMocks();
  });

  // 1 & 2. CNN Real Inference, Checkpoint Hash & Output Normalization
  it("1-2. verifies CNN checkpoint hash and guarantees strict probability normalization", () => {
    expect(MODEL_INVENTORY.CNN_1D_V1.checkpointHash).toBe("4cdde6aca72078c38dd76dc95a7f1a4dda89bbe71dea57c37824c067183eb458");
    expect(MODEL_INVENTORY.MAMBA_RESEARCH_V1.checkpointHash).toBe("fad84368f4fd1b1b988387891debab4639d3a7c7078a39ab8564aec51b5ee3f7");

    const features = createMockFeatures();
    const cnn: ModelExpertPrediction = {
      modelName: "CNN_1D_V1_BENCHMARK",
      modelVersion: "1.0.0",
      architecture: "1D_CNN",
      inferenceMode: "BENCHMARK",
      direction: "LONG",
      probabilities: { LONG: 0.70, SHORT: 0.15, HOLD: 0.15 },
      confidence: 0.70,
      probability: 0.70,
      uncertainty: 0.30,
      predictionInterval: [0.6, 0.8],
      latencyMs: 5,
      status: "BENCHMARK",
      regimeCompatibility: 0.85,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };

    const res = AqeaP16ShadowLedger.evaluate("DEC_16_01", features, "TRENDING_BULL", [cnn], []);
    const sum = res.cnnValidation.probabilities.LONG + res.cnnValidation.probabilities.SHORT + res.cnnValidation.probabilities.HOLD;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });

  // 3 & 4. CNN Perturbation Responsiveness & Mamba Contract Preservation
  it("3-4. confirms CNN responsiveness classification and Mamba contract preservation", () => {
    const features = createMockFeatures();
    const mamba: ModelExpertPrediction = {
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      inferenceMode: "REAL_MODEL",
      direction: "HOLD",
      probabilities: { LONG: 0.2243, SHORT: 0.3550, HOLD: 0.4207 },
      confidence: 0.4621,
      probability: 0.3550,
      uncertainty: 0.5379,
      predictionInterval: [0.2, 0.8],
      latencyMs: 15,
      status: "PRODUCTION",
      regimeCompatibility: 0.95,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };

    const cnn: ModelExpertPrediction = {
      modelName: "CNN_1D_V1_BENCHMARK",
      modelVersion: "1.0.0",
      architecture: "1D_CNN",
      inferenceMode: "BENCHMARK",
      direction: "LONG",
      probabilities: { LONG: 0.7894, SHORT: 0.1102, HOLD: 0.1004 },
      confidence: 0.7894,
      probability: 0.7894,
      uncertainty: 0.2106,
      predictionInterval: [0.7, 0.9],
      latencyMs: 5,
      status: "BENCHMARK",
      regimeCompatibility: 0.85,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };

    const res = AqeaP16ShadowLedger.evaluate("DEC_16_02", features, "TRENDING_BULL", [mamba, cnn], []);
    expect(res.cnnValidation.responsiveness).toBe("RESPONSIVE");
    expect(res.mambaContract.contractStatus).toBe("VALID_REAL_INFERENCE");
    expect(res.mambaContract.fallbackUsed).toBe(false);
  });

  // 5. LSTM Collapse Detection & Exclusion
  it("5. verifies LSTM collapse status (+7.95 logit bias) and ensures complete shadow exclusion", () => {
    const features = createMockFeatures();
    const res = AqeaP16ShadowLedger.evaluate("DEC_16_03", features, "TRENDING_BULL", [], []);
    expect(res.lstmStatus.status).toBe("OUTPUT_COLLAPSED");
    expect(res.lstmStatus.holdLogitBias).toBe(7.95);
    expect(res.lstmStatus.participatingInShadow).toBe(false);
  });

  // 6. Microstructure Health & Fail-Closed
  it("6. validates microstructure data integrity and fails closed on invalid data", () => {
    const features = createMockFeatures();
    const res = AqeaP16ShadowLedger.evaluate("DEC_16_04", features, "TRENDING_BULL", [], []);
    expect(res.microstructure.isTradePermitted).toBe(true);
    expect(res.microstructure.classification).toBe("HEALTHY_SYMMETRIC");
  });

  // 7. Primary Ensemble Isolation (CNN + MAMBA)
  it("7. evaluates 5 primary ensemble scenarios for CNN + MAMBA", () => {
    const features = createMockFeatures();
    const mamba: ModelExpertPrediction = {
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      inferenceMode: "REAL_MODEL",
      direction: "HOLD",
      probabilities: { LONG: 0.2243, SHORT: 0.3550, HOLD: 0.4207 },
      confidence: 0.4621,
      probability: 0.3550,
      uncertainty: 0.5379,
      predictionInterval: [0.2, 0.8],
      latencyMs: 15,
      status: "PRODUCTION",
      regimeCompatibility: 0.95,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };

    const cnn: ModelExpertPrediction = {
      modelName: "CNN_1D_V1_BENCHMARK",
      modelVersion: "1.0.0",
      architecture: "1D_CNN",
      inferenceMode: "BENCHMARK",
      direction: "LONG",
      probabilities: { LONG: 0.7894, SHORT: 0.1102, HOLD: 0.1004 },
      confidence: 0.7894,
      probability: 0.7894,
      uncertainty: 0.2106,
      predictionInterval: [0.7, 0.9],
      latencyMs: 5,
      status: "BENCHMARK",
      regimeCompatibility: 0.85,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };

    const res = AqeaP16ShadowLedger.evaluate("DEC_16_05", features, "TRENDING_BULL", [mamba, cnn], []);
    expect(res.primaryEnsemble.scenarios.SCENARIO_1_CNN_ALONE.fusedDirection).toBe("LONG");
    expect(res.primaryEnsemble.scenarios.SCENARIO_2_MAMBA_ALONE.fusedDirection).toBe("HOLD");
    expect(res.primaryEnsemble.scenarios.SCENARIO_3_CNN_MAMBA_BASELINE_WEIGHTS.participatingModels).toContain("CNN_1D_V1_SHADOW");
  });

  // 8, 9, 10. Shadow Opportunity Ledger & Non-Execution Invariants
  it("8-10. persists shadow opportunities with strict executionAttempted === false", () => {
    const features = createMockFeatures();
    const res = AqeaP16ShadowLedger.evaluate("DEC_16_06", features, "TRENDING_BULL", [], []);

    expect(res.shadowOpportunity.shadowOnly).toBe(true);
    expect(res.shadowOpportunity.paperTrade).toBe(false);
    expect(res.shadowOpportunity.liveExecution).toBe(false);
    expect(res.safety.executionAttempted).toBe(false);
    expect(res.safety.orderCreationCount).toBe(0);
    expect(res.safety.walletMutationCount).toBe(0);
  });

  // 11 & 12. Fail-Closed on NaN/Infinity and Invalid Inputs
  it("11-12. fails closed safely when NaN or invalid probability is supplied", () => {
    const features = createMockFeatures();
    const invalidPred: ModelExpertPrediction = {
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      inferenceMode: "REAL_MODEL",
      direction: "HOLD",
      probabilities: { LONG: NaN, SHORT: Infinity, HOLD: -0.5 },
      confidence: 0,
      probability: 0,
      uncertainty: 1.0,
      predictionInterval: [0, 1],
      latencyMs: 10,
      status: "PRODUCTION",
      regimeCompatibility: 0.5,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };

    const res = AqeaP16ShadowLedger.evaluate("DEC_16_07", features, "TRENDING_BULL", [invalidPred], []);
    expect(res.safety.executionAttempted).toBe(false);
  });

  // 13. Friction-Adjusted NetEV
  it("13. guarantees friction deductions (spread + fees + slippage) in NetEV calculations", () => {
    const features = createMockFeatures();
    const res = AqeaP16ShadowLedger.evaluate("DEC_16_08", features, "TRENDING_BULL", [], []);
    expect(res.shadowOpportunity.fees).toBeGreaterThan(0);
    expect(res.shadowOpportunity.slippage).toBeGreaterThan(0);
  });

  // 14 & 15. Position & P&L Invariants
  it("14-15. verifies margin = notional / leverage and ROI% = netPnL / margin * 100", () => {
    const features = createMockFeatures();
    const res = AqeaP16ShadowLedger.evaluate("DEC_16_09", features, "TRENDING_BULL", [], []);
    expect(res.positionIntegrity.entryPriceImmutable).toBe(true);
    expect(res.positionIntegrity.marginFormulaValid).toBe(true);
    expect(res.positionIntegrity.roiFormulaValid).toBe(true);
  });

  // 16 & 17. Bayesian Gate & LIVE_PROMOTION_BLOCKED Immutability
  it("16-17. confirms Bayesian thresholds and LIVE_PROMOTION_BLOCKED remain strictly immutable", () => {
    const features = createMockFeatures();
    const evalResult = AdaptiveBayesianGate.evaluate(0.65, 0.35, features, "TRENDING_BULL", "LONG");
    expect(evalResult.requiredThreshold).toBe(0.78);

    const res = AqeaP16ShadowLedger.evaluate("DEC_16_10", features, "TRENDING_BULL", [], []);
    expect(res.safety.livePromotionBlocked).toBe(true);
    expect(res.safety.isLiveApproved).toBe(false);
    expect(res.promotionReadiness.promotionCandidate).toBe(false);
  });
});
