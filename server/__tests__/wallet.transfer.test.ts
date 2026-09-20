import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── /wallet/transfer tests ─────────────────────────────
 *
 * Covers:
 *  - PAPER internal: moves dummy USDT between Spot/Futures wallets
 *  - PAPER external: simulated withdraw to Binance main account
 *  - LIVE internal: Binance SAPI Universal Transfer (MAIN_UMFUTURE / UMFUTURE_MAIN)
 *  - LIVE validation: disallows external transfer, validates keys and errors
 */
import { jest } from '@jest/globals';
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const mockTransferAsset = jest.fn() as any;

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue([]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50000),
  getTickerPriceSync: (jest.fn() as any).mockResolvedValue(50000),
  transferAsset: mockTransferAsset,
}));

const TEST_MONGO_URI = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/aalgolakshmi_test?replicaSet=rs0";
const JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-this-suite-only";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

let app: express.Express;
let paper: any, WalletTransaction: any, ApiKeys: any, encrypt: any;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
  paper = await import("../src/services/paperState.js");
  ({ WalletTransaction } = await import("../src/models/WalletTransaction.js"));
  ({ ApiKeys } = await import("../src/models/ApiKeys.js"));
  ({ encrypt } = await import("../src/lib/crypto.js"));

  const walletRouter = (await import("../src/routes/wallet.js")).default;
  app = express();
  app.use(express.json());
  app.use("/wallet", walletRouter);
});

afterAll(async () => {
  if (WalletTransaction && mongoose.connection.readyState === 1) {
    try { await WalletTransaction.deleteMany({ userId: testUserId }); } catch { /* ignore */ }
  }
  if (ApiKeys && mongoose.connection.readyState === 1) {
    try { await ApiKeys.deleteMany({ userId: testUserId }); } catch { /* ignore */ }
  }
  await disconnectMongo();
});

beforeEach(async () => {
  if (WalletTransaction && mongoose.connection.readyState === 1) {
    try { await WalletTransaction.deleteMany({ userId: testUserId }); } catch { /* ignore */ }
  }
  if (ApiKeys && mongoose.connection.readyState === 1) {
    try { await ApiKeys.deleteMany({ userId: testUserId }); } catch { /* ignore */ }
  }
  mockTransferAsset.mockReset();
  if (paper) {
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 100, "FUTURES");
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 20, "SPOT");
  }
});

