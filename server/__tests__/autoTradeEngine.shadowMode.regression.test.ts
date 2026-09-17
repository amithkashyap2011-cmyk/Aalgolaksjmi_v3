import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Regression: Settings.shadowMode must actually gate entries ───────
 *
 * server/.env had an AQEA_SHADOW_MODE flag that the CLAUDE.md docs
 * describe as "log decisions without executing" — but nothing in the
 * codebase ever read process.env.AQEA_SHADOW_MODE, and the one hardcoded
 * AQEA_CONFIG.SHADOW_MODE consumer only fires under NODE_ENV=production
 * (this box runs development). So the documented behavior didn't exist
 * anywhere, and there was no UI to control it either.
 *
 * Added a real, per-user Settings.shadowMode toggle (Settings page →
 * Risk Control) that actually does what the old flag only claimed to:
 * the 24/7 engine keeps scanning/scoring every symbol as normal, but
 * handleLong/handleShort refuse to open a real (paper or live) position
 * while it's on.
 */
import { jest } from "@jest/globals";

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue([]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50000),
  getTickerPriceSync: (jest.fn() as any).mockResolvedValue(50000),
}));

import mongoose from "mongoose";

let Trade: any, handleLong: any, handleShort: any;

const testUserId = new mongoose.Types.ObjectId().toString();
const SYMBOL = "BTCUSDT";

beforeAll(async () => {
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
  ({ Trade } = await import("../src/models/Trade.js"));
  ({ handleLong, handleShort } = await import("../src/services/autoTradeEngine.js"));
});

afterAll(async () => {
  if (Trade && mongoose.connection.readyState === 1) {
    try { await Trade.deleteMany({ userId: testUserId }); } catch { /* ignore */ }
  }
  await disconnectMongo();
});

function baseSettings(overrides: Record<string, unknown> = {}): any {
  return {
    riskConfig: { maxConcurrentPositions: 10 },
    shadowMode: false,
    ...overrides,
  };
}

function validLongDecision(): any {
  return {
    riskApproved: true,
    positionSize: 100,
    leverage: 5,
    confidence: 80,
    meta: { indicators: { close: 50000 } },
    decisionPath: {
      cnnVote: "LONG", ppoVote: "LONG", transformerVote: "LONG", mambaVote: "LONG",
      regime: "TRENDING_BULL", coreScore: 80, finalScore: 80,
    },
  };
}

const riskProfile = { positionSize: undefined, leverage: undefined, sl: 49000, tp1: 51000, tp2: 52000, tp3: 53000 };

describe("Settings.shadowMode — gates real entries in handleLong/handleShort", () => {
  test("shadowMode=true: handleLong never opens a position, even for an otherwise-valid LONG decision", async () => {
    if (skipIfNoMongo()) return;
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await handleLong(testUserId, SYMBOL, "PAPER", "SPOT", baseSettings({ shadowMode: true }), validLongDecision(), riskProfile);

    const openCount = await Trade.countDocuments({ userId: testUserId, symbol: SYMBOL, status: "OPEN" });
    expect(openCount).toBe(0);
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes("[HANDLE_LONG_SKIP] shadowMode is ON"))).toBe(true);

    logSpy.mockRestore();
  });

  test("shadowMode=true: handleShort never opens a position, even for an otherwise-valid SHORT decision", async () => {
    if (skipIfNoMongo()) return;
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await handleShort(testUserId, SYMBOL, "PAPER", "SPOT", baseSettings({ shadowMode: true }), validLongDecision(), riskProfile);

    const openCount = await Trade.countDocuments({ userId: testUserId, symbol: SYMBOL, status: "OPEN" });
    expect(openCount).toBe(0);
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes("[HANDLE_SHORT_SKIP] shadowMode is ON"))).toBe(true);

    logSpy.mockRestore();
  });

  test("shadowMode=false: handleLong proceeds past the shadow gate (does not short-circuit there)", async () => {
    if (skipIfNoMongo()) return;
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await handleLong(testUserId, SYMBOL, "PAPER", "SPOT", baseSettings({ shadowMode: false }), validLongDecision(), riskProfile);

    expect(logSpy.mock.calls.some((c) => String(c[0]).includes("[HANDLE_LONG_SKIP] shadowMode is ON"))).toBe(false);

    logSpy.mockRestore();
    await Trade.deleteMany({ userId: testUserId, symbol: SYMBOL });
  });
});
