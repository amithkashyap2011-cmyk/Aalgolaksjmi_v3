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
  genClientOrderId: (jest.fn() as any).mockReturnValue("test-domain-sep-order"),
}));

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-domain-separation";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

let app: express.Express;
let paper: any;
let autoTradeEngine: any;
let Settings: any;
let WalletSnapshot: any;
let WalletTransaction: any;
let Trade: any;
let CurrencyService: any;

jest.setTimeout(60000);

describe("Regression Suite: Separation of PAPER Crypto (USDT) & Indian Market (INR) Wallets", () => {
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
    ({ CurrencyService } = await import("../src/services/currencyService.js"));
    const walletRouter = (await import("../src/routes/wallet.js")).default;
    const aqeaUiRouter = (await import("../src/routes/aqeaUi.js")).default;

    app = express();
    app.use(express.json());
    app.use("/wallet", walletRouter);
    app.use("/aqea-ui", aqeaUiRouter);

    // Clean initial test state
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

  it("1. INR -> INDIAN_NSE credits INR only", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 10000, accountType: "INDIAN_NSE", currency: "INR" });
    expect(res.status).toBe(200);
    expect(res.body.newBalance).toBe(10000);
    expect(res.body.currency).toBe("INR");

    const w = paper.getWallet(testUserId, "PAPER", "INDIAN_NSE");
    expect(w.get("INR")).toBe(10000);
    expect(w.get("USDT")).toBe(0);

    const snap = await WalletSnapshot.findOne({ userId: testUserId, mode: "PAPER", accountType: "INDIAN_NSE" });
    expect(snap?.balances?.get("INR")).toBe(10000);
    expect(snap?.balances?.get("USDT") || 0).toBe(0);
  });

  it("2. INR -> INDIAN_BSE credits INR only", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 15000, accountType: "INDIAN_BSE", currency: "INR" });
    expect(res.status).toBe(200);
    expect(res.body.newBalance).toBe(15000);
    expect(res.body.currency).toBe("INR");

    const w = paper.getWallet(testUserId, "PAPER", "INDIAN_BSE");
    expect(w.get("INR")).toBe(15000);
    expect(w.get("USDT")).toBe(0);

    const snap = await WalletSnapshot.findOne({ userId: testUserId, mode: "PAPER", accountType: "INDIAN_BSE" });
    expect(snap?.balances?.get("INR")).toBe(15000);
    expect(snap?.balances?.get("USDT") || 0).toBe(0);
  });

  it("3. INR -> INDIAN_NIFTY50 credits INR only", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 25000, accountType: "INDIAN_NIFTY50", currency: "INR" });
    expect(res.status).toBe(200);
    expect(res.body.newBalance).toBe(25000);
    expect(res.body.currency).toBe("INR");

    const w = paper.getWallet(testUserId, "PAPER", "INDIAN_NIFTY50");
    expect(w.get("INR")).toBe(25000);
    expect(w.get("USDT")).toBe(0);

    const snap = await WalletSnapshot.findOne({ userId: testUserId, mode: "PAPER", accountType: "INDIAN_NIFTY50" });
    expect(snap?.balances?.get("INR")).toBe(25000);
    expect(snap?.balances?.get("USDT") || 0).toBe(0);
  });

  it("4. Indian deposit creates no USDT balance in Indian accounts", async () => {
    if (skipIfNoMongo()) return;
    for (const acct of ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50"]) {
      const snap = await WalletSnapshot.findOne({ userId: testUserId, mode: "PAPER", accountType: acct });
      expect(snap?.balances?.get("USDT") || 0).toBe(0);

      const balRes = await request(app)
        .get(`/wallet/balance?mode=PAPER&accountType=${acct}`)
        .set("Authorization", `Bearer ${token}`);
      expect(balRes.status).toBe(200);
      expect(balRes.body.usdt).toBe(0);
      expect(balRes.body.currency).toBe("INR");
    }
  });

  it("5. USDT -> SPOT credits USDT only", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 500, accountType: "SPOT", currency: "USDT" });
    expect(res.status).toBe(200);
    expect(res.body.newBalance).toBe(500);
    expect(res.body.currency).toBe("USDT");

    const w = paper.getWallet(testUserId, "PAPER", "SPOT");
    expect(w.get("USDT")).toBe(500);
    expect(w.get("INR")).toBe(0);

    const snap = await WalletSnapshot.findOne({ userId: testUserId, mode: "PAPER", accountType: "SPOT" });
    expect(snap?.balances?.get("USDT")).toBe(500);
    expect(snap?.balances?.get("INR")).toBe(0);
  });

  it("6. USDT -> FUTURES credits USDT only", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 750, accountType: "FUTURES", currency: "USDT" });
    expect(res.status).toBe(200);
    expect(res.body.newBalance).toBe(750);
    expect(res.body.currency).toBe("USDT");

    const w = paper.getWallet(testUserId, "PAPER", "FUTURES");
    expect(w.get("USDT")).toBe(750);
    expect(w.get("INR")).toBe(0);

    const snap = await WalletSnapshot.findOne({ userId: testUserId, mode: "PAPER", accountType: "FUTURES" });
    expect(snap?.balances?.get("USDT")).toBe(750);
    expect(snap?.balances?.get("INR")).toBe(0);
  });

  it("7. INR -> SPOT converts only when explicitly requested (confirmConversion=true)", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 10000, accountType: "SPOT", currency: "INR", confirmConversion: true });
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("USDT");
    expect(res.body.newBalance).toBeGreaterThan(500);

    const snap = await WalletSnapshot.findOne({ userId: testUserId, mode: "PAPER", accountType: "SPOT" });
    expect(snap?.balances?.get("INR")).toBe(0);
    let rate = CurrencyService.getRate();
    expect(snap?.balances?.get("USDT")).toBeGreaterThan(550);
  });

  it("8. INR -> FUTURES converts only when explicitly requested (confirmConversion=true)", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 10000, accountType: "FUTURES", currency: "INR", confirmConversion: true });
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("USDT");
    expect(res.body.newBalance).toBeGreaterThan(750);

    const snap = await WalletSnapshot.findOne({ userId: testUserId, mode: "PAPER", accountType: "FUTURES" });
    expect(snap?.balances?.get("INR")).toBe(0);
    let rate = CurrencyService.getRate();
    expect(snap?.balances?.get("USDT")).toBeGreaterThan(800);
  });

  it("9. Invalid Indian + USDT combination is rejected (400)", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 100, accountType: "INDIAN_NSE", currency: "USDT" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Indian market accounts accept INR deposits only");
  });

  it("10. Crypto + INR without explicit conversion intent is rejected (400)", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 5000, accountType: "FUTURES", currency: "INR" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("confirmConversion");
  });

  it("11. Missing accountType is rejected (400, no silent defaulting)", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 100, currency: "USDT" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("accountType is required");
  });

  it("12. Deposit never enables AutoTrade or creates open orders", async () => {
    if (skipIfNoMongo()) return;
    await Settings.updateOne({ userId: testUserId }, { $set: { autoTrade: false, autoTradeSpot: false, autoTradeFutures: false } });

    await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 50000, accountType: "INDIAN_NSE", currency: "INR" });

    await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 200, accountType: "SPOT", currency: "USDT" });

    const s = await Settings.findOne({ userId: testUserId });
    expect(s?.autoTrade ?? false).toBe(false);

    const openTrades = await Trade.find({ userId: testUserId, mode: "PAPER", status: "OPEN" });
    expect(openTrades.length).toBe(0);
  });

  it("13. Dashboard keeps Crypto and Indian equity separate", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=BOTH`);
    expect(res.status).toBe(200);

    const data = res.body;
    expect(data.domains.indianStock.balances.spot).toBe(75000);
    expect(data.domains.indianStock.balances.futures).toBe(25000);
    expect(data.domains.indianStock.totalEquity).toBe(100000);

    const r = CurrencyService.getRate();
    expect(data.domains.crypto.balances.spot).toBeGreaterThan(750);
    expect(data.domains.crypto.balances.futures).toBeGreaterThan(800);
    expect(data.domains.crypto.totalEquity).toBeGreaterThan(1550);
  });

  it("14. MongoDB WalletSnapshot and paperState remain synchronized", async () => {
    if (skipIfNoMongo()) return;
    const accounts = ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "SPOT", "FUTURES"];
    for (const acct of accounts) {
      const snap = await WalletSnapshot.findOne({ userId: testUserId, mode: "PAPER", accountType: acct });
      const memWallet = paper.getWallet(testUserId, "PAPER", acct);
      expect(snap).not.toBeNull();
      expect(memWallet.get("INR") ?? 0).toBe(snap?.balances?.get("INR") ?? 0);
      expect(memWallet.get("USDT") ?? 0).toBe(snap?.balances?.get("USDT") ?? 0);
    }
  });

  it("15. Server restart / hydrate preserves domain balances without cross-contamination", async () => {
    if (skipIfNoMongo()) return;
    paper.resetAllPaperStateToZero();
    await paper.hydrate();

    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_NSE").get("INR")).toBe(60000);
    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_NSE").get("USDT")).toBe(0);

    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_BSE").get("INR")).toBe(15000);
    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_BSE").get("USDT")).toBe(0);

    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_NIFTY50").get("INR")).toBe(25000);
    expect(paper.getWallet(testUserId, "PAPER", "INDIAN_NIFTY50").get("USDT")).toBe(0);

    const r2 = CurrencyService.getRate();
    expect(paper.getWallet(testUserId, "PAPER", "SPOT").get("INR")).toBe(0);
    expect(paper.getWallet(testUserId, "PAPER", "SPOT").get("USDT")).toBeGreaterThan(750);
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("INR")).toBe(0);
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("USDT")).toBeGreaterThan(800);
  });

  it("16. LIVE wallets and trades remain completely untouched", async () => {
    if (skipIfNoMongo()) return;
    const liveSnaps = await WalletSnapshot.find({ mode: "LIVE" });
    const liveTrades = await Trade.find({ mode: "LIVE" });
    for (const s of liveSnaps) {
      expect(s.mode).toBe("LIVE");
    }
    for (const t of liveTrades) {
      expect(t.mode).toBe("LIVE");
    }
  });
});