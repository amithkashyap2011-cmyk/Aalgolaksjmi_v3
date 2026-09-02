import { jest } from '@jest/globals';

// 1. Define global fetch mock for predictors
(global as any).fetch = (jest.fn() as any).mockImplementation((url: string) => {
    if (url.includes("/predict/")) {
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ action: "NORMAL_SIZE", confidence: 0.8, value_estimate: 0.5 })
        });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
});

// Mock binanceService to return valid klines
jest.unstable_mockModule("../../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue(Array(250).fill({
    open: "50000", high: "50100", low: "49900", close: "50000", volume: "1000", openTime: 0
  })),
  syncTime: (jest.fn() as any).mockResolvedValue(0)
}));

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

jest.unstable_mockModule("mongoose", () => ({
  default: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    Schema: MockSchema,
    model: jest.fn().mockReturnValue(mockModelObj),
    Types: { ObjectId: jest.fn().mockReturnValue("mock-id") }
  },
  Schema: MockSchema,
  model: jest.fn().mockReturnValue(mockModelObj),
  Types: { ObjectId: jest.fn().mockReturnValue("mock-id") }
}));

jest.unstable_mockModule("../../src/services/aqea/institutional/capitalTierManager.js", () => ({
  CapitalTierManager: { getActiveTier: (jest.fn() as any).mockResolvedValue({ tier: 1, riskPerTrade: 0.005, maxDailyDrawdown: 0.03, maxExposure: 0.10 }) }
}));

jest.unstable_mockModule("../../src/models/TransitionOverrideAudit.js", () => ({
  TransitionOverrideAudit: { 
    find: (jest.fn() as any).mockReturnValue({ 
      sort: jest.fn().mockReturnThis(), 
      limit: jest.fn().mockReturnThis(), 
      lean: (jest.fn() as any).mockResolvedValue([]) 
    }), 
    create: (jest.fn() as any).mockResolvedValue({}) 
  }
}));

// @ts-ignore
jest.unstable_mockModule("../../src/config/serviceDiscovery.js", () => ({
  getQuantEngineURL: (jest.fn() as any).mockResolvedValue("http://localhost:8000"),
  isReachable: (jest.fn() as any).mockResolvedValue(true),
  isQuantEngineAvailable: (jest.fn() as any).mockResolvedValue(true)
}));

// @ts-ignore
jest.unstable_mockModule("../../src/models/AIPredictionTelemetry.js", () => ({
  AIPredictionTelemetry: { create: (jest.fn() as any).mockResolvedValue({} as any) },
  ModelAccuracyMetrics: { findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve({ rolling100_accuracy: 85 }) } as any) }
}));

const chainMock = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: (jest.fn() as any).mockResolvedValue([])
};

jest.unstable_mockModule("../../src/models/AqeaTradeAnalytics.js", () => ({
  AqeaTradeAnalytics: { find: jest.fn().mockReturnValue(chainMock), create: (jest.fn() as any).mockResolvedValue({}) }
}));

jest.unstable_mockModule("../../src/models/AqeaPerformance.js", () => ({
  AqeaPerformance: { find: jest.fn().mockReturnValue(chainMock) }
}));

jest.unstable_mockModule("../../src/models/ResearchMetaAlphaAudit.js", () => ({
  ResearchMetaAlphaAudit: { create: (jest.fn() as any).mockResolvedValue({}) }
}));


jest.unstable_mockModule("../../src/models/Settings.js", () => {
  const mockFindOne = {
    lean: jest.fn().mockResolvedValue({ aiConsensusGate: true }),
    exec: jest.fn().mockResolvedValue({ aiConsensusGate: true }),
    then: (cb: any, errCb?: any) => Promise.resolve({ aiConsensusGate: true }).then(cb, errCb)
  };
  return {
    default: { findOne: jest.fn().mockReturnValue(mockFindOne) },
    Settings: { findOne: jest.fn().mockReturnValue(mockFindOne) }
  };
});

