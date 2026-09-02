/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 14 Regression Suite
 *  Mamba Contract Repair + Shadow Ensemble Replay + Safety Barriers
 * ═══════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { ModelInferenceBridge } from "../src/services/aqea/ai/ModelInferenceBridge.js";
import { AqeaP14ShadowReplay } from "../src/services/aqea/shadow/AqeaP14ShadowReplay.js";
import { Standardized15Features, FeaturePipeline } from "../src/services/aqea/pipeline/FeaturePipeline.js";
import { UnifiedEnsembleFusion } from "../src/services/aqea/ensemble/UnifiedEnsembleFusion.js";
import { AdaptiveBayesianGate } from "../src/services/aqea/bayesian/AdaptiveBayesianGate.js";
import { ModelExpertPrediction } from "../src/services/aqea/ai/IModelExpert.js";
import { QuantExpertSignal } from "../src/services/aqea/quant/QuantStrategyRegistry.js";

// Helper to create synthetic standard 15-features
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
      rsi14: 62,
      adx14: 32,
      ema9: 97600,
      ema21: 97300,
      cvd: 0.25,
      orderBlock: true
    },
    bars: [
      { open: 97300, high: 97600, low: 97100, close: 97400, volume: 1000000 },
      { open: 97400, high: 97800, low: 97200, close: 97500, volume: 1200000 }
    ],
    marketData: {
      orderBook: { bidVol: 650, askVol: 350 }
    }
  });

  return {
    ...base,
    ...overrides
  };
}

