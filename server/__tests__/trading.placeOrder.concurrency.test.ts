import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Regression test: manual /place-order TOCTOU race ──
 *
 * This is the one proven-live concurrency bug from this session that
 * still had no automated regression test (flagged as the top roadmap item
 * in the prior Verification Report). Real HTTP requests via supertest
 * against the actual trading router, a real MongoDB replica set
 * (required for the transaction the fix depends on), and the real
 * paperState/Trade models — only binanceService is mocked, since price
 * lookups would otherwise hit the real Binance API for every request.
 *
 * The bug: `existing = paper.getPosition(...)` was read, then the
 * new/average/reduce decision was made, all BEFORE the wallet debit was
 * serialized through the per-wallet lock — so N concurrent orders on a
 * flat symbol each read "no position" and each created a brand new Trade
 * document instead of one correctly averaging into the others. Proven
 * live earlier this session with 20 and 30 concurrent orders producing
 * that many fragmented documents instead of one.
 */
import { jest } from '@jest/globals';
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50000),
  formatQuantity: (jest.fn() as any).mockImplementation(async (_s: string, q: number) => q.toFixed(6)),
  formatFuturesQuantity: (jest.fn() as any).mockImplementation(async (_s: string, q: number) => q.toFixed(6)),
  genClientOrderId: (jest.fn() as any).mockImplementation((prefix: string) => `${prefix}-${Math.random()}`),
  getKlines: (jest.fn() as any).mockResolvedValue([]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
  getFuturesOpenInterest: (jest.fn() as any).mockResolvedValue(0),
  getActiveSocketsInfo: (jest.fn() as any).mockReturnValue([]),
  setFuturesLeverage: (jest.fn() as any).mockResolvedValue(undefined),
  placeOrder: (jest.fn() as any).mockResolvedValue({ orderId: 1, executedQty: "1", avgPrice: "50000" }),
  placeFuturesOrder: (jest.fn() as any).mockResolvedValue({ orderId: 1, executedQty: "1", avgPrice: "50000" }),
}));

const TEST_MONGO_URI = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/aalgolakshmi_test?replicaSet=rs0";
const JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-this-suite-only";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

let app: express.Express;
let Trade: any, Settings: any, paper: any;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const connected = await connectIfAvailable();
  if (!connected) return;
  ({ Trade } = await import("../src/models/Trade.js"));
  ({ Settings } = await import("../src/models/Settings.js"));
  paper = await import("../src/services/paperState.js");

  const tradingRouter = (await import("../src/routes/trading.js")).default;
  app = express();
  app.use(express.json());
  app.use("/trading", tradingRouter);

  await Settings.findOneAndUpdate(
    { userId: testUserId },
    { userId: testUserId, allowedSymbols: ["BTCUSDT"], riskConfig: { maxPositionSizePct: 100, maxDailyLoss: 100000, maxWeeklyLoss: 100000, maxMonthlyLoss: 100000 } },
    { upsert: true }
  );
});

afterAll(async () => {
  if (Trade) await Trade.deleteMany({ userId: testUserId });
  if (Settings) await Settings.deleteMany({ userId: testUserId });
  await disconnectMongo();
});

beforeEach(async () => {
  if (!Trade) return;
  await Trade.deleteMany({ userId: testUserId });
  await paper.setWalletBalance(testUserId, "PAPER", "USDT", 100_000, "FUTURES");
});

describe("REGRESSION: manual /place-order TOCTOU race (proven live this session, now permanent)", () => {
  test("30 concurrent BUY orders on a flat symbol consolidate into exactly one position, not 30 fragmented documents", async () => {
    if (skipIfNoMongo()) return;
    const concurrency = 30;

    const responses = await Promise.all(
      Array.from({ length: concurrency }, () =>
        request(app)
          .post("/trading/place-order")
          .set("Authorization", `Bearer ${token}`)
          .send({ symbol: "BTCUSDT", side: "BUY", quantity: 0.001, mode: "PAPER", accountType: "FUTURES", leverage: 1 })
      )
    );

    const successes = responses.filter(r => r.status === 200);
    expect(successes.length).toBe(concurrency);

    const openTrades = await Trade.find({ userId: testUserId, symbol: "BTCUSDT", mode: "PAPER", status: "OPEN" }).lean();
    // This is the exact assertion that would have caught the original bug:
    // it previously produced 30 fragmented documents (quantity 0.001 each)
    // instead of 1 consolidated position (quantity 0.03).
    expect(openTrades.length).toBe(1);
    expect(openTrades[0].quantity).toBeCloseTo(0.001 * concurrency, 6);
  }, 30000);

  test("wallet debit exactly matches total notional across all concurrent orders — no lost updates", async () => {
    if (skipIfNoMongo()) return;
    const concurrency = 20;
    const price = 50000;
    const quantity = 0.001;
    const leverage = 1;
    const marginPerOrder = (quantity * price) / leverage;

    await Promise.all(
      Array.from({ length: concurrency }, () =>
        request(app)
          .post("/trading/place-order")
          .set("Authorization", `Bearer ${token}`)
          .send({ symbol: "BTCUSDT", side: "BUY", quantity, mode: "PAPER", accountType: "FUTURES", leverage })
      )
    );

    const wallet = paper.getWallet(testUserId, "PAPER", "FUTURES");
    const balance = wallet.get("USDT") ?? 0;
    expect(balance).toBeCloseTo(100_000 - marginPerOrder * concurrency, 2);
  }, 30000);
});
