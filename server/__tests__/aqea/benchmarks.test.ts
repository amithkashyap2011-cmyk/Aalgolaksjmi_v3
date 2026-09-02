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

const mockGetKlines = jest.fn() as any;
const mockGetTickerPrice = jest.fn() as any;
jest.unstable_mockModule("../../src/services/binanceService.js", () => ({
  getKlines: mockGetKlines,
  getTickerPrice: mockGetTickerPrice
}));

jest.unstable_mockModule("../../src/services/aqea/ai/PredictorRegistry.js", () => ({
  PredictorRegistry: {
    getAllPredictions: (jest.fn() as any).mockResolvedValue([]),
    getAuthorizedPredictions: (jest.fn() as any).mockResolvedValue([]),
    getPredictor: (jest.fn() as any).mockReturnValue(null),
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
jest.unstable_mockModule("../../src/services/aqea/orderFlowEngine.js", () => ({
  OrderFlowEngine: { analyze: jest.fn().mockResolvedValue({ score: 50, diagnostics: {} }) }
}));

jest.unstable_mockModule("../../src/services/aqea/riskEngine.js", () => ({
  RiskEngine: { validateTrade: mockValidateTrade }
}));

jest.unstable_mockModule("../../src/config/serviceDiscovery.js", () => ({
  getQuantEngineURL: jest.fn().mockResolvedValue("http://localhost:8000"),
  isReachable: jest.fn().mockResolvedValue(false),
  isQuantEngineAvailable: jest.fn().mockResolvedValue(false)
}));

jest.unstable_mockModule("../../src/services/aqea/router/RegimeRoutingService.js", () => ({
  V2_2_Router: { route: jest.fn().mockResolvedValue({ activeModel: "MAMBA", prediction: "HOLD", confidence: 0.5, meta: { latencyMs: 1 } }) },
  RegimeRoutingService: { route: jest.fn().mockResolvedValue({ activeModel: "MAMBA", prediction: "HOLD", confidence: 0.5, meta: { latencyMs: 1 } }) }
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

let AQEAEngine: any, MultiTimeframeEngine: any;

beforeAll(async () => {
  ({ AQEAEngine } = await import("../../src/services/aqea/engine.js"));
  ({ MultiTimeframeEngine } = await import("../../src/services/aqea/multiTimeframeEngine.js"));
});

afterAll(async () => {
  // mongoose is mocked — no real connection to close
});

jest.setTimeout(60000);

describe("AQEA Performance Benchmarks", () => {
  const userId = "507f1f77bcf86cd799439011";
  const symbol = "BTCUSDT";

  beforeAll(() => {
    mockGetKlines.mockResolvedValue(new Array(250).fill({
      open: "100", high: "110", low: "90", close: "105", volume: "1000"
    }));
    mockGetWallet.mockReturnValue(new Map([["USDT", 10000]]));
  });

  test("Multi-Timeframe Engine Latency", async () => {
    await MultiTimeframeEngine.calculateAlignment(symbol);
    const ITERATIONS = 3;
    const durations: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = Date.now();
      await MultiTimeframeEngine.calculateAlignment(symbol);
      durations.push(Date.now() - start);
    }
    const avgDuration = durations.reduce((a, b) => a + b, 0) / ITERATIONS;
    console.log(`[BENCHMARK] Multi-TF Engine Alignment: avg=${avgDuration.toFixed(0)}ms`);
    expect(avgDuration).toBeLessThan(1000); 
  });

  test("AQEA Orchestrator Latency", async () => {
    const baseContext: any = {
      mode: "PAPER",
      accountType: "FUTURES",
      currentPrice: 100000,
      indicators: { adx14: 30, atr14: 2000, ema200: 95000, volume: 1000 },
      marketData: { btcDominance: 53.5, fundingRate: 0.0001, volumeAvg: 800 },
      performance: { winRate: 0.55, rewardRisk: 1.8 }
    };

    await AQEAEngine.decide(symbol, userId, baseContext);

    const ITERATIONS = 5;
    const durations: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = Date.now();
      await AQEAEngine.decide(symbol, userId, baseContext);
      durations.push(Date.now() - start);
    }
    const avgDuration = durations.reduce((a, b) => a + b, 0) / ITERATIONS;

    console.log(`[BENCHMARK] AQEA Orchestrator Decision: avg=${avgDuration.toFixed(0)}ms samples=${durations.join(",")}ms`);
    expect(avgDuration).toBeLessThan(5000);
  });
});
