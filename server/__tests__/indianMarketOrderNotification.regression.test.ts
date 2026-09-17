import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Regression: Indian market order placement must create a toast ────
 * ─── notification, matching crypto's behavior ──────────────────────────
 *
 * The client's global ToastContainer (mounted in App.tsx) already polls
 * GET /trading/alerts and surfaces the newest Alert as a toast — but that
 * pipeline only ever got fed by autoTradeEngine.ts's crypto order paths.
 * server/src/routes/indianMarket.ts and indianMarketAutoTrader.ts never
 * called Alert.create at all, so a real BUY/SELL order on the Indian
 * side never produced any visible notification, even though the exact
 * same toast mechanism that already works for crypto was sitting right
 * there unused. Fixed by extracting the alert-creation helper (formerly
 * a private function inside autoTradeEngine.ts) into a shared
 * services/alertService.ts used by all three order-placing code paths.
 */
import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-this-suite-only";
const testUserId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ sub: testUserId, role: "TRADER" }, JWT_SECRET);

let app: express.Express;
let paper: any, Trade: any, Alert: any;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
  paper = await import("../src/services/paperState.js");
  ({ Trade } = await import("../src/models/Trade.js"));
  ({ Alert } = await import("../src/models/Alert.js"));

  const indianMarketRouter = (await import("../src/routes/indianMarket.js")).default;
  app = express();
  app.use(express.json());
  app.use("/api/indian-market", indianMarketRouter);
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    try {
      await Trade.deleteMany({ userId: testUserId });
      await Alert.deleteMany({ userId: testUserId });
    } catch { /* ignore */ }
  }
  await disconnectMongo();
});

beforeEach(async () => {
  if (paper) {
    await paper.setWalletBalance(testUserId, "PAPER", "INR", 500000, "INDIAN_NSE");
  }
});

describe("Indian market order placement creates an Alert (feeds the global toast notification)", () => {
  test("POST /execute creates an ORDER SUCCESS alert for the placed BUY order", async () => {
    if (skipIfNoMongo()) return;

    const res = await request(app)
      .post("/api/indian-market/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({ symbol: "RELIANCE", side: "BUY", exchange: "NSE", mode: "PAPER", quantity: 250, productType: "MIS" });

    expect(res.status).toBe(200);

    const alert = await Alert.findOne({ userId: testUserId, symbol: "RELIANCE", title: "ORDER SUCCESS" }).sort({ createdAt: -1 }).lean();
    expect(alert).toBeTruthy();
    expect(alert!.message).toContain("BUY");
    expect(alert!.severity).toBe("GREEN");
  });

  test("POST /close-position creates a POSITION CLOSED alert for the exit", async () => {
    if (skipIfNoMongo()) return;

    const openRes = await request(app)
      .post("/api/indian-market/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({ symbol: "TCS", side: "BUY", exchange: "NSE", mode: "PAPER", quantity: 10, productType: "MIS" });
    expect(openRes.status).toBe(200);

    const closeRes = await request(app)
      .post("/api/indian-market/close-position")
      .set("Authorization", `Bearer ${token}`)
      .send({ tradeId: openRes.body.tradeId, userId: testUserId });
    expect(closeRes.status).toBe(200);

    const alert = await Alert.findOne({ userId: testUserId, symbol: "TCS", title: "POSITION CLOSED" }).sort({ createdAt: -1 }).lean();
    expect(alert).toBeTruthy();
  });
});
