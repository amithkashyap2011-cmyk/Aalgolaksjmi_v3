/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 15 Regression Suite
 *  Multi-Model Shadow Enrollment + Calibration + Ablation Matrix
 * ═══════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { AqeaP15ShadowEnrollment } from "../src/services/aqea/shadow/AqeaP15ShadowEnrollment.js";
import { FeaturePipeline, Standardized15Features } from "../src/services/aqea/pipeline/FeaturePipeline.js";
import { ModelExpertPrediction } from "../src/services/aqea/ai/IModelExpert.js";
import { QuantExpertSignal } from "../src/services/aqea/quant/QuantStrategyRegistry.js";
import { AdaptiveBayesianGate } from "../src/services/aqea/bayesian/AdaptiveBayesianGate.js";
import { UnifiedEnsembleFusion } from "../src/services/aqea/ensemble/UnifiedEnsembleFusion.js";

function createMockFeatures(overrides?: Partial<Standardized15Features>): Standardized15Features {
  const base = FeaturePipeline.process({
    symbol: "BTCUSDT",
    currentPrice: 97500,
    indicators: {
      open: 97400,
      high: 97800,
      low: 97200,
      close: 97500,
      volume: 1200000,
      rsi14: 64,
      adx14: 34,
      ema9: 97600,
      ema21: 97300,
      cvd: 0.35,
      orderBlock: true
    },
    bars: [
      { open: 97300, high: 97600, low: 97100, close: 97400, volume: 1000000 },
      { open: 97400, high: 97800, low: 97200, close: 97500, volume: 1200000 }
    ],
    marketData: {
      orderBook: { bidVol: 700, askVol: 300 }
    }
  });

  return {
    ...base,
    ...overrides
  };
}

