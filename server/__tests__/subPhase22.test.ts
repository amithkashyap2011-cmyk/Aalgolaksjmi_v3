import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import mongoose from "mongoose";
import { ShadowExecutionEngine } from "../src/services/execution/shadowExecutionEngine.js";
import { SlippageSimulator } from "../src/services/execution/slippageSimulator.js";
import { LatencyEngine } from "../src/services/execution/latencyEngine.js";
import { ExecutionQualityService } from "../src/services/execution/executionQualityService.js";
import { ExchangeSimulator } from "../src/services/execution/exchangeSimulator.js";
import { ExecutionAnalyticsService } from "../src/services/execution/executionAnalyticsService.js";
import { ReplayEngine } from "../src/services/execution/replayEngine.js";

describe("Phase 22 Modular Sub-Phase Verification Suite (22.1 — 22.4)", () => {
  beforeAll(async () => {
    const connected = await connectIfAvailable();
    if (!connected || mongoose.connection.readyState !== 1) return;
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  describe("Sub-Phase 22.1: Shadow Trading Engine", () => {
    it("should intercept AI consensus and execute shadow order without real capital", async () => {
    if (skipIfNoMongo()) return;
      const trade = await ShadowExecutionEngine.executeShadowOrder({
        symbol: "ETHUSDT",
        side: "BUY",
        requestedQty: 1.5,
        requestedPrice: 3400,
        exchangeType: "BINANCE_TESTNET",
      });

      expect(trade).toBeDefined();
      expect(trade.shadowTradeId).toContain("SHADOW_");
      expect(trade.requestedPrice).toBe(3400);
    });
  });

  describe("Sub-Phase 22.2: Execution Quality Analytics", () => {
    it("should accurately measure 5-stage latency, slippage, spread, and overall EQS", () => {
      const latency = LatencyEngine.measurePipelineLatency();
      expect(latency.total).toBe(latency.inference + latency.risk + latency.execution + latency.exchange + latency.confirmation);

      const slippage = SlippageSimulator.simulate("BUY", 3400, 1.5);
      expect(slippage.slippagePct).toBeGreaterThan(0);
      expect(slippage.spreadPct).toBe(0.02);

      const eqs = ExecutionQualityService.calculateEQS(latency.total, slippage.slippagePct, 0.98, slippage.spreadPct);
      expect(eqs.overallQualityScore).toBeGreaterThan(80);
    });
  });

  describe("Sub-Phase 22.3: Exchange Adapters", () => {
    it("should support Binance Testnet, Bybit Testnet, and OKX Demo partial fill simulations", () => {
      const binanceFill = ExchangeSimulator.simulateFill(1.0, "BINANCE_TESTNET");
      expect(binanceFill.requestedQty).toBe(1.0);

      const bybitFill = ExchangeSimulator.simulateFill(2.0, "BYBIT_TESTNET");
      expect(bybitFill.requestedQty).toBe(2.0);

      const okxFill = ExchangeSimulator.simulateFill(0.5, "OKX_DEMO");
      expect(okxFill.requestedQty).toBe(0.5);
    });
  });

  describe("Sub-Phase 22.4: Live vs Paper Validation Dashboard & Automated Reports", () => {
    it("should generate comparative Paper vs Shadow metrics and daily validation report", async () => {
    if (skipIfNoMongo()) return;
      const comp = ExecutionAnalyticsService.getLiveVsPaperComparison();
      expect(comp.metrics.find((m: any) => m.metric === "Win Rate (%)")).toBeDefined();

      const mdReport = await ReplayEngine.generateDailyValidationReport();
      expect(mdReport).toContain("Daily Live vs Shadow Execution Validation Report");
      expect(mdReport).toContain("Average Pipeline Latency");
    });
  });
});
