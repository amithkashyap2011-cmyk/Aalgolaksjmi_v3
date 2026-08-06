import { connectIfAvailable, disconnectMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Regression test: deposit no longer silently re-enables autoTrade ──
 *
 * Real bug found and fixed during a live production incident: /wallet/deposit/paper
 * unconditionally set autoTrade: true and immediately triggered a trade
 * cycle on every deposit — including an auto-seeded starting balance —
 * silently overriding a user's explicit choice to pause trading. Right
 * after a hard reset (which sets autoTrade: false), the very next deposit
 * flipped it back on and the engine opened new positions within seconds.
 */
import { jest } from '@jest/globals';
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

jest.setTimeout(45000);

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ rates: { INR: 84.5 }, INR: 84.5 })
}) as any;

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50000),
}));

jest.unstable_mockModule("../src/services/autoTradeEngine.js", () => ({
  enableUser: jest.fn(),
  processUser: (jest.fn() as any).mockResolvedValue(undefined),
}));

const TEST_MONGO_URI = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/aalgolakshmi_test?replicaSet=rs0";
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
  if (Settings) await Settings.deleteMany({ userId: testUserId });
  await disconnectMongo();
});

beforeEach(async () => {
  jest.clearAllMocks();
  if (!Settings) return;
  await Settings.deleteMany({ userId: testUserId });
  await paper.setWalletBalance(testUserId, "PAPER", "USDT", 0, "FUTURES");
});

describe("REGRESSION: /wallet/deposit/paper must not override an explicit autoTrade:false", () => {
  test("when autoTrade was explicitly disabled, a deposit does NOT re-enable it or trigger the engine", async () => {
    await Settings.create({ userId: testUserId, autoTrade: false });

    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 100, accountType: "FUTURES", currency: "USDT" });

    expect(res.status).toBe(200);

    const settings = await Settings.findOne({ userId: testUserId });
    expect(settings.autoTrade).toBe(false);
    expect(autoTradeEngine.enableUser).not.toHaveBeenCalled();
    expect(autoTradeEngine.processUser).not.toHaveBeenCalled();

    // The deposit itself must still have gone through — disabling
    // auto-trade shouldn't block the deposit, only the re-enable side effect.
    const wallet = paper.getWallet(testUserId, "PAPER", "FUTURES");
    expect(wallet.get("USDT")).toBeCloseTo(100, 6);
  }, 15000);

  test("when autoTrade was never set (new user), a deposit DOES enable it (existing, unchanged behavior)", async () => {
    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 100, accountType: "FUTURES", currency: "USDT" });

    expect(res.status).toBe(200);

    const settings = await Settings.findOne({ userId: testUserId });
    expect(settings.autoTrade).toBe(true);
    expect(autoTradeEngine.enableUser).toHaveBeenCalledWith(testUserId, expect.any(String));
    // Now passes the deposit's own accountType explicitly (SPOT/FUTURES are
    // independent legs — see routes/wallet.ts) instead of leaving it for
    // processUser to re-derive from Settings.accountType.
    expect(autoTradeEngine.processUser).toHaveBeenCalledWith(testUserId, "FUTURES");
  }, 15000);

  test("when autoTrade was explicitly true already, a deposit keeps it enabled (existing, unchanged behavior)", async () => {
    await Settings.create({ userId: testUserId, autoTrade: true });

    const res = await request(app)
      .post("/wallet/deposit/paper")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 50, accountType: "FUTURES", currency: "USDT" });

    expect(res.status).toBe(200);
    const settings = await Settings.findOne({ userId: testUserId });
    expect(settings.autoTrade).toBe(true);
    expect(autoTradeEngine.enableUser).toHaveBeenCalled();
    expect(autoTradeEngine.processUser).toHaveBeenCalledWith(testUserId, "FUTURES");
  }, 15000);
});
