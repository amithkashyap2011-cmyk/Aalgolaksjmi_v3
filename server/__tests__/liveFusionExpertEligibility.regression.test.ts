/**
 * Live fusion expert eligibility (2026-09-23).
 *
 * The CNN is the only expert with a real training pipeline and a measured
 * forward edge, so it must vote in UnifiedEnsembleFusion. The Mamba checkpoint
 * is untrained and must stay shadow-only even though the inference bridge
 * stamps every successful response PRODUCTION.
 */

import { describe, it, expect, afterEach, jest } from "@jest/globals";

import { ModelInferenceBridge } from "../src/services/aqea/ai/ModelInferenceBridge.js";
import { BenchmarkCNNExpert } from "../src/services/aqea/ai/experts/BenchmarkCNNExpert.js";
import { MambaExpert } from "../src/services/aqea/ai/experts/MambaExpert.js";
import { ModelExpertPrediction } from "../src/services/aqea/ai/IModelExpert.js";
import { UnifiedEnsembleFusion } from "../src/services/aqea/ensemble/UnifiedEnsembleFusion.js";
import { DEFAULT_FORWARD_LEARNING_CANDIDATES } from "../src/services/aqea/ensemble/ForwardLearningPipeline.js";

function bridgeResult(modelName: string, overrides: Partial<ModelExpertPrediction> = {}): ModelExpertPrediction {
  return {
    modelName,
    modelVersion: "1.0.0",
    architecture: "TEST_ARCH",
    inferenceMode: "REAL_MODEL",
    direction: "LONG",
    probabilities: { LONG: 0.7, SHORT: 0.1, HOLD: 0.2 },
    confidence: 0.7,
    probability: 0.7,
    uncertainty: 0.3,
    predictionInterval: [0.2, 0.8],
    latencyMs: 5,
    status: "PRODUCTION",
    regimeCompatibility: 0,
    featureVersion: 2,
    isTrained: true,
    timestamp: Date.now(),
    ...overrides,
  };
}

const features: any = { symbol: "BTCUSDT", tensorVector: new Array(15).fill(0.1) };

describe("Live fusion expert eligibility", () => {
  afterEach(() => jest.restoreAllMocks());

  it("CNN expert emits a PRODUCTION REAL_MODEL prediction on successful inference", async () => {
    jest.spyOn(ModelInferenceBridge, "executeRemoteInference")
      .mockResolvedValue(bridgeResult("CNN_1D_V1_BENCHMARK"));

    const pred = await new BenchmarkCNNExpert().predict(features, "TRENDING_BULL");

    expect(pred.inferenceMode).toBe("REAL_MODEL");
    expect(pred.status).toBe("PRODUCTION");
  });

  it("CNN expert keeps a failed inference DISABLED so it cannot vote", async () => {
    jest.spyOn(ModelInferenceBridge, "executeRemoteInference")
      .mockResolvedValue(bridgeResult("CNN_1D_V1_BENCHMARK", {
        inferenceMode: "UNAVAILABLE",
        status: "DISABLED",
        error: "MODEL_INFERENCE_EXCEPTION: WINDOW_FETCH_FAILED",
      }));

    const pred = await new BenchmarkCNNExpert().predict(features, "TRENDING_BULL");

    expect(pred.inferenceMode).toBe("UNAVAILABLE");
    expect(pred.status).toBe("DISABLED");
  });

  it("Mamba expert downgrades the bridge's PRODUCTION stamp to SHADOW", async () => {
    jest.spyOn(ModelInferenceBridge, "executeRemoteInference")
      .mockResolvedValue(bridgeResult("MAMBA_RESEARCH_V1"));

    const pred = await new MambaExpert().predict(features, "TRENDING_BULL");

    expect(pred.inferenceMode).toBe("REAL_MODEL");
    expect(pred.status).toBe("SHADOW");
  });

  it("fusion counts the CNN as a live voter and Mamba as shadow", async () => {
    jest.spyOn(ModelInferenceBridge, "executeRemoteInference")
      .mockImplementation(async (params: any) => bridgeResult(params.modelName));

    const preds = [
      await new BenchmarkCNNExpert().predict(features, "TRENDING_BULL"),
      await new MambaExpert().predict(features, "TRENDING_BULL"),
    ];
    const result = UnifiedEnsembleFusion.fuse(
      preds,
      [],
      { score: 0, confidence: 0, classification: "NEUTRAL" },
      "TRENDING_BULL",
      { atrPercent: 1.0, tpMultiplier: 2.0, slMultiplier: 1.5 },
    );

    expect(result.participatingModels).toContain("CNN_1D_V1_BENCHMARK");
    expect(result.participatingModels).not.toContain("MAMBA_RESEARCH_V1");
    expect(result.shadowModels).toContain("MAMBA_RESEARCH_V1");
    expect(result.modelWeights.find(w => w.modelName === "CNN_1D_V1_BENCHMARK")?.normalizedWeight).toBeGreaterThan(0);
  });

  it("forward learning tracks the live CNN voter, not the shadow Mamba", () => {
    expect(DEFAULT_FORWARD_LEARNING_CANDIDATES).toContain("CNN_1D_V1_BENCHMARK");
    expect(DEFAULT_FORWARD_LEARNING_CANDIDATES).not.toContain("MAMBA_RESEARCH_V1");
  });
});
