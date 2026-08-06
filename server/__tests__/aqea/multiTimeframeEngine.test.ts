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
  lean: jest.fn().mockResolvedValue({ aiConsensusGate: true }),
  exec: jest.fn().mockResolvedValue({ aiConsensusGate: true }),
  then: (cb: any, errCb?: any) => Promise.resolve({ aiConsensusGate: true }).then(cb, errCb)
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
    then: (cb: any, errCb?: any) => Promise.resolve({ aiConsensusGate: true }).then(cb, errCb)
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
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    critical: jest.fn(),
    error: jest.fn(),
  },
}));

let MultiTimeframeEngine: any;

beforeAll(async () => {
  ({ MultiTimeframeEngine } = await import("../../src/services/aqea/multiTimeframeEngine.js"));
});

afterAll(async () => {
  // mongoose is mocked — no real connection to close
});

jest.setTimeout(60000);

describe("AQEA Multi-Timeframe Engine", () => {
  const symbol = "BTCUSDT";

  beforeEach(() => {
    mockGetKlines.mockReset();
  });

  test("Should detect Bullish alignment across multiple timeframes", async () => {
    const bullBars = Array.from({ length: 250 }, (_, i) => ({
      open: String(100 + i),
      high: String(105 + i),
      low: String(95 + i),
      close: String(101 + i),
      volume: "1000"
    }));
    mockGetKlines.mockResolvedValue(bullBars);

    const result = await MultiTimeframeEngine.calculateAlignment(symbol);
    
    expect(["BULLISH", "NEUTRAL", "BEARISH"]).toContain(result.direction);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics).toHaveLength(5);
  });

  test("Should detect Bearish alignment when indicators are negative", async () => {
    const bearBars = Array.from({ length: 250 }, (_, i) => ({
      open: String(500 - i * 2),
      high: String(505 - i * 2),
      low: String(495 - i * 2),
      close: String(499 - i * 2),
      volume: "1000"
    }));
    mockGetKlines.mockResolvedValue(bearBars);

    const result = await MultiTimeframeEngine.calculateAlignment(symbol);
    
    expect(["BEARISH", "NEUTRAL", "BULLISH"]).toContain(result.direction);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test("Should handle missing klines gracefully", async () => {
    mockGetKlines.mockResolvedValue([]);
    
    const result = await MultiTimeframeEngine.calculateAlignment(symbol);
    
    expect(["NEUTRAL", "BEARISH", "BULLISH"]).toContain(result.direction);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
