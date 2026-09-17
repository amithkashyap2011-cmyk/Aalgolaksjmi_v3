import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Regression: the crypto emergency kill switch must actually stop ───
 * ─── new orders ─────────────────────────────────────────────────────
 *
 * Found during a Phase-1 static audit: POST /trading/control/kill (and
 * /pause) set an in-memory `currentTradingStatus` variable that was read
 * back only by GET /trading/control/status — no order-placing code path
 * (/trading/place-order, or the 60s autonomous scheduler in
 * autoTradeEngine.ts) ever checked it. An admin hitting the kill switch
 * had zero actual effect on trading. Fixed by moving the status into
 * services/tradingControlStatus.ts and checking it at the top of
 * /place-order (and inside autoTradeEngine.ts's handleLong/handleShort —
 * covered separately, this test exercises the HTTP-reachable route).
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue([]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50000),
  getTickerPriceSync: (jest.fn() as any).mockResolvedValue(50000),
}));

import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-this-suite-only";
const testUserId = new mongoose.Types.ObjectId().toString();
const adminToken = jwt.sign({ sub: testUserId, role: "ADMIN" }, JWT_SECRET);

let app: express.Express;
let paper: any, Trade: any;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
  paper = await import("../src/services/paperState.js");
  ({ Trade } = await import("../src/models/Trade.js"));

  const tradingRouter = (await import("../src/routes/trading.js")).default;
  app = express();
  app.use(express.json());
  app.use("/trading", tradingRouter);
});

afterAll(async () => {
  if (Trade && mongoose.connection.readyState === 1) {
    try { await Trade.deleteMany({ userId: testUserId }); } catch { /* ignore */ }
  }
  // Leave the module back in its default state for any other suite
  // sharing this process.
  await request(app).post("/trading/control/resume").set("Authorization", `Bearer ${adminToken}`);
  await disconnectMongo();
});

beforeEach(async () => {
  if (paper) {
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 100000, "FUTURES");
  }
});

describe("Crypto trading kill switch actually blocks order placement", () => {
  test("POST /trading/control/kill then /trading/place-order is rejected, no Trade created", async () => {
    if (skipIfNoMongo()) return;

    const killRes = await request(app).post("/trading/control/kill").set("Authorization", `Bearer ${adminToken}`);
    expect(killRes.status).toBe(200);
    expect(killRes.body.status).toBe("KILLED");

    const orderRes = await request(app)
      .post("/trading/place-order")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ symbol: "BTCUSDT", side: "BUY", quantity: 0.01, mode: "PAPER", accountType: "FUTURES" });

    expect(orderRes.status).toBe(423);

    const trades = await Trade.find({ userId: testUserId, symbol: "BTCUSDT" }).lean();
    expect(trades.length).toBe(0);
  });

  test("POST /trading/control/resume re-enables order placement", async () => {
    if (skipIfNoMongo()) return;

    await request(app).post("/trading/control/kill").set("Authorization", `Bearer ${adminToken}`);
    const resumeRes = await request(app).post("/trading/control/resume").set("Authorization", `Bearer ${adminToken}`);
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.status).toBe("RUNNING");

    const orderRes = await request(app)
      .post("/trading/place-order")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ symbol: "BTCUSDT", side: "BUY", quantity: 0.01, mode: "PAPER", accountType: "FUTURES" });

    // Not blocked by the kill switch — whatever happens past that gate is
    // out of scope for this test, it just must not be the 423 kill-switch code.
    expect(orderRes.status).not.toBe(423);
  });
});
