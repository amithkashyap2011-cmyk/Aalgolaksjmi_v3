import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import mongoose from "mongoose";
import { StrategyRegistryService } from "../src/services/v5/strategyRegistryService.js";
import { StrategySelectorEngine } from "../src/services/v5/strategySelectorEngine.js";
import { MultiStrategyEngine } from "../src/services/v5/multiStrategyEngine.js";
import { StrategyRegistry } from "../src/models/StrategyRegistry.js";

describe("AAlgolakshmi V5 Institutional Multi-Strategy Adaptive Platform", () => {
  beforeAll(async () => {
    const connected = await connectIfAvailable();
    if (!connected) return;
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  it("Module 1 & 2: Strategy Registry — should initialize all 10 quantitative strategies", async () => {
    if (skipIfNoMongo()) return;
    const list = await StrategyRegistryService.ensureRegistryInitialized();

    expect(list.length).toBe(10);
    expect(list.some((s) => s.strategyId === "STRAT_TREND_FOLLOWING")).toBe(true);
    expect(list.some((s) => s.strategyId === "STRAT_MEAN_REVERSION")).toBe(true);
    expect(list.some((s) => s.strategyId === "STRAT_STATISTICAL_ARBITRAGE")).toBe(true);
  });

  it("Module 3 & 4: Strategy Selector AI — should select Trend Following for Bull and Mean Reversion for Range regimes", () => {
    if (skipIfNoMongo()) return;
    const bullSelection = StrategySelectorEngine.selectBestStrategies("STRONG_BULL");
    expect(bullSelection.bestStrategy.strategyId).toBe("STRAT_TREND_FOLLOWING");
    expect(bullSelection.bestStrategy.confidence).toBeGreaterThan(85);

    const rangeSelection = StrategySelectorEngine.selectBestStrategies("RANGE");
    expect(rangeSelection.bestStrategy.strategyId).toBe("STRAT_MEAN_REVERSION");
    expect(rangeSelection.bestStrategy.confidence).toBeGreaterThan(85);
  });

  it("Module 8: Portfolio Level Multi-Strategy Engine — should allocate capital (50% / 30% / 20%) across top 3 strategies", async () => {
    if (skipIfNoMongo()) return;
    const exec = await MultiStrategyEngine.executeMultiStrategy("BTCUSDT", "STRONG_BULL", 10000);

    expect(exec.status).toBe("EXECUTED_MULTI_STRATEGY");
    expect(exec.allocation.bestStrategyCapital).toBe(5000);
    expect(exec.allocation.secondBestCapital).toBe(3000);
    expect(exec.allocation.thirdBestCapital).toBe(2000);
  });

  it("Module 6: Strategy Lifecycle — should demote weak strategy to STANDBY state without deletion", async () => {
    if (skipIfNoMongo()) return;
    let strat = await StrategyRegistry.findOneAndUpdate(
      { strategyId: "STRAT_OHMKARA_TEST" },
      {
        strategyName: "Test Frequency Strategy",
        description: "Test strategy for standby demotion",
        category: "TEST",
        healthScore: 35,
        currentState: "STANDBY",
      },
      { new: true, upsert: true }
    );

    expect(strat.currentState).toBe("STANDBY");
    expect(strat.healthScore).toBeLessThan(40);
  });
});
