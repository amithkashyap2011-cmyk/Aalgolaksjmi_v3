import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import mongoose from "mongoose";
import { ShadowExecutionEngine } from "../src/services/execution/shadowExecutionEngine.js";
import { SlippageSimulator } from "../src/services/execution/slippageSimulator.js";
import { LatencyEngine } from "../src/services/execution/latencyEngine.js";
import { ExecutionQualityService } from "../src/services/execution/executionQualityService.js";
import { ExchangeSimulator } from "../src/services/execution/exchangeSimulator.js";
import { ExecutionAnalyticsService } from "../src/services/execution/executionAnalyticsService.js";
import { ReplayEngine } from "../src/services/execution/replayEngine.js";

jest.setTimeout(30000);

describe("Phase 22: Institutional Shadow Trading & Live Execution Validation", () => {
  beforeAll(async () => {
    const connected = await connectIfAvailable();
    if (!connected) return;
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  it("1. Live Shadow Trading Engine — should create shadow trade without real capital", async () => {
    if (skipIfNoMongo()) return;
    const trade = await ShadowExecutionEngine.executeShadowOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      requestedQty: 0.5,
      requestedPrice: 65000,
      exchangeType: "BINANCE_TESTNET",
    });

    expect(trade).toBeDefined();
    expect(trade.shadowTradeId).toContain("SHADOW_");
    expect(trade.executionQualityScore).toBeGreaterThan(50);
  });

  it("2 & 3. Execution & Slippage Simulator — should compute requested vs executed price", () => {
    if (skipIfNoMongo()) return;
    const res = SlippageSimulator.simulate("BUY", 65000, 1.0);
    expect(res.executedPrice).toBeGreaterThanOrEqual(65000);
    expect(res.slippagePct).toBeGreaterThan(0);
    expect(res.spreadPct).toBe(0.02);
  });

  it("4. Latency Engine — should measure step-by-step pipeline latency", () => {
    if (skipIfNoMongo()) return;
    const latency = LatencyEngine.measurePipelineLatency();
    expect(latency.inference).toBeGreaterThan(0);
    expect(latency.risk).toBeGreaterThan(0);
    expect(latency.execution).toBeGreaterThan(0);
    expect(latency.exchange).toBeGreaterThan(0);
    expect(latency.confirmation).toBeGreaterThan(0);
    expect(latency.total).toBe(latency.inference + latency.risk + latency.execution + latency.exchange + latency.confirmation);
  });

  it("5. Execution Quality Score — should calculate EQS using 5 weighted metrics", () => {
    if (skipIfNoMongo()) return;
    const eqs = ExecutionQualityService.calculateEQS(44, 0.04, 0.98, 0.02);
    expect(eqs.overallQualityScore).toBeGreaterThan(80);
    expect(eqs.overallQualityScore).toBeLessThanOrEqual(100);
  });

  it("6 & 7. Partial Fill & Exchange Simulator — should simulate partial fill breakdown", () => {
    if (skipIfNoMongo()) return;
    const fill = ExchangeSimulator.simulateFill(1.0, "BINANCE_TESTNET");
    expect(fill.requestedQty).toBe(1.0);
    expect(fill.filledQty + fill.remainingQty).toBeCloseTo(1.0, 4);
  });

  it("8. Live vs Paper Analytics — should produce comparative metrics breakdown", () => {
    if (skipIfNoMongo()) return;
    const comp = ExecutionAnalyticsService.getLiveVsPaperComparison();
    expect(comp.metrics).toBeDefined();
    expect(comp.metrics.length).toBeGreaterThan(0);
  });

  it("9 & 10. Replay Engine & Validation Report — should replay and generate report", async () => {
    if (skipIfNoMongo()) return;
    const replay = await ReplayEngine.replayPeriod("YESTERDAY");
    expect(replay.status).toBe("COMPLETED");

    const report = await ReplayEngine.generateDailyValidationReport();
    expect(report).toContain("Daily Live vs Shadow Execution Validation Report");
    expect(report).toContain("Overall Execution Quality Score (EQS)");
  });
});