let AQEAEngine: any, SmartMoneyEngine: any, RegimeEngine: any, PredictorRegistry: any, Settings: any, Trade: any, RouterDecisionAudit: any, AqeaTradeAnalytics: any, AqeaPerformance: any, TransitionOverrideAudit: any;
beforeAll(async () => {
  ({ Settings } = await import("../../src/models/Settings.js"));
  ({ Trade } = await import("../../src/models/Trade.js"));
  ({ RouterDecisionAudit } = await import("../../src/models/RouterDecisionAudit.js"));
  ({ AqeaTradeAnalytics } = await import("../../src/models/AqeaTradeAnalytics.js"));
  ({ AqeaPerformance } = await import("../../src/models/AqeaPerformance.js"));
  ({ TransitionOverrideAudit } = await import("../../src/models/TransitionOverrideAudit.js"));
  ({ AQEAEngine } = await import("../../src/services/aqea/engine.js"));
  ({ SmartMoneyEngine } = await import("../../src/services/aqea/smartMoneyEngine.js"));
  ({ RegimeEngine } = await import("../../src/services/aqea/regimeEngine.js"));
  ({ PredictorRegistry } = await import("../../src/services/aqea/ai/PredictorRegistry.js"));
});

beforeEach(() => {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    lean: (jest.fn() as any).mockResolvedValue([])
  };
  if (Settings?.findOne) {
    jest.spyOn(Settings, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue({ aiConsensusGate: true }),
      exec: jest.fn().mockResolvedValue({ aiConsensusGate: true }),
      then: (cb: any, errCb?: any) => Promise.resolve({ aiConsensusGate: true }).then(cb, errCb)
    } as any);
  }
  if (Trade?.find) jest.spyOn(Trade, "find").mockReturnValue(chain as any);
  if (RouterDecisionAudit?.create) jest.spyOn(RouterDecisionAudit, "create").mockResolvedValue({} as any);
  if (AqeaTradeAnalytics?.find) jest.spyOn(AqeaTradeAnalytics, "find").mockReturnValue(chain as any);
  if (AqeaTradeAnalytics?.create) jest.spyOn(AqeaTradeAnalytics, "create").mockResolvedValue({} as any);
  if (AqeaPerformance?.find) jest.spyOn(AqeaPerformance, "find").mockReturnValue(chain as any);
  if (TransitionOverrideAudit?.find) jest.spyOn(TransitionOverrideAudit, "find").mockReturnValue(chain as any);
  if (TransitionOverrideAudit?.create) jest.spyOn(TransitionOverrideAudit, "create").mockResolvedValue({} as any);
});

// Mocking required for unit testing without live data/DB
jest.unstable_mockModule("../../src/services/aqea/riskEngine.js", () => ({
  RiskEngine: { validateTrade: (jest.fn() as any).mockResolvedValue({ allowed: true, positionSize: 100, riskScore: 80, leverage: 1 }) }
}));

jest.unstable_mockModule("../../src/services/aqea/orderFlowEngine.js", () => ({
  OrderFlowEngine: { analyze: (jest.fn() as any).mockResolvedValue({ votingScore: 50, pressure: "NEUTRAL", confidence: 0, diagnostics: {} }) }
}));

jest.unstable_mockModule("../../src/services/paperState.js", () => ({
  getWallet: jest.fn().mockReturnValue(new Map([["USDT", 10000]])),
  getOpenPositions: jest.fn().mockReturnValue([])
}));

jest.unstable_mockModule("../../src/services/aqea/router/RegimeRoutingService.js", () => ({
  RegimeRoutingService: { 
    route: (jest.fn() as any).mockResolvedValue({ 
        activeModel: "CNN", 
        prediction: "HOLD", 
        confidence: 0.8, 
        meta: { latencyMs: 10 } 
    }) 
  }
}));

