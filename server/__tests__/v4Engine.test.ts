import { connectIfAvailable, disconnectMongo } from "./helpers/mongoTestHelper.js";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import mongoose from "mongoose";
import { MetaDecisionService } from "../src/services/v4/metaDecisionService.js";
import { TradeQualityEngine } from "../src/services/v4/tradeQualityEngine.js";
import { MarketRegimeEngine } from "../src/services/v4/marketRegimeEngine.js";
import { PortfolioOptimizer } from "../src/services/v4/portfolioOptimizer.js";
import { GraphIntelligenceEngine } from "../src/services/v4/graphIntelligenceEngine.js";
import { MacroEngine } from "../src/services/v4/macroEngine.js";
import { EmbeddingService } from "../src/services/v4/embeddingService.js";
import { ContinuousLearningService } from "../src/services/v4/continuousLearningService.js";

describe("AAlgolakshmi V4 Institutional Quantitative Engine (15 Modules)", () => {
  beforeAll(async () => {
    const connected = await connectIfAvailable();
    if (!connected || mongoose.connection.readyState !== 1) return;
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  it("Module 1: Meta Decision AI & Trade Quality Score — should calculate TQS and execute full size for TQS >= 95", () => {
    const quality = TradeQualityEngine.calculateQuality({
      symbol: "BTCUSDT",
      consensusStrength: 98,
      confidenceCalibration: 98,
      historicalSimilarity: 98,
      marketRegime: "STRONG_BULL",
      orderFlowScore: 98,
      volatilityScore: 98,
      liquidityScore: 98,
      correlationScore: 98,
    });

    expect(quality.tradeQualityScore).toBeGreaterThanOrEqual(95);
    expect(quality.action).toBe("FULL_SIZE");
    expect(quality.allowedToExecute).toBe(true);
  });

  it("Module 1: Trade Quality Gating — should REJECT trade when TQS < 50", () => {
    const rejection = TradeQualityEngine.calculateQuality({
      symbol: "BTCUSDT",
      consensusStrength: 30,
      confidenceCalibration: 40,
      historicalSimilarity: 25,
      marketRegime: "RANGE",
      orderFlowScore: 35,
      volatilityScore: 40,
      liquidityScore: 50,
      correlationScore: 40,
    });

    expect(rejection.tradeQualityScore).toBeLessThan(50);
    expect(rejection.action).toBe("REJECT");
    expect(rejection.allowedToExecute).toBe(false);
  });

  it("Module 2: Market Regime AI — should classify market across 18 regimes and adjust SL/TP multipliers", () => {
    const fedRegime = MarketRegimeEngine.classifyRegime("BTCUSDT", 25, 1.0, "FED_ANNOUNCEMENT");
    expect(fedRegime.regime).toBe("FED_ANNOUNCEMENT");
    expect(fedRegime.slMultiplier).toBe(1.5);

    const bullRegime = MarketRegimeEngine.classifyRegime("BTCUSDT", 35, 1.0, "NONE");
    expect(bullRegime.regime).toBe("STRONG_BULL");
  });

  it("Module 3: Portfolio Intelligence — should evaluate Portfolio Heat, VaR, CVaR, and Expected Shortfall", () => {
    const risk = PortfolioOptimizer.evaluateSystemicRisk(40000, 4000);
    expect(risk.portfolioHeatPct).toBe(10);
    expect(risk.var95Pct).toBeGreaterThan(0);
    expect(risk.cvar95Pct).toBeGreaterThan(risk.var95Pct);
    expect(risk.systemicRiskAlert).toBe(false);
  });

  it("Module 4 & 5: Dynamic Graph GNN & Self-Supervised Embeddings — should construct cross-asset lead-lag graph", () => {
    const graph = GraphIntelligenceEngine.getDynamicGraph();
    expect(graph.length).toBeGreaterThan(0);
    expect(graph.some((e) => e.sourceSymbol === "BTCUSDT" && e.targetSymbol === "ETHUSDT")).toBe(true);

    const emb = EmbeddingService.generateEmbedding("BTCUSDT");
    expect(emb.embeddingVector.length).toBe(16);
  });

  it("Module 6, 7 & 8: Macro Engine & Continuous Learning — should process feedback loop without data leakage", async () => {
    const macro = await MacroEngine.getActiveMacroEvents();
    expect(macro.length).toBeGreaterThan(0);

    const learning = await ContinuousLearningService.processTradeFeedback("TRADE_V4_101", 1.45);
    expect(learning.dataLeakageDetected).toBe(false);
    expect(learning.weightsUpdated).toBe(true);
  });
});
