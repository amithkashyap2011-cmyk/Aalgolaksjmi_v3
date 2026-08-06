import { jest } from '@jest/globals';
import mongoose from 'mongoose';

const mockGetKlines = jest.fn() as any;
const mockGetTickerPrice = jest.fn() as any;

jest.unstable_mockModule("../../src/services/binanceService.js", () => ({
  __esModule: true,
  getKlines: mockGetKlines,
  getTickerPrice: mockGetTickerPrice,
}));

const chainMock = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: (jest.fn() as any).mockResolvedValue([])
};

const mockSettingsQuery = {
  lean: jest.fn().mockResolvedValue({ aiConsensusGate: false, shortScoreThreshold: 35 }),
  exec: jest.fn().mockResolvedValue({ aiConsensusGate: false, shortScoreThreshold: 35 }),
  then: (cb: any, errCb?: any) => Promise.resolve({ aiConsensusGate: false, shortScoreThreshold: 35 }).then(cb, errCb)
};

const settingsMockFactory = () => ({
  default: { findOne: jest.fn().mockReturnValue(mockSettingsQuery) },
  Settings: { findOne: jest.fn().mockReturnValue(mockSettingsQuery) }
});

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
    then: (cb: any, errCb?: any) => Promise.resolve({ aiConsensusGate: false, shortScoreThreshold: 35 }).then(cb, errCb)
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

jest.unstable_mockModule("../../src/models/Trade.js", () => ({ Trade: { find: jest.fn().mockReturnValue(chainMock) } }));
jest.unstable_mockModule("../../models/Trade.js", () => ({ Trade: { find: jest.fn().mockReturnValue(chainMock) } }));
jest.unstable_mockModule("../../src/models/AqeaTradeAnalytics.js", () => ({ AqeaTradeAnalytics: { find: jest.fn().mockReturnValue(chainMock), create: (jest.fn() as any).mockResolvedValue({}) } }));
jest.unstable_mockModule("../../models/AqeaTradeAnalytics.js", () => ({ AqeaTradeAnalytics: { find: jest.fn().mockReturnValue(chainMock), create: (jest.fn() as any).mockResolvedValue({}) } }));
jest.unstable_mockModule("../../src/models/AqeaPerformance.js", () => ({ AqeaPerformance: { find: jest.fn().mockReturnValue(chainMock) } }));
jest.unstable_mockModule("../../models/AqeaPerformance.js", () => ({ AqeaPerformance: { find: jest.fn().mockReturnValue(chainMock) } }));
jest.unstable_mockModule("../../src/models/Settings.js", settingsMockFactory);
jest.unstable_mockModule("../../models/Settings.js", settingsMockFactory);

jest.unstable_mockModule("../../src/services/aqea/AqeaAudit.js", () => ({
  AqeaAuditService: {
    log: jest.fn(), info: jest.fn(), warn: jest.fn(), critical: jest.fn(), error: jest.fn(),
  },
}));

let AQEAEngine: any;
let RegimeEngine: any;
let SignificanceAnalyzer: any;

beforeAll(async () => {
  ({ AQEAEngine } = await import("../../src/services/aqea/engine.js"));
  ({ RegimeEngine } = await import("../../src/services/aqea/regimeEngine.js"));
  ({ SignificanceAnalyzer } = await import("../../src/services/aqea/research/significanceAnalyzer.js"));
});

afterAll(async () => {
  // mongoose is mocked — no real connection to close
});

jest.setTimeout(60000);

describe("AQEA Model Accuracy, Bias & Functional Edge-Case Testing", () => {
  const symbol = "BTCUSDT";

  test("Model Bias Test: Directional symmetry under Bullish vs Bearish inputs", async () => {
    // Bullish input
    const bullRegime = RegimeEngine.analyze({
      adx: 35, atr: 100, atrTrailing: 90, ema200: 50000, close: 55000,
      volume: 10000, volumeAvg: 5000, btcDominance: 50, fundingRate: 0.0001
    });

    // Bearish input
    const bearRegime = RegimeEngine.analyze({
      adx: 35, atr: 100, atrTrailing: 90, ema200: 50000, close: 45000,
      volume: 10000, volumeAvg: 5000, btcDominance: 50, fundingRate: 0.0001
    });

    expect(bullRegime.state).toBe("TRENDING_BULL");
    expect(bearRegime.state).toBe("TRENDING_BEAR");
    expect(bullRegime.score).toBeGreaterThan(60);
    expect(bearRegime.score).toBeLessThan(40);
    expect(Math.abs((bullRegime.score - 50) + (bearRegime.score - 50))).toBeLessThanOrEqual(5); // Perfectly symmetrical offset sum = 0
  });

  test("Statistical Significance Test: p-value < 0.05 for non-random return series", async () => {
    const profitableReturns = [0.02, 0.015, 0.03, -0.005, 0.025, 0.018, 0.022, 0.012, 0.028, 0.019];
    const report = await SignificanceAnalyzer.analyze("AQEA_10_ENSEMBLE", profitableReturns);

    expect(report.statisticallySignificant).toBe(true);
    expect(report.pValue).toBeLessThan(0.05);
    expect(report.bootstrapMean).toBeGreaterThan(0);
  });

  test("Functional Edge-Case: Flash Crash scenario (-90% in 1 bar)", async () => {
    const flashCrashRegime = RegimeEngine.analyze({
      adx: 60, atr: 5000, atrTrailing: 500, ema200: 50000, close: 5000, // -90% drop
      volume: 100000, volumeAvg: 5000, btcDominance: 60, fundingRate: -0.05
    });

    expect(["HIGH_VOLATILITY", "TRENDING_BEAR"]).toContain(flashCrashRegime.state);
    expect(flashCrashRegime.score).toBeLessThanOrEqual(40);
  });

  test("Functional Edge-Case: Zero Volume / Micro Liquidity Freeze", async () => {
    const zeroVolRegime = RegimeEngine.analyze({
      adx: 10, atr: 5, atrTrailing: 5, ema200: 50000, close: 50000,
      volume: 0, volumeAvg: 0, btcDominance: 50, fundingRate: 0
    });

    expect(["RANGING", "TRANSITION"]).toContain(zeroVolRegime.state);
    expect(zeroVolRegime.score).toBeGreaterThanOrEqual(40);
    expect(zeroVolRegime.score).toBeLessThanOrEqual(60);
  });

  test("Functional Edge-Case: Extreme Funding Rate Spikes (+0.10 and -0.10)", async () => {
    const highFundingRegime = RegimeEngine.analyze({
      adx: 30, atr: 100, atrTrailing: 90, ema200: 50000, close: 52000,
      volume: 5000, volumeAvg: 5000, btcDominance: 50, fundingRate: 0.10
    });

    const lowFundingRegime = RegimeEngine.analyze({
      adx: 30, atr: 100, atrTrailing: 90, ema200: 50000, close: 48000,
      volume: 5000, volumeAvg: 5000, btcDominance: 50, fundingRate: -0.10
    });

    expect(highFundingRegime.score).toBeDefined();
    expect(lowFundingRegime.score).toBeDefined();
    expect(highFundingRegime.score).toBeGreaterThan(lowFundingRegime.score);
  });
});
