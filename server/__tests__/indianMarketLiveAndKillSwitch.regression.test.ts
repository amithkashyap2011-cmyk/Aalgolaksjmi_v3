import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Regression: Indian-market LIVE-mode fabrication + kill-switch gaps ───
 *
 * Found during a Phase-1 static audit:
 *  1. POST /api/indian-market/execute and /execute-strategy read `mode`
 *     straight from the request body and never called any broker adapter
 *     — a request with mode:"LIVE" got a Trade document stamped
 *     mode:"LIVE" for a trade that only ever touched the in-memory PAPER
 *     wallet simulator. Fixed by rejecting mode:"LIVE" outright on both
 *     routes (there's no real broker integration to route it through).
 *  2. /execute-strategy never checked TradingKillSwitch at all (unlike
 *     /execute). Fixed by adding the same guard.
 *  3. IndianMarketAutoTrader.autoExecuteBestTrade — the function the 60s
 *     background daemon calls for every user with autoTrade enabled —
 *     never checked TradingKillSwitch either, so an emergency stop
 *     silently didn't stop the highest-volume autonomous order path.
 *  4. /execute never checked IndianRiskManager's panic-stop flag, unlike
 *     /execute-strategy and the auto-trader (both route every order
 *     through IndianRiskManager.validateTrade, which checks it).
 */
import { jest } from '@jest/globals';
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-this-suite-only";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId, role: "TRADER" }, JWT_SECRET);

let app: express.Express;
let paper: any, Trade: any, TradingKillSwitch: any, IndianMarketAutoTrader: any, IndianRiskManager: any;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
  paper = await import("../src/services/paperState.js");
  ({ Trade } = await import("../src/models/Trade.js"));
  ({ TradingKillSwitch } = await import("../src/services/indianMarket/security/tradingKillSwitch.js"));
  ({ IndianMarketAutoTrader } = await import("../src/services/indianMarketAutoTrader.js"));
  ({ IndianRiskManager } = await import("../src/services/indianMarket/riskManager.js"));

  const indianMarketRouter = (await import("../src/routes/indianMarket.js")).default;
  app = express();
  app.use(express.json());
  app.use("/api/indian-market", indianMarketRouter);
});

afterAll(async () => {
  if (Trade && mongoose.connection.readyState === 1) {
    try { await Trade.deleteMany({ userId: testUserId }); } catch { /* ignore */ }
  }
  if (TradingKillSwitch) {
    try { await TradingKillSwitch.enableTrading("test-cleanup", "restore default state after suite"); } catch { /* ignore */ }
  }
  await disconnectMongo();
});

beforeEach(async () => {
  if (paper) {
    await paper.setWalletBalance(testUserId, "PAPER", "INR", 500000, "INDIAN_NSE");
  }
});

describe("Indian market: no fabricated LIVE trades", () => {
  test("POST /execute with mode:LIVE is rejected, not silently simulated", async () => {
    if (skipIfNoMongo()) return;

    const res = await request(app)
      .post("/api/indian-market/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({ symbol: "RELIANCE", side: "BUY", exchange: "NSE", mode: "LIVE", quantity: 250, productType: "MIS" });

    expect(res.status).toBe(501);
    expect(res.body.error).toBe("LIVE_EXECUTION_NOT_IMPLEMENTED");

    const trades = await Trade.find({ userId: testUserId, symbol: "RELIANCE", mode: "LIVE" }).lean();
    expect(trades.length).toBe(0);
  });

  test("POST /execute-strategy with mode:LIVE is rejected", async () => {
    if (skipIfNoMongo()) return;

    const res = await request(app)
      .post("/api/indian-market/execute-strategy")
      .set("Authorization", `Bearer ${token}`)
      .send({ strategyId: "LONG_STRADDLE", underlying: "NIFTY50", mode: "LIVE" });

    expect(res.status).toBe(501);
    expect(res.body.error).toBe("LIVE_EXECUTION_NOT_IMPLEMENTED");
  });
});

describe("Indian market: kill switch coverage gaps", () => {
  afterEach(async () => {
    if (TradingKillSwitch) {
      try { await TradingKillSwitch.enableTrading("test-cleanup", "reset between tests"); } catch { /* ignore */ }
    }
  });

  test("POST /execute-strategy is blocked when the kill switch is active", async () => {
    if (skipIfNoMongo()) return;
    await TradingKillSwitch.disableTrading("ADMIN_MANUAL", "regression test", "test-admin");

    const res = await request(app)
      .post("/api/indian-market/execute-strategy")
      .set("Authorization", `Bearer ${token}`)
      .send({ strategyId: "LONG_STRADDLE", underlying: "NIFTY50", mode: "PAPER" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("KILL_SWITCH_ACTIVE");
  });

  test("IndianMarketAutoTrader.autoExecuteBestTrade throws when the kill switch is active", async () => {
    if (skipIfNoMongo()) return;
    await TradingKillSwitch.disableTrading("ADMIN_MANUAL", "regression test", "test-admin");

    await expect(
      IndianMarketAutoTrader.autoExecuteBestTrade(testUserId, "PAPER", "MIS", "RELIANCE")
    ).rejects.toThrow(/KILL_SWITCH_ACTIVE/);
  });

  test("POST /execute is blocked when panic stop is active", async () => {
    if (skipIfNoMongo()) return;
    await IndianRiskManager.setPanicStop(testUserId, true);

    try {
      const res = await request(app)
        .post("/api/indian-market/execute")
        .set("Authorization", `Bearer ${token}`)
        .send({ symbol: "RELIANCE", side: "BUY", exchange: "NSE", mode: "PAPER", quantity: 250, productType: "MIS" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("PANIC_STOP_ACTIVE");

      const trades = await Trade.find({ userId: testUserId, symbol: "RELIANCE" }).lean();
      expect(trades.length).toBe(0);
    } finally {
      await IndianRiskManager.setPanicStop(testUserId, false);
    }
  });
});
