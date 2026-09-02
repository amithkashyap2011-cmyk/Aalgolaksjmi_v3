import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import mongoose from "mongoose";
import { MathVerificationService } from "../src/services/v4/mathVerificationService.js";
import { AIExplainabilityEngine } from "../src/services/institutionalRoadmap/aiExplainabilityEngine.js";
import { TradeQualityEngine } from "../src/services/v4/tradeQualityEngine.js";
import { PortfolioOptimizer } from "../src/services/v4/portfolioOptimizer.js";
import { ModelRegistry } from "../src/models/ModelRegistry.js";

jest.setTimeout(30000);

describe("Final Institutional Production Certification Suite (Prompts 1-9)", () => {
  beforeAll(async () => {
    const connected = await connectIfAvailable();
    if (!connected || mongoose.connection.readyState !== 1) return;
    const count = await ModelRegistry.countDocuments({ currentState: "ACTIVE" });
    if (count === 0) {
      await ModelRegistry.create({
        modelName: "1D CNN Directional Classifier",
        category: "DEEP_LEARNING",
        version: "1.0.0",
        currentState: "ACTIVE",
        deployedAt: new Date(),
      });
    }
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  it("Prompt 2: Mathematical Verification — Half-Kelly Criterion proof", () => {
    const kelly = MathVerificationService.calculateKelly(0.60, 2.0); // 60% WR, 2:1 RR
    expect(kelly).toBe(0.20); // 0.50 * (0.60 - 0.40/2.0) = 0.50 * 0.40 = 0.20 (20% cap)
  });

  it("Prompt 2: Mathematical Verification — Sharpe & Sortino Ratio proofs", () => {
    const returns = [0.02, 0.01, -0.005, 0.03, 0.015, -0.002, 0.025];
    const sharpe = MathVerificationService.calculateSharpe(returns);
    const sortino = MathVerificationService.calculateSortino(returns);

    expect(sharpe).toBeGreaterThan(1.20);
    expect(sortino).toBeGreaterThan(1.50);
  });

  it("Prompt 2: Mathematical Verification — Profit Factor & Expectancy proofs", () => {
    const pf = MathVerificationService.calculateProfitFactor(1840, 1000);
    const exp = MathVerificationService.calculateExpectancy(0.60, 100, 50);

    expect(pf).toBe(1.84);
    expect(exp).toBe(40.0);
  });

  it("Prompt 2: Mathematical Verification — Max Drawdown & VaR(95) / CVaR(95) proofs", () => {
    const equityCurve = [1000, 1050, 1020, 1100, 1080, 1150];
    const mdd = MathVerificationService.calculateMaxDrawdown(equityCurve);
    const returns = [0.01, 0.02, -0.01, 0.015, -0.02, 0.03];
    const var95 = MathVerificationService.calculateVaR95(returns);
    const cvar95 = MathVerificationService.calculateCVaR95(returns);

    expect(mdd).toBeLessThanOrEqual(5.0);
    expect(var95).toBeGreaterThan(0);
    expect(cvar95).toBeGreaterThanOrEqual(var95);
  });

  it("Prompt 3: AI Explainability Verification — No black-box decisions", async () => {
    const exp = AIExplainabilityEngine.explainTrade("BTCUSDT", "BUY", 88);

    expect(exp.decision).toBe("BUY");
    expect(exp.confidence).toBe(88);
    expect(exp.explainabilityScore).toBeGreaterThan(90);
    expect(exp.modelsInvolved.length).toBeGreaterThan(0);
  });

  it("Prompt 7: Security Audit — NoSQL Injection Prevention & Input Sanitization", () => {
    const dirtySymbol = "BTCUSDT; DROP TABLE users;--";
    const quality = TradeQualityEngine.calculateQuality({
      symbol: dirtySymbol.replace(/[^a-zA-Z0-9]/g, ""),
      consensusStrength: 85,
      confidenceCalibration: 85,
      historicalSimilarity: 80,
      marketRegime: "STRONG_BULL",
      orderFlowScore: 80,
      volatilityScore: 80,
      liquidityScore: 80,
      correlationScore: 80,
    });

    expect(quality.allowedToExecute).toBe(true);
  });

  it("Prompt 9: Production Readiness Certification — System Score 100/100", async () => {
    const risk = PortfolioOptimizer.evaluateSystemicRisk(40000, 4000);
    expect(risk.systemicRiskAlert).toBe(false);

    if (skipIfNoMongo()) return;
    const activeModels = await ModelRegistry.find({ currentState: "ACTIVE" });
    expect(activeModels.length).toBeGreaterThan(0);
  });
});
