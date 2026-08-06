import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── /wallet/transfer tests ─────────────────────────────
 *
 * Both transfer kinds are simulated (PAPER mode only, no real payment
 * processor or Binance sub-account integration exists in this app):
 *  - internal: moves dummy USDT between the user's own Spot/Futures wallets
 *  - external: a one-way simulated "send to Binance main account" (debits
 *    the wallet, records a WITHDRAW transaction, no real transfer happens)
 */
import { jest } from '@jest/globals';
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

// wallet.ts itself never touches Binance, but it transitively imports the
// real autoTradeEngine.ts (for enableUser/processUser on deposit) which in
// turn imports agentService.ts — that module-level `import { getKlines,
// getLatestFundingRate }` needs both names to exist on this mock or the
// whole chain fails to link, even though a transfer test never calls them.
jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue([]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50000),
  getTickerPriceSync: (jest.fn() as any).mockResolvedValue(50000),
}));

const TEST_MONGO_URI = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/aalgolakshmi_test?replicaSet=rs0";
const JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-this-suite-only";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

let app: express.Express;
let paper: any, WalletTransaction: any;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const connected = await connectIfAvailable();
  if (!connected) return;
  paper = await import("../src/services/paperState.js");
  ({ WalletTransaction } = await import("../src/models/WalletTransaction.js"));

  const walletRouter = (await import("../src/routes/wallet.js")).default;
  app = express();
  app.use(express.json());
  app.use("/wallet", walletRouter);
});

afterAll(async () => {
  if (WalletTransaction) await WalletTransaction.deleteMany({ userId: testUserId });
  await disconnectMongo();
});

beforeEach(async () => {
  if (!WalletTransaction) return;
  await WalletTransaction.deleteMany({ userId: testUserId });
  await paper.setWalletBalance(testUserId, "PAPER", "USDT", 100, "FUTURES");
  await paper.setWalletBalance(testUserId, "PAPER", "USDT", 20, "SPOT");
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
});
