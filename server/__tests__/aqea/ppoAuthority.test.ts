import { jest } from '@jest/globals';
import mongoose from 'mongoose';

const chainMock = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: (jest.fn() as any).mockResolvedValue([])
};

const mockSettingsQuery = {
  lean: jest.fn().mockResolvedValue({ aiConsensusGate: false, autoTradeThreshold: 45, shortScoreThreshold: 35 }),
  exec: jest.fn().mockResolvedValue({ aiConsensusGate: false, autoTradeThreshold: 45, shortScoreThreshold: 35 }),
  then: (cb: any, errCb?: any) => Promise.resolve({ aiConsensusGate: false, autoTradeThreshold: 45, shortScoreThreshold: 35 }).then(cb, errCb)
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

jest.unstable_mockModule("../../src/models/RouterDecisionAudit.js", () => ({ RouterDecisionAudit: { create: (jest.fn() as any).mockResolvedValue({}) } }));
jest.unstable_mockModule("../../models/RouterDecisionAudit.js", () => ({ RouterDecisionAudit: { create: (jest.fn() as any).mockResolvedValue({}) } }));

jest.unstable_mockModule("../../src/models/TransitionOverrideAudit.js", () => ({ TransitionOverrideAudit: { find: jest.fn().mockReturnValue(chainMock), create: (jest.fn() as any).mockResolvedValue({}) } }));
jest.unstable_mockModule("../../models/TransitionOverrideAudit.js", () => ({ TransitionOverrideAudit: { find: jest.fn().mockReturnValue(chainMock), create: (jest.fn() as any).mockResolvedValue({}) } }));

jest.unstable_mockModule("../../src/models/ResearchMetaAlphaAudit.js", () => ({ ResearchMetaAlphaAudit: { create: (jest.fn() as any).mockResolvedValue({}) } }));
jest.unstable_mockModule("../../models/ResearchMetaAlphaAudit.js", () => ({ ResearchMetaAlphaAudit: { create: (jest.fn() as any).mockResolvedValue({}) } }));

jest.unstable_mockModule("../../src/models/AqeaDecisionAttribution.js", () => ({ AqeaDecisionAttribution: { create: (jest.fn() as any).mockResolvedValue({}) } }));
jest.unstable_mockModule("../../models/AqeaDecisionAttribution.js", () => ({ AqeaDecisionAttribution: { create: (jest.fn() as any).mockResolvedValue({}) } }));

jest.unstable_mockModule("../../src/models/Settings.js", settingsMockFactory);
jest.unstable_mockModule("../../models/Settings.js", settingsMockFactory);

const mockValidateTrade = jest.fn().mockResolvedValue({ allowed: true, positionSize: 100, riskScore: 80, reason: "OK" }) as any;
jest.unstable_mockModule("../../src/services/aqea/riskEngine.js", () => ({
  RiskEngine: { validateTrade: mockValidateTrade }
}));

const mockGetWallet = jest.fn() as any;
jest.unstable_mockModule("../../src/services/paperState.js", () => ({
  getWallet: mockGetWallet,
  getOpenPositions: jest.fn(),
}));

const mockPPOPredictor = {
  predict: jest.fn(),
  getHealth: jest.fn().mockReturnValue({ name: "PPO_EXECUTION_V1", available: true })
};

const mockGetAllPredictions = jest.fn() as any;
const mockGetAuthorizedPredictions = jest.fn() as any;
jest.unstable_mockModule("../../src/services/aqea/ai/PredictorRegistry.js", () => ({
  PredictorRegistry: { 
    getPredictor: jest.fn().mockImplementation((name: string) => name === "PPO" ? mockPPOPredictor : null),
    getAllPredictions: mockGetAllPredictions,
    getAuthorizedPredictions: mockGetAuthorizedPredictions
  }
}));

jest.unstable_mockModule("../../src/models/AIPredictionTelemetry.js", () => ({
  AIPredictionTelemetry: { create: (jest.fn() as any).mockResolvedValue({} as any) },
  ModelAccuracyMetrics: { findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve({ rolling100_accuracy: 85 }) } as any) }
}));

jest.unstable_mockModule("../../src/config/serviceDiscovery.js", () => ({
  getQuantEngineURL: (jest.fn() as any).mockResolvedValue("http://localhost:8000"),
  isReachable: (jest.fn() as any).mockResolvedValue(true)
}));

jest.unstable_mockModule("../../src/services/aqea/AqeaAudit.js", () => ({
  AqeaAuditService: {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    critical: jest.fn(),
    error: jest.fn()
  }
}));
jest.unstable_mockModule("../../src/services/aqea/regimeEngine.js", () => ({
  RegimeEngine: { analyze: jest.fn(() => ({ state: "TRENDING_BULL", score: 80, confidence: 80 })) }
}));
jest.unstable_mockModule("../../src/services/aqea/multiTimeframeEngine.js", () => ({
  MultiTimeframeEngine: { calculateAlignment: jest.fn(async () => ({ score: 80, direction: "BULLISH", agreement: 5 })) }
}));
jest.unstable_mockModule("../../src/services/aqea/orderFlowEngine.js", () => ({
  OrderFlowEngine: { analyze: jest.fn(async () => ({ votingScore: 80, pressure: "BUY", diagnostics: {} })) }
}));
jest.unstable_mockModule("../../src/services/aqea/smartMoneyEngine.js", () => ({
  SmartMoneyEngine: { analyze: jest.fn(() => ({ votingScore: 80, signal: "BULLISH", diagnostics: { liquiditySweeps: [] } })) }
}));

