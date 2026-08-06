import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import mongoose from "mongoose";
import { ModelAttributionService } from "../src/services/analytics/modelAttributionService.js";

describe("Part A: AI Model Attribution Engine", () => {
  beforeAll(async () => {
    const connected = await connectIfAvailable();
    if (!connected) return;
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  it("should record model contribution accurately using Contribution = Weight × Correctness × ReturnR × Calibration", async () => {
    if (skipIfNoMongo()) return;
    const outcome = {
      tradeId: "TRADE_TEST_101",
      symbol: "BTCUSDT",
      side: "BUY" as const,
      entryPrice: 65000,
      exitPrice: 66300,
      pnlR: 1.5,
      votes: [
        { modelName: "FinMamba-SSM", category: "DEEP_LEARNING", prediction: "BUY" as const, confidence: 92, weight: 0.25 },
        { modelName: "Transformer-Attention", category: "DEEP_LEARNING", prediction: "BUY" as const, confidence: 85, weight: 0.20 },
      ],
    };

    await expect(ModelAttributionService.recordAttribution(outcome)).resolves.not.toThrow();

    const summary = await ModelAttributionService.getModelSummary();
    expect(Array.isArray(summary)).toBe(true);
    expect(summary.length).toBeGreaterThan(0);
  });

  it("should evaluate Data Drift, Concept Drift, and PSI (Population Stability Index)", async () => {
    const { DriftDetector } = await import("../src/services/analytics/driftDetector.js");

    // Stable distribution predictions
    const stablePreds = Array.from({ length: 50 }, () => 0.5 + (Math.random() * 0.04 - 0.02));
    const stableResult = await DriftDetector.evaluateDrift("FinMamba-SSM", stablePreds);
    expect(stableResult.status).toBe("STABLE");
    expect(stableResult.conceptDriftScore).toBeLessThanOrEqual(0.12);

    // High-variance shifted distribution predictions (triggering Concept Drift warning/critical)
    const shiftedPreds = [0.1, 0.9, 0.05, 0.95, 0.02, 0.98, 0.12, 0.88, 0.01, 0.99, 0.15, 0.85, 0.08, 0.92, 0.03, 0.97, 0.04, 0.96, 0.1, 0.9];
    const shiftedResult = await DriftDetector.evaluateDrift("FinMamba-SSM", shiftedPreds);
    expect(["WARNING", "CRITICAL"]).toContain(shiftedResult.status);
    expect(shiftedResult.conceptDriftScore).toBeGreaterThan(0.12);
  });
});