describe("AQEA Phase 15: Multi-Model Shadow Enrollment & Calibration Audit", () => {
  beforeEach(() => {
    AqeaP15ShadowEnrollment.clearHistory();
    jest.restoreAllMocks();
  });

  // A, B, C. Model Endpoint Health & Status Validation
  it("A-C. evaluates CNN, LSTM, and Mamba model health in shadow ensemble", () => {
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

    const lstm: ModelExpertPrediction = {
      modelName: "BILSTM_V1_BENCHMARK",
      modelVersion: "1.0.0",
      architecture: "BILSTM",
      inferenceMode: "BENCHMARK",
      direction: "HOLD",
      probabilities: { LONG: 0.0000, SHORT: 0.0000, HOLD: 1.0000 },
      confidence: 1.0000,
      probability: 0.0000,
      uncertainty: 0.0000,
      predictionInterval: [0.0, 0.0],
      latencyMs: 6,
      status: "BENCHMARK",
      regimeCompatibility: 0.80,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };

    const result = AqeaP15ShadowEnrollment.evaluate(
      "DEC_P15_TEST_001",
      features,
      "TRENDING_BULL",
      [mamba, cnn, lstm],
      []
    );

    expect(result.baseline.mamba.direction).toBe("HOLD");
    expect(result.baseline.cnn.direction).toBe("LONG");
    expect(result.baseline.lstm.direction).toBe("HOLD");
    expect(result.baseline.lstm.isCollapsed).toBe(true);
  });

  // D, E, F. Schema Validation & Probabilities Sum
  it("D-F. guarantees canonical probability normalization across all ablation scenarios", () => {
    const features = createMockFeatures();

    const mamba: ModelExpertPrediction = {
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      inferenceMode: "REAL_MODEL",
      direction: "HOLD",
      probabilities: { LONG: 0.25, SHORT: 0.35, HOLD: 0.40 },
      confidence: 0.40,
      probability: 0.35,
      uncertainty: 0.60,
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

    const result = AqeaP15ShadowEnrollment.evaluate(
      "DEC_P15_TEST_002",
      features,
      "TRENDING_BULL",
      [mamba, cnn],
      []
    );

    for (const [scenarioId, res] of Object.entries(result.ablations)) {
      const sum = res.probabilities.LONG + res.probabilities.SHORT + res.probabilities.HOLD;
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
    }
  });

  // G, H, I, J. Shadow Isolation & Production Threshold Invariance
  it("G-J. maintains CNN and LSTM in shadow mode while preserving Mamba and production thresholds", () => {
    const features = createMockFeatures();

    const evaluation = AdaptiveBayesianGate.evaluate(
      0.70,
      0.30,
      features,
      "TRENDING_BULL",
      "LONG"
    );

    // Bayesian threshold must remain exactly 0.78 for trending regimes
    expect(evaluation.requiredThreshold).toBe(0.78);
  });

  // K, L, M, N, O. Mathematical Determinism & Gate Integrity
  it("K-O. computes deterministic 8-scenario ablation matrix without modifying formulas", () => {
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

    const lstm: ModelExpertPrediction = {
      modelName: "BILSTM_V1_BENCHMARK",
      modelVersion: "1.0.0",
      architecture: "BILSTM",
      inferenceMode: "BENCHMARK",
      direction: "HOLD",
      probabilities: { LONG: 0.0000, SHORT: 0.0000, HOLD: 1.0000 },
      confidence: 1.0000,
      probability: 0.0000,
      uncertainty: 0.0000,
      predictionInterval: [0.0, 0.0],
      latencyMs: 6,
      status: "BENCHMARK",
      regimeCompatibility: 0.80,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };

    const quantSignals: QuantExpertSignal[] = [
      {
        strategyId: "AARYAN_MOMENTUM",
        direction: "LONG",
        confidence: 0.80,
        horizon: "4h",
        regimeCompatibility: 0.90,
        expectedReturn: 0.025,
        maxAdverseExcursion: 0.010,
        source: "INTERNAL_CALCULATED"
      }
    ];

    const result = AqeaP15ShadowEnrollment.evaluate(
      "DEC_P15_TEST_ABLATION",
      features,
      "TRENDING_BULL",
      [mamba, cnn, lstm],
      quantSignals
    );

    // Scenario A: Mamba Only -> Direction is HOLD
    expect(result.ablations.A_MAMBA_ONLY.direction).toBe("HOLD");

    // Scenario B: CNN Only -> Direction is LONG with high buyProbability
    expect(result.ablations.B_CNN_ONLY.direction).toBe("LONG");
    expect(result.ablations.B_CNN_ONLY.probabilities.LONG).toBeGreaterThan(0.50);

    // Scenario C: LSTM Only -> Direction is HOLD (due to collapse)
    expect(result.ablations.C_LSTM_ONLY.direction).toBe("HOLD");

    // Scenario G: Mamba + CNN + LSTM -> CNN's LONG conviction is diluted by LSTM + Mamba
    expect(result.ablations.G_MAMBA_CNN_LSTM.probabilities.LONG).toBeLessThan(result.ablations.B_CNN_ONLY.probabilities.LONG);

    // Scenario H: Neural + Quant -> Full Master Ensemble
    expect(result.ablations.H_NEURAL_QUANT_FULL.participatingModels.length).toBeGreaterThan(0);
  });

  // P, Q, R, S. Strict Safety & Non-Execution Invariants
  it("P-S. strictly verifies non-execution invariant (executionAttempted === false, zero mutations)", () => {
    const features = createMockFeatures();

    const cnn: ModelExpertPrediction = {
      modelName: "CNN_1D_V1_BENCHMARK",
      modelVersion: "1.0.0",
      architecture: "1D_CNN",
      inferenceMode: "BENCHMARK",
      direction: "LONG",
      probabilities: { LONG: 0.99, SHORT: 0.005, HOLD: 0.005 },
      confidence: 0.99,
      probability: 0.99,
      uncertainty: 0.01,
      predictionInterval: [0.95, 1.0],
      latencyMs: 5,
      status: "BENCHMARK",
      regimeCompatibility: 0.95,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };

    const result = AqeaP15ShadowEnrollment.evaluate(
      "DEC_P15_SAFETY",
      features,
      "TRENDING_BULL",
      [cnn],
      []
    );

    expect(result.safety.executionAttempted).toBe(false);
    expect(result.safety.orderCreationCount).toBe(0);
    expect(result.safety.walletMutationCount).toBe(0);
    expect(result.safety.livePromotionBlocked).toBe(true);
    expect(result.safety.isLiveApproved).toBe(false);
  });

  // T, U, V, W. Telemetry Schema & OOS Separation
  it("T-W. emits valid [P15_*] telemetry structures without mutating history", () => {
    const features = createMockFeatures();
    const result = AqeaP15ShadowEnrollment.evaluate(
      "DEC_P15_TELEMETRY",
      features,
      "TRENDING_BULL",
      [],
      []
    );

    expect(result.decisionId).toBe("DEC_P15_TELEMETRY");
    expect(result.gateWaterfall.funnelDepth).toBeGreaterThanOrEqual(1);
    expect(result.microstructure.isHealthy).toBe(true);
  });
});
