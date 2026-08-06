/*
 * ─── Determinism smoke tests ────────────────────────────
 *
 * Scope, honestly stated: this is NOT a full historical-trading-session
 * replay harness (capturing real historical price/decision sequences and
 * replaying them against the live engine) — that's a genuinely larger
 * undertaking requiring a recording/storage format and harness this pass
 * didn't have time to build, and it's called out as the top roadmap item
 * in the final report rather than being silently skipped.
 *
 * What this DOES verify, for real: given byte-identical inputs, the pure
 * financial-calculation functions this suite already covers
 * (computeUnrealisedPnl, the risk engine's calculations) produce
 * byte-identical outputs across repeated invocations — the narrower,
 * checkable claim "no hidden non-determinism" actually supports. If any
 * of these ever depended on wall-clock time, RNG, or object-iteration
 * order in an unstable way, this would catch it.
 */
import { jest } from '@jest/globals';

const mockGetWallet = jest.fn() as any;
const mockTradeFind = jest.fn().mockReturnValue({ lean: (jest.fn() as any).mockResolvedValue([]) });

jest.unstable_mockModule("../src/services/paperState.js", () => ({ getWallet: mockGetWallet }));
jest.unstable_mockModule("../src/models/Trade.js", () => ({ Trade: { find: mockTradeFind, create: jest.fn(), deleteMany: jest.fn() } }));

jest.unstable_mockModule("mongoose", () => {
  class MockSchema {
    static Types: any = { ObjectId: "ObjectId" };
    index() {}
  }
  const defaultQueryMock = {
    lean: jest.fn().mockResolvedValue([]),
    exec: jest.fn().mockResolvedValue([]),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    then: (cb: any, errCb?: any) => Promise.resolve(null).then(cb, errCb)
  };
  const mockModelObj = {
    index: jest.fn(),
    findOne: jest.fn().mockReturnValue(defaultQueryMock),
    find: jest.fn().mockReturnValue(defaultQueryMock),
    create: jest.fn().mockResolvedValue({}),
    updateOne: jest.fn().mockResolvedValue({})
  };
  return {
    default: {
      connection: { readyState: 1 },
      Types: { ObjectId: class { id: any; constructor(id: any) { this.id = id; } toString() { return this.id; } static isValid() { return true; } } },
      model: jest.fn().mockReturnValue(mockModelObj),
      Schema: MockSchema,
      connect: jest.fn().mockResolvedValue({})
    },
    Schema: MockSchema,
    model: jest.fn().mockReturnValue(mockModelObj)
  };
});

jest.unstable_mockModule("../src/models/Settings.js", () => ({
  default: { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) },
  Settings: { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) }
}));

jest.unstable_mockModule("../src/services/aqea/AqeaAudit.js", () => ({
  AqeaAuditService: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), critical: jest.fn(), error: jest.fn() }
}));

import { computeUnrealisedPnl } from "../src/services/pnlService";

describe("Determinism — pure calculation functions", () => {
  test("computeUnrealisedPnl is byte-identical across 1000 repeated calls with the same input", () => {
    const trade = { side: "BUY", entryPrice: 43217.53, quantity: 0.02841 };
    const markPrice = 43890.12;
    const first = computeUnrealisedPnl(trade, markPrice);
    for (let i = 0; i < 1000; i++) {
      expect(computeUnrealisedPnl(trade, markPrice)).toBe(first);
    }
  });

  test("computeUnrealisedPnl gives the same result regardless of call order across multiple distinct inputs (no shared mutable state leaking between calls)", () => {
    const scenarios = [
      { trade: { side: "BUY", entryPrice: 100, quantity: 1 }, mark: 110 },
      { trade: { side: "SELL", entryPrice: 200, quantity: 2 }, mark: 190 },
      { trade: { side: "BUY", entryPrice: 50000, quantity: 0.001 }, mark: 49000 },
    ];
    const firstPass = scenarios.map(s => computeUnrealisedPnl(s.trade, s.mark));
    // Run again in REVERSE order — if any hidden shared state existed
    // between calls, running in a different order would change results.
    const reversed = [...scenarios].reverse();
    const secondPass = reversed.map(s => computeUnrealisedPnl(s.trade, s.mark)).reverse();
    expect(secondPass).toEqual(firstPass);
  });
});

describe("Determinism — RiskEngine (mocked I/O, deterministic inputs)", () => {
  let RiskEngine: any;
  beforeAll(async () => {
    ({ RiskEngine } = await import("../src/services/aqea/riskEngine.js"));
  });

  afterAll(async () => {
    // mongoose is mocked — no real connection to close
  });

  test("validateTrade produces byte-identical results across repeated calls with identical wallet/position/context state", async () => {
    const ctx = {
      userId: "69c2bc93c8601b4eaf3abe2f", symbol: "BTCUSDT", mode: "PAPER", accountType: "FUTURES",
      currentPrice: 100000, atr: 2000, winRate: 0.6, rewardRisk: 2, fundingRate: 0.0001,
    };

    const results = [];
    for (let i = 0; i < 20; i++) {
      mockGetWallet.mockReturnValue(new Map([["USDT", 10000]]));
      mockTradeFind.mockReturnValue({ lean: (jest.fn() as any).mockResolvedValue([]) });
      results.push(await RiskEngine.validateTrade({ ...ctx }));
    }

    const first = JSON.stringify(results[0]);
    for (const r of results) {
      expect(JSON.stringify(r)).toBe(first);
    }
  });
});

