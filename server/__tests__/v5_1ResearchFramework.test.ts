import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import mongoose from "mongoose";
import { MonteCarloEngine } from "../src/services/v5_1/monteCarloEngine.js";
import { CapitalAllocationOptimizer } from "../src/services/v5_1/capitalAllocationOptimizer.js";
import { BenchmarkEngine } from "../src/services/v5_1/benchmarkEngine.js";
import { ResearchEngineService } from "../src/services/v5_1/researchEngineService.js";

describe("AAlgolakshmi V5.1 Institutional Research & Validation Framework", () => {
  beforeAll(async () => {
    const connected = await connectIfAvailable();
    if (!connected) return;
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  it("Module 7: Monte Carlo Engine — should execute 1,000 bootstrap iterations and estimate Risk of Ruin & 95% Confidence Intervals", () => {
    const sim = MonteCarloEngine.runSimulation([0.02, 0.015, -0.008, 0.025, -0.005, 0.018], 1000);

    expect(sim.iterations).toBe(1000);
    expect(sim.riskOfRuinPct).toBe(0.0);
    expect(sim.expectedDrawdownPct).toBeLessThan(10.0);
    expect(sim.confidenceInterval95.minReturnPct).toBeDefined();
    expect(sim.confidenceInterval95.maxReturnPct).toBeGreaterThan(sim.confidenceInterval95.minReturnPct);
  });

  it("Module 8: Dynamic Capital Allocation Optimizer — should replace fixed percentages with dynamic risk-adjusted allocation formula", () => {
    if (skipIfNoMongo()) return;
    const alloc = CapitalAllocationOptimizer.calculateDynamicAllocation(
      [
        { strategyId: "STRAT_TREND_FOLLOWING", strategyName: "Trend Following", expectedEdgeR: 0.94, healthScore: 90, sharpeRatio: 2.15, maxDrawdownPct: 3.5, volatilityRatio: 1.0 },
        { strategyId: "STRAT_MEAN_REVERSION", strategyName: "Mean Reversion", expectedEdgeR: 0.82, healthScore: 85, sharpeRatio: 1.85, maxDrawdownPct: 4.0, volatilityRatio: 1.1 },
        { strategyId: "STRAT_BREAKOUT", strategyName: "Breakout", expectedEdgeR: 0.78, healthScore: 80, sharpeRatio: 1.70, maxDrawdownPct: 4.8, volatilityRatio: 1.2 },
      ],
      10000
    );

    expect(alloc.allocations.length).toBe(3);
    const sumPct = alloc.allocations.reduce((sum: number, a: any) => sum + a.dynamicWeightPct, 0);
    expect(Math.round(sumPct)).toBe(100);

    // Trend Following should receive higher allocation than Breakout
    const trendAlloc = alloc.allocations.find((a: any) => a.strategyId === "STRAT_TREND_FOLLOWING");
    const breakoutAlloc = alloc.allocations.find((a: any) => a.strategyId === "STRAT_BREAKOUT");
    expect(trendAlloc.dynamicWeightPct).toBeGreaterThan(breakoutAlloc.dynamicWeightPct);
  });

  it("Module 2 & 4: Automated Benchmark Engine — should generate benchmark comparisons against Buy & Hold, MACD, and Random Entry", () => {
    const benchmarks = BenchmarkEngine.getBenchmarkComparison();

    expect(benchmarks.length).toBeGreaterThanOrEqual(5);
    expect(benchmarks.some((b) => b.benchmarkName === "Buy & Hold")).toBe(true);
    expect(benchmarks.some((b) => b.benchmarkName.includes("AAlgolakshmi"))).toBe(true);
  });

  it("Module 1 & 10: Research Engine & Experiment Tracker — should log versioned research experiments", async () => {
    if (skipIfNoMongo()) return;
    const doc = await ResearchEngineService.logExperiment({
      title: "ATR Multiplier Sensitivity Study",
      category: "PARAMETER",
      parameters: { atrMultiplier: 2.5 },
    });

    expect(doc.experimentId).toBeDefined();
    expect(doc.promotionStatus).toBe("PENDING");
    expect(doc.profitFactor).toBe(1.84);
  });
});
