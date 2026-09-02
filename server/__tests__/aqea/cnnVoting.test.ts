import { jest } from '@jest/globals';
import mongoose from 'mongoose';

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

const mockGetWallet = jest.fn() as any;
jest.unstable_mockModule("../../src/services/paperState.js", () => ({
  getWallet: mockGetWallet,
  getOpenPositions: jest.fn(),
}));

const mockRegimeAnalyze = jest.fn() as any;
jest.unstable_mockModule("../../src/services/aqea/regimeEngine.js", () => ({
  RegimeEngine: { analyze: mockRegimeAnalyze }
}));

const mockMultiTFCalculate = jest.fn() as any;
jest.unstable_mockModule("../../src/services/aqea/multiTimeframeEngine.js", () => ({
  MultiTimeframeEngine: { calculateAlignment: mockMultiTFCalculate }
}));

const mockOrderFlowAnalyze = jest.fn() as any;
jest.unstable_mockModule("../../src/services/aqea/orderFlowEngine.js", () => ({
  OrderFlowEngine: { analyze: mockOrderFlowAnalyze }
}));

const mockSmartMoneyAnalyze = jest.fn() as any;
jest.unstable_mockModule("../../src/services/aqea/smartMoneyEngine.js", () => ({
  SmartMoneyEngine: { analyze: mockSmartMoneyAnalyze }
}));

const mockGetAllPredictions = jest.fn() as any;
const mockGetAuthorizedPredictions = jest.fn() as any;
jest.unstable_mockModule("../../src/services/aqea/ai/PredictorRegistry.js", () => ({
  PredictorRegistry: {
    getPredictor: jest.fn(),
    getAllPredictions: mockGetAllPredictions,
    getAuthorizedPredictions: mockGetAuthorizedPredictions
  }
}));

jest.unstable_mockModule("../../src/models/AIPredictionTelemetry.js", () => ({
  AIPredictionTelemetry: { create: (jest.fn() as any).mockResolvedValue({}) },
  ModelAccuracyMetrics: { findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve({ rolling100_accuracy: 85 }) }) }
}));

jest.unstable_mockModule("../../src/config/serviceDiscovery.js", () => ({
  getQuantEngineURL: (jest.fn() as any).mockResolvedValue("http://localhost:8000"),
  isReachable: (jest.fn() as any).mockResolvedValue(true),
  isQuantEngineAvailable: (jest.fn() as any).mockResolvedValue(true)
}));

const mockValidateTrade = jest.fn().mockResolvedValue({ allowed: true, positionSize: 100, riskScore: 80, reason: "OK" }) as any;
jest.unstable_mockModule("../../src/services/aqea/riskEngine.js", () => ({
  RiskEngine: { validateTrade: mockValidateTrade }
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

let AQEAEngine: any, AQEA_CONFIG: any, Settings: any, PredictorRegistry: any;
let currentPreds: any[] = [];

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

describe("AQEA Phase 4E: CNN Voting Integration", () => {
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
    (AQEA_CONFIG as any).CNN_VOTING_ENABLED = true;
    (AQEA_CONFIG as any).AI_ENABLED = true;

    if (PredictorRegistry?.getAuthorizedPredictions) {
      jest.spyOn(PredictorRegistry, "getAuthorizedPredictions").mockImplementation(() => Promise.resolve(currentPreds));
      jest.spyOn(PredictorRegistry, "getAllPredictions").mockImplementation(() => Promise.resolve(currentPreds));
    }

    if (Settings?.findOne) {
      jest.spyOn(Settings, "findOne").mockReturnValue(mockSettingsQuery as any);
    }
    mockGetWallet.mockReturnValue(new Map([["USDT", 10000]]));
    mockValidateTrade.mockResolvedValue({ allowed: true, positionSize: 100, riskScore: 80, reason: "OK" });

    mockRegimeAnalyze.mockReturnValue({ state: "TRENDING_BULL", score: 80, confidence: 80 });
    mockMultiTFCalculate.mockResolvedValue({ score: 80, direction: "BULLISH", agreement: 5 });
    mockOrderFlowAnalyze.mockResolvedValue({ votingScore: 80, pressure: "BUY", diagnostics: {} });
    mockSmartMoneyAnalyze.mockReturnValue({ votingScore: 80, signal: "BULLISH", diagnostics: { liquiditySweeps: [] } });
  });

  test("CNN Vote aligns with Core (LONG, high conf) -> receives 15% voting weight", async () => {
    currentPreds = [{
       predictor: "CNN_1D_V1",
       direction: "LONG",
       confidence: 0.85,
       probability: 0.85
    }];
    mockGetAllPredictions.mockResolvedValue(currentPreds);
    mockGetAuthorizedPredictions.mockResolvedValue(currentPreds);

    const res = await AQEAEngine.decide(symbol, userId, baseContext);
    
    expect(res.meta.weightsApplied.cnn).toBeGreaterThan(0);
    expect(res.meta.weightsApplied.cnn).toBeLessThanOrEqual(0.15);
    expect(res.reasons.some((r: string) => r.includes("CNN_VOTE"))).toBe(true);
  });

  test("CNN Vote low confidence (<0.70) -> receives 0% weight", async () => {
    currentPreds = [{
       predictor: "CNN_1D_V1",
       direction: "LONG",
       confidence: 0.65,
       probability: 0.65
    }];
    mockGetAllPredictions.mockResolvedValue(currentPreds);
    mockGetAuthorizedPredictions.mockResolvedValue([]);

    const res = await AQEAEngine.decide(symbol, userId, baseContext);
    expect(res.meta.weightsApplied.cnn).toBe(0);
    expect(res.reasons).not.toContain(expect.stringContaining("CNN_VOTE"));
  });

  test("CNN weight is 0% in HIGH_VOLATILITY override", async () => {
    mockRegimeAnalyze.mockReturnValue({ state: "HIGH_VOLATILITY", score: 50, confidence: 50 });
    mockMultiTFCalculate.mockResolvedValue({ score: 50, direction: "NEUTRAL", agreement: 3 });
    
    currentPreds = [{
       predictor: "CNN_1D_V1",
       direction: "LONG",
       confidence: 0.90,
       probability: 0.90
    }];
    mockGetAllPredictions.mockResolvedValue(currentPreds);
    mockGetAuthorizedPredictions.mockResolvedValue(currentPreds);

    mockOrderFlowAnalyze.mockResolvedValue({ votingScore: 50, diagnostics: {} });
    mockSmartMoneyAnalyze.mockReturnValue({ votingScore: 50, diagnostics: { liquiditySweeps: [] } });

    const res = await AQEAEngine.decide(symbol, userId, baseContext);
    expect(res.meta.weightsApplied.cnn).toBeLessThan(0.10);
  });

  test("Rollback: CNN_VOTING_ENABLED=false reverts to Ph 3 baseline weights", async () => {
    (AQEA_CONFIG as any).CNN_VOTING_ENABLED = false;
    
    mockRegimeAnalyze.mockReturnValue({ state: "TRENDING_BULL", score: 80, confidence: 80 });
    mockMultiTFCalculate.mockResolvedValue({ score: 80, direction: "BULLISH", agreement: 5 });
    
    currentPreds = [{
       predictor: "CNN_1D_V1",
       direction: "LONG",
       confidence: 0.90,
       probability: 0.90
    }];
    mockGetAllPredictions.mockResolvedValue(currentPreds);
    mockGetAuthorizedPredictions.mockResolvedValue(currentPreds);

    const res = await AQEAEngine.decide(symbol, userId, baseContext);
    expect(res.meta.weightsApplied.cnn).toBe(0);
  });
});