let AQEAEngine: any, AQEA_CONFIG: any, Settings: any, PredictorRegistry: any;
beforeAll(async () => {
  ({ Settings } = await import("../../src/models/Settings.js"));
  ({ AQEAEngine } = await import("../../src/services/aqea/engine.js"));
  ({ AQEA_CONFIG } = await import("../../src/services/aqea/config.js") as any);
  ({ PredictorRegistry } = await import("../../src/services/aqea/ai/PredictorRegistry.js") as any);
});

afterAll(async () => {
  // mongoose is mocked — no real connection to close
});

jest.setTimeout(60000);

describe("AQEA Phase 5C: PPO Execution Authority", () => {
  const symbol = "BTCUSDT";
  const userId = "507f1f77bcf86cd799439011";

  const baseContext: any = {
    mode: "PAPER",
    accountType: "FUTURES",
    currentPrice: 100000,
    indicators: {
      adx14: 35, atr14: 1000, rsi14: 65, ema20: 95000, ema50: 90000, sma200: 80000,
      open: 100000, high: 101000, low: 99000, close: 100000, volume: 1000,
      bars: Array(250).fill({ open: 90000, high: 101000, low: 89000, close: 100000, volume: 1000 })
    },
    marketData: { btcDominance: 53, fundingRate: 0.0001, volumeAvg: 1000 },
    performance: { winRate: 0.55, rewardRisk: 2 }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (AQEA_CONFIG as any).PPO_ENABLED = true;
    const mockPrediction = {
      predictor: "CNN_1D_V1",
      direction: "LONG",
      confidence: 0.85,
      probability: 0.85
    };

    if (PredictorRegistry) {
      if (PredictorRegistry.getPredictor) jest.spyOn(PredictorRegistry, "getPredictor").mockImplementation((name: string) => name === "PPO" ? mockPPOPredictor as any : null);
      if (PredictorRegistry.getAllPredictions) {
        jest.spyOn(PredictorRegistry, "getAllPredictions").mockImplementation(async () => {
          const ppoRes = await mockPPOPredictor.predict();
          return [
            mockPrediction,
            {
              predictor: "PPO_EXEC_V1",
              direction: ppoRes.direction,
              confidence: ppoRes.confidence,
              meta: ppoRes.meta
            }
          ];
        });
      }
      if (PredictorRegistry.getAuthorizedPredictions) jest.spyOn(PredictorRegistry, "getAuthorizedPredictions").mockImplementation(() => Promise.resolve([mockPrediction]));
    }

    if (Settings?.findOne) {
      jest.spyOn(Settings, "findOne").mockReturnValue(mockSettingsQuery as any);
    }
    
    mockGetWallet.mockReturnValue(new Map([["USDT", 10000]]));
    mockValidateTrade.mockResolvedValue({ allowed: true, positionSize: 100, riskScore: 90 });
    (AQEA_CONFIG as any).PPO_EXECUTION_AUTHORITY = true;
    
    mockPPOPredictor.predict.mockResolvedValue({
      direction: "HOLD",
      confidence: 0.9,
      meta: { recommendedAction: "SKIP_TRADE" }
    });
  });

  test("PPO executes SKIP_TRADE", async () => {
    mockPPOPredictor.predict.mockResolvedValue({
      direction: "HOLD",
      confidence: 0.9,
      meta: { recommendedAction: "SKIP_TRADE" }
    });

    const res = await AQEAEngine.decide(symbol, userId, baseContext);
    
    expect(res.decision).toBe("HOLD");
    expect(res.meta.ppoAuthorityApplied).toBe(true);
    expect(res.meta.ppoSkipDecision).toBe(true);
    expect(res.reasons.some((r: string) => r.includes("PPO_AUTHORITY: SKIP_TRADE_EXECUTED"))).toBe(true);
  });

  test("PPO adjusts size downward (REDUCE_SIZE)", async () => {
    mockPPOPredictor.predict.mockResolvedValue({
      direction: "LONG",
      confidence: 0.95,
      meta: { recommendedAction: "REDUCE_SIZE" }
    });

    const res = await AQEAEngine.decide(symbol, userId, baseContext);
    
    expect(res.decision).toBe("LONG");
    expect(res.meta.ppoAuthorityApplied).toBe(true);
    expect(res.reasons.some((r: string) => r.includes("PPO_AUTHORITY: SIZE_ADJUSTED_0.5x"))).toBe(true);
  });

  test("PPO adjusts size upward (INCREASE_SIZE)", async () => {
    mockPPOPredictor.predict.mockResolvedValue({
      direction: "LONG",
      confidence: 0.88,
      meta: { recommendedAction: "INCREASE_SIZE" }
    });

    const res = await AQEAEngine.decide(symbol, userId, baseContext);
    
    expect(res.decision).toBe("LONG");
    expect(res.meta.ppoAuthorityApplied).toBe(true);
    expect(res.reasons.some((r: string) => r.includes("PPO_AUTHORITY: SIZE_ADJUSTED_"))).toBe(true);
  });

  test("Rollback: PPO authority disabled reverts to baseline", async () => {
    (AQEA_CONFIG as any).PPO_EXECUTION_AUTHORITY = false;
    
    mockPPOPredictor.predict.mockResolvedValue({
      direction: "HOLD",
      confidence: 0.9,
      meta: { recommendedAction: "SKIP_TRADE" }
    });

    const res = await AQEAEngine.decide(symbol, userId, baseContext);
    
    expect(res.decision).toBe("LONG");
    expect(res.meta.ppoAuthorityApplied).toBe(false);
  });
});
