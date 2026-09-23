import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Regression: GET /api/indian-market/positions must expose ─────────
 * ─── productType (MIS vs CNC) ───────────────────────────────────────────
 *
 * Found live: the client's "Long-Term Equity Holdings" table was seeded
 * with three permanently-hardcoded fake positions (RELIANCE/HDFCBANK/
 * TATAMOTORS) that summed to a specific total investment a user reported
 * seeing on screen — the table was never wired to real account data at
 * all. Fixing it requires the client to filter this route's real
 * positions down to CNC (delivery/"holdings") vs MIS (intraday) — which
 * this route's response didn't expose, even though Trade.productType is
 * a real, already-persisted field. Added it to the mapped response.
 */
import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-this-suite-only";
const testUserId = new mongoose.Types.ObjectId().toString();

let app: express.Express;
let Trade: any;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
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

async function openTrade(symbol: string, productType: "CNC" | "MIS") {
  return Trade.create({
    userId: testUserId,
    mode: "PAPER",
    symbol,
    side: "BUY",
    quantity: 10,
    entryPrice: 100,
    accountType: "INDIAN_NSE",
    productType,
    status: "OPEN",
    decisionPath: { source: "test-fixture" },
  });
}

describe("GET /api/indian-market/positions — exposes productType", () => {
  test("a CNC (delivery) trade is returned with productType: 'CNC'", async () => {
    if (skipIfNoMongo()) return;
    await openTrade("RELIANCE", "CNC");

    const res = await request(app).get(`/api/indian-market/positions?userId=${testUserId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const found = res.body.positions.find((p: any) => p.symbol === "RELIANCE" || p.instrument === "RELIANCE");
    expect(found).toBeDefined();
    expect(found.productType).toBe("CNC");
  });

  test("an MIS (intraday) trade is returned with productType: 'MIS', distinguishable from CNC", async () => {
    if (skipIfNoMongo()) return;
    await openTrade("TATASTEEL", "MIS");

    const res = await request(app).get(`/api/indian-market/positions?userId=${testUserId}`);
    expect(res.status).toBe(200);
    const found = res.body.positions.find((p: any) => p.symbol === "TATASTEEL" || p.instrument === "TATASTEEL");
    expect(found).toBeDefined();
    expect(found.productType).toBe("MIS");
  });
});