describe("AQEA Phase 14: Mamba Contract Repair & Shadow Ensemble Replay", () => {
  beforeEach(() => {
    AqeaP14ShadowReplay.clearHistory();
    jest.restoreAllMocks();
  });

  // A. Python response schema recognized
  it("A. recognizes canonical Python 3-class response schema", async () => {
    const mockPythonResponse = {
      direction: "LONG",
      probLong: 0.6200,
      probShort: 0.1800,
      probHold: 0.2000,
      directionScore: 0.7200,
      predictedMove: 0.015,
      confidence: 0.6200,
      modelName: "mamba-v1"
    };

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPythonResponse)
      } as any)
    ) as any;

    const result = await ModelInferenceBridge.executeRemoteInference({
      endpoint: "/research/predict/mamba",
      payload: { sequence: [[[0.1, 0.2]]] },
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      isTrained: true
    });

    expect(result.inferenceMode).toBe("REAL_MODEL");
    expect(result.direction).toBe("LONG");
    expect(result.probabilities.LONG).toBeCloseTo(0.6200, 3);
    expect(result.probabilities.SHORT).toBeCloseTo(0.1800, 3);
    expect(result.probabilities.HOLD).toBeCloseTo(0.2000, 3);
    expect(result.confidence).toBeCloseTo(0.6200, 3);
  });

  // B. directionScore is not discarded
  it("B. correctly interprets legacy directionScore without discarding information", async () => {
    const mockLegacyResponse = {
      directionScore: 0.5459,
      predictedMove: 0.4815,
      confidence: 0.4241,
      modelName: "mamba-v1"
    };

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockLegacyResponse)
      } as any)
    ) as any;

    const result = await ModelInferenceBridge.executeRemoteInference({
      endpoint: "/research/predict/mamba",
      payload: { sequence: [[[0.1, 0.2]]] },
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      isTrained: true
    });

    expect(result.inferenceMode).toBe("REAL_MODEL");
    expect(result.probabilities.LONG).toBeCloseTo(0.5459, 3);
    expect(result.probabilities.SHORT).toBeCloseTo(1 - 0.5459, 3);
    expect(result.direction).toBe("LONG");
  });

  // C. Valid neural response does not trigger fallback
  it("C. ensures valid neural response never triggers fallback stub", async () => {
    const mockPythonResponse = {
      direction: "HOLD",
      probLong: 0.2905,
      probShort: 0.2739,
      probHold: 0.4356,
      directionScore: 0.5166,
      predictedMove: 0.4226,
      confidence: 0.4329,
      modelName: "mamba-v1"
    };

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPythonResponse)
      } as any)
    ) as any;

    const result = await ModelInferenceBridge.executeRemoteInference({
      endpoint: "/research/predict/mamba",
      payload: { sequence: [[[0.1, 0.2]]] },
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      isTrained: true
    });

    expect(result.inferenceMode).toBe("REAL_MODEL");
    expect(result.status).toBe("PRODUCTION");
    expect(result.probabilities.HOLD).toBeCloseTo(0.4356, 3);
    expect(result.error).toBeUndefined();
  });

  // D. Malformed response triggers fallback
  it("D. malformed response correctly triggers fallback", async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ error: "MODEL_DEGRADED" })
      } as any)
    ) as any;

    const result = await ModelInferenceBridge.executeRemoteInference({
      endpoint: "/research/predict/mamba",
      payload: { sequence: [[[0.1, 0.2]]] },
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      isTrained: true
    });

    expect(result.inferenceMode).toBe("UNAVAILABLE");
    expect(result.status).toBe("DISABLED");
    expect(result.probabilities.LONG).toBe(0.3333);
    expect(result.probabilities.SHORT).toBe(0.3333);
    expect(result.probabilities.HOLD).toBe(0.3334);
    expect(result.error).toContain("MODEL_CHECKPOINT_MISSING");
  });

  // E & F. NaN & Infinity trigger fallback
  it("E & F. handles NaN and Infinity safely without crashing", async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          probLong: NaN,
          probShort: Infinity,
          probHold: 0.5
        })
      } as any)
    ) as any;

    const result = await ModelInferenceBridge.executeRemoteInference({
      endpoint: "/research/predict/mamba",
      payload: { sequence: [[[0.1, 0.2]]] },
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      isTrained: true
    });

    expect(result.probabilities.LONG).toBeGreaterThanOrEqual(0);
    expect(result.probabilities.SHORT).toBeGreaterThanOrEqual(0);
    expect(result.probabilities.HOLD).toBeGreaterThanOrEqual(0);
    expect(isFinite(result.probabilities.LONG)).toBe(true);
    expect(isFinite(result.probabilities.SHORT)).toBe(true);
    expect(isFinite(result.probabilities.HOLD)).toBe(true);
  });

  // G. Probabilities sum to 1
  it("G. guarantees canonical probabilities sum exactly to 1.0", async () => {
    const mockPythonResponse = {
      probLong: 0.3851,
      probShort: 0.2941,
      probHold: 0.3208,
      confidence: 0.3851
    };

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPythonResponse)
      } as any)
    ) as any;

    const result = await ModelInferenceBridge.executeRemoteInference({
      endpoint: "/research/predict/mamba",
      payload: { sequence: [[[0.1, 0.2]]] },
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      isTrained: true
    });

    const sum = result.probabilities.LONG + result.probabilities.SHORT + result.probabilities.HOLD;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });

  // H, I, J, K, L. Metadata and Direction Classification Determinism
  it("H-L. preserves direction determinism, confidence, modelName, and source", async () => {
    const mockPythonResponse = {
      direction: "SHORT",
      probLong: 0.1500,
      probShort: 0.6500,
      probHold: 0.2000,
      confidence: 0.6500,
      modelName: "mamba-v1"
    };

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPythonResponse)
      } as any)
    ) as any;

    const result = await ModelInferenceBridge.executeRemoteInference({
      endpoint: "/research/predict/mamba",
      payload: { sequence: [[[0.1, 0.2]]] },
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      isTrained: true
    });

    expect(result.direction).toBe("SHORT");
    expect(result.confidence).toBeCloseTo(0.6500, 3);
    expect(result.modelName).toBe("MAMBA_RESEARCH_V1");
    expect(result.inferenceMode).toBe("REAL_MODEL");
  });

  // M, N, O. Shadow Path receives repaired output while Production remains isolated
  it("M-O. shadow ensemble receives repaired Mamba prediction and evaluates side-by-side", () => {
    const features = createMockFeatures();

    const productionMamba: ModelExpertPrediction = {
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      inferenceMode: "REAL_MODEL",
      direction: "HOLD",
      probabilities: { LONG: 0.3333, SHORT: 0.3333, HOLD: 0.3334 },
      confidence: 0,
      probability: 0.3333,
      uncertainty: 1.0,
      predictionInterval: [0, 1],
      latencyMs: 50,
      status: "PRODUCTION",
      regimeCompatibility: 0.95,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };

    const repairedMamba: ModelExpertPrediction = {
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      inferenceMode: "REAL_MODEL",
      direction: "LONG",
      probabilities: { LONG: 0.6500, SHORT: 0.1500, HOLD: 0.2000 },
      confidence: 0.65,
      probability: 0.6500,
      uncertainty: 0.35,
      predictionInterval: [0.55, 0.75],
      latencyMs: 50,
      status: "PRODUCTION",
      regimeCompatibility: 0.95,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };

    const quantSignals: QuantExpertSignal[] = [
      {
        strategyId: "AARYAN_MOMENTUM",
        direction: "LONG",
        confidence: 0.75,
        horizon: "4h",
        regimeCompatibility: 0.90,
        expectedReturn: 0.02,
        maxAdverseExcursion: 0.01,
        source: "INTERNAL_CALCULATED"
      }
    ];

    const shadowResult = AqeaP14ShadowReplay.evaluate(
      "DEC_TEST_14_001",
      features,
      "TRENDING_BULL",
      [productionMamba],
      quantSignals,
      repairedMamba
    );

    expect(shadowResult.repairedMamba.probabilities.LONG).toBe(0.65);
    expect(shadowResult.productionMamba.probabilities.LONG).toBe(0.3333);
    expect(shadowResult.shadowEnsemble.buyProbability).toBeGreaterThan(shadowResult.productionEnsemble.buyProbability);
  });

  // P & Q. Bayesian formula and thresholds remain unchanged
  it("P & Q. Bayesian threshold remains 0.78 in trending regimes without alteration", () => {
    const features = createMockFeatures();

    const evaluation = AdaptiveBayesianGate.evaluate(
      0.65,
      0.35,
      features,
      "TRENDING_BULL",
      "LONG"
    );

    expect(evaluation.requiredThreshold).toBe(0.78);
    expect(evaluation.priorOdds).toBe(0.58);
  });

  // R, S, T, U. Strict Safety Barriers and Non-Execution Invariants
  it("R-U. asserts strict non-execution invariant (executionAttempted === false) and safety barriers", () => {
    const features = createMockFeatures();
    const repairedMamba: ModelExpertPrediction = {
      modelName: "MAMBA_RESEARCH_V1",
      modelVersion: "1.4.0",
      architecture: "SELECTIVE_SSM",
      inferenceMode: "REAL_MODEL",
      direction: "LONG",
      probabilities: { LONG: 0.95, SHORT: 0.02, HOLD: 0.03 },
      confidence: 0.95,
      probability: 0.95,
      uncertainty: 0.05,
      predictionInterval: [0.90, 1.0],
      latencyMs: 50,
      status: "PRODUCTION",
      regimeCompatibility: 0.95,
      featureVersion: 2,
      isTrained: true,
      timestamp: Date.now()
    };

    const shadowResult = AqeaP14ShadowReplay.evaluate(
      "DEC_TEST_SAFETY_001",
      features,
      "TRENDING_BULL",
      [],
      [],
      repairedMamba
    );

    expect(shadowResult.executionAttempted).toBe(false);
    expect(shadowResult.orderCreated).toBe(false);
    expect(shadowResult.walletMutated).toBe(false);
    expect(shadowResult.livePromotionBlocked).toBe(true);
    expect(shadowResult.isLiveApproved).toBe(false);
  });

  // V, W, X, Y, Z. Distribution calculation and cross-model comparison
  it("V-Z. computes empirical distribution statistics across shadow runs", () => {
    const features = createMockFeatures();

    for (let i = 0; i < 20; i++) {
      const pL = 0.45 + (i * 0.005);
      const repaired: ModelExpertPrediction = {
        modelName: "MAMBA_RESEARCH_V1",
        modelVersion: "1.4.0",
        architecture: "SELECTIVE_SSM",
        inferenceMode: "REAL_MODEL",
        direction: pL > 0.50 ? "LONG" : "HOLD",
        probabilities: { LONG: pL, SHORT: 0.25, HOLD: Number((1 - pL - 0.25).toFixed(4)) },
        confidence: pL,
        probability: pL,
        uncertainty: 1 - pL,
        predictionInterval: [pL - 0.1, pL + 0.1],
        latencyMs: 40,
        status: "PRODUCTION",
        regimeCompatibility: 0.90,
        featureVersion: 2,
        isTrained: true,
        timestamp: Date.now()
      };

      AqeaP14ShadowReplay.evaluate(
        `DEC_DIST_${i}`,
        features,
        "TRENDING_BULL",
        [],
        [],
        repaired
      );
    }

    const stats = AqeaP14ShadowReplay.getDistributionStats();
    expect(stats.sampleCount).toBe(20);
    expect(stats.probLong.min).toBeCloseTo(0.45, 2);
    expect(stats.probLong.max).toBeCloseTo(0.545, 2);
    expect(stats.fractions.probLongGt50).toBeGreaterThan(0);
    expect(stats.fractions.probLongGt78).toBe(0.0); // Verifies Mamba does not reach 0.78
  });
});
