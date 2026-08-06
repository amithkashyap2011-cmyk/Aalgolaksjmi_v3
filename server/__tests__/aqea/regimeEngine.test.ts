import { jest } from '@jest/globals';

const chainMock = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: (jest.fn() as any).mockResolvedValue([])
};

jest.unstable_mockModule("mongoose", () => {
  class MockSchema {
    static Types: any = { ObjectId: "ObjectId" };
    index() {}
  }
  return {
    default: {
      connection: { readyState: 1 },
      Types: { ObjectId: class { id: any; constructor(id: any) { this.id = id; } toString() { return this.id; } static isValid() { return true; } } },
      model: jest.fn().mockReturnValue({ index: jest.fn() }),
      Schema: MockSchema
    },
    Schema: MockSchema,
    model: jest.fn().mockReturnValue({ index: jest.fn() })
  };
});

jest.unstable_mockModule("../../src/models/Trade.js", () => ({
  Trade: { find: jest.fn().mockReturnValue(chainMock) }
}));

jest.unstable_mockModule("../../src/models/AqeaTradeAnalytics.js", () => ({
  AqeaTradeAnalytics: { find: jest.fn().mockReturnValue(chainMock), create: (jest.fn() as any).mockResolvedValue({}) }
}));

jest.unstable_mockModule("../../src/models/AqeaPerformance.js", () => ({
  AqeaPerformance: { find: jest.fn().mockReturnValue(chainMock) }
}));

let RegimeEngine: any;
beforeAll(async () => {
  ({ RegimeEngine } = await import("../../src/services/aqea/regimeEngine.js"));
});

describe("AQEA Regime Engine", () => {
  jest.setTimeout(60000);
  const baseCtx: any = {
    adx: 15,
    atr: 100,
    atrTrailing: 100,
    ema200: 1000,
    close: 1050,
    volume: 1000,
    volumeAvg: 1000,
    btcDominance: 52,
    fundingRate: 0.0001
  };

  test("Classify RANGING regime", () => {
    const res = RegimeEngine.analyze({ ...baseCtx, adx: 18 });
    expect(res.state).toBe("RANGING");
    expect(res.score).toBeGreaterThanOrEqual(50); // Neutral
  });

  test("Classify TRENDING_BULL regime", () => {
    const res = RegimeEngine.analyze({ 
      ...baseCtx, 
      adx: 26, 
      close: 1100, 
      ema200: 1000,
      volume: 2000, // Momentum expansion
      volumeAvg: 1000
    });
    expect(res.state).toBe("TRENDING_BULL");
    expect(res.score).toBeGreaterThanOrEqual(80); // Strong Bull
    expect(res.confidence).toBeGreaterThan(70);
  });

  test("Classify TRENDING_BEAR regime", () => {
    const res = RegimeEngine.analyze({ 
      ...baseCtx, 
      adx: 26, 
      close: 900, 
      ema200: 1000 
    });
    expect(res.state).toBe("TRENDING_BEAR");
    expect(res.score).toBeLessThan(30);
  });

  test("Classify HIGH_VOLATILITY regime", () => {
    const res = RegimeEngine.analyze({ 
      ...baseCtx, 
      adx: 15, 
      atr: 200, 
      atrTrailing: 100, // ATR expansion
      fundingRate: 0.001 // High funding
    });
    expect(res.state).toBe("HIGH_VOLATILITY");
    expect(res.score).toBe(60);
  });

  test("Classify TRANSITION regime", () => {
    const res = RegimeEngine.analyze({ ...baseCtx, adx: 22 });
    expect(res.state).toBe("TRANSITION");
  });

  test("Scoring bands validation", () => {
    const bull = RegimeEngine.analyze({ ...baseCtx, adx: 26, close: 1100, ema200: 1000 });
    expect(bull.score).toBeGreaterThan(70);
    expect(bull.score).toBeLessThanOrEqual(85); // Bull
  });
});