describe("POST /wallet/transfer", () => {
  test("internal: moves USDT from FUTURES to SPOT correctly", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "internal", amount: 30, from: "FUTURES", mode: "PAPER" });

    expect(res.status).toBe(200);
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("USDT")).toBeCloseTo(70, 6);
    expect(paper.getWallet(testUserId, "PAPER", "SPOT").get("USDT")).toBeCloseTo(50, 6);
  });

  test("internal: moves USDT from SPOT to FUTURES correctly", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "internal", amount: 10, from: "SPOT", mode: "PAPER" });

    expect(res.status).toBe(200);
    expect(paper.getWallet(testUserId, "PAPER", "SPOT").get("USDT")).toBeCloseTo(10, 6);
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("USDT")).toBeCloseTo(110, 6);
  });

  test("internal: rejects when source balance is insufficient, leaving both wallets untouched", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "internal", amount: 500, from: "FUTURES", mode: "PAPER" });

    expect(res.status).toBe(400);
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("USDT")).toBeCloseTo(100, 6);
    expect(paper.getWallet(testUserId, "PAPER", "SPOT").get("USDT")).toBeCloseTo(20, 6);
  });

  test("external: debits the wallet and records a WITHDRAW transaction", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "external", amount: 25, accountType: "FUTURES", mode: "PAPER" });

    expect(res.status).toBe(200);
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("USDT")).toBeCloseTo(75, 6);

    const txns = await WalletTransaction.find({ userId: testUserId, type: "WITHDRAW" }).lean();
    expect(txns.length).toBe(1);
    expect(txns[0].amount).toBeCloseTo(25, 6);
  });

  test("external: rejects when balance is insufficient", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "external", amount: 1000, accountType: "FUTURES", mode: "PAPER" });

    expect(res.status).toBe(400);
    expect(paper.getWallet(testUserId, "PAPER", "FUTURES").get("USDT")).toBeCloseTo(100, 6);
  });

  test("rejects non-positive amounts", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "internal", amount: 0, from: "FUTURES", mode: "PAPER" });
    expect(res.status).toBe(400);
  });

  test("rejects an unknown transfer kind", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "bogus", amount: 10, mode: "PAPER" });
    expect(res.status).toBe(400);
  });

  /* ── LIVE Transfers ─────────────────────────────────────── */
  test("LIVE: rejects external transfer with 400", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "external", amount: 10, mode: "LIVE" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("only internal transfers");
  });

  test("LIVE: rejects internal transfer if API keys missing", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "internal", amount: 10, from: "SPOT", mode: "LIVE" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Binance API keys required");
  });

  test("LIVE: successfully executes Spot to Futures transfer via Binance SAPI", async () => {
    if (skipIfNoMongo()) return;
    mockTransferAsset.mockResolvedValueOnce({ tranId: 777888999 });

    const encKey = encrypt("mock-binance-key-123");
    const encSec = encrypt("mock-binance-secret-456");
    await ApiKeys.create({
      userId: new mongoose.Types.ObjectId(testUserId),
      encryptedKey: encKey.ciphertext,
      encryptedSecret: encSec.ciphertext,
      iv: encKey.iv,
      authTag: encKey.authTag,
      ivSecret: encSec.iv,
      authTagSecret: encSec.authTag,
    });

    const res = await request(app)
      .post("/wallet/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "internal", amount: 15, from: "SPOT", mode: "LIVE" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tranId).toBe(777888999);
    expect(mockTransferAsset).toHaveBeenCalledWith("mock-binance-key-123", "mock-binance-secret-456", "MAIN_UMFUTURE", "USDT", 15);

    const txns = await WalletTransaction.find({ userId: testUserId, type: "ADJUSTMENT" }).lean();
    expect(txns.length).toBe(1);
    expect(txns[0].method).toBe("CRYPTO");
    expect(txns[0].capitalSource).toBe("TRANSFER");
    expect(txns[0].amount).toBe(15);
  });

  test("LIVE: successfully executes Futures to Spot transfer via Binance SAPI", async () => {
    if (skipIfNoMongo()) return;
    mockTransferAsset.mockResolvedValueOnce({ tranId: 111222333 });

    const encKey = encrypt("mock-binance-key-123");
    const encSec = encrypt("mock-binance-secret-456");
    await ApiKeys.create({
      userId: new mongoose.Types.ObjectId(testUserId),
      encryptedKey: encKey.ciphertext,
      encryptedSecret: encSec.ciphertext,
      iv: encKey.iv,
      authTag: encKey.authTag,
      ivSecret: encSec.iv,
      authTagSecret: encSec.authTag,
    });

    const res = await request(app)
      .post("/wallet/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "internal", amount: 20, from: "FUTURES", mode: "LIVE" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tranId).toBe(111222333);
    expect(mockTransferAsset).toHaveBeenCalledWith("mock-binance-key-123", "mock-binance-secret-456", "UMFUTURE_MAIN", "USDT", 20);
  });

  test("LIVE: returns 502 if Binance API transfer fails", async () => {
    if (skipIfNoMongo()) return;
    mockTransferAsset.mockRejectedValueOnce(new Error("MIN_TRANSFER_LIMIT"));

    const encKey = encrypt("mock-binance-key-123");
    const encSec = encrypt("mock-binance-secret-456");
    await ApiKeys.create({
      userId: new mongoose.Types.ObjectId(testUserId),
      encryptedKey: encKey.ciphertext,
      encryptedSecret: encSec.ciphertext,
      iv: encKey.iv,
      authTag: encKey.authTag,
      ivSecret: encSec.iv,
      authTagSecret: encSec.authTag,
    });

    const res = await request(app)
      .post("/wallet/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "internal", amount: 0.001, from: "FUTURES", mode: "LIVE" });

    expect(res.status).toBe(502);
    expect(res.body.error).toContain("MIN_TRANSFER_LIMIT");
  });
});
