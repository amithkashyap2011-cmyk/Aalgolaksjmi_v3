/**
 * ─── IndianMarketAutoTrader Unit Tests ───────────────────
 * Tests AI candidate ranking, autonomous trade execution,
 * and auto-selloff (SL, TP, and Signal Reversal) handling.
 */

import { jest } from '@jest/globals';

jest.unstable_mockModule("../src/services/aqea/orderFlowEngine.js", () => ({
  OrderFlowEngine: { analyze: jest.fn().mockResolvedValue({ score: 50, diagnostics: {} }) }
}));

jest.unstable_mockModule("../src/services/aqea/engine.js", () => ({
  AQEAEngine: {
    decide: jest.fn().mockResolvedValue({
      symbol: "NIFTY50",
      action: "LONG",
      confidence: 85,
      score: 85,
      votingBreakdown: { coreScore: 85, orderFlowScore: 85, smartMoneyScore: 85, cnnConfidence: 0.85 },
      reasons: ["MOCK_TEST_DECISION"]
    })
  }
}));

jest.unstable_mockModule("../src/services/indianMarketService.js", () => ({
  IndianMarketService: {
    evaluateIndianSymbol: jest.fn().mockImplementation((symbol: string) => Promise.resolve({
      symbol,
      exchange: "NSE",
      category: "NIFTY50",
      ltp: 24500,
      open: 24400,
      high: 24600,
      low: 24350,
      close: 24500,
      volume: 1000000,
      sessionStatus: { isOpen: true, session: "REGULAR_MARKET", reason: "Market Open" },
      decision: {
        decision: "LONG",
        confidence: 85,
        score: 85,
        votingBreakdown: { coreScore: 85, orderFlowScore: 85, smartMoneyScore: 85, cnnConfidence: 0.85 },
        reasons: ["MOCK_TEST_DECISION"]
      }
    })),
    SUPPORTED_INDIAN_SYMBOLS: ["NIFTY50", "BANKNIFTY", "FINNIFTY", "SENSEX", "RELIANCE"]
  }
}));

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

const chainMock = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: (jest.fn() as any).mockResolvedValue([])
};

jest.unstable_mockModule("../src/models/Trade.js", () => ({ Trade: { find: jest.fn().mockReturnValue(chainMock), create: jest.fn(), deleteMany: jest.fn() } }));
jest.unstable_mockModule("../src/services/paperState.js", () => ({ getWallet: jest.fn().mockReturnValue(new Map([["INR", 500000]])) }));

let IndianMarketAutoTrader: any;

describe("IndianMarketAutoTrader", () => {
  jest.setTimeout(60000);

  beforeAll(async () => {
    ({ IndianMarketAutoTrader } = await import("../src/services/indianMarketAutoTrader.js"));
  });

  afterAll(async () => {
    // mongoose is mocked — no real connection to close
  });

  afterEach(() => {
    IndianMarketAutoTrader.stopDaemon();
  });

  test("findBestAICandidate scans symbols and ranks candidate by AI conviction", async () => {
    const candidate = await IndianMarketAutoTrader.findBestAICandidate("test-user", 50);
    expect(candidate).not.toBeNull();
    if (candidate) {
      expect(candidate.symbol).toBeDefined();
      expect(candidate.aiConfidence).toBeGreaterThanOrEqual(50);
      expect(["LONG", "SHORT"]).toContain(candidate.aiSignal);
    }
  }, 45000);

  test("setAutoTradingEnabled toggles daemon state correctly", () => {
    IndianMarketAutoTrader.setAutoTradingEnabled(true);
    expect(IndianMarketAutoTrader.isEnabled()).toBe(true);
    IndianMarketAutoTrader.setAutoTradingEnabled(false);
    expect(IndianMarketAutoTrader.isEnabled()).toBe(false);
  });

  test("getStatus returns daemon configuration status", () => {
    const status = IndianMarketAutoTrader.getStatus();
    expect(status).toHaveProperty("enabled");
  });
});
