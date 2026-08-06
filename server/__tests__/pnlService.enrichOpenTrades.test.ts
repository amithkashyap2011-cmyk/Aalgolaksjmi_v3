/*
 * ─── enrichOpenTrades — unit tests ──────────────────────
 *
 * Written in direct response to a real Stryker mutation-testing run
 * (server/stryker.conf.json, scoped spike) that found 40 surviving
 * mutants in this exact function — every mutation to its margin/
 * unrealisedPnlPct math and price-resolution fallback logic went
 * undetected because only computeUnrealisedPnl (the sibling pure
 * function) had tests. This closes that gap.
 */
import { jest } from '@jest/globals';

const mockGetTickerPriceSync = jest.fn() as any;
const mockGetTickerPrice = jest.fn() as any;

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getTickerPriceSync: mockGetTickerPriceSync,
  getTickerPrice: mockGetTickerPrice,
}));

let enrichOpenTrades: any;
beforeAll(async () => {
  ({ enrichOpenTrades } = await import("../src/services/pnlService.js"));
});

beforeEach(() => {
  mockGetTickerPriceSync.mockReset();
  mockGetTickerPrice.mockReset();
});

describe("enrichOpenTrades", () => {
  test("uses the sync ticker price when available, without falling back to the async fetch", async () => {
    mockGetTickerPriceSync.mockReturnValue(51000);
    const trades = [{ symbol: "BTCUSDT", side: "BUY", entryPrice: 50000, quantity: 1, leverage: 5 }];
    const result = await enrichOpenTrades(trades);
    expect(result[0].markPrice).toBe(51000);
    expect(mockGetTickerPrice).not.toHaveBeenCalled();
  });

  test("falls back to the async ticker price when the sync lookup returns falsy", async () => {
    mockGetTickerPriceSync.mockReturnValue(0);
    mockGetTickerPrice.mockResolvedValue(52000);
    const trades = [{ symbol: "BTCUSDT", side: "BUY", entryPrice: 50000, quantity: 1, leverage: 5 }];
    const result = await enrichOpenTrades(trades);
    expect(result[0].markPrice).toBe(52000);
    expect(mockGetTickerPrice).toHaveBeenCalledWith("BTCUSDT", true);
  });

  test("skips (continue) a trade entirely — no markPrice/pnl fields set — when no price can be resolved", async () => {
    mockGetTickerPriceSync.mockReturnValue(0);
    mockGetTickerPrice.mockResolvedValue(0);
    const trades = [{ symbol: "BTCUSDT", side: "BUY", entryPrice: 50000, quantity: 1, leverage: 5 }];
    const result = await enrichOpenTrades(trades);
    expect(result[0].markPrice).toBeUndefined();
    expect(result[0].pnl).toBeUndefined();
  });

  test("margin = entryPrice * quantity / leverage, and defaults leverage to 1 when unset", async () => {
    mockGetTickerPriceSync.mockReturnValue(50000); // flat price, so pnl is fee-only, not the focus here
    const trades = [{ symbol: "BTCUSDT", side: "BUY", entryPrice: 50000, quantity: 2 }]; // no leverage field
    const result = await enrichOpenTrades(trades);
    const expectedMargin = 50000 * 2 / 1;
    const expectedPct = (result[0].pnl / expectedMargin) * 100;
    expect(result[0].unrealisedPnlPct).toBeCloseTo(expectedPct, 9);
  });

  test("unrealisedPnlPct is exactly 0 when margin is 0 (entryPrice or quantity is 0) — division by zero is deliberately avoided, not left as NaN/Infinity", async () => {
    mockGetTickerPriceSync.mockReturnValue(50000);
    const trades = [{ symbol: "BTCUSDT", side: "BUY", entryPrice: 0, quantity: 0, leverage: 5 }];
    const result = await enrichOpenTrades(trades);
    expect(result[0].unrealisedPnlPct).toBe(0);
  });

  test("unrealisedPnlPct scales correctly with a real profitable move (sanity check against computeUnrealisedPnl's own math)", async () => {
    mockGetTickerPriceSync.mockReturnValue(55000);
    const trades = [{ symbol: "BTCUSDT", side: "BUY", entryPrice: 50000, quantity: 1, leverage: 10 }];
    const result = await enrichOpenTrades(trades);
    const margin = (50000 * 1) / 10;
    expect(result[0].unrealisedPnlPct).toBeCloseTo((result[0].pnl / margin) * 100, 9);
    expect(result[0].pnl).toBeGreaterThan(0); // 55000 > 50000, BUY side, comfortably clears fees
  });

  test("an error enriching one trade (e.g. price lookup throws) doesn't stop the rest of the batch from being enriched", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetTickerPriceSync
      .mockImplementationOnce(() => { throw new Error("ticker feed error"); })
      .mockImplementationOnce(() => 60000);
    const trades = [
      { symbol: "BADUSDT", side: "BUY", entryPrice: 100, quantity: 1, leverage: 1 },
      { symbol: "BTCUSDT", side: "BUY", entryPrice: 50000, quantity: 1, leverage: 1 },
    ];
    const result = await enrichOpenTrades(trades);
    expect(result[0].markPrice).toBeUndefined(); // first trade's error was caught, not fatal
    expect(result[1].markPrice).toBe(60000); // second trade still processed normally
    expect(consoleSpy).toHaveBeenCalledWith(
      "[pnlService] Failed to attach live PnL for BADUSDT:",
      "ticker feed error"
    );
    consoleSpy.mockRestore();
  });

  test("supports SPOT trades (accountType other than FUTURES) by passing isFutures=false to the price lookups", async () => {
    mockGetTickerPriceSync.mockClear();
    mockGetTickerPriceSync.mockReturnValue(50000);
    const trades = [{ symbol: "BTCUSDT", side: "BUY", entryPrice: 49000, quantity: 1, leverage: 1, accountType: "SPOT" }];
    await enrichOpenTrades(trades);
    expect(mockGetTickerPriceSync).toHaveBeenCalledWith("BTCUSDT", false);
  });

  test("defaults to FUTURES (isFutures=true) when accountType is unset", async () => {
    mockGetTickerPriceSync.mockClear();
    mockGetTickerPriceSync.mockReturnValue(50000);
    const trades = [{ symbol: "BTCUSDT", side: "BUY", entryPrice: 49000, quantity: 1, leverage: 1 }];
    await enrichOpenTrades(trades);
    expect(mockGetTickerPriceSync).toHaveBeenCalledWith("BTCUSDT", true);
  });
});
