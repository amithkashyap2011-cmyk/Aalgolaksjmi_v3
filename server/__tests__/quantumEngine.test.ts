/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Unit Tests
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from "@jest/globals";
import { OrderBookIntelligenceEngine } from "../src/services/quantum/orderBookIntelligence.js";
import { FundingRateEngine } from "../src/services/quantum/fundingRateEngine.js";
import { LiquidationEngine } from "../src/services/quantum/liquidationEngine.js";
import { RiskEngine } from "../src/services/quantum/riskEngine.js";
import type {
  OrderBookSnapshot,
  FundingRateData,
  OpenInterestData,
  IndicatorSet,
  PortfolioState,
} from "../src/services/quantum/types.js";

describe("Quantum Alpha Engine - Core Components", () => {
  
  // 1. Order Book Intelligence Engine Tests
  describe("Order Book Intelligence Engine", () => {
    it("should compute spread, imbalance, and detect walls correctly", () => {
      const engine = OrderBookIntelligenceEngine.getInstance();
      
      const mockSnapshot: OrderBookSnapshot = {
        symbol: "BTCUSDT",
        exchange: "binance",
        timestamp: Date.now(),
        bids: [
          { price: 90000, quantity: 1.5 },
          { price: 89900, quantity: 1.2 },
          { price: 89800, quantity: 5.0 }, // wall
        ],
        asks: [
          { price: 90100, quantity: 2.5 },
          { price: 90200, quantity: 1.0 },
          { price: 90300, quantity: 1.1 },
        ],
        lastUpdateId: 100,
      };

      const result = engine.analyze(mockSnapshot);

      expect(result.symbol).toBe("BTCUSDT");
      expect(result.spreadBps).toBeCloseTo(11.1, 1); // (90100 - 90000) / 90050 * 10000
      expect(result.bidAskImbalance).toBeDefined();
      expect(result.liquidityWalls.length).toBeGreaterThanOrEqual(0);
      expect(result.depthScore).toBeGreaterThan(0);
    });
  });

  // 2. Funding Rate Engine Tests
  describe("Funding Rate Engine", () => {
    it("should calculate squeeze probabilities and spot-perp basis arbitrage", () => {
      const engine = FundingRateEngine.getInstance();
      
      const fundingData: FundingRateData = {
        symbol: "BTCUSDT",
        fundingRate: 0.0008, // 0.08% per 8h (high positive)
        fundingTime: Date.now(),
        markPrice: 90100,
        indexPrice: 90000,
        nextFundingTime: Date.now() + 28800000,
      };

      const oiData: OpenInterestData = {
        symbol: "BTCUSDT",
        openInterest: 15000,
        openInterestValue: 1350000000,
        timestamp: Date.now(),
      };

      const result = engine.analyze(fundingData, oiData, 1.8);

      expect(result.longSqueezeProb).toBeGreaterThan(0.5); // high positive funding + rising OI
      expect(result.shortSqueezeProb).toBe(0);
      expect(result.arbOpportunity).not.toBeNull();
      expect(result.arbOpportunity?.type).toBe("CASH_AND_CARRY");
    });
  });

  // 3. Liquidation Engine Tests
  describe("Liquidation Engine", () => {
    it("should estimate cascade risk and identify forced pressure", () => {
      const engine = LiquidationEngine.getInstance();
      const symbol = "ETHUSDT";
      const currentPrice = 2500;

      // Feed multiple large long liquidations (SELL side orders by exchange)
      engine.recordEvent({
        symbol,
        side: "SELL",
        price: 2490,
        quantity: 200, // $500k value
        timestamp: Date.now(),
        exchange: "binance",
      });

      engine.recordEvent({
        symbol,
        side: "SELL",
        price: 2485,
        quantity: 150, // $375k value
        timestamp: Date.now(),
        exchange: "binance",
      });

      const result = engine.analyze(symbol, currentPrice);

      expect(result.cascadeRiskScore).toBeGreaterThan(50);
      expect(result.forcedSellingPressure).toBeGreaterThan(0.5);
      expect(result.forcedBuyingPressure).toBe(0);
      expect(result.nearestLongLiquidations.length).toBe(4);
    });
  });

  // 4. Risk Engine Tests
  describe("Risk Engine", () => {
    it("should evaluate orders and flag risk boundary violations", () => {
      const engine = RiskEngine.getInstance();
      
      const indicators: IndicatorSet = {
        ema9: 90000,
        ema21: 89500,
        ema50: 89000,
        ema200: null,
        sma20: null,
        sma50: null,
        rsi14: 45,
        macdLine: null,
        macdSignal: null,
        macdHist: null,
        atr14: 1500,
        bbUpper: null,
        bbMiddle: null,
        bbLower: null,
        stdDev20: 1200,
        vwap: null,
        obv: null,
        adx14: 30,
        volumeRatio: 1.2,
        hurstExponent: 0.58,
        close: 90050,
      };

      const portfolioState: PortfolioState = {
        totalEquity: 10000,
        availableBalance: 10000,
        unrealizedPnl: 0,
        positions: [],
        dailyPnl: 0,
        weeklyPnl: 0,
        monthlyPnl: 0,
        maxDrawdownToday: 0,
        maxDrawdownWeek: 0,
        maxDrawdownMonth: 0,
        correlationMatrix: {},
      };

      // Evaluate normal order size (USDT 300 which is 3% of total equity)
      const evaluation = engine.evaluateOrder(
        "BTCUSDT",
        "BUY",
        300,
        indicators,
        "BULL",
        portfolioState
      );

      expect(evaluation.approved).toBe(true);
      expect(evaluation.dynamicSLPct).toBeGreaterThan(0.5);
      expect(evaluation.dynamicTPPct).toBeGreaterThan(evaluation.dynamicSLPct);

      // Evaluate oversized order size (USDT 800 which exceeds max 5% position size limit)
      const badEvaluation = engine.evaluateOrder(
        "BTCUSDT",
        "BUY",
        800,
        indicators,
        "BULL",
        portfolioState
      );

      expect(badEvaluation.approved).toBe(false);
      expect(badEvaluation.riskFlags.some(f => f.code === "SIZE_LIMIT_EXCEEDED")).toBe(true);
    });
  });
});
