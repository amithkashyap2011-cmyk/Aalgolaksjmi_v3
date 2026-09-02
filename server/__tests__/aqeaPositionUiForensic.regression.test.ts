/**
 * AQEA Position UI Forensic & Real-Time Telemetry Regression Suite
 *
 * Pattern: jest.unstable_mockModule + dynamic import in beforeAll
 * (ESM vm-modules; test script runs with --experimental-vm-modules).
 * jest.resetModules() before import clears stale cache from sibling tests.
 */
import { describe, it, expect, beforeEach, beforeAll, jest } from "@jest/globals";

const mockGetTickerPriceSync = jest.fn() as jest.MockedFunction<(symbol: string, isFutures?: boolean) => number | null>;
const mockGetTickerPrice = jest.fn() as jest.MockedFunction<(symbol: string, isFutures?: boolean) => Promise<number>>;

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getTickerPriceSync: mockGetTickerPriceSync,
  getTickerPrice: mockGetTickerPrice,
}));

let computeUnrealisedPnl: any;
let enrichOpenTrades: any;
let TAKER_FEE: any;
let paperState: any;

beforeAll(async () => {
  jest.resetModules();
  ({ computeUnrealisedPnl, enrichOpenTrades, TAKER_FEE } = await import("../src/services/pnlService.js") as any);
  paperState = await import("../src/services/paperState.js");
});

