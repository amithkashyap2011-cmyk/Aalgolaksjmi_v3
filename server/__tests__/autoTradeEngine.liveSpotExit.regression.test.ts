import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * Regression: LIVE spot exits (2026-09-23).
 *
 * - Two exit paths (SL/TP monitor + scheduler) can close the same position
 *   concurrently; only one exchange SELL may be sent.
 * - An order-book rejection falls back to Binance Convert (how small LIVE
 *   spot positions are opened), but a timeout must not, since it may have filled.
 * - Flooring to the lot step (495079.57 → 495079) must not leave an OPEN
 *   unsellable dust remainder.
 */
import { jest } from "@jest/globals";

process.env.ALLOW_MANUAL_LIVE_TRADES = "true";

const mockPlaceOrder = jest.fn() as any;
const mockConvert = jest.fn() as any;
const mockGetAccount = jest.fn() as any;

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue([]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(0.00000503),
  getTickerPriceSync: () => 0.00000503,
  formatQuantity: async (_s: string, q: number) => String(Math.floor(q)),
  genClientOrderId: () => "aalgo-exit_test",
  placeOrder: mockPlaceOrder,
  convertSpotMarket: mockConvert,
  getAccount: mockGetAccount,
}));
jest.unstable_mockModule("../src/lib/crypto.js", () => ({
  decrypt: () => "decrypted",
  encrypt: () => ({ ciphertext: "", iv: "", authTag: "" }),
}));

import mongoose from "mongoose";

let paper: any, Trade: any, ApiKeys: any, handleExit: any;

const USER = new mongoose.Types.ObjectId().toString();
const SYMBOL = "PEPEUSDT";
const QTY = 495079.57;
const ENTRY = 0.00000517;

beforeAll(async () => {
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
  paper = await import("../src/services/paperState.js");
  ({ Trade } = await import("../src/models/Trade.js"));
  ({ ApiKeys } = await import("../src/models/ApiKeys.js"));
  ({ handleExit } = await import("../src/services/autoTradeEngine.js"));
  jest.spyOn(ApiKeys, "findOne").mockResolvedValue({
    encryptedKey: "k", iv: "i", authTag: "a", encryptedSecret: "s", ivSecret: "i", authTagSecret: "a",
  } as never);
});

afterAll(async () => {
  if (Trade && mongoose.connection.readyState === 1) {
    try { await Trade.deleteMany({ userId: USER }); } catch { /* ignore */ }
  }
  await disconnectMongo();
});

beforeEach(() => {
  mockPlaceOrder.mockReset();
  mockConvert.mockReset();
  mockGetAccount.mockReset();
  mockGetAccount.mockResolvedValue([{ asset: "PEPE", free: String(QTY), locked: "0" }]);
});

async function openLivePepe() {
  const trade = await Trade.create({
    userId: USER, mode: "LIVE", symbol: SYMBOL, side: "BUY", quantity: QTY, entryPrice: ENTRY,
    leverage: 1, accountType: "SPOT", market: "CRYPTO", status: "OPEN", decisionPath: { source: "test-fixture" },
  });
  paper.setPosition(USER, SYMBOL, "LIVE", {
    userId: USER, symbol: SYMBOL, side: "BUY", quantity: QTY, entryPrice: ENTRY, leverage: 1,
    tradeId: trade._id.toString(), sl: 0.00000495, accountType: "SPOT", meta: {},
  });
  return trade;
}

