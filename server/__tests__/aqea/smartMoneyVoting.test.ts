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
      Schema: MockSchema
    },
    Schema: MockSchema,
    model: jest.fn().mockReturnValue(mockModelObj)
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

jest.unstable_mockModule("../../src/models/RouterDecisionAudit.js", () => ({
  RouterDecisionAudit: { create: (jest.fn() as any).mockResolvedValue({}) }
}));

jest.unstable_mockModule("../../src/models/TransitionOverrideAudit.js", () => ({
  TransitionOverrideAudit: { find: jest.fn().mockReturnValue(chainMock), create: (jest.fn() as any).mockResolvedValue({}) }
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

jest.unstable_mockModule("../../src/models/ResearchMetaAlphaAudit.js", () => ({
  ResearchMetaAlphaAudit: { create: (jest.fn() as any).mockResolvedValue({}) }
}));

jest.unstable_mockModule("../../src/services/aqea/orderFlowEngine.js", () => ({
  OrderFlowEngine: { analyze: jest.fn() }
}));
jest.unstable_mockModule("../../src/services/aqea/smartMoneyEngine.js", () => ({
  SmartMoneyEngine: { analyze: jest.fn() }
}));
jest.unstable_mockModule("../../src/services/aqea/regimeEngine.js", () => ({
  RegimeEngine: { analyze: jest.fn() }
}));
jest.unstable_mockModule("../../src/services/aqea/multiTimeframeEngine.js", () => ({
  MultiTimeframeEngine: { calculateAlignment: jest.fn() }
}));
jest.unstable_mockModule("../../src/services/aqea/riskEngine.js", () => ({
  RiskEngine: { validateTrade: (jest.fn() as any).mockResolvedValue({ allowed: true, positionSize: 100, riskScore: 80, reason: "OK" }) }
}));
jest.unstable_mockModule("../../src/services/aqea/AqeaAudit.js", () => ({
  AqeaAuditService: {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    critical: jest.fn(),
    error: jest.fn(),
  },
}));


jest.unstable_mockModule("../../models/Settings.js", () => ({
  Settings: { findOne: (jest.fn() as any).mockResolvedValue({ aiConsensusGate: true }) }
}));

jest.unstable_mockModule("../../src/services/aqea/ai/PredictorRegistry.js", () => ({
  PredictorRegistry: {
    getAllPredictions: (jest.fn() as any).mockResolvedValue([]),
    getAuthorizedPredictions: (jest.fn() as any).mockResolvedValue([]),
    getPredictor: (jest.fn() as any).mockReturnValue(null),
  }
}));

let AQEAEngine: any, OrderFlowEngine: any, SmartMoneyEngine: any, RegimeEngine: any, MultiTimeframeEngine: any, Settings: any, Trade: any, RouterDecisionAudit: any, AqeaTradeAnalytics: any, AqeaPerformance: any, ResearchMetaAlphaAudit: any, TransitionOverrideAudit: any, AQEA_CONFIG: any;
beforeAll(async () => {
  ({ Settings } = await import("../../src/models/Settings.js"));
  ({ Trade } = await import("../../src/models/Trade.js"));
  ({ RouterDecisionAudit } = await import("../../src/models/RouterDecisionAudit.js"));
  ({ AqeaTradeAnalytics } = await import("../../src/models/AqeaTradeAnalytics.js"));
  ({ AqeaPerformance } = await import("../../src/models/AqeaPerformance.js"));
  ({ ResearchMetaAlphaAudit } = await import("../../src/models/ResearchMetaAlphaAudit.js"));
  ({ TransitionOverrideAudit } = await import("../../src/models/TransitionOverrideAudit.js"));
  ({ AQEAEngine } = await import("../../src/services/aqea/engine.js"));
  ({ OrderFlowEngine } = await import("../../src/services/aqea/orderFlowEngine.js") as any);
  ({ SmartMoneyEngine } = await import("../../src/services/aqea/smartMoneyEngine.js") as any);
  ({ RegimeEngine } = await import("../../src/services/aqea/regimeEngine.js") as any);
  ({ MultiTimeframeEngine } = await import("../../src/services/aqea/multiTimeframeEngine.js") as any);
  ({ AQEA_CONFIG } = await import("../../src/services/aqea/config.js") as any);
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
  if (ResearchMetaAlphaAudit?.create) jest.spyOn(ResearchMetaAlphaAudit, "create").mockResolvedValue({} as any);
  if (TransitionOverrideAudit?.find) jest.spyOn(TransitionOverrideAudit, "find").mockReturnValue(chain as any);
  if (TransitionOverrideAudit?.create) jest.spyOn(TransitionOverrideAudit, "create").mockResolvedValue({} as any);
});

describe("AQEA Phase 3C: Smart Money Voting Integration", () => {
  jest.setTimeout(60000);
  const symbol = "BTCUSDT";
  const userId = "507f1f77bcf86cd799439011";

  const baseContext: any = {
    mode: "PAPER",
    accountType: "FUTURES",
    currentPrice: 100000,
    indicators: { adx14: 30, atr14: 1000, bars: [] },
    marketData: { btcDominance: 53, fundingRate: 0.0001, volumeAvg: 1000 },
    performance: { winRate: 0.55, rewardRisk: 2 }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (AQEA_CONFIG as any).ORDERFLOW_VOTING_ENABLED = true;
    (AQEA_CONFIG as any).SMART_MONEY_VOTING_ENABLED = true;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("Base weights are Core 75%, OF 15%, SM 10% in normal regime", async () => {
    jest.spyOn(RegimeEngine, "analyze").mockResolvedValue({ state: "TRENDING_BULL", score: 80, confidence: 80 } as any);
    jest.spyOn(MultiTimeframeEngine, "calculateAlignment").mockResolvedValue({ score: 50, direction: "NEUTRAL", agreement: 3 } as any);
    jest.spyOn(OrderFlowEngine, "analyze").mockResolvedValue({ votingScore: 50, pressure: "NEUTRAL", diagnostics: {} } as any);
    jest.spyOn(SmartMoneyEngine, "analyze").mockReturnValue({ votingScore: 50, signal: "NEUTRAL", diagnostics: { liquiditySweeps: [] } } as any);

    const res = await AQEAEngine.decide(symbol, userId, baseContext);
    expect(res.meta.weightsApplied.core).toBeCloseTo(0.7368, 3);
  });

  test("Conviction Boost increases SM weight to 15% and Core to 70%", async () => {
    jest.spyOn(RegimeEngine, "analyze").mockResolvedValue({ state: "TRENDING_BULL", score: 80, confidence: 80 } as any);
    jest.spyOn(MultiTimeframeEngine, "calculateAlignment").mockResolvedValue({ score: 80, direction: "BULLISH", agreement: 5 } as any);
    jest.spyOn(OrderFlowEngine, "analyze").mockResolvedValue({ votingScore: 80, pressure: "BUY", diagnostics: {} } as any);
    jest.spyOn(SmartMoneyEngine, "analyze").mockReturnValue({ votingScore: 80, signal: "BULLISH", diagnostics: { liquiditySweeps: ["BULLISH_SWEEP"] } } as any);

    const res = await AQEAEngine.decide(symbol, userId, baseContext);
    
    expect(res.meta.convictionBoost).toBe(true);
    expect(res.meta.weightsApplied.smartMoney).toBeCloseTo(0.1579, 4);
    expect(res.reasons).toContain("CONVICTION_BOOST_ACTIVE");
  });

  test("High Volatility disables Conviction Boost", async () => {
    jest.spyOn(RegimeEngine, "analyze").mockResolvedValue({ state: "HIGH_VOLATILITY", score: 50, confidence: 50 } as any);
    jest.spyOn(MultiTimeframeEngine, "calculateAlignment").mockResolvedValue({ score: 50, direction: "NEUTRAL", agreement: 5 } as any);
    jest.spyOn(OrderFlowEngine, "analyze").mockResolvedValue({ votingScore: 50, pressure: "NEUTRAL", diagnostics: {} } as any);
    jest.spyOn(SmartMoneyEngine, "analyze").mockReturnValue({ votingScore: 50, signal: "NEUTRAL", diagnostics: { liquiditySweeps: [] } } as any);

    const res = await AQEAEngine.decide(symbol, userId, baseContext);
    expect(res.meta.convictionBoost).toBe(false);
    expect(res.meta.weightsApplied.smartMoney).toBeCloseTo(0.1053, 4);
  });
});
