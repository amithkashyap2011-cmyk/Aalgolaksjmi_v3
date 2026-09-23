import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * Regression (2026-09-23): a LIVE SPOT account whose USDT is fully deployed
 * returned early from the scheduler ("0 balance ... Skipping"), so its open
 * positions were never reviewed by AI exit management. It must now review
 * the held symbols only (no new entries) and book profit when the AI turns
 * against an in-profit position — and never sell at a loss on that signal.
 */
import { jest } from "@jest/globals";

process.env.ALLOW_MANUAL_LIVE_TRADES = "true";

const prices = new Map<string, number>();
const mockPlaceOrder = jest.fn() as any;
const mockBuildContext = jest.fn() as any;

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue([]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
  getFuturesOpenInterest: (jest.fn() as any).mockResolvedValue(0),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(0),
  getTickerPriceSync: (symbol: string) => prices.get(symbol) ?? null,
  subscribeTicker: jest.fn(),
  unsubscribeTicker: jest.fn(),
  getActiveSocketsInfo: (jest.fn() as any).mockReturnValue([]),
  formatQuantity: async (_s: string, q: number) => String(Math.floor(q)),
  formatFuturesQuantity: async (_s: string, q: number) => String(q),
  genClientOrderId: () => "aalgo-exit_test",
  placeOrder: mockPlaceOrder,
  convertSpotMarket: jest.fn(),
}));
jest.unstable_mockModule("../src/services/agentService.js", () => ({
  buildContext: mockBuildContext,
}));
jest.unstable_mockModule("../src/routes/wallet.js", () => ({
  default: () => undefined,
  computeAccountBalance: async () => ({ usdt: 0, totalBalance: 0 }),
}));
jest.unstable_mockModule("../src/lib/crypto.js", () => ({
  decrypt: () => "decrypted",
  encrypt: () => ({ ciphertext: "", iv: "", authTag: "" }),
}));

import mongoose from "mongoose";

jest.setTimeout(60000);

let paper: any, Trade: any, Settings: any, ApiKeys: any, AQEAEngine: any, processUser: any;
let decideSpy: any;

const USER = new mongoose.Types.ObjectId().toString();
const SYMBOL = "PEPEUSDT";
const ENTRY = 0.00000517;
const QTY = 495079.57;

function bearishDecision() {
  return {
    decision: "HOLD",
    confidence: 50,
    riskApproved: false,
    reasons: [],
    decisionPath: {},
    meta: { lakshmiEnsemble: { ensembleFusion: { direction: "SHORT", buyProbability: 0.2, sellProbability: 0.5 } } },
  };
}

beforeAll(async () => {
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
  paper = await import("../src/services/paperState.js");
  ({ Trade } = await import("../src/models/Trade.js"));
  ({ Settings } = await import("../src/models/Settings.js"));
  ({ ApiKeys } = await import("../src/models/ApiKeys.js"));
  ({ AQEAEngine } = await import("../src/services/aqea/engine.js"));
  ({ processUser } = await import("../src/services/autoTradeEngine.js"));

  jest.spyOn(ApiKeys, "findOne").mockResolvedValue({
    encryptedKey: "k", iv: "i", authTag: "a", encryptedSecret: "s", ivSecret: "i", authTagSecret: "a",
  } as never);
  decideSpy = jest.spyOn(AQEAEngine, "decide");

  await Settings.create({
    userId: USER, autoTrade: true, autoTradeSpot: true, autoTradeFutures: false,
    accountType: "SPOT", defaultMode: "LIVE", allowedSymbols: ["BTCUSDT"], aiFlipExitMinProfitR: 0.3,
  });
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    try {
      await Trade.deleteMany({ userId: USER });
      await Settings.deleteMany({ userId: USER });
    } catch { /* ignore */ }
  }
  await disconnectMongo();
});

beforeEach(() => {
  mockPlaceOrder.mockReset();
  mockBuildContext.mockReset();
  decideSpy?.mockReset();
  decideSpy?.mockResolvedValue(bearishDecision());
});

async function openLivePepe() {
  const trade = await Trade.create({
    userId: USER, mode: "LIVE", symbol: SYMBOL, side: "BUY", quantity: QTY, entryPrice: ENTRY, leverage: 1,
    sl: 0.00000495, tp: 0.00000548, accountType: "SPOT", market: "CRYPTO", status: "OPEN",
    decisionPath: { source: "test-fixture" },
  });
  paper.setPosition(USER, SYMBOL, "LIVE", {
    userId: USER, symbol: SYMBOL, side: "BUY", quantity: QTY, entryPrice: ENTRY, leverage: 1,
    tradeId: trade._id.toString(), sl: 0.00000495, tp: 0.00000548, accountType: "SPOT", meta: {},
  });
  return trade;
}

function marketAt(price: number) {
  prices.set(SYMBOL, price);
  mockBuildContext.mockResolvedValue({
    bars: [{ open: price, high: price, low: price, close: price, volume: 1 }],
    ind: { close: price, atr14: price * 0.01, adx14: 25 },
    fundingRate: 0,
  });
}

describe("AI profit booking on held LIVE positions of a fully invested account", () => {
  test("reviews only the held symbol and sells once the AI stays bearish while in profit", async () => {
    if (skipIfNoMongo()) return;
    const trade = await openLivePepe();
    marketAt(0.0000053); // +2.5% gross, above 0.3R (~1.28%) after fees
    mockPlaceOrder.mockResolvedValue({ orderId: 7, executedQty: "495079", cummulativeQuoteQty: "2.62", avgPrice: "0.0000053" });

    await processUser(USER, "SPOT");
    expect(mockPlaceOrder).not.toHaveBeenCalled(); // first bearish evaluation only arms it
    await processUser(USER, "SPOT");

    expect(decideSpy.mock.calls.map((c: any[]) => c[0])).toEqual([SYMBOL, SYMBOL]); // held symbol only, no BTCUSDT entry scan
    expect(mockPlaceOrder).toHaveBeenCalledTimes(1);
    expect(mockPlaceOrder.mock.calls[0][2]).toMatchObject({ symbol: SYMBOL, side: "SELL" });
    const closed = await Trade.findById(trade._id).lean();
    expect(closed.status).toBe("CLOSED");
    expect(closed.meta.exitReason).toBe("AI_BOOK_PROFIT");
  });

  test("does not sell a losing position on a bearish AI signal", async () => {
    if (skipIfNoMongo()) return;
    const trade = await openLivePepe();
    marketAt(0.000005); // -3.3%

    for (let i = 0; i < 3; i++) await processUser(USER, "SPOT");

    expect(mockPlaceOrder).not.toHaveBeenCalled();
    const stillOpen = await Trade.findById(trade._id).lean();
    expect(stillOpen.status).toBe("OPEN");
    paper.removePosition(USER, SYMBOL, "LIVE", "SPOT");
  });
});
