/*
 * ─── Model Schema Validation Tests ────────────────────
 *
 * Tests default values, required fields, and enum constraints
 * for all Mongoose models WITHOUT requiring a live MongoDB connection.
 * Uses Mongoose model validation (doc.validateSync()).
 */
import mongoose from "mongoose";
import { User } from "../src/models/User";
import { Settings } from "../src/models/Settings";
import { Trade } from "../src/models/Trade";
import { BacktestRun } from "../src/models/BacktestRun";
import { Alert } from "../src/models/Alert";
import { ApiKeys } from "../src/models/ApiKeys";

const fakeId = new mongoose.Types.ObjectId();

describe("User model", () => {
  test("TC-G1: requires email and passwordHash", () => {
    const doc = new User({});
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err!.errors).toHaveProperty("email");
    expect(err!.errors).toHaveProperty("passwordHash");
  });

  test("TC-G2: default role is 'user'", () => {
    const doc = new User({ email: "a@b.com", passwordHash: "hash" });
    expect(doc.role).toBe("user");
  });

  test("TC-G3: rejects invalid role", () => {
    const doc = new User({ email: "a@b.com", passwordHash: "hash", role: "superadmin" });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test("TC-G4: lowercases and trims email", () => {
    const doc = new User({ email: "  Hello@World.COM  ", passwordHash: "hash" });
    expect(doc.email).toBe("hello@world.com");
  });
});

describe("Settings model", () => {
  test("TC-G5: default mode is PAPER", () => {
    const doc = new Settings({ userId: fakeId });
    expect(doc.defaultMode).toBe("PAPER");
  });

  test("TC-G6: default allowedSymbols includes 5 coins", () => {
    const doc = new Settings({ userId: fakeId });
    expect(doc.allowedSymbols).toHaveLength(5);
    expect(doc.allowedSymbols).toContain("DOGEUSDT");
    expect(doc.allowedSymbols).toContain("SHIBUSDT");
    expect(doc.allowedSymbols).toContain("ETHUSDT");
    expect(doc.allowedSymbols).toContain("ADAUSDT");
    expect(doc.allowedSymbols).toContain("BNBUSDT");
  });

  test("TC-G7: riskConfig defaults populated", () => {
    const doc = new Settings({ userId: fakeId });
    expect(doc.riskConfig.maxDailyLoss).toBe(100);
    expect(doc.riskConfig.maxPositionSizePct).toBe(21);
    expect(doc.riskConfig.defaultSL).toBe(2);
    expect(doc.riskConfig.defaultTP).toBe(4);
    expect(doc.riskConfig.trailingSL).toBe(1);
  });

  test("TC-G8: behaviorWeights includes animal + strategy weights", () => {
    const doc = new Settings({ userId: fakeId });
    const bw = doc.behaviorWeights;
    expect(bw.eagle).toBe(50);
    expect(bw.lion).toBe(50);
    expect(bw.om_chant).toBe(50);
    expect(bw.gayatri_mantra).toBe(50);
    expect(bw.aaryan).toBe(50);
    expect(bw.aayush).toBe(50);
    expect(bw.lakshmi_hybrid).toBe(50);
  });

  test("TC-G9: chartSettings defaults", () => {
    const doc = new Settings({ userId: fakeId });
    expect(doc.chartSettings.showFibZones).toBe(true);
    expect(doc.chartSettings.defaultTimeframe).toBe("5m");
    expect(doc.chartSettings.darkMode).toBe(false);
  });

  test("TC-G10: rejects invalid defaultMode", () => {
    const doc = new Settings({ userId: fakeId, defaultMode: "INVALID" as any });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });
});

describe("Trade model", () => {
  test("TC-G11: requires userId, mode, symbol, side, quantity, entryPrice", () => {
    const doc = new Trade({});
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err!.errors).toHaveProperty("userId");
    expect(err!.errors).toHaveProperty("mode");
    expect(err!.errors).toHaveProperty("symbol");
    expect(err!.errors).toHaveProperty("side");
    expect(err!.errors).toHaveProperty("quantity");
    expect(err!.errors).toHaveProperty("entryPrice");
  });

  test("TC-G12: default status is OPEN", () => {
    const doc = new Trade({
      userId: fakeId, mode: "PAPER", symbol: "DOGEUSDT",
      side: "BUY", quantity: 100, entryPrice: 0.15,
    });
    expect(doc.status).toBe("OPEN");
  });

  test("TC-G13: default strategy is null", () => {
    const doc = new Trade({
      userId: fakeId, mode: "PAPER", symbol: "DOGEUSDT",
      side: "BUY", quantity: 100, entryPrice: 0.15,
    });
    expect(doc.strategy).toBeNull();
  });

  test("TC-G14: strategy can be set", () => {
    const doc = new Trade({
      userId: fakeId, mode: "PAPER", symbol: "DOGEUSDT",
      side: "BUY", quantity: 100, entryPrice: 0.15,
      strategy: "LAKSHMI",
    });
    expect(doc.strategy).toBe("LAKSHMI");
  });

  test("TC-G15: sl and tp default to null", () => {
    const doc = new Trade({
      userId: fakeId, mode: "PAPER", symbol: "DOGEUSDT",
      side: "BUY", quantity: 100, entryPrice: 0.15,
    });
    expect(doc.sl).toBeNull();
    expect(doc.tp).toBeNull();
  });

  test("TC-G16: sl and tp can be set", () => {
    const doc = new Trade({
      userId: fakeId, mode: "PAPER", symbol: "DOGEUSDT",
      side: "BUY", quantity: 100, entryPrice: 0.15,
      sl: 0.14, tp: 0.18,
    });
    expect(doc.sl).toBe(0.14);
    expect(doc.tp).toBe(0.18);
  });

  test("TC-G17: pnl defaults to 0", () => {
    const doc = new Trade({
      userId: fakeId, mode: "PAPER", symbol: "DOGEUSDT",
      side: "BUY", quantity: 100, entryPrice: 0.15,
    });
    expect(doc.pnl).toBe(0);
  });

  test("TC-G18: rejects invalid mode", () => {
    const doc = new Trade({
      userId: fakeId, mode: "INVALID" as any, symbol: "DOGEUSDT",
      side: "BUY", quantity: 100, entryPrice: 0.15,
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test("TC-G19: rejects invalid side", () => {
    const doc = new Trade({
      userId: fakeId, mode: "PAPER", symbol: "DOGEUSDT",
      side: "SHORT" as any, quantity: 100, entryPrice: 0.15,
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  test("TC-G20: rejects invalid status", () => {
    const doc = new Trade({
      userId: fakeId, mode: "PAPER", symbol: "DOGEUSDT",
      side: "BUY", quantity: 100, entryPrice: 0.15,
      status: "EXPIRED" as any,
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });
});

describe("BacktestRun model", () => {
  test("TC-G21: requires userId and params", () => {
    const doc = new BacktestRun({});
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err!.errors).toHaveProperty("userId");
  });

  test("TC-G22: equityCurve defaults to empty array", () => {
    const doc = new BacktestRun({
      userId: fakeId,
      params: { symbol: "DOGEUSDT", timeframe: "5m", startDate: "2024-01-01", endDate: "2024-06-01", strategies: ["LAKSHMI"] },
      metrics: { cagr: 10, maxDD: 5, winRate: 60, profitFactor: 1.5, sharpeEst: 1.2, totalTrades: 50 },
    });
    expect(doc.equityCurve).toEqual([]);
    expect(doc.trades).toEqual([]);
  });
});

describe("ApiKeys model", () => {
  test("TC-G23: requires userId, encryptedKey, encryptedSecret, iv, authTag", () => {
    const doc = new ApiKeys({});
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err!.errors).toHaveProperty("userId");
    expect(err!.errors).toHaveProperty("encryptedKey");
    expect(err!.errors).toHaveProperty("encryptedSecret");
    expect(err!.errors).toHaveProperty("iv");
    expect(err!.errors).toHaveProperty("authTag");
  });

  test("TC-G24: lastTestedAt defaults to null", () => {
    const doc = new ApiKeys({
      userId: fakeId,
      encryptedKey: "enc", encryptedSecret: "enc",
      iv: "iv1", authTag: "tag1", ivSecret: "iv2", authTagSecret: "tag2",
    });
    expect(doc.lastTestedAt).toBeNull();
  });
});