describe("handleExit — LIVE spot", () => {
  test("concurrent exits of one position send a single exchange SELL", async () => {
    if (skipIfNoMongo()) return;
    const trade = await openLivePepe();
    mockPlaceOrder.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { orderId: 1, executedQty: "495079", cummulativeQuoteQty: "2.49", avgPrice: "0.00000503" };
    });

    await Promise.all([
      handleExit(USER, SYMBOL, "LIVE", "SPOT", "STOP_LOSS_HIT", 1.0, 0.00000479),
      handleExit(USER, SYMBOL, "LIVE", "SPOT", "DYNAMIC_DRAWDOWN_CUT", 1.0, 0.00000479),
    ]);

    expect(mockPlaceOrder).toHaveBeenCalledTimes(1);
    const closed = await Trade.findById(trade._id).lean();
    expect(closed.status).toBe("CLOSED");
  });

  test("lot-step rounding dust is booked as a full close, not an OPEN remainder", async () => {
    if (skipIfNoMongo()) return;
    const trade = await openLivePepe();
    mockPlaceOrder.mockResolvedValue({ orderId: 2, executedQty: "495079", cummulativeQuoteQty: "2.49", avgPrice: "0.00000503" });

    await handleExit(USER, SYMBOL, "LIVE", "SPOT", "STOP_LOSS_HIT", 1.0, 0.00000503);

    const closed = await Trade.findById(trade._id).lean();
    expect(closed.status).toBe("CLOSED");
    expect(paper.getPosition(USER, SYMBOL, "LIVE", "SPOT")).toBeUndefined();
  });

  test("an order-book rejection falls back to Binance Convert", async () => {
    if (skipIfNoMongo()) return;
    const trade = await openLivePepe();
    mockPlaceOrder.mockRejectedValue(new Error('Binance Spot 401: {"code":-2015,"msg":"Invalid API-key, IP, or permissions for action."}'));
    mockConvert.mockResolvedValue({ orderId: "conv-1", executedQty: String(QTY), cummulativeQuoteQty: "2.49", avgPrice: "0.00000503" });

    await handleExit(USER, SYMBOL, "LIVE", "SPOT", "STOP_LOSS_HIT", 1.0, 0.00000503);

    expect(mockConvert).toHaveBeenCalledWith("decrypted", "decrypted", expect.objectContaining({ symbol: SYMBOL, side: "SELL", quantity: QTY }));
    const closed = await Trade.findById(trade._id).lean();
    expect(closed.status).toBe("CLOSED");
  });

  test("a timeout does not fall back to Convert (the order may have filled)", async () => {
    if (skipIfNoMongo()) return;
    const trade = await openLivePepe();
    mockPlaceOrder.mockRejectedValue(new Error("The operation was aborted due to timeout"));

    await expect(handleExit(USER, SYMBOL, "LIVE", "SPOT", "STOP_LOSS_HIT", 1.0, 0.00000503)).rejects.toThrow(/timeout/);

    expect(mockConvert).not.toHaveBeenCalled();
    const stillOpen = await Trade.findById(trade._id).lean();
    expect(stillOpen.status).toBe("OPEN");
    paper.removePosition(USER, SYMBOL, "LIVE", "SPOT");
  });

  test("sells only the real free Spot balance when it is below the recorded qty", async () => {
    // Buy fee charged in PEPE: recorded 495079.57, wallet actually held 492649.94,
    // so Convert returned a quote with no quoteId and the exit failed forever.
    if (skipIfNoMongo()) return;
    const trade = await openLivePepe();
    mockGetAccount.mockResolvedValue([{ asset: "PEPE", free: "492649.94", locked: "0" }]);
    mockPlaceOrder.mockRejectedValue(new Error('Binance Spot 400: {"code":-1013,"msg":"Filter failure: NOTIONAL"}'));
    mockConvert.mockResolvedValue({ orderId: "conv-2", executedQty: "492649.94", cummulativeQuoteQty: "2.43", avgPrice: "0.00000493" });

    await handleExit(USER, SYMBOL, "LIVE", "SPOT", "STOP_LOSS_HIT", 1.0, 0.00000493);

    expect(mockPlaceOrder).toHaveBeenCalledWith("decrypted", "decrypted", expect.objectContaining({ quantity: "492649" }));
    expect(mockConvert).toHaveBeenCalledWith("decrypted", "decrypted", expect.objectContaining({ quantity: 492649.94 }));
    const closed = await Trade.findById(trade._id).lean();
    expect(closed.status).toBe("CLOSED");
  });

  test("funds swept into Simple Earn fail with a clear error and send no order", async () => {
    if (skipIfNoMongo()) return;
    const trade = await openLivePepe();
    mockGetAccount.mockResolvedValue([{ asset: "LDPEPE", free: "492649.94", locked: "0.00" }]);

    await expect(handleExit(USER, SYMBOL, "LIVE", "SPOT", "STOP_LOSS_HIT", 1.0, 0.00000493)).rejects.toThrow(/Simple Earn/);

    expect(mockPlaceOrder).not.toHaveBeenCalled();
    expect(mockConvert).not.toHaveBeenCalled();
    const stillOpen = await Trade.findById(trade._id).lean();
    expect(stillOpen.status).toBe("OPEN");
    paper.removePosition(USER, SYMBOL, "LIVE", "SPOT");
  });

  test("a failed balance read does not block the exit", async () => {
    if (skipIfNoMongo()) return;
    const trade = await openLivePepe();
    mockGetAccount.mockRejectedValue(new Error("The operation was aborted due to timeout"));
    mockPlaceOrder.mockResolvedValue({ orderId: 3, executedQty: "495079", cummulativeQuoteQty: "2.49", avgPrice: "0.00000503" });

    await handleExit(USER, SYMBOL, "LIVE", "SPOT", "STOP_LOSS_HIT", 1.0, 0.00000503);

    expect(mockPlaceOrder).toHaveBeenCalledWith("decrypted", "decrypted", expect.objectContaining({ quantity: "495079" }));
    const closed = await Trade.findById(trade._id).lean();
    expect(closed.status).toBe("CLOSED");
  });
});
