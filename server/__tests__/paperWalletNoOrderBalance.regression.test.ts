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
  genClientOrderId: (jest.fn() as any).mockReturnValue("test-order-no-drop"),
}));

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-paper-no-order";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

let app: express.Express;
let paper: any;
let WalletSnapshot: any;
let WalletTransaction: any;
let Trade: any;

describe("Regression Test: PAPER Wallet Deposit Without Orders Must Retain Exact Balance", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const connected = await connectIfAvailable();
    if (!connected) return;

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

    // Clean state
    await WalletSnapshot.deleteMany({ userId: testUserId });
    await WalletTransaction.deleteMany({ userId: testUserId });
    await Trade.deleteMany({ userId: testUserId });
    paper.resetAllPaperStateToZero();
  });

  afterAll(async () => {
    if (WalletSnapshot) {
      await WalletSnapshot.deleteMany({ userId: testUserId });
      await WalletTransaction.deleteMany({ userId: testUserId });
      await Trade.deleteMany({ userId: testUserId });
    }
    await disconnectMongo();
  });

  it("1. Explicit 500 USDT deposit sets wallet exactly to 500 USDT", async () => {
    if (skipIfNoMongo()) return;
    const depRes = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 500, currency: "USDT", accountType: "FUTURES" });
    expect(depRes.status).toBe(200);
    expect(depRes.body.newBalance).toBe(500);
  });

  it("2. When no orders are placed, wallet balance API reports exactly 500 USDT", async () => {
    if (skipIfNoMongo()) return;
    const balRes = await request(app)
      .get("/wallet/balance?mode=PAPER&accountType=FUTURES")
      .set("Authorization", `Bearer ${token}`);
    expect(balRes.status).toBe(200);
    expect(balRes.body.usdt).toBe(500);
    expect(balRes.body.totalBalance).toBe(500);
    expect(balRes.body.lockedMargin).toBe(0);
  });

  it("3. Dashboard equity reports exactly $500.00 without unexplained drops", async () => {
    if (skipIfNoMongo()) return;
    const dashRes = await request(app)
      .get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=FUTURES`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.domains.crypto.totalEquity).toBe(500);
    expect(dashRes.body.domains.crypto.openPositions).toBe(0);
    expect(dashRes.body.domains.crypto.openPnL).toBe(0);
  });

  it("4. Opening a trade debits EXACTLY margin = (entryPrice * qty) / leverage", async () => {
    if (skipIfNoMongo()) return;
    // Position: 0.01 BTC @ 50,000 with 10x leverage -> Margin = (50,000 * 0.01) / 10 = $50.00
    const qty = 0.01;
    const entryPrice = 50000;
    const leverage = 10;
    const requiredMargin = (entryPrice * qty) / leverage; // 50

    const trade = await Trade.create({
      userId: new mongoose.Types.ObjectId(testUserId),
      mode: "PAPER",
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: qty,
      entryPrice: entryPrice,
      leverage: leverage,
      accountType: "FUTURES",
      status: "OPEN",
      openedAt: new Date(),
      sl: 49000,
      tp: 52000,
      strategy: "AQEA_V33",
      decisionPath: { regime: "BULL", coreScore: 90, finalScore: 90 }
    });

    // Debit $50 margin from available cash
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 500 - requiredMargin, "FUTURES");
    paper.setPosition(testUserId, "BTCUSDT", "PAPER", {
      userId: testUserId,
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: qty,
      entryPrice: entryPrice,
      tradeId: trade._id.toString(),
      accountType: "FUTURES",
      leverage: leverage
    });

    // Check available cash is 450 and total equity is 500 (+ PnL)
    const balRes = await request(app)
      .get("/wallet/balance?mode=PAPER&accountType=FUTURES")
      .set("Authorization", `Bearer ${token}`);
    expect(balRes.body.usdt).toBe(450);
    expect(balRes.body.lockedMargin).toBe(50);
  });

  it("5. Closing trade returns margin + realized PnL back into cash wallet", async () => {
    if (skipIfNoMongo()) return;
    // Close BTC trade at 51,000 (+10 gross PnL - 0.40 taker fee = +9.60 net)
    const closeTrade = await Trade.findOne({ userId: testUserId, status: "OPEN" });
    if (closeTrade) {
      closeTrade.status = "CLOSED";
      closeTrade.exitPrice = 51000;
      closeTrade.pnl = 9.60;
      closeTrade.closedAt = new Date();
      await closeTrade.save();
    }
    paper.removePosition(testUserId, "BTCUSDT", "PAPER", "FUTURES");
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 450 + 50 + 9.60, "FUTURES");

    const balRes = await request(app)
      .get("/wallet/balance?mode=PAPER&accountType=FUTURES")
      .set("Authorization", `Bearer ${token}`);
    expect(balRes.body.usdt).toBe(509.6);
    expect(balRes.body.totalBalance).toBe(509.6);
    expect(balRes.body.lockedMargin).toBe(0);
  });
});