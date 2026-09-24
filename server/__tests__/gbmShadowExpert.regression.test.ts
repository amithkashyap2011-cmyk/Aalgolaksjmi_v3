/*
 * Regression (2026-09-24): the gradient-boosted model runs SHADOW-only.
 * The inference bridge stamps successful inferences PRODUCTION; the expert
 * must override that, or a shadow model would silently gain a live vote.
 */
import { jest } from "@jest/globals";
import { GBMTreesExpert } from "../src/services/aqea/ai/experts/GBMTreesExpert.js";
import { ModelInferenceBridge } from "../src/services/aqea/ai/ModelInferenceBridge.js";
import { UnifiedEnsembleFusion } from "../src/services/aqea/ensemble/UnifiedEnsembleFusion.js";
import { ModernModelRegistry } from "../src/services/aqea/ai/ModernModelRegistry.js";

const realPrediction = (overrides: any = {}) => ({
  modelName: "GBM_TREES_V1", modelVersion: "1.0.0", architecture: "GRADIENT_BOOSTED_TREES",
  inferenceMode: "REAL_MODEL", status: "PRODUCTION", direction: "LONG",
  probabilities: { LONG: 0.9, SHORT: 0.05, HOLD: 0.05 }, confidence: 0.9, probability: 0.9,
  uncertainty: 0.1, predictionInterval: [0, 1], latencyMs: 1, regimeCompatibility: 0.7,
  featureVersion: 2, isTrained: true, timestamp: Date.now(), ...overrides,
});

afterEach(() => jest.restoreAllMocks());

test("a successful inference stays SHADOW even though the bridge stamps PRODUCTION", async () => {
  jest.spyOn(ModelInferenceBridge, "executeRemoteInference").mockResolvedValue(realPrediction() as any);
  const pred = await new GBMTreesExpert().predict({ symbol: "BTCUSDT", ohlcv: { close: 1 } } as any, "TRENDING_BULL" as any);
  expect(pred.status).toBe("SHADOW");
  expect((UnifiedEnsembleFusion as any).isEligibleForLiveVoting(pred)).toBe(false);
});

test("it is registered with the modern experts, as SHADOW", () => {
  (ModernModelRegistry as any).initialize();
  const e = ModernModelRegistry.getExpert("GBM_TREES_V1");
  expect(e).toBeDefined();
  expect(e!.status).toBe("SHADOW");
});