jest.unstable_mockModule("../../src/models/Trade.js", () => ({
  // @ts-ignore
  Trade: { find: (jest.fn() as any).mockReturnValue({ lean: (jest.fn() as any).mockResolvedValue([]) }) }
}));

jest.unstable_mockModule("../../src/models/RouterDecisionAudit.js", () => ({
  // @ts-ignore
  RouterDecisionAudit: { create: (jest.fn() as any).mockResolvedValue({}) }
}));

jest.unstable_mockModule("../../src/models/TransitionOverrideAudit.js", () => ({
  TransitionOverrideAudit: { 
    find: (jest.fn() as any).mockReturnValue({ 
      sort: jest.fn().mockReturnThis(), 
      limit: jest.fn().mockReturnThis(), 
      // @ts-ignore
      lean: (jest.fn() as any).mockResolvedValue([]) 
    }), 
    // @ts-ignore
    create: (jest.fn() as any).mockResolvedValue({}) 
  }
}));

jest.unstable_mockModule("../../src/models/ResearchMetaAlphaAudit.js", () => ({
  // @ts-ignore
  ResearchMetaAlphaAudit: { create: (jest.fn() as any).mockResolvedValue({}) }
}));

jest.unstable_mockModule("../../src/services/aqea/institutional/driftMonitor.js", () => ({
  DriftMonitor: { calculateDrift: (jest.fn() as any).mockResolvedValue({ score: 0, components: {} }) }
}));

describe("AQEA v2.4R Regression Tests", () => {
  const userId = "69c2bc93c8601b4eaf3abe2f";
  const symbol = "BTCUSDT";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Defect #1: SmartMoneyEngine receives actual bars", async () => {
    const smSpy = jest.spyOn(SmartMoneyEngine, 'analyze');
    
    // Mock bars
    const bars = Array(60).fill({ close: 50000, high: 50100, low: 49900, open: 50000, volume: 1000 });

    await AQEAEngine.decide(symbol, userId, {
      mode: "PAPER",
      accountType: "FUTURES",
      currentPrice: 50000,
      indicators: { sma200: 49000, adx14: 30, atr14: 1000 },
      bars: bars, // Actual bars passed here
      marketData: { btcDominance: 53, fundingRate: 0.0001, volumeAvg: 1000 },
      performance: { winRate: 0.55, rewardRisk: 2 }
    });

    expect(smSpy).toHaveBeenCalled();
    const passedBars = smSpy.mock.calls[0][0];
    expect(passedBars.length).toBeGreaterThanOrEqual(50);
  }, 20000);

  test("Defect #2: RegimeEngine receives valid 200MA from sma200 mapping", async () => {
    const regimeSpy = jest.spyOn(RegimeEngine, 'analyze');

    await AQEAEngine.decide(symbol, userId, {
      mode: "PAPER",
      accountType: "FUTURES",
      currentPrice: 50000,
      indicators: { sma200: 48000, adx14: 30, atr14: 1000 }, // Passed as sma200
      bars: [],
      marketData: { btcDominance: 53, fundingRate: 0.0001, volumeAvg: 1000 },
      performance: { winRate: 0.55, rewardRisk: 2 }
    });

    expect(regimeSpy).toHaveBeenCalled();
    const ctx = regimeSpy.mock.calls[0][0];
    expect(ctx.ema200).toBe(48000); // Verify it was mapped correctly
  }, 20000);

  test("Defect #3: PPO returns structured metadata on failure", async () => {
    const ppo = PredictorRegistry.getPredictor("PPO");
    
    // Mock runInference to throw
    (ppo as any).runInference = (jest.fn() as any).mockRejectedValue(new Error("Connection Failed"));

    const result = await ppo.predict({} as any);
    expect(result.meta).toBeDefined();
    expect(result.meta.recommendedAction).toBe("UNAVAILABLE");
    expect(result.meta.reason).toBe("SERVICE_OFFLINE");
  }, 20000);
});
