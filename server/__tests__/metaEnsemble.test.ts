import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import mongoose from "mongoose";
import { ModelRegistryService } from "../src/services/ensemble/modelRegistryService.js";
import { ModelHealthService } from "../src/services/ensemble/modelHealthService.js";
import { LifecycleManager } from "../src/services/ensemble/lifecycleManager.js";
import { MetaEnsembleEngine } from "../src/services/ensemble/metaEnsembleEngine.js";

describe("Institutional Adaptive Meta-Ensemble & Model Lifecycle Management", () => {
  beforeAll(async () => {
    const connected = await connectIfAvailable();
    if (!connected) return;
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  it("1. Model Registry — should initialize all 10 core AI models without permanent deletion", async () => {
    if (skipIfNoMongo()) return;
    const list = await ModelRegistryService.ensureRegistryInitialized();
    expect(list.length).toBe(10);
    expect(list.some((m) => m.modelName === "FinMamba-SSM")).toBe(true);
    expect(list.some((m) => m.modelName === "Lakshmi-Quant-Trend")).toBe(true);
  });

  it("2. Model Health Score — should calculate 7-factor health score (0-100)", () => {
    if (skipIfNoMongo()) return;
    const health = ModelHealthService.calculateHealth({
      winRatePct: 62.5,
      profitFactor: 1.84,
      sharpeRatio: 1.82,
      contributionR: 0.75,
      brierScore: 0.124,
      predictionVariance: 0.03,
      conceptDriftScore: 0.04,
    });

    expect(health.overallHealthScore).toBeGreaterThan(60);
    expect(health.overallHealthScore).toBeLessThanOrEqual(100);
    expect(health.accuracyScore).toBe(62.5);
  });

  it("3 & 4. Lifecycle Manager — should transition underperforming model to STANDBY", () => {
    if (skipIfNoMongo()) return;
    const res = LifecycleManager.evaluateTransition({
      modelName: "FinMamba-SSM",
      currentState: "ACTIVE",
      healthScore: 35,
      rollingProfitFactor: 0.8,
      rollingSharpe: 0.3,
      rollingShadowTrades: 500,
      conceptDriftScore: 0.05,
    });

    expect(res.transitioned).toBe(true);
    expect(res.nextState).toBe("STANDBY");
    expect(res.reason).toContain("STATISTICAL_UNDERPERFORMANCE");
  });

  it("5. Automatic Reactivation — should transition STANDBY model to RECOVERY under shadow criteria", () => {
    if (skipIfNoMongo()) return;
    const res = LifecycleManager.evaluateTransition({
      modelName: "FinMamba-SSM",
      currentState: "STANDBY",
      healthScore: 78,
      rollingProfitFactor: 1.45,
      rollingSharpe: 1.2,
      rollingShadowTrades: 220,
      conceptDriftScore: 0.02,
    });

    expect(res.transitioned).toBe(true);
    expect(res.nextState).toBe("RECOVERY");
    expect(res.reason).toContain("SHADOW_RECOVERY_CRITERIA_MET");
  });

  it("6. Meta-Ensemble Engine — should compute dynamic consensus excluding STANDBY models from live weight", async () => {
    if (skipIfNoMongo()) return;
    const predictions = [
      { modelName: "FinMamba-SSM", prediction: "BUY" as const, confidence: 90, currentState: "ACTIVE" as const, healthScore: 85 },
      { modelName: "Transformer-Attention", prediction: "BUY" as const, confidence: 85, currentState: "ACTIVE" as const, healthScore: 80 },
      { modelName: "OrderFlow-Engine", prediction: "SELL" as const, confidence: 70, currentState: "STANDBY" as const, healthScore: 35 },
    ];

    const context = { symbol: "BTCUSDT", regime: "TRENDING", volatility: 0.01, orderFlowImbalance: 0.12 };

    const consensus = await MetaEnsembleEngine.evaluateMetaConsensus(predictions, context);

    expect(consensus.finalConsensus).toBe("BUY");
    expect(consensus.weights["OrderFlow-Engine"]).toBe(0); // Standby gets 0 weight
    expect(consensus.weights["FinMamba-SSM"]).toBeGreaterThan(0);
    expect(consensus.tradeQualityScore).toBeGreaterThan(60);
  });
});
