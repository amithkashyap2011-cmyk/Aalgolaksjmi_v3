import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { jest } from '@jest/globals';
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue([]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(612.35),
  getTickerPriceSync: (jest.fn() as any).mockReturnValue(612.35),
  isRestBanned: (jest.fn() as any).mockReturnValue(false),
}));

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

jest.setTimeout(30000);

let app: express.Express;
let Trade: any, paper: any;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  await connectIfAvailable();
  paper = await import("../src/services/paperState.js");
  ({ Trade } = await import("../src/models/Trade.js"));

  const tradingRouter = (await import("../src/routes/trading.js")).default;
  app = express();
  app.use(express.json());
  app.use("/trading", tradingRouter);
});

afterAll(async () => {
  if (Trade && mongoose?.connection?.readyState === 1) {
    try { await Trade.deleteMany({ userId: testUserId }); } catch { /* ignore */ }
  }
  await disconnectMongo();
});

describe("Leverage change → wallet margin adjustment", () => {
  const SYMBOL = "BNBUSDT";
  const ENTRY = 612.35;
  const QTY = 0.012346;

  async function setupPosition(leverage: number, walletUsdt: number) {
    // Set up wallet with starting balance
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", walletUsdt, "FUTURES");

    // Create DB trade
    const trade = Trade
      ? await Trade.create({
          userId: testUserId,
          symbol: SYMBOL,
          side: "BUY",
          quantity: QTY,
          entryPrice: ENTRY,
          leverage,
          mode: "PAPER",
          accountType: "FUTURES",
          status: "OPEN",
          sl: 550.0,
          tp: 700.0,
          entrySource: "TEST",
          decisionPath: {},
          authorizedVotes: {},
          shadowVotes: {},
          coreScore: 0,
          finalScore: 0,
        })
      : { _id: new mongoose.Types.ObjectId() };

    // Hydrate in-memory position
    paper.setPosition(testUserId, SYMBOL, "PAPER", {
      userId: testUserId,
      symbol: SYMBOL,
      side: "BUY",
      quantity: QTY,
      entryPrice: ENTRY,
      leverage,
      tradeId: trade._id.toString(),
      accountType: "FUTURES",
      sl: 550.0,
      tp: 700.0,
    });

    return { tradeId: trade._id.toString() };
  }

  async function cleanup(tradeId?: string) {
    if (Trade && mongoose?.connection?.readyState === 1) {
      if (tradeId) {
        try { await Trade.deleteOne({ _id: tradeId }); } catch { /* ignore */ }
      } else {
        try { await Trade.deleteMany({ userId: testUserId }); } catch { /* ignore */ }
      }
    }
    // Clean up in-memory position
    paper.removePosition(testUserId, SYMBOL, "PAPER", "FUTURES", tradeId);
    paper.removePosition(testUserId, SYMBOL, "PAPER", "FUTURES");
  }

  it("increasing leverage (4x→10x) should credit freed margin to wallet", async () => {
    if (skipIfNoMongo()) return;
    const initialMargin = (QTY * ENTRY) / 4; // ~1.89 USDT
    const startingWallet = 8.60; // Available USDT after opening position

    const { tradeId } = await setupPosition(4, startingWallet);

    const res = await request(app)
      .post("/trading/update-sl-tp")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tradeId,
        symbol: SYMBOL,
        leverage: 10,
        mode: "PAPER",
        accountType: "FUTURES",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.leverage).toBe(10);

    // Check wallet was credited with the freed margin
    const newMargin = (QTY * ENTRY) / 10; // ~0.76 USDT
    const marginFreed = initialMargin - newMargin; // ~1.13 USDT
    const wallet = paper.getWallet(testUserId, "PAPER", "FUTURES");
    const newAvailable = wallet.get("USDT");

    expect(newAvailable).toBeCloseTo(startingWallet + marginFreed, 2);

    // Verify in-memory position has updated leverage
    const memPos = paper.getPosition(testUserId, SYMBOL, "PAPER", "FUTURES");
    expect(memPos?.leverage).toBe(10);

    await cleanup(tradeId);
  });

  it("decreasing leverage (10x→4x) should debit additional margin from wallet", async () => {
    if (skipIfNoMongo()) return;
    const startingWallet = 8.60;

    const { tradeId } = await setupPosition(10, startingWallet);

    const res = await request(app)
      .post("/trading/update-sl-tp")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tradeId,
        symbol: SYMBOL,
        leverage: 4,
        mode: "PAPER",
        accountType: "FUTURES",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 10x margin = 0.756, 4x margin = 1.89 → wallet should lose ~1.13
    const oldMargin = (QTY * ENTRY) / 10;
    const newMargin = (QTY * ENTRY) / 4;
    const marginNeeded = newMargin - oldMargin; // ~1.13 USDT

    const wallet = paper.getWallet(testUserId, "PAPER", "FUTURES");
    const newAvailable = wallet.get("USDT");

    expect(newAvailable).toBeCloseTo(startingWallet - marginNeeded, 2);

    await cleanup(tradeId);
  });

  it("locked margin should reflect new leverage after change", async () => {
    if (skipIfNoMongo()) return;
    const startingWallet = 10.0;
    const { tradeId } = await setupPosition(5, startingWallet);

    // Before: margin = (0.012346 * 612.35) / 5 ≈ 1.51
    const stats = paper.getWalletStats(testUserId, "PAPER", "FUTURES");
    const marginBefore = stats.marginUsed;
    expect(marginBefore).toBeCloseTo((QTY * ENTRY) / 5, 2);

    // Change leverage to 20x
    await request(app)
      .post("/trading/update-sl-tp")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tradeId,
        symbol: SYMBOL,
        leverage: 20,
        mode: "PAPER",
        accountType: "FUTURES",
      });

    // After: margin = (0.012346 * 612.35) / 20 ≈ 0.38
    const statsAfter = paper.getWalletStats(testUserId, "PAPER", "FUTURES");
    expect(statsAfter.marginUsed).toBeCloseTo((QTY * ENTRY) / 20, 2);

    // Available should have increased by the freed margin
    const wallet = paper.getWallet(testUserId, "PAPER", "FUTURES");
    const expectedAvailable = startingWallet + (marginBefore - statsAfter.marginUsed);
    expect(wallet.get("USDT")).toBeCloseTo(expectedAvailable, 2);

    await cleanup(tradeId);
  });

  it("same leverage value should not change wallet", async () => {
    if (skipIfNoMongo()) return;
    const startingWallet = 8.60;
    const { tradeId } = await setupPosition(5, startingWallet);

    await request(app)
      .post("/trading/update-sl-tp")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tradeId,
        symbol: SYMBOL,
        leverage: 5, // Same as current
        mode: "PAPER",
        accountType: "FUTURES",
      });

    const wallet = paper.getWallet(testUserId, "PAPER", "FUTURES");
    expect(wallet.get("USDT")).toBeCloseTo(startingWallet, 4);

    await cleanup(tradeId);
  });

  it("SL/TP only update should not touch wallet", async () => {
    if (skipIfNoMongo()) return;
    const startingWallet = 8.60;
    const { tradeId } = await setupPosition(5, startingWallet);

    await request(app)
      .post("/trading/update-sl-tp")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tradeId,
        symbol: SYMBOL,
        sl: 600.0,
        tp: 650.0,
        mode: "PAPER",
        accountType: "FUTURES",
      });

    const wallet = paper.getWallet(testUserId, "PAPER", "FUTURES");
    expect(wallet.get("USDT")).toBeCloseTo(startingWallet, 4);

    await cleanup(tradeId);
  });
});
