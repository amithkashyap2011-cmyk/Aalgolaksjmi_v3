import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue([]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50000),
  getTickerPriceSync: (jest.fn() as any).mockResolvedValue(50000),
}));

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-dummy-wallet-zero";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

let app: express.Express;
let paper: any;
let WalletSnapshot: any;
let WalletTransaction: any;
let Trade: any;

describe("DUMMY / PAPER Complete Zero-Capital Regression Suite", () => {
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
    app = express();
    app.use(express.json());
    app.use("/wallet", walletRouter);
    app.use("/aqea-ui", aqeaUiRouter);
  });

  afterAll(async () => {
    if (WalletSnapshot) {
      await WalletSnapshot.deleteMany({ userId: testUserId });
      await WalletTransaction.deleteMany({ userId: testUserId });
      await Trade.deleteMany({ userId: testUserId });
    }
    await disconnectMongo();
  });

  it("TEST 1: New/uninitialized PAPER wallet defaults to 0 USDT and 0 INR", () => {
    const freshUser = new mongoose.Types.ObjectId().toString();
    const w = paper.getWallet(freshUser, "PAPER", "FUTURES");
    expect(w.get("USDT")).toBe(0);
    expect(w.get("INR")).toBe(0);
  });

  it("TEST 2: MongoDB PAPER WalletSnapshot stores USDT=0 and INR=0", async () => {
    if (skipIfNoMongo()) return;
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 0, "FUTURES");
    await paper.setWalletBalance(testUserId, "PAPER", "INR", 0, "FUTURES");

    const snap = await WalletSnapshot.findOne({ userId: testUserId, mode: "PAPER", accountType: "FUTURES" });
    expect(snap).toBeDefined();
    expect(snap.balances.get ? snap.balances.get("USDT") : snap.balances.USDT).toBe(0);
    expect(snap.balances.get ? snap.balances.get("INR") : snap.balances.INR).toBe(0);
  });

  it("TEST 3: Server restart / rehydration preserves 0 balance without creating funds", async () => {
    if (skipIfNoMongo()) return;
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 0, "FUTURES");
    paper.resetAllPaperStateToZero();
    await paper.hydrate();
    const w = paper.getWallet(testUserId, "PAPER", "FUTURES");
    expect(w.get("USDT")).toBe(0);
  });

  it("TEST 4: Repeated GET /wallet/balance requests keep balance at 0", async () => {
    if (skipIfNoMongo()) return;
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .get("/wallet/balance?mode=PAPER&accountType=FUTURES")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.usdt).toBe(0);
      expect(res.body.totalBalance).toBe(0);
      expect(res.body.lockedMargin).toBe(0);
    }
  });

  it("TEST 5: Repeated dashboard requests keep totalEquity at 0 when no positions open", async () => {
    if (skipIfNoMongo()) return;
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=BOTH`);
      expect(res.status).toBe(200);
      expect(res.body.summary.totalEquity).toBe(0);
      expect(res.body.domains.crypto.totalEquity).toBe(0);
      expect(res.body.domains.indianStock.totalEquity).toBe(0);
    }
  });

  it("TEST 6: Zero open positions means zero locked margin and zero portfolio equity", async () => {
    if (skipIfNoMongo()) return;
    const positions = paper.getOpenPositions(testUserId, "PAPER");
    expect(positions.length).toBe(0);
    const res = await request(app)
      .get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=BOTH`);
    expect(res.body.summary.invested.total).toBe(0);
    expect(res.body.summary.totalEquity).toBe(0);
  });

  it("TEST 7: Closing open PAPER positions reduces open positions count to 0", async () => {
    if (skipIfNoMongo()) return;
    paper.setPosition(testUserId, "BTCUSDT", "PAPER", {
      userId: testUserId,
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 0.1,
      entryPrice: 50000,
      tradeId: new mongoose.Types.ObjectId().toString(),
      accountType: "FUTURES",
      leverage: 10
    });
    expect(paper.getOpenPositions(testUserId, "PAPER").length).toBe(1);
    paper.removePosition(testUserId, "BTCUSDT", "PAPER", "FUTURES");
    expect(paper.getOpenPositions(testUserId, "PAPER").length).toBe(0);
  });

  it("TEST 8: LIVE/REAL wallets remain completely unchanged and isolated", async () => {
    if (skipIfNoMongo()) return;
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 0, "FUTURES");
    const paperWallet = paper.getWallet(testUserId, "PAPER", "FUTURES");
    const liveWallet = paper.getWallet(testUserId, "LIVE", "FUTURES");
    expect(paperWallet.get("USDT")).toBe(0);
    expect(liveWallet.get("USDT")).toBe(0);
  });

  it("TEST 9: A legitimate PAPER deposit increases wallet balance exactly once", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 500, accountType: "FUTURES" });
    expect(res.status).toBe(200);
    expect(res.body.newBalance).toBe(500);
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("USDT")).toBe(500);
    // Clean back to 0
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 0, "FUTURES");
  });

  it("TEST 10: Repeated dashboard calls do not synthesize/create money", async () => {
    if (skipIfNoMongo()) return;
    const initialRes = await request(app)
      .get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=BOTH`);
    const secondRes = await request(app)
      .get(`/aqea-ui/dashboard?userId=${testUserId}&accountType=BOTH`);
    expect(initialRes.body.summary.totalEquity).toBe(0);
    expect(secondRes.body.summary.totalEquity).toBe(0);
  });
});