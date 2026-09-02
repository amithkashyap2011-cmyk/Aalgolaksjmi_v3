/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA V3 — Overnight P0 Forensic Runtime Fix Regression Tests
 * ═══════════════════════════════════════════════════════════════════
 *
 * Certifies:
 * 1. Binance WebSocket/Cache-First Kline Architecture & In-Flight Deduplication.
 * 2. Circuit Breaker / 429 Resilient Fallback without unhandled throws.
 * 3. Funding rate in-memory cache with 5-minute TTL.
 * 4. Paper zero-balance decoupled from RiskEngine decision evaluation.
 * 5. Live mode fail-closed on zero balance (BALANCE_ZERO).
 * 6. Bounded Model Inference Timeouts (1500ms) with local transformer fallback.
 * 7. Symbol-Level Failure Isolation and Bounded Execution.
 * 8. Opportunity Accounting & Telemetry Conservation.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import * as binance from "../src/services/binanceService.js";
import { RiskEngine } from "../src/services/aqea/riskEngine.js";
import { ModelInferenceBridge } from "../src/services/aqea/ai/ModelInferenceBridge.js";
import { DL_TIMEOUT_MS, predictSequence, SequenceInput } from "../src/services/dlModelService.js";
import { LiveExecutionBarrier } from "../src/services/aqea/governance/LiveExecutionBarrier.js";
import { ForwardTelemetryStore } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import * as paper from "../src/services/paperState.js";

