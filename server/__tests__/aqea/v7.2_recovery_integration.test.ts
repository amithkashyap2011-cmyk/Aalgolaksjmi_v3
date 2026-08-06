// @ts-nocheck
import { jest } from '@jest/globals';
import mongoose from "mongoose";

jest.setTimeout(30000);

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

const mockWallet = new Map();
mockWallet.set("USDT", 100000);

jest.unstable_mockModule("../../src/services/paperState.js", () => ({
  getWallet: jest.fn().mockReturnValue(mockWallet),
  getOpenPositions: jest.fn().mockReturnValue([])
}));

const mockGetAllPredictions = jest.fn() as any;
const mockGetAuthorizedPredictions = jest.fn() as any;
const mockGetPredictor = jest.fn() as any;

jest.unstable_mockModule("../../src/services/aqea/ai/PredictorRegistry.js", () => ({
  PredictorRegistry: {
    getAllPredictions: mockGetAllPredictions,
    getAuthorizedPredictions: mockGetAuthorizedPredictions,
    getPredictor: mockGetPredictor
  }
}));

jest.unstable_mockModule("../../src/models/AIPredictionTelemetry.js", () => ({
  AIPredictionTelemetry: { create: jest.fn().mockResolvedValue({}) },
  ModelAccuracyMetrics: { findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve({ rolling100_accuracy: 85 }) }) }
}));

jest.unstable_mockModule("../../src/config/serviceDiscovery.js", () => ({
  getQuantEngineURL: jest.fn().mockResolvedValue("http://localhost:8000"),
  isReachable: jest.fn().mockResolvedValue(false)
}));

const mockValidateTrade = jest.fn().mockResolvedValue({
  allowed: true,
  riskScore: 100,
  positionSize: 1000,
  maxLoss: 100,
  leverage: 5,
  reason: "Risk Approved"
}) as any;

jest.unstable_mockModule("../../src/services/aqea/multiTimeframeEngine.js", () => ({
  MultiTimeframeEngine: { calculateAlignment: jest.fn().mockResolvedValue({ direction: "BULLISH", score: 80 }) }
}));

jest.unstable_mockModule("../../src/services/aqea/orderFlowEngine.js", () => ({
  OrderFlowEngine: { analyze: jest.fn().mockResolvedValue({ score: 80, votingScore: 80, pressure: "BUY", confidence: 0.8, diagnostics: { cvd: 0, delta: 0, oiExpansion: 0, fundingRate: 0, liqLongs: 0, liqShorts: 0, liquidationScore: 0, bookImbalance: 0, votingBreakdown: { liquidationImpact: 0, oiExpansionImpact: 0 } } }) }
}));

jest.unstable_mockModule("../../src/services/aqea/riskEngine.js", () => ({
  RiskEngine: { validateTrade: mockValidateTrade }
}));

jest.unstable_mockModule("../../src/services/aqea/router/RegimeRoutingService.js", () => ({
  V2_2_Router: { route: jest.fn().mockResolvedValue({ activeModel: "MAMBA", prediction: "HOLD", confidence: 0.5, meta: { latencyMs: 1 } }) },
  RegimeRoutingService: { route: jest.fn().mockResolvedValue({ activeModel: "MAMBA", prediction: "HOLD", confidence: 0.5, meta: { latencyMs: 1 } }) }
}));

let AQEAEngine: any, PredictorRegistry: any, AQEA_CONFIG: any;

beforeAll(async () => {
  ({ AQEAEngine } = await import("../../src/services/aqea/engine.js"));
  ({ PredictorRegistry } = await import("../../src/services/aqea/ai/PredictorRegistry.js"));
  ({ AQEA_CONFIG } = await import("../../src/services/aqea/config.js"));
});

afterAll(async () => {
  // mongoose is mocked — no real connection to close
});

describe("AQEA V7.2 Recovery Integration Test", () => {
  jest.setTimeout(30000);
  const userId = "69c2bc93c8601b4eaf3abe2f";
  const symbol = "BTCUSDT";

  beforeEach(() => {
    AQEA_CONFIG.SHADOW_MODE = true;
  });

  it("should generate a LONG decision when AI and Core signals align", async () => {
    AQEA_CONFIG.CNN_VOTING_ENABLED = true;
    AQEA_CONFIG.AI_ENABLED = true;

    const mockLongPrediction = {
      direction: "LONG",
      confidence: 0.85,
      probability: 0.9,
      predictor: "CNN_1D_V1",
      role: "AUTHORIZED"
    };

    mockGetAllPredictions.mockResolvedValue([mockLongPrediction]);
    mockGetAuthorizedPredictions.mockResolvedValue([mockLongPrediction]);
    mockGetPredictor.mockReturnValue({
      predict: jest.fn().mockResolvedValue(mockLongPrediction),
      getHealth: jest.fn().mockReturnValue({ available: true, checkpointLoaded: true })
    });

    if (PredictorRegistry?.getAuthorizedPredictions) {
      jest.spyOn(PredictorRegistry, "getAuthorizedPredictions").mockResolvedValue([mockLongPrediction]);
      jest.spyOn(PredictorRegistry, "getAllPredictions").mockResolvedValue([mockLongPrediction]);
    }

    const context = {
      mode: "PAPER",
      accountType: "FUTURES",
      currentPrice: 65000,
      indicators: {
        adx14: 45,
        atr14: 1000,
        sma200: 55000,
        rsi14: 75,
        open: 64500,
        high: 65500,
        low: 64400,
        volume: 2000,
        macd: { histogram: 15, macd: 25, signal: 10 },
        ema50: 63000,
        ema20: 64000
      },
      bars: Array(250).fill({ open: 64500, high: 65500, low: 64400, close: 65000, volume: 2000 }),
      marketData: { btcDominance: 53.5, fundingRate: 0.0001, volumeAvg: 1800 },
      performance: { winRate: 0.55, rewardRisk: 1.8 }
    };

    const decision = await AQEAEngine.decide(symbol, userId, context);
    console.log("[V7.2 INTEGRATION TEST] Decision Output:", JSON.stringify(decision, null, 2));

    expect(decision.decision).toBe("LONG");
    expect(decision.riskApproved).toBe(true);
    expect(decision.positionSize).toBeGreaterThan(0);
  }, 60000);
});
