/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — DUAL-MARKET ISOLATION TEST SUITE
 * ═══════════════════════════════════════════════════════════════════
 *  Automated verification of Section 55:
 *   - India strategy cannot trade crypto.
 *   - Crypto strategy cannot trade India.
 *   - India order cannot reach Binance.
 *   - Crypto order cannot reach Angel One.
 *   - India risk rules do not corrupt crypto risk.
 *   - Crypto risk rules do not corrupt India risk.
 *   - India dashboard/adapter does not consume crypto-only state.
 *   - Crypto dashboard/adapter does not consume India-only state.
 */

import { describe, test, expect } from "@jest/globals";
import { MarketIsolationGuard, MarketIsolationViolationError } from "../src/services/market/MarketIsolationGuard.js";
import { IndianMarketAdapter, CryptoMarketAdapter, MarketAdapterRegistry } from "../src/services/market/MarketAdapter.js";
import { CanonicalOrderRequest } from "../src/services/market/CanonicalModel.js";

describe("DUAL-MARKET ARCHITECTURE: Isolation & Invariant Proof", () => {
  const indiaAdapter = new IndianMarketAdapter();
  const cryptoAdapter = new CryptoMarketAdapter();

  test("1. India strategy cannot trade crypto (BTCUSDT rejected)", () => {
    expect(() => {
      MarketIsolationGuard.validateStrategyMarket({
        strategyId: "NIFTY_BREAKOUT_V1",
        strategyMarket: "INDIA",
        executionMarket: "CRYPTO",
        symbol: "BTCUSDT",
      });
    }).toThrow(MarketIsolationViolationError);
  });

  test("2. Crypto strategy cannot trade India (NIFTY rejected)", () => {
    expect(() => {
      MarketIsolationGuard.validateStrategyMarket({
        strategyId: "CRYPTO_MOMENTUM_BTC",
        strategyMarket: "CRYPTO",
        executionMarket: "INDIA",
        symbol: "NIFTY",
      });
    }).toThrow(MarketIsolationViolationError);
  });

  test("3. India order cannot reach Binance broker target", () => {
    expect(() => {
      MarketIsolationGuard.validateOrderRouting({
        symbol: "RELIANCE",
        declaredMarket: "INDIA",
        brokerTarget: "BINANCE_FUTURES",
      });
    }).toThrow(/cannot be routed to Binance/);
  });

  test("4. Crypto order cannot reach Angel One / Zerodha broker target", () => {
    expect(() => {
      MarketIsolationGuard.validateOrderRouting({
        symbol: "BTCUSDT",
        declaredMarket: "CRYPTO",
        brokerTarget: "ANGEL_ONE_SMARTAPI",
      });
    }).toThrow(/cannot be routed to Indian broker/);
  });

  test("5. India order routing rejects crypto symbols (ETHUSDT in India)", () => {
    expect(() => {
      MarketIsolationGuard.validateOrderRouting({
        symbol: "ETHUSDT",
        declaredMarket: "INDIA",
      });
    }).toThrow(/cannot be executed through the Indian Market pipeline/);
  });

  test("6. Crypto order routing rejects Indian symbols (BANKNIFTY in Crypto)", () => {
    expect(() => {
      MarketIsolationGuard.validateOrderRouting({
        symbol: "BANKNIFTY",
        declaredMarket: "CRYPTO",
      });
    }).toThrow(/cannot be executed through the Binance Crypto pipeline/);
  });

  test("7. Indian Risk Engine rejects crypto symbol evaluation", () => {
    expect(() => {
      MarketIsolationGuard.validateRiskEngineContext({
        engineMarket: "INDIA",
        symbol: "SOLUSDT",
      });
    }).toThrow(MarketIsolationViolationError);
  });

  test("8. Crypto Risk Engine rejects Indian equity symbol evaluation", () => {
    expect(() => {
      MarketIsolationGuard.validateRiskEngineContext({
        engineMarket: "CRYPTO",
        symbol: "TCS",
      });
    }).toThrow(MarketIsolationViolationError);
  });

  test("9. IndianMarketAdapter rejects crypto quote requests", async () => {
    await expect(indiaAdapter.getQuote("BTCUSDT")).rejects.toThrow(/not a valid Indian market instrument/);
  });

  test("10. CryptoMarketAdapter rejects Indian quote requests", async () => {
    await expect(cryptoAdapter.getQuote("NIFTY")).rejects.toThrow(/not a valid Crypto market instrument/);
  });

  test("11. IndianMarketAdapter rejects crypto order placement", async () => {
    const invalidReq: CanonicalOrderRequest = {
      clientOrderId: "TEST_ORD_1",
      userId: "test_user",
      symbol: "BTCUSDT",
      market: "CRYPTO",
      exchange: "BINANCE_FUTURES",
      side: "BUY",
      orderType: "MARKET",
      productType: "CROSS",
      quantity: 1,
    };

    await expect(indiaAdapter.placeOrder("test_user", invalidReq)).rejects.toThrow(/Rejecting order with market domain/);
  });

  test("12. CryptoMarketAdapter rejects Indian order placement", async () => {
    const invalidReq: CanonicalOrderRequest = {
      clientOrderId: "TEST_ORD_2",
      userId: "test_user",
      symbol: "RELIANCE",
      market: "INDIA",
      exchange: "NSE",
      side: "BUY",
      orderType: "MARKET",
      productType: "MIS",
      quantity: 25,
    };

    await expect(cryptoAdapter.placeOrder("test_user", invalidReq)).rejects.toThrow(/Rejecting order with market domain/);
  });

  test("13. MarketAdapterRegistry correctly resolves adapter by symbol and market", () => {
    expect(MarketAdapterRegistry.getAdapter("INDIA").market).toBe("INDIA");
    expect(MarketAdapterRegistry.getAdapter("CRYPTO").market).toBe("CRYPTO");
    expect(MarketAdapterRegistry.resolveAdapterForSymbol("BTCUSDT").market).toBe("CRYPTO");
    expect(MarketAdapterRegistry.resolveAdapterForSymbol("NIFTY").market).toBe("INDIA");
    expect(MarketAdapterRegistry.resolveAdapterForSymbol("RELIANCE").market).toBe("INDIA");
  });

  test("14. Indian account equity is isolated in INR and Crypto is isolated in USDT", async () => {
    const indianAcc = await indiaAdapter.getAccount("test_user");
    expect(indianAcc.currency).toBe("INR");
    expect(indianAcc.market).toBe("INDIA");

    const cryptoAcc = await cryptoAdapter.getAccount("test_user");
    expect(cryptoAcc.currency).toBe("USDT");
    expect(cryptoAcc.market).toBe("CRYPTO");
  });
});