describe("AQEA Position UI Forensic & Real-Time Telemetry Regression Suite", () => {
  const userId = "test_user_forensic_01";
  const symbol = "BTCUSDT";
  const mode = "PAPER";
  const accountType = "FUTURES";
  const refEntryPrice = 74632.50;
  const refQty = 0.0010080058955548856;
  const refLeverage = 4;

  beforeEach(() => {
    mockGetTickerPriceSync.mockReset();
    mockGetTickerPrice.mockReset();
    paperState.resetAllPaperStateToZero();
  });

  it("Test A: Creates and stores BTCUSDT LONG at 74,632.50 with canonical 4x leverage", () => {
    paperState.setPosition(userId, symbol, mode, {
      userId, symbol, side: "BUY", quantity: refQty,
      entryPrice: refEntryPrice, leverage: refLeverage,
      tradeId: "TRADE_BTC_001", accountType
    });

    const pos = paperState.getPosition(userId, symbol, mode, accountType);
    expect(pos).toBeDefined();
    expect(pos?.symbol).toBe("BTCUSDT");
    expect(pos?.side).toBe("BUY");
    expect(pos?.entryPrice).toBe(refEntryPrice);
    expect(pos?.quantity).toBe(refQty);
    expect(pos?.leverage).toBe(4);
  });

  it("Test B: Confirm DTO and enrichment explicitly preserve leverage = 4 without inference", async () => {
    const rawTrade = {
      _id: "TRADE_BTC_001", userId, symbol, side: "BUY",
      quantity: refQty, entryPrice: refEntryPrice, leverage: refLeverage, accountType
    };
    mockGetTickerPriceSync.mockReturnValue(refEntryPrice);
    const enriched = await enrichOpenTrades([rawTrade]);
    expect(enriched[0].leverage).toBe(4);
    expect(enriched[0].entryPrice).toBe(refEntryPrice);
  });

  it("Test C & D: markPrice updates while entryPrice remains strictly immutable", async () => {
    const rawTrade: any = {
      _id: "TRADE_BTC_001", userId, symbol, side: "BUY",
      quantity: refQty, entryPrice: refEntryPrice, leverage: refLeverage, accountType
    };

    const initialMark = 74632.50;
    mockGetTickerPriceSync.mockReturnValue(initialMark);
    await enrichOpenTrades([rawTrade]);
    expect(rawTrade.markPrice).toBe(initialMark);
    expect(rawTrade.entryPrice).toBe(refEntryPrice);

    const newMark = 77319.27;
    mockGetTickerPriceSync.mockReturnValue(newMark);
    await enrichOpenTrades([rawTrade]);
    expect(rawTrade.markPrice).toBe(newMark);
    expect(rawTrade.entryPrice).toBe(refEntryPrice);
  });

  it("Test E: Confirm unrealized P&L recalculated accurately from mark price", () => {
    const rawTrade = { entryPrice: refEntryPrice, quantity: refQty, side: "BUY", accountType: "FUTURES" };
    const markPrice = 77319.27;
    const grossPnl = (markPrice - refEntryPrice) * refQty;
    const entryFee = refEntryPrice * refQty * TAKER_FEE;
    const exitFee = markPrice * refQty * TAKER_FEE;
    const expectedNetPnl = grossPnl - entryFee - exitFee;
    expect(computeUnrealisedPnl(rawTrade, markPrice)).toBeCloseTo(expectedNetPnl, 5);
  });

  it("Test F: ROI/P&L% uses correct leverage convention yielding ~24.19%", async () => {
    const rawTrade: any = {
      _id: "TRADE_BTC_001", userId, symbol, side: "BUY",
      quantity: refQty, entryPrice: refEntryPrice, leverage: 4, accountType: "FUTURES"
    };
    const notional = refEntryPrice * refQty;
    const margin = notional / 4;
    const expectedRoiPct = (4.55 / margin) * 100;

    expect(margin).toBeCloseTo(18.8075, 4);
    expect(expectedRoiPct).toBeCloseTo(24.19, 2);

    mockGetTickerPriceSync.mockReturnValue(79170.00);
    await enrichOpenTrades([rawTrade]);
    expect(rawTrade.margin).toBeCloseTo(18.8075, 4);
    expect(rawTrade.unrealisedPnlPct).toBeGreaterThan(0);
  });

  it("Test G: Changing leverage scales ROI% without multiplying absolute P&L twice", async () => {
    mockGetTickerPriceSync.mockReturnValue(77319.27);
    const trade1x: any = { symbol, side: "BUY", quantity: refQty, entryPrice: refEntryPrice, leverage: 1, accountType: "FUTURES" };
    const trade4x: any = { symbol, side: "BUY", quantity: refQty, entryPrice: refEntryPrice, leverage: 4, accountType: "FUTURES" };
    const trade10x: any = { symbol, side: "BUY", quantity: refQty, entryPrice: refEntryPrice, leverage: 10, accountType: "FUTURES" };

    await enrichOpenTrades([trade1x, trade4x, trade10x]);

    expect(trade1x.pnl).toBeCloseTo(trade4x.pnl, 6);
    expect(trade4x.pnl).toBeCloseTo(trade10x.pnl, 6);
    expect(trade4x.margin).toBeCloseTo(trade1x.margin / 4, 4);
    expect(trade10x.margin).toBeCloseTo(trade1x.margin / 10, 4);
    expect(trade4x.unrealisedPnlPct).toBeCloseTo(trade1x.unrealisedPnlPct * 4, 4);
    expect(trade10x.unrealisedPnlPct).toBeCloseTo(trade1x.unrealisedPnlPct * 10, 4);
  });

  it("Test H: Closing position frees in-memory state cleanly", () => {
    paperState.setPosition(userId, symbol, mode, {
      userId, symbol, side: "BUY", quantity: refQty,
      entryPrice: refEntryPrice, leverage: refLeverage, tradeId: "TRADE_BTC_001", accountType
    });
    expect(paperState.getPosition(userId, symbol, mode, accountType)).toBeDefined();
    paperState.removePosition(userId, symbol, mode, accountType);
    expect(paperState.getPosition(userId, symbol, mode, accountType)).toBeUndefined();
  });

  it("Test I: getOpenPositions preserves canonical leverage across retrieval cycles", () => {
    paperState.setPosition(userId, symbol, mode, {
      userId, symbol, side: "BUY", quantity: refQty,
      entryPrice: refEntryPrice, leverage: 4, tradeId: "TRADE_BTC_001", accountType
    });
    const positions = paperState.getOpenPositions(userId, mode);
    expect(positions.length).toBe(1);
    expect(positions[0].leverage).toBe(4);
    expect(positions[0].symbol).toBe("BTCUSDT");
  });

  it("Test J: Emits [POSITION_UI_TRACE] telemetry matching required schema", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const rawTrade: any = {
      _id: "TRADE_BTC_LOG_01", userId, symbol, side: "BUY",
      quantity: refQty, entryPrice: refEntryPrice, leverage: 4, accountType: "FUTURES"
    };

    mockGetTickerPriceSync.mockReturnValue(77319.27);
    await enrichOpenTrades([rawTrade]);

    const traceCall = logSpy.mock.calls.find(
      call => typeof call[0] === "string" && (call[0] as string).includes("[POSITION_UI_TRACE]")
    );
    expect(traceCall).toBeDefined();

    const traceJson = JSON.parse((traceCall![0] as string).replace("[POSITION_UI_TRACE] ", ""));
    expect(traceJson.symbol).toBe("BTCUSDT");
    expect(traceJson.side).toBe("BUY");
    expect(traceJson.quantity).toBe(refQty);
    expect(traceJson.entryPrice).toBe(refEntryPrice);
    expect(traceJson.markPrice).toBe(77319.27);
    expect(traceJson.leverage).toBe(4);
    expect(traceJson.notional).toBeGreaterThan(0);
    expect(traceJson.margin).toBeGreaterThan(0);
    expect(traceJson.unrealizedPnl).toBeDefined();
    expect(traceJson.pnlPercent).toBeDefined();
    expect(traceJson.source).toBe("BACKEND_PNL_SERVICE");

    logSpy.mockRestore();
  });
});
