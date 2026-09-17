import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Regression: exit price must not drift from the price that ────────
 * ─── actually triggered the exit ───────────────────────────────────────
 *
 * Found live: a BTCUSDT position closed with exitReason "TP3_HIT" (a
 * take-profit hit) yet booked a net LOSS. Root cause: the exit *decision*
 * (ExitEngine.evaluateExit / PositionManager / AutoCloseEngine) is made
 * against ctx.ind.close — the close of the last of 200 5-minute candles,
 * up to ~5 minutes stale — but handleExit() then independently re-fetched
 * a brand-new 1-minute kline moments later to price the PAPER-mode fill.
 * Two different intervals, fetched at two different times: in a fast
 * market, price can (and did) move enough between them to flip a
 * genuinely-triggered take-profit into a net loss after fees, producing
 * exactly the "TP3_HIT but -$0.03" contradiction a user reported.
 *
 * Fix: handleExit() now accepts the triggerPrice the caller already used
 * to decide the exit, and books the PAPER-mode fill at that exact price
 * instead of re-fetching a fresh, different-interval kline. LIVE mode is
 * unaffected — it still always prices off the real broker fill.
 */
import { jest } from "@jest/globals";

const mockGetKlines = jest.fn() as any;
jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: mockGetKlines,
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50000),
  getTickerPriceSync: (jest.fn() as any).mockResolvedValue(50000),
}));

import mongoose from "mongoose";

let paper: any, Trade: any, handleExit: any;

const testUserId = new mongoose.Types.ObjectId().toString();
const SYMBOL = "BTCUSDT";

beforeAll(async () => {
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
  paper = await import("../src/services/paperState.js");
  ({ Trade } = await import("../src/models/Trade.js"));
  ({ handleExit } = await import("../src/services/autoTradeEngine.js"));
});

afterAll(async () => {
  if (Trade && mongoose.connection.readyState === 1) {
    try { await Trade.deleteMany({ userId: testUserId }); } catch { /* ignore */ }
  }
  await disconnectMongo();
});

beforeEach(() => {
  mockGetKlines.mockReset();
  mockGetKlines.mockResolvedValue([]);
});

async function openPaperPosition(entryPrice: number, quantity: number) {
  const trade = await Trade.create({
    userId: testUserId,
    mode: "PAPER",
    symbol: SYMBOL,
    side: "BUY",
    quantity,
    entryPrice,
    accountType: "SPOT",
    market: "CRYPTO",
    status: "OPEN",
    decisionPath: { source: "test-fixture" },
  });
  paper.setPosition(testUserId, SYMBOL, "PAPER", {
    userId: testUserId,
    symbol: SYMBOL,
    side: "BUY",
    quantity,
    entryPrice,
    tradeId: trade._id.toString(),
    accountType: "SPOT",
    leverage: 1,
    meta: {},
  });
  return trade;
}

describe("handleExit — PAPER mode books the fill at the price that triggered the exit", () => {
  test("uses triggerPrice, never a separately re-fetched kline, when triggerPrice is provided", async () => {
    if (skipIfNoMongo()) return;

    const entryPrice = 79165.92;
    const triggerPrice = 79300.0; // the price that actually satisfied TP3 (favorable move)
    const staleKlinePrice = 79135.78; // a DIFFERENT, later-fetched, lower price (would flip TP into a loss)

    mockGetKlines.mockResolvedValue([{ close: String(staleKlinePrice) }]);

    const trade = await openPaperPosition(entryPrice, 0.00033);

    await handleExit(testUserId, SYMBOL, "PAPER", "SPOT", "TP3_HIT", 1.0, triggerPrice);

    const closed = await Trade.findById(trade._id).lean();
    expect(closed!.status).toBe("CLOSED");
    expect(closed!.exitPrice).toBeCloseTo(triggerPrice, 6);
    expect(closed!.exitPrice).not.toBeCloseTo(staleKlinePrice, 6);

    // A take-profit exit priced at a genuinely higher price than entry must
    // book a net gain (net of the tiny two-sided taker fee), not a loss.
    expect(closed!.grossPnl).toBeGreaterThan(0);

    // The stale/duplicate re-fetch must never happen once a trigger price
    // is supplied — that redundant fetch was the actual root cause.
    expect(mockGetKlines).not.toHaveBeenCalled();
  });

  test("falls back to a fresh kline fetch only when no triggerPrice is supplied (e.g. legacy/manual close)", async () => {
    if (skipIfNoMongo()) return;

    const entryPrice = 79165.92;
    const fallbackPrice = 79300.0;
    mockGetKlines.mockResolvedValue([{ close: String(fallbackPrice) }]);

    const trade = await openPaperPosition(entryPrice, 0.00033);

    await handleExit(testUserId, SYMBOL, "PAPER", "SPOT", "MANUAL", 1.0);

    const closed = await Trade.findById(trade._id).lean();
    expect(closed!.exitPrice).toBeCloseTo(fallbackPrice, 6);
    expect(mockGetKlines).toHaveBeenCalledTimes(1);
  });
});