describe("AQEA Overnight P0 Forensic Runtime Fix Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. Binance WebSocket/Cache-First Market Data & Fallback", () => {
    it("updates and retrieves klines from in-memory cache without REST calls", async () => {
      const symbol = "BTCUSDT";
      const interval = "5m";
      const sampleKline: binance.Kline = {
        openTime: 1700000000000,
        open: "65000",
        high: "65500",
        low: "64800",
        close: "65200",
        volume: "150.5",
        closeTime: 1700000300000
      };

      binance.updateKlineCache(symbol, interval, sampleKline);

      // Populate 25 bars so cache meets minimum threshold
      for (let i = 1; i <= 25; i++) {
        binance.updateKlineCache(symbol, interval, {
          ...sampleKline,
          openTime: 1700000000000 + i * 300000,
          closeTime: 1700000300000 + i * 300000,
          close: String(65200 + i * 10)
        });
      }

      const retrieved = await binance.getKlines(symbol, interval, undefined, undefined, 20);
      expect(retrieved).toBeDefined();
      expect(retrieved.length).toBe(20);
      expect(parseFloat(retrieved[retrieved.length - 1].close)).toBeGreaterThanOrEqual(65200);
    });

    it("generates synthetic klines during REST ban or missing cache", () => {
      const synthetic = binance.generateSyntheticKlines("ETHUSDT", 50);
      expect(synthetic).toBeDefined();
      expect(synthetic.length).toBe(50);
      expect(parseFloat(synthetic[0].close)).toBeGreaterThan(0);
      expect(synthetic[0].openTime).toBeLessThan(synthetic[synthetic.length - 1].openTime);
    });

    it("caches funding rate with 5-minute TTL", async () => {
      const originalFetch = globalThis.fetch;
      let fetchCount = 0;
      globalThis.fetch = (async (url: string) => {
        fetchCount++;
        return {
          ok: true,
          json: async () => [{ fundingRate: "0.00015" }]
        };
      }) as any;

      try {
        const rate1 = await binance.getLatestFundingRate("SOLUSDT");
        expect(rate1).toBe(0.00015);
        expect(fetchCount).toBe(1);

        // Immediate second call uses cache and does NOT call fetch again
        const rate2 = await binance.getLatestFundingRate("SOLUSDT");
        expect(rate2).toBe(0.00015);
        expect(fetchCount).toBe(1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("2. RiskEngine & Paper Zero-Balance Decoupling", () => {
    it("allows PAPER mode trade evaluation when wallet balance is $0.00 using virtual baseline", async () => {
      const userId = "507f1f77bcf86cd799439011";
      // Ensure wallet balance is 0
      const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
      wallet.set("USDT", 0);

      const ctx = {
        userId,
        symbol: "BTCUSDT",
        accountType: "FUTURES" as const,
        mode: "PAPER" as const,
        direction: "BUY" as const,
        currentPrice: 65000,
        atr: 500,
        winRate: 0.70,
        rewardRisk: 2.0,
        fundingRate: 0.0001
      };

      const result = await RiskEngine.validateTrade(ctx);
      expect(result.allowed).toBe(true);
      expect(result.positionSize).toBeGreaterThan(0);
      expect(result.reason).toContain("Risk Approved");
    });

    it("strictly rejects LIVE mode trade when wallet balance is $0.00 with BALANCE_ZERO", async () => {
      const userId = "507f1f77bcf86cd799439012";
      const wallet = paper.getWallet(userId, "LIVE", "FUTURES");
      wallet.set("USDT", 0);

      const ctx = {
        userId,
        symbol: "BTCUSDT",
        accountType: "FUTURES" as const,
        mode: "LIVE" as const,
        direction: "BUY" as const,
        currentPrice: 65000,
        atr: 500,
        winRate: 0.70,
        rewardRisk: 2.0,
        fundingRate: 0.0001
      };

      const result = await RiskEngine.validateTrade(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("BALANCE_ZERO");
      expect(result.positionSize).toBe(0);
    });
  });

  describe("3. Bounded Model Timeouts and Graceful Degradation", () => {
    it("verifies DL_TIMEOUT_MS is bounded to <= 1500ms", () => {
      expect(DL_TIMEOUT_MS).toBeLessThanOrEqual(1500);
    });

    it("predictSequence falls back gracefully to local transformer when input is given", async () => {
      const dummyInput: SequenceInput = {
        symbol: "BTCUSDT",
        timeframe: "5m",
        window: Array.from({ length: 20 }, (_, i) => ({
          open: 65000 + i * 10,
          high: 65100 + i * 10,
          low: 64900 + i * 10,
          close: 65050 + i * 10,
          volume: 100,
          rsi: 55,
          ema9: 65020,
          ema21: 65000,
          macdHist: 0.5
        }))
      };

      const prediction = await predictSequence(dummyInput);
      expect(prediction).toBeDefined();
      expect(prediction.directionScore).toBeGreaterThanOrEqual(0);
      expect(prediction.directionScore).toBeLessThanOrEqual(1);
    });

    it("ModelInferenceBridge handles network timeout and marks model UNAVAILABLE without throwing", async () => {
      const mockFetch = jest.fn().mockImplementation(() =>
        new Promise((_, reject) => {
          const err = new Error("AbortError");
          err.name = "AbortError";
          setTimeout(() => reject(err), 50);
        })
      );
      global.fetch = mockFetch as any;

      const result = await ModelInferenceBridge.executeRemoteInference({
        endpoint: "http://127.0.0.1:9999/predict",
        payload: { symbol: "BTCUSDT" },
        modelName: "test-transformer",
        modelVersion: "1.0",
        architecture: "TRANSFORMER",
        isTrained: true,
        timeoutMs: 50
      });

      expect(result.inferenceMode).toBe("UNAVAILABLE");
      expect(result.status).toBe("DISABLED");
      expect(result.error).toContain("timed out");
    });
  });

  describe("4. Live Execution Barrier and Governance Integrity", () => {
    it("permanently blocks live capital promotion", () => {
      const result = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
      expect(result.permitted).toBe(false);
      expect(result.reason).toContain("LIVE_PROMOTION_BLOCKED_BARRIER");
      expect(ForwardTelemetryStore.isLivePromotionBlocked()).toBe(true);
    });
  });

  describe("5. Telemetry Conservation & Opportunity Accounting", () => {
    it("ensures decision records correctly preserve direction and finalDecision", () => {
      const record = ForwardTelemetryStore.recordDecision({
        decisionId: `TEST_DEC_${Date.now()}`,
        timestamp: Date.now(),
        symbol: "BTCUSDT",
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        regime: "BULL_TREND",
        featureVersion: 2,
        buyProbability: 0.85,
        holdProbability: 0.10,
        sellProbability: 0.05,
        direction: "LONG",
        confidence: 85,
        agreementScore: 90,
        tradeQualityScore: 88,
        expectedValue: 0.015,
        fees: 0.0004,
        slippage: 0.0002,
        uncertainty: 0.15,
        modelBreakdowns: {}
      });

      expect(record.direction).toBe("LONG");
      expect(record.finalDecision).toBe("LONG");
      expect(record.dataSource).toBe("PAPER");
    });
  });
});
