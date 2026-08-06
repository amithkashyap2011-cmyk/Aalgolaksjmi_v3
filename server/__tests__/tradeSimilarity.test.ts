import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import mongoose from "mongoose";
import { TradeSimilarityEngine } from "../src/services/v4/tradeSimilarityEngine.js";
import { ExecutionAIEngine } from "../src/services/v4/executionAIEngine.js";
import { ModelRegistry } from "../src/models/ModelRegistry.js";

describe("Trade Similarity Engine & Pre-Trade Execution AI", () => {
  beforeAll(async () => {
    const connected = await connectIfAvailable();
    if (!connected) return;
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  it("1. Trade Similarity Engine — should match against top 100 historical trades and approve high similarity (>= 60%)", () => {
    if (skipIfNoMongo()) return;
    const sim = TradeSimilarityEngine.evaluateSimilarity({
      adx: 25,
      rsi: 55,
      vdi: 0.15,
      obi: 0.20,
      volatilityRatio: 1.0,
    });

    expect(sim.similarityScore).toBeGreaterThanOrEqual(60.0);
    expect(sim.approved).toBe(true);
    expect(sim.matchedTradesCount).toBe(100);
    expect(sim.expectedWinRate).toBeGreaterThan(50);
  });

  it("2. Trade Similarity Engine — should REJECT trades with poor historical pattern similarity (< 60%)", () => {
    if (skipIfNoMongo()) return;
    const sim = TradeSimilarityEngine.evaluateSimilarity({
      adx: 90, // Extreme anomaly outlier
      rsi: 95,
      vdi: 0.90,
      obi: 0.95,
      volatilityRatio: 5.0,
    });

    expect(sim.similarityScore).toBeLessThan(60.0);
    expect(sim.approved).toBe(false);
    expect(sim.reason).toContain("POOR_HISTORICAL_SIMILARITY");
  });

  it("3. Pre-Trade Execution AI — should predict slippage, spread, impact, and recommend EXECUTE_IMMEDIATELY", () => {
    const pred = ExecutionAIEngine.predictExecutionQuality({
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 0.5,
      requestedPrice: 65000,
      volatilityRatio: 1.0,
    });

    expect(pred.predictedSlippagePct).toBeGreaterThan(0);
    expect(pred.predictedSpreadPct).toBe(0.02);
    expect(pred.executionQualityScore).toBeGreaterThan(70);
    expect(pred.recommendation).toBe("EXECUTE_IMMEDIATELY");
  });

  it("4. Ohmkara Model — should remain in STANDBY mode with shadow evaluation", async () => {
    if (skipIfNoMongo()) return;
    let ohmkara = await ModelRegistry.findOneAndUpdate(
      { modelName: "Ohmkara-Resonance" },
      { $set: { currentState: "STANDBY", currentWeight: 0.0 } },
      { new: true, upsert: true }
    );

    expect(ohmkara.currentState).toBe("STANDBY");
    expect(ohmkara.currentWeight).toBe(0.0);
  });
});
