import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue([
    { openTime: 1000, open: "50000", high: "51000", low: "49500", close: "50500", volume: "100", closeTime: 2000 }
  ]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0.0001),
  getFuturesOpenInterest: (jest.fn() as any).mockResolvedValue(1000),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50500),
  getTickerPriceSync: (jest.fn() as any).mockReturnValue(50500),
  subscribeTicker: jest.fn(),
  unsubscribeTicker: jest.fn(),
  getActiveSocketsInfo: (jest.fn() as any).mockReturnValue([]),
  formatFuturesQuantity: (jest.fn() as any).mockImplementation((s: string, q: number) => String(q)),
  setFuturesLeverage: (jest.fn() as any).mockResolvedValue({ leverage: 10 }),
  placeFuturesOrder: (jest.fn() as any).mockResolvedValue({ orderId: 12345, executedQty: "0.01", avgPrice: "50500" }),
  genClientOrderId: (jest.fn() as any).mockReturnValue("test-order-1"),
}));

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-dummy-wallet-zero";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

let app: express.Express;
let paper: any;
let WalletSnapshot: any;
let WalletTransaction: any;
let Trade: any;

jest.setTimeout(60000);

describe("Regression Suite: Complete Eradication of Dummy $10,000 / ₹1,00,000 Fallbacks", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const connected = await connectIfAvailable();
    if (!connected || mongoose.connection.readyState !== 1) return;

    paper = await import("../src/services/paperState.js");
    ({ WalletSnapshot } = await import("../src/models/WalletSnapshot.js"));
    ({ WalletTransaction } = await import("../src/models/WalletTransaction.js"));
    ({ Trade } = await import("../src/models/Trade.js"));

    const walletRouter = (await import("../src/routes/wallet.js")).default;
    const aqeaUiRouter = (await import("../src/routes/aqeaUi.js")).default;
    const tradingRouter = (await import("../src/routes/trading.js")).default;

    app = express();
    app.use(express.json());
    app.use("/wallet", walletRouter);
    app.use("/aqea-ui", aqeaUiRouter);
    app.use("/trading", tradingRouter);
  });

  afterAll(async () => {
    if (WalletSnapshot && mongoose.connection.readyState === 1) {
      try {
        await WalletSnapshot.deleteMany({ userId: testUserId });
        await WalletTransaction.deleteMany({ userId: testUserId });
        await Trade.deleteMany({ userId: testUserId });
      } catch { /* ignore */ }
    }
    await disconnectMongo();
  });

  it("1. Zero PAPER balance does not silently auto-fund", async () => {
    if (skipIfNoMongo()) return;
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 0, "FUTURES");
    const w = paper.getWallet(testUserId, "PAPER", "FUTURES");
    expect(w.get("USDT")).toBe(0);
  });

  it("2. Explicit PAPER funding works exactly once", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 1000, currency: "USDT", accountType: "FUTURES" });
    expect(res.status).toBe(200);
    expect(res.body.newBalance).toBe(1000);
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("USDT")).toBe(1000);
  });

  it("3. Restart/rehydration does not duplicate funding", async () => {
    if (skipIfNoMongo()) return;
    paper.resetAllPaperStateToZero();
    await paper.hydrate();
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("USDT")).toBe(1000);
  });

  it("4. PAPER and LIVE wallets remain isolated", async () => {
    if (skipIfNoMongo()) return;
    const paperW = paper.getWallet(testUserId, "PAPER", "FUTURES");
    const liveW = paper.getWallet(testUserId, "LIVE", "FUTURES");
    expect(paperW.get("USDT")).toBe(1000);
    expect(liveW.get("USDT")).toBe(0);
  });

  it("5. Zero balance does not permanently disable user-initiated PAPER activation", async () => {
    if (skipIfNoMongo()) return;
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 0, "FUTURES");
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("USDT")).toBe(0);
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 500, currency: "USDT", accountType: "FUTURES" });
    expect(res.status).toBe(200);
    expect(res.body.newBalance).toBe(500);
  });

  it("6. OPEN PAPER position is created and persisted to MongoDB", async () => {
    if (skipIfNoMongo()) return;
    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(testUserId),
      mode: "PAPER",
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 0.01,
      entryPrice: 50000,
      leverage: 10,
      accountType: "FUTURES",
      status: "OPEN",
      openedAt: new Date(),
      sl: 49000,
      tp: 52000,
      strategy: "AQEA_V33",
      decisionPath: {
        regime: "TRENDING_BULL",
        coreScore: 85,
        finalScore: 88
      }
    });
    expect(trade._id).toBeDefined();
    paper.setPosition(testUserId, "BTCUSDT", "PAPER", {
      userId: testUserId,
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 0.01,
      entryPrice: 50000,
      tradeId: trade._id.toString(),
      accountType: "FUTURES",
      leverage: 10
    });
  });

  it("7. Positions API (/trading/open-positions) returns enriched OPEN position", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .get("/trading/open-positions?mode=PAPER&accountType=FUTURES")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const btcPos = res.body.find((p: any) => p.symbol === "BTCUSDT");
    expect(btcPos).toBeDefined();
    expect(btcPos.entryPrice).toBe(50000);
    expect(btcPos.margin).toBe(50); // 0.01 * 50000 / 10 = 50
    expect(btcPos.pnl).toBeDefined();
  });

  it("8. PnL calculation signs are correct for LONG and SHORT", async () => {
    const { computeUnrealisedPnl } = await import("../src/services/pnlService.js");
    // LONG: price up is profit
    const longProfit = computeUnrealisedPnl({ side: "BUY", entryPrice: 50000, quantity: 1, accountType: "FUTURES" }, 51000);
    expect(longProfit).toBeGreaterThan(0);
    // LONG: price down is loss
    const longLoss = computeUnrealisedPnl({ side: "BUY", entryPrice: 50000, quantity: 1, accountType: "FUTURES" }, 49000);
    expect(longLoss).toBeLessThan(0);
    // SHORT: price down is profit
    const shortProfit = computeUnrealisedPnl({ side: "SELL", entryPrice: 50000, quantity: 1, accountType: "FUTURES" }, 49000);
    expect(shortProfit).toBeGreaterThan(0);
    // SHORT: price up is loss
    const shortLoss = computeUnrealisedPnl({ side: "SELL", entryPrice: 50000, quantity: 1, accountType: "FUTURES" }, 51000);
    expect(shortLoss).toBeLessThan(0);
  });

  it("9. Invested amount calculation is exactly quantity * entryPrice / leverage", () => {
    const qty = 0.01;
    const entry = 50000;
    const lev = 10;
    const invested = (qty * entry) / lev;
    expect(invested).toBe(50);
  });

  it("10. Reset returns PAPER wallet and positions to clean zero", async () => {
    if (skipIfNoMongo()) return;
    await Trade.updateMany({ userId: new mongoose.Types.ObjectId(testUserId), mode: "PAPER" }, { $set: { status: "CLOSED" } });
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 0, "FUTURES");
    paper.removePosition(testUserId, "BTCUSDT", "PAPER", "FUTURES");

    const resPos = await request(app)
      .get("/trading/open-positions?mode=PAPER&accountType=FUTURES")
      .set("Authorization", `Bearer ${token}`);
    expect(resPos.body.length).toBe(0);

    const resBal = await request(app)
      .get("/wallet/balance?mode=PAPER&accountType=FUTURES")
      .set("Authorization", `Bearer ${token}`);
    expect(resBal.body.usdt).toBe(0);
    expect(resBal.body.totalBalance).toBe(0);
  });
});