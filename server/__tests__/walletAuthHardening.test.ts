/*
 * Regression tests: /trading/wallet/adjust admin-only + PAPER-only, wallet
 * ledger mutations serialized under withWalletLock, and previously
 * unauthenticated routers (v4/v5/platform/roadmap/dashboard) now guarded.
 */
process.env.JWT_SECRET = "test-secret-for-jwt-unit-tests-1234567890";
import { jest, describe, it, expect, beforeAll } from "@jest/globals";
import express from "express";
import request from "supertest";

jest.unstable_mockModule("../src/models/WalletTransaction.js", () => ({
  WalletTransaction: {
    create: jest.fn(async (d: any) => ({ ...d, save: async () => undefined })),
    find: jest.fn(), findOne: jest.fn(), aggregate: jest.fn(async () => []),
    findOneAndUpdate: jest.fn(), findByIdAndUpdate: jest.fn(), countDocuments: jest.fn(async () => 0),
  },
}));
jest.unstable_mockModule("../src/services/currencyService.js", () => ({ CurrencyService: { getRate: () => 90 } }));
jest.unstable_mockModule("../src/routes/aqeaUi.js", () => ({ clearDashboardCache: jest.fn() }));
jest.unstable_mockModule("../src/services/sentinelAuditor.js", () => ({ runSentinelAudit: jest.fn(async () => undefined) }));

let signToken: any;
let paper: any;
let walletApp: any;
let tradingApp: any;
const guarded: Record<string, any> = {};

const LAN = { "x-forwarded-for": "192.168.1.50" };
const userA = "507f1f77bcf86cd799439011";
const bearer = (role: string, id = userA) => ({ Authorization: `Bearer ${signToken(id, role)}` });

beforeAll(async () => {
  ({ signToken } = await import("../src/middleware/auth.js"));
  paper = await import("../src/services/paperState.js");
  const mk = (path: string, router: any) => { const a = express(); a.use(express.json()); a.use(path, router); return a; };
  walletApp = mk("/wallet", (await import("../src/routes/wallet.js")).default);
  tradingApp = mk("/trading", (await import("../src/routes/trading.js")).default);
  guarded.v4 = mk("/v4", (await import("../src/routes/v4Api.js")).default);
  guarded.v5 = mk("/v5", (await import("../src/routes/v5Api.js")).default);
  guarded.roadmap = mk("/roadmap", (await import("../src/routes/roadmap.js")).default);
  guarded.platform = mk("/platform", (await import("../src/routes/platform.js")).default);
  guarded.dashboard = mk("/dashboard", (await import("../src/routes/dashboard.js")).default);
});

describe("/trading/wallet/adjust", () => {
  it("rejects non-admin JWT with 403 and does not mint funds", async () => {
    const before = paper.getWallet(userA, "PAPER", "FUTURES").get("USDT") ?? 0;
    const r = await request(tradingApp).post("/trading/wallet/adjust").set(bearer("TRADER")).send({ delta: 1000 });
    expect(r.status).toBe(403);
    expect(paper.getWallet(userA, "PAPER", "FUTURES").get("USDT") ?? 0).toBe(before);
  });
  it("rejects anonymous LAN caller with 401", async () => {
    const r = await request(tradingApp).post("/trading/wallet/adjust").set(LAN).send({ delta: 5 });
    expect(r.status).toBe(401);
  });
  it("rejects mode=LIVE even for admin", async () => {
    const r = await request(tradingApp).post("/trading/wallet/adjust").set(bearer("ADMIN")).send({ delta: 5, mode: "LIVE" });
    expect(r.status).toBe(400);
  });
  it("admin PAPER adjustment works", async () => {
    const admin = "507f1f77bcf86cd799439022";
    const r = await request(tradingApp).post("/trading/wallet/adjust").set(bearer("ADMIN", admin)).send({ delta: 50 });
    expect(r.status).toBe(200);
    expect(r.body.newBalance).toBe(50);
  });
});

describe("wallet withdrawals are serialized under the wallet lock", () => {
  it("two concurrent UPI withdrawals cannot both spend the same balance", async () => {
    const u = "507f1f77bcf86cd799439033";
    await paper.setWalletBalance(u, "PAPER", "USDT", 100, "FUTURES");
    const send = () => request(walletApp).post("/wallet/withdraw/upi").set(bearer("TRADER", u))
      .send({ usdtAmount: 60, upiId: "a@upi", accountType: "FUTURES" });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(paper.getWallet(u, "PAPER", "FUTURES").get("USDT")).toBe(40);
  });
  it("two concurrent crypto withdrawals cannot overdraw", async () => {
    const u = "507f1f77bcf86cd799439044";
    await paper.setWalletBalance(u, "PAPER", "USDT", 100, "FUTURES");
    const send = () => request(walletApp).post("/wallet/withdraw/crypto").set(bearer("TRADER", u))
      .send({ symbol: "USDT", amount: 60, address: "0xabc", network: "BSC", accountType: "FUTURES" });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(paper.getWallet(u, "PAPER", "FUTURES").get("USDT")).toBe(40);
  });
});

describe("previously unauthenticated routers", () => {
  it.each([
    ["v4", "/v4/regime"], ["v5", "/v5/strategies"], ["roadmap", "/roadmap/roadmap"],
    ["platform", "/platform/telemetry"], ["dashboard", "/dashboard/trade-stats"],
  ])("%s rejects anonymous LAN GET with 401", async (name, path) => {
    const r = await request(guarded[name]).get(path).set(LAN);
    expect(r.status).toBe(401);
  });
  it.each([["v4", "/v4/meta-decision"], ["v5", "/v5/strategy-selector"]])(
    "%s rejects non-admin POST with 403", async (name, path) => {
      const r = await request(guarded[name]).post(path).set(bearer("TRADER")).send({});
      expect(r.status).toBe(403);
    });
  it("platform /health stays open to anonymous LAN probes", async () => {
    const r = await request(guarded.platform).get("/platform/health").set(LAN);
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });
});
