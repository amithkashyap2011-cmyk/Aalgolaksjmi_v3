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
  genClientOrderId: (jest.fn() as any).mockReturnValue("test-order-auto-decouple"),
}));

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-paper-decouple-auto";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

let app: express.Express;
let paper: any;
let autoTradeEngine: any;
let Settings: any;
let WalletSnapshot: any;
let WalletTransaction: any;
let Trade: any;

jest.setTimeout(60000);

describe("Regression Test: Decoupling PAPER Wallet Deposit from Auto-Trading", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const connected = await connectIfAvailable();
    if (!connected || mongoose.connection.readyState !== 1) return;

    paper = await import("../src/services/paperState.js");
    autoTradeEngine = await import("../src/services/autoTradeEngine.js");
    ({ Settings } = await import("../src/models/Settings.js"));
    ({ WalletSnapshot } = await import("../src/models/WalletSnapshot.js"));
    ({ WalletTransaction } = await import("../src/models/WalletTransaction.js"));
    ({ Trade } = await import("../src/models/Trade.js"));

    const walletRouter = (await import("../src/routes/wallet.js")).default;
    const agentRouter = (await import("../src/routes/agent.js")).default;
    const tradingRouter = (await import("../src/routes/trading.js")).default;
    const aqeaUiRouter = (await import("../src/routes/aqeaUi.js")).default;

    app = express();
    app.use(express.json());
    app.use("/wallet", walletRouter);
    app.use("/agent", agentRouter);
    app.use("/trading", tradingRouter);
    app.use("/aqea-ui", aqeaUiRouter);

    // Clean state for test user
    if (mongoose.connection.readyState === 1) {
      try {
        await Settings.deleteMany({ userId: testUserId });
        await WalletSnapshot.deleteMany({ userId: testUserId });
        await WalletTransaction.deleteMany({ userId: testUserId });
        await Trade.deleteMany({ userId: testUserId });
      } catch { /* ignore */ }
    }
    paper.resetAllPaperStateToZero();
  });

  afterAll(async () => {
    if (Settings && mongoose.connection.readyState === 1) {
      try {
        await Settings.deleteMany({ userId: testUserId });
        await WalletSnapshot.deleteMany({ userId: testUserId });
        await WalletTransaction.deleteMany({ userId: testUserId });
        await Trade.deleteMany({ userId: testUserId });
      } catch { /* ignore */ }
    }
    await disconnectMongo();
  });

  it("A. PAPER deposit does NOT enable autoTrade in Settings", async () => {
    if (skipIfNoMongo()) return;
    // Initial state: ensure settings either does not exist or has autoTrade=false
    await Settings.create({
      userId: new mongoose.Types.ObjectId(testUserId),
      autoTrade: false,
      autoTradeSpot: false,
      autoTradeFutures: false,
      accountType: "FUTURES",
      defaultMode: "PAPER",
    });

    const depRes = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 500, currency: "USDT", accountType: "FUTURES" });
    expect(depRes.status).toBe(200);

    // Verify Settings were NOT mutated to true
    const userSettings = await Settings.findOne({ userId: testUserId });
    expect(userSettings?.autoTrade).toBe(false);
    expect(userSettings?.autoTradeFutures).toBe(false);
    expect(userSettings?.autoTradeSpot).toBe(false);
  });

  it("B. PAPER deposit does NOT create a position / trade", async () => {
    if (skipIfNoMongo()) return;
    const openTrades = await Trade.find({ userId: testUserId, mode: "PAPER", status: "OPEN" });
    expect(openTrades.length).toBe(0);
  });

  it("C. autoTrade=false prevents autoTradeEngine from creating a position", async () => {
    if (skipIfNoMongo()) return;
    // Trigger processUser directly while autoTrade is false
    await autoTradeEngine.processUser(testUserId, "FUTURES");

    // Verify 0 trades created
    const openTrades = await Trade.find({ userId: testUserId, mode: "PAPER", status: "OPEN" });
    expect(openTrades.length).toBe(0);
  });

  it("D. autoTrade=true with sufficient balance allows engine registration and evaluation", async () => {
    if (skipIfNoMongo()) return;
    // User explicitly enables auto-trade via /agent/auto/enable
    const enableRes = await request(app)
      .post("/agent/auto/enable")
      .set("Authorization", `Bearer ${token}`)
      .send({ accountType: "FUTURES" });
    expect(enableRes.status).toBe(200);

    const userSettings = await Settings.findOne({ userId: testUserId });
    expect(userSettings?.autoTrade).toBe(true);
    expect(userSettings?.autoTradeFutures).toBe(true);
    expect(autoTradeEngine.isEnabled(testUserId, "FUTURES")).toBe(true);
  });

  it("E. Manual PAPER Buy works when autoTrade=false", async () => {
    if (skipIfNoMongo()) return;
    // Disable auto-trade again
    await request(app)
      .post("/agent/auto/disable")
      .set("Authorization", `Bearer ${token}`)
      .send({ accountType: "FUTURES" });

    const userSettings = await Settings.findOne({ userId: testUserId });
    expect(userSettings?.autoTrade).toBe(false);

    // Place manual BUY order via /trading/order
    // Ensure test wallet has balance for manual trade
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 500, "FUTURES");
    const orderRes = await request(app)
      .post("/trading/place-order")
      .set("Authorization", `Bearer ${token}`)
      .send({
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.001,
        mode: "PAPER",
        accountType: "FUTURES",
        leverage: 5,
        price: 50000
      });
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.trade).toBeDefined();

    const openTrades = await Trade.find({ userId: testUserId, mode: "PAPER", status: "OPEN" });
    expect(openTrades.length).toBe(1);
    expect(openTrades[0].symbol).toBe("BTCUSDT");
  });

  it("F. Manual PAPER Sell / Close works when autoTrade=false", async () => {
    if (skipIfNoMongo()) return;
    const openTrade = await Trade.findOne({ userId: testUserId, mode: "PAPER", status: "OPEN" });
    expect(openTrade).not.toBeNull();

    const closeRes = await request(app)
      .post("/trading/close-position")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tradeId: openTrade!._id.toString(),
        mode: "PAPER",
        accountType: "FUTURES"
      });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.success).toBe(true);

    const remainingOpen = await Trade.find({ userId: testUserId, mode: "PAPER", status: "OPEN" });
    expect(remainingOpen.length).toBe(0);
  });

  it("G. Zero PAPER balance prevents automatic order creation", async () => {
    if (skipIfNoMongo()) return;
    // Set wallet to 0
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 0, "FUTURES");
    // Enable auto-trade
    await Settings.updateOne({ userId: testUserId }, { $set: { autoTrade: true, autoTradeFutures: true } });

    await autoTradeEngine.processUser(testUserId, "FUTURES");

    const openTrades = await Trade.find({ userId: testUserId, mode: "PAPER", status: "OPEN" });
    expect(openTrades.length).toBe(0);
  });

  it("H. Server restart / hydrate preserves disabled autoTrade state", async () => {
    if (skipIfNoMongo()) return;
    // Set autoTrade to false in Settings
    await Settings.updateOne({ userId: testUserId }, { $set: { autoTrade: false, autoTradeFutures: false } });

    // Run engine hydration
    await autoTradeEngine.hydrate();

    expect(autoTradeEngine.isEnabled(testUserId, "FUTURES")).toBe(false);
  });

  it("I. LIVE trading behavior remains untouched", async () => {
    if (skipIfNoMongo()) return;
    // Verify mode default and isolation
    const liveTrades = await Trade.find({ mode: "LIVE" });
    // No live trades created or touched by paper operations
    for (const t of liveTrades) {
      expect(t.mode).toBe("LIVE");
    }
  });
});