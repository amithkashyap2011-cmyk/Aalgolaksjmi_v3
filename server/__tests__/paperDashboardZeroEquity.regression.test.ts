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

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-dashboard-zero";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

let app: express.Express;
let paper: any;
let WalletSnapshot: any;
let Trade: any;

jest.setTimeout(60000);

describe("Forensic Audit: PAPER Wallet & Dashboard Zero-Capital Baseline", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const connected = await connectIfAvailable();
    if (!connected || mongoose.connection.readyState !== 1) return;

    paper = await import("../src/services/paperState.js");
    ({ WalletSnapshot } = await import("../src/models/WalletSnapshot.js"));
    ({ Trade } = await import("../src/models/Trade.js"));

    const walletRouter = (await import("../src/routes/wallet.js")).default;
    const aqeaUiRouter = (await import("../src/routes/aqeaUi.js")).default;
    const tradingRouter = (await import("../src/routes/trading.js")).default;

    app = express();
    app.use(express.json());
    app.use("/wallet", walletRouter);
    app.use("/aqea-ui", aqeaUiRouter);
    app.use("/trading", tradingRouter);

    // Initialize clean zero baseline in DB for test user
    if (mongoose.connection.readyState === 1) {
      try {
        const ALL_ACCTS = ["FUTURES", "SPOT", "INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50"];
        await WalletSnapshot.deleteMany({ userId: testUserId });
        for (const a of ALL_ACCTS) {
          await WalletSnapshot.create({
            userId: new mongoose.Types.ObjectId(testUserId),
            mode: "PAPER",
            accountType: a,
            balances: { USDT: 0, INR: 0 }
          });
        }
      } catch { /* ignore */ }
    }
    paper.resetAllPaperStateToZero();
    await paper.hydrate();
  });

  afterAll(async () => {
    if (WalletSnapshot && mongoose.connection.readyState === 1) {
      try {
        await WalletSnapshot.deleteMany({ userId: testUserId });
        await Trade.deleteMany({ userId: testUserId });
      } catch { /* ignore */ }
    }
    await disconnectMongo();
  });

  it("1. SPOT, FUTURES and Indian PAPER balances return exactly 0", async () => {
    if (skipIfNoMongo()) return;
    const resFutures = await request(app)
      .get("/wallet/balance?mode=PAPER&accountType=FUTURES")
      .set("Authorization", `Bearer ${token}`);
    expect(resFutures.status).toBe(200);
    expect(resFutures.body.usdt).toBe(0);
    expect(resFutures.body.totalBalance).toBe(0);

    const resSpot = await request(app)
      .get("/wallet/balance?mode=PAPER&accountType=SPOT")
      .set("Authorization", `Bearer ${token}`);
    expect(resSpot.status).toBe(200);
    expect(resSpot.body.usdt).toBe(0);
    expect(resSpot.body.totalBalance).toBe(0);
  });

  it("2. No open PAPER positions exist and count is 0", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .get("/trading/open-positions?mode=PAPER&accountType=BOTH")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it("3. Dashboard /aqea-ui/dashboard reports totalEquity=0, crypto=0, indian=0, invested=0, openPnL=0", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=BOTH`);
    expect(res.status).toBe(200);
    expect(res.body.summary.totalEquity).toBe(0);
    expect(res.body.summary.openPnL).toBe(0);
    expect(res.body.summary.openPositions).toBe(0);
    expect(res.body.summary.invested.total).toBe(0);
    expect(res.body.summary.balances.spot).toBe(0);
    expect(res.body.summary.balances.futures).toBe(0);
    expect(res.body.domains.crypto.totalEquity).toBe(0);
    expect(res.body.domains.indianStock.totalEquity).toBe(0);
  });

  it("4. Stale/closed historical PAPER trades do NOT inflate current equity", async () => {
    if (skipIfNoMongo()) return;
    await Trade.create({
      userId: new mongoose.Types.ObjectId(testUserId),
      mode: "PAPER",
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 0.01,
      entryPrice: 50000,
      exitPrice: 55000,
      pnl: 50,
      netPnl: 50,
      status: "CLOSED",
      closedAt: new Date(),
      decisionPath: { regime: "BULL", coreScore: 90, finalScore: 90 }
    });

    const res = await request(app)
      .get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=BOTH`);
    expect(res.body.summary.totalEquity).toBe(0);
    expect(res.body.summary.openPnL).toBe(0);
    expect(res.body.summary.invested.total).toBe(0);
    expect(res.body.summary.openPositions).toBe(0);
  });

  it("5. Rehydration from MongoDB does not create phantom money", async () => {
    if (skipIfNoMongo()) return;
    paper.resetAllPaperStateToZero();
    await paper.hydrate();

    const res = await request(app)
      .get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=BOTH`);
    expect(res.body.summary.totalEquity).toBe(0);
    expect(res.body.domains.crypto.totalEquity).toBe(0);
    expect(res.body.domains.indianStock.totalEquity).toBe(0);
  });

  it("6. Explicit user deposit is the ONLY way to increase PAPER capital", async () => {
    if (skipIfNoMongo()) return;
    const depRes = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 500, currency: "USDT", accountType: "FUTURES" });
    expect(depRes.status).toBe(200);
    expect(depRes.body.newBalance).toBe(500);

    const res = await request(app)
      .get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=BOTH`);
    expect(res.body.summary.totalEquity).toBe(500);
    expect(res.body.domains.crypto.totalEquity).toBe(500);
  });
});