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
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50000),
  getTickerPriceSync: (jest.fn() as any).mockReturnValue(50000),
  subscribeTicker: jest.fn(),
  unsubscribeTicker: jest.fn(),
  getActiveSocketsInfo: (jest.fn() as any).mockReturnValue([]),
  formatFuturesQuantity: (jest.fn() as any).mockImplementation((s: string, q: number) => String(q)),
  setFuturesLeverage: (jest.fn() as any).mockResolvedValue({ leverage: 10 }),
  placeFuturesOrder: (jest.fn() as any).mockResolvedValue({ orderId: 12345, executedQty: "0.01", avgPrice: "50000" }),
  genClientOrderId: (jest.fn() as any).mockReturnValue("test-3view-order"),
}));

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-3view-isolation";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

let app: express.Express;
let paper: any;
let Settings: any;
let WalletSnapshot: any;
let WalletTransaction: any;
let Trade: any;

jest.setTimeout(60000);

describe("Regression Suite: 3-View PAPER Wallet Architecture (Indian, Crypto, All Markets)", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const connected = await connectIfAvailable();
    if (!connected || mongoose.connection.readyState !== 1) return;

    paper = await import("../src/services/paperState.js");
    ({ Settings } = await import("../src/models/Settings.js"));
    ({ WalletSnapshot } = await import("../src/models/WalletSnapshot.js"));
    ({ WalletTransaction } = await import("../src/models/WalletTransaction.js"));
    ({ Trade } = await import("../src/models/Trade.js"));

    const walletRouter = (await import("../src/routes/wallet.js")).default;
    const aqeaUiRouter = (await import("../src/routes/aqeaUi.js")).default;

    app = express();
    app.use(express.json());
    app.use("/wallet", walletRouter);
    app.use("/aqea-ui", aqeaUiRouter);

    // Clean test state
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

  it("1. Sets up exact baseline: SPOT=$100, FUTURES=$200, NSE=10000, BSE=5000, NIFTY50=20000", async () => {
    if (skipIfNoMongo()) return;
    // Crypto deposits
    await request(app).post("/wallet/deposit/paper").set("Authorization", `Bearer ${token}`).send({ amount: 100, accountType: "SPOT", currency: "USDT" });
    await request(app).post("/wallet/deposit/paper").set("Authorization", `Bearer ${token}`).send({ amount: 200, accountType: "FUTURES", currency: "USDT" });
    // Indian deposits
    await request(app).post("/wallet/deposit/paper").set("Authorization", `Bearer ${token}`).send({ amount: 10000, accountType: "INDIAN_NSE", currency: "INR" });
    await request(app).post("/wallet/deposit/paper").set("Authorization", `Bearer ${token}`).send({ amount: 5000, accountType: "INDIAN_BSE", currency: "INR" });
    await request(app).post("/wallet/deposit/paper").set("Authorization", `Bearer ${token}`).send({ amount: 20000, accountType: "INDIAN_NIFTY50", currency: "INR" });

    expect(paper.getWallet(testUserId, "PAPER", "SPOT").get("USDT")).toBe(100);
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("USDT")).toBe(200);
    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_NSE").get("INR")).toBe(10000);
    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_BSE").get("INR")).toBe(5000);
    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_NIFTY50").get("INR")).toBe(20000);
  });

  it("2. Proves Crypto Tab strictly reports $300 USD and 0 Indian influence", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app).get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=CRYPTO`);
    expect(res.status).toBe(200);
    const crypto = res.body.domains.crypto;
    expect(crypto.currency).toBe("USD");
    expect(crypto.balances.spot).toBe(100);
    expect(crypto.balances.futures).toBe(200);
    expect(crypto.totalEquity).toBe(300);
  });

  it("3. Proves Indian Tab strictly reports 35,000 INR and 0 Crypto influence", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app).get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=INDIAN_MARKET`);
    expect(res.status).toBe(200);
    const indian = res.body.domains.indianStock;
    expect(indian.currency).toBe("INR");
    expect(indian.balances.nse).toBe(10000);
    expect(indian.balances.bse).toBe(5000);
    expect(indian.balances.nifty50).toBe(20000);
    expect(indian.balances.spot).toBe(15000); // NSE + BSE
    expect(indian.balances.futures).toBe(20000); // NIFTY50
    expect(indian.totalEquity).toBe(35000);
  });

  it("4. Proves All Markets / Combined summary equals exactly $300 + (35,000 / inrRate)", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app).get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=BOTH`);
    expect(res.status).toBe(200);
    const { summary, domains } = res.body;
    const inrRate = summary.inrRate;
    const expectedCombinedUsd = 300 + (35000 / inrRate);
    expect(summary.totalEquity).toBeCloseTo(expectedCombinedUsd, 2);
    expect(summary.totalEquityInr).toBeCloseTo(expectedCombinedUsd * inrRate, 0);
    expect(domains.crypto.totalEquity).toBe(300);
    expect(domains.indianStock.totalEquity).toBe(35000);
  });

  it("5. Proves changing Indian balance NEVER alters Crypto tab equity", async () => {
    if (skipIfNoMongo()) return;
    // Deposit additional 50,000 INR to Indian NSE
    await request(app).post("/wallet/deposit/paper").set("Authorization", `Bearer ${token}`).send({ amount: 50000, accountType: "INDIAN_NSE", currency: "INR" });

    const res = await request(app).get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=CRYPTO`);
    expect(res.body.domains.crypto.totalEquity).toBe(300); // Still exactly $300
    expect(res.body.domains.crypto.balances.spot).toBe(100);
    expect(res.body.domains.crypto.balances.futures).toBe(200);
  });

  it("6. Proves changing Crypto balance NEVER alters Indian tab equity", async () => {
    if (skipIfNoMongo()) return;
    // Deposit additional 500 USDT to Crypto SPOT
    await request(app).post("/wallet/deposit/paper").set("Authorization", `Bearer ${token}`).send({ amount: 500, accountType: "SPOT", currency: "USDT" });

    const res = await request(app).get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=INDIAN_MARKET`);
    expect(res.body.domains.indianStock.totalEquity).toBe(85000); // 35000 + 50000 = 85000 INR
    expect(res.body.domains.indianStock.balances.nse).toBe(60000);
    expect(res.body.domains.indianStock.balances.bse).toBe(5000);
    expect(res.body.domains.indianStock.balances.nifty50).toBe(20000);
  });

  it("7. Proves zero hardcoded fallback balances across all 5 accounts", async () => {
    if (skipIfNoMongo()) return;
    const freshUserId = new mongoose.Types.ObjectId().toString();
    const freshToken = jwt.sign({ sub: freshUserId }, JWT_SECRET);

    for (const acct of ["SPOT", "FUTURES", "INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50"]) {
      const bal = await request(app).get(`/wallet/balance?mode=PAPER&accountType=${acct}`).set("Authorization", `Bearer ${freshToken}`);
      expect(bal.status).toBe(200);
      expect(bal.body.totalBalance).toBe(0);
      expect(bal.body.realizedBalance).toBe(0);
    }
  });

  it("8. Server restart / hydrate preserves all 5 wallets in MongoDB without leakage", async () => {
    if (skipIfNoMongo()) return;
    paper.resetAllPaperStateToZero();
    await paper.hydrate();

    expect(paper.getWallet(testUserId, "PAPER", "SPOT").get("USDT")).toBe(600);
    expect(paper.getWallet(testUserId, "PAPER", "SPOT").get("INR")).toBe(0);
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("USDT")).toBe(200);
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("INR")).toBe(0);
    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_NSE").get("INR")).toBe(60000);
    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_NSE").get("USDT")).toBe(0);
    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_BSE").get("INR")).toBe(5000);
    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_BSE").get("USDT")).toBe(0);
    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_NIFTY50").get("INR")).toBe(20000);
    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_NIFTY50").get("USDT")).toBe(0);
  });
});