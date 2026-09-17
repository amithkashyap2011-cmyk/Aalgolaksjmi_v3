import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Regression: Indian order must not tag its paper position with a ───
 * ─── crypto accountType ─────────────────────────────────────────────
 *
 * Found during a Phase-1 static audit: POST /api/indian-market/execute
 * correctly stamps the Trade document's accountType as the computed
 * Indian value (e.g. "INDIAN_NSE"), but the paperState position it wrote
 * right after was hardcoded to accountType:"FUTURES" — the crypto
 * futures account. Since paperState keys positions (and wallet.ts's
 * computeAccountBalance filters them) by accountType, this meant every
 * Indian order's notional/PnL silently leaked into the user's crypto
 * FUTURES wallet computation, while being invisible to Indian-market
 * views that correctly filter by the Indian accountType.
 */
import { jest } from '@jest/globals';
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const TEST_MONGO_URI = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/aalgolakshmi_test?replicaSet=rs0";
const JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-this-suite-only";
const testUserId = new mongoose.Types.ObjectId().toString();
// A real Bearer token with role embedded directly, so requirePermission
// reads req.user.role without needing a DB User document.
const token = jwt.sign({ sub: testUserId, role: "TRADER" }, JWT_SECRET);

let app: express.Express;
let paper: any, Trade: any;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
  paper = await import("../src/services/paperState.js");
  ({ Trade } = await import("../src/models/Trade.js"));

  const indianMarketRouter = (await import("../src/routes/indianMarket.js")).default;
  app = express();
  app.use(express.json());
  app.use("/api/indian-market", indianMarketRouter);
});

afterAll(async () => {
  if (Trade && mongoose.connection.readyState === 1) {
    try { await Trade.deleteMany({ userId: testUserId }); } catch { /* ignore */ }
  }
  await disconnectMongo();
});

beforeEach(async () => {
  if (paper) {
    // Comfortably above the ~₹1.5L MIS margin RELIANCE x250 @ ~₹2988 needs.
    await paper.setWalletBalance(testUserId, "PAPER", "INR", 500000, "INDIAN_NSE");
    await paper.setWalletBalance(testUserId, "PAPER", "USDT", 0, "FUTURES");
  }
});

describe("POST /api/indian-market/execute — cross-market position isolation", () => {
  test("an Indian NSE order's paper position is tagged INDIAN_NSE, not FUTURES", async () => {
    if (skipIfNoMongo()) return;

    const res = await request(app)
      .post("/api/indian-market/execute")
      .set("Authorization", `Bearer ${token}`)
      .send({ symbol: "RELIANCE", side: "BUY", exchange: "NSE", mode: "PAPER", quantity: 250, productType: "MIS" });

    expect(res.status).toBe(200);

    const position = paper.getPosition(testUserId, "RELIANCE", "PAPER", "INDIAN_NSE");
    expect(position).toBeDefined();
    expect(position.accountType).toBe("INDIAN_NSE");

    // The bug: this same position, mistagged, would also satisfy a lookup
    // under the crypto FUTURES accountType. It must not.
    const futuresPositions = paper.getOpenPositions(testUserId, "PAPER").filter((p: any) => p.accountType === "FUTURES");
    expect(futuresPositions.find((p: any) => p.symbol === "RELIANCE")).toBeUndefined();

    // And the crypto futures wallet's own open-position view must not
    // include this Indian trade's notional.
    const openPositions = paper.getOpenPositions(testUserId, "PAPER").filter((p: any) => p.accountType === "FUTURES");
    expect(openPositions.length).toBe(0);
  });
});
