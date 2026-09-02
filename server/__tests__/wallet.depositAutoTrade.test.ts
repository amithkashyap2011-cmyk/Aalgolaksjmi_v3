import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Regression test: deposit NEVER enables or triggers autoTrade ──
 *
 * Requirements:
 * - A successful PAPER deposit must ONLY update wallet balances/transactions/snapshots.
 * - It must NOT automatically enable auto-trade, register in engine, or trigger processUser.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

jest.setTimeout(45000);

(global as any).fetch = (jest.fn() as any).mockResolvedValue({
  ok: true,
  json: async () => ({ rates: { INR: 84.5 }, INR: 84.5 })
});

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50000),
}));

jest.unstable_mockModule("../src/services/autoTradeEngine.js", () => ({
  enableUser: jest.fn(),
  processUser: (jest.fn() as any).mockResolvedValue(undefined),
}));

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-this-suite-only";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId }, JWT_SECRET);

let app: express.Express;
let Settings: any, paper: any, autoTradeEngine: any;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const connected = await connectIfAvailable();
  if (!connected) return;
  ({ Settings } = await import("../src/models/Settings.js"));
  paper = await import("../src/services/paperState.js");
  autoTradeEngine = await import("../src/services/autoTradeEngine.js");

  const walletRouter = (await import("../src/routes/wallet.js")).default;
  app = express();
  app.use(express.json());
  app.use("/wallet", walletRouter);
});

afterAll(async () => {
  if (Settings && mongoose?.connection?.readyState === 1) await Settings.deleteMany({ userId: testUserId });
  await disconnectMongo();
});

beforeEach(async () => {
  jest.clearAllMocks();
  if (!Settings || mongoose?.connection?.readyState !== 1) return;
  await Settings.deleteMany({ userId: testUserId });
  await paper.setWalletBalance(testUserId, "PAPER", "USDT", 0, "FUTURES");
});

describe("REGRESSION: /wallet/deposit/paper must NOT enable or trigger autoTrade", () => {
  test("when autoTrade was explicitly disabled, a deposit does NOT re-enable it or trigger the engine", async () => {
    if (skipIfNoMongo()) return;
    await Settings.create({ userId: testUserId, autoTrade: false, autoTradeFutures: false, autoTradeSpot: false });

    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 100, accountType: "FUTURES", currency: "USDT" });

    expect(res.status).toBe(200);

    const settings = await Settings.findOne({ userId: testUserId });
    expect(settings.autoTrade).toBe(false);
    expect(autoTradeEngine.enableUser).not.toHaveBeenCalled();
    expect(autoTradeEngine.processUser).not.toHaveBeenCalled();

    const wallet = paper.getWallet(testUserId, "PAPER", "FUTURES");
    expect(wallet.get("USDT")).toBeCloseTo(100, 6);
  }, 15000);

  test("when autoTrade was never set (new user), a deposit does NOT enable it", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 100, accountType: "FUTURES", currency: "USDT" });

    expect(res.status).toBe(200);

    // Deposit does NOT create Settings with autoTrade: true
    const settings = await Settings.findOne({ userId: testUserId });
    expect(settings?.autoTrade ?? false).toBe(false);
    expect(autoTradeEngine.enableUser).not.toHaveBeenCalled();
    expect(autoTradeEngine.processUser).not.toHaveBeenCalled();
  }, 15000);

  test("deposit preserves existing balance update without touching autoTrade", async () => {
    if (skipIfNoMongo()) return;
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 50, accountType: "FUTURES", currency: "USDT" });

    expect(res.status).toBe(200);
    expect(autoTradeEngine.enableUser).not.toHaveBeenCalled();
    expect(autoTradeEngine.processUser).not.toHaveBeenCalled();
  }, 15000);
});
