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

import { alignedDlMockFactory, approveBayesianGate } from "./alignedDlMock.js";
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

const mockCalculateLevels = jest.fn() as any;
const mockEvaluateExit = jest.fn() as any;
jest.unstable_mockModule("../../src/services/aqea/exitEngine.js", () => ({
  ExitEngine: {
    calculateLevels: mockCalculateLevels,
    evaluateExit: mockEvaluateExit
  }
}));

const mockGetAllPredictions = jest.fn() as any;
const mockGetAuthorizedPredictions = jest.fn() as any;
jest.unstable_mockModule("../../src/services/aqea/ai/ModernModelRegistry.js", alignedDlMockFactory);
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

let AQEAEngine: any, ShadowSimulator: any, AQEA_CONFIG: any, Settings: any, PredictorRegistry: any, RegimeEngine: any;
let LakshmiMasterRouter: any, __origRoute: any;
let currentPreds: any[] = [];

beforeAll(async () => {
  ({ Settings } = await import("../../src/models/Settings.js"));
  ({ AQEAEngine } = await import("../../src/services/aqea/engine.js"));
  await approveBayesianGate(jest);
  ({ ShadowSimulator } = await import("../../src/services/aqea/shadowSimulator.js"));
  ({ AQEA_CONFIG } = await import("../../src/services/aqea/config.js") as any);
  ({ PredictorRegistry } = await import("../../src/services/aqea/ai/PredictorRegistry.js") as any);
  ({ RegimeEngine } = await import("../../src/services/aqea/regimeEngine.js") as any);
  // The real ensemble fusion is structurally sub-hurdle (evPassesGate === false,
  // expectedValue 0) on this suite's synthetic inputs. Post-fix, that EV veto
  // now (correctly) blocks the technical fallback — so to keep exercising this
  // suite's actual subject (layer alignment / directional decisions), we run the
  // REAL router and only force evPassesGate=true, i.e. reproduce the legitimate-
  // signal path where the ensemble does NOT veto. A dedicated test below asserts
  // the blocked path (evPassesGate=false → HOLD) separately.
  ({ LakshmiMasterRouter } = await import("../../src/services/aqea/router/LakshmiMasterRouter.js") as any);
  __origRoute = LakshmiMasterRouter.route.bind(LakshmiMasterRouter);
});

afterAll(async () => {
  // mongoose is mocked — no real connection to close
});

jest.setTimeout(60000);

describe("AQEA Engine Integration", () => {
  const userId = "507f1f77bcf86cd799439011";
  const symbol = "BTCUSDT";

  const baseContext: any = {
    mode: "PAPER",
    accountType: "FUTURES",
    currentPrice: 100000,
    indicators: {
      adx14: 35, atr14: 2000, rsi14: 65, ema20: 95000, ema50: 90000, sma200: 80000,
      open: 100000, high: 101000, low: 99000, close: 100000, volume: 1000,
      bars: Array(250).fill({ open: 90000, high: 101000, low: 89000, close: 100000, volume: 1000 })
    },
    marketData: { btcDominance: 53.5, fundingRate: 0.0001, volumeAvg: 800 },
    performance: { winRate: 0.55, rewardRisk: 1.8 }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Force the ensemble EV gate to PASS (see beforeAll note) so legitimate
    // directional signals still flow through the technical fallback.
    LakshmiMasterRouter.route = async (...args: any[]) => {
      const r: any = await __origRoute(...args);
      if (r?.ensembleFusion) r.ensembleFusion.evPassesGate = true;
      return r;
    };
    (AQEA_CONFIG as any).AI_ENABLED = false;
    (AQEA_CONFIG as any).CNN_VOTING_ENABLED = false;

    if (PredictorRegistry?.getAuthorizedPredictions) {
      jest.spyOn(PredictorRegistry, "getAuthorizedPredictions").mockImplementation(() => Promise.resolve(currentPreds));
      jest.spyOn(PredictorRegistry, "getAllPredictions").mockImplementation(() => Promise.resolve(currentPreds));
    }

    if (RegimeEngine?.analyze) {
      jest.spyOn(RegimeEngine, "analyze").mockReturnValue({ state: "TRENDING_BULL", score: 80, confidence: 80 } as any);
    }

    if (Settings?.findOne) {
      jest.spyOn(Settings, "findOne").mockReturnValue(mockSettingsQuery as any);
    }
    mockGetWallet.mockReturnValue(new Map([["USDT", 10000]]));
    mockValidateTrade.mockResolvedValue({ allowed: true, positionSize: 200, riskScore: 90, reason: "OK" });

    mockRegimeAnalyze.mockReturnValue({ state: "TRENDING_BULL", score: 80, confidence: 80 });
    mockMultiTFCalculate.mockResolvedValue({ score: 85, direction: "BULLISH" });
    mockOrderFlowAnalyze.mockResolvedValue({ votingScore: 50, score: 50, pressure: "NEUTRAL", confidence: 30, diagnostics: { liquiditySweeps: [] } });
    mockSmartMoneyAnalyze.mockReturnValue({ votingScore: 50, signal: "NEUTRAL", diagnostics: { liquiditySweeps: [] } });
    mockCalculateLevels.mockReturnValue({ tp1: 102000, tp2: 104000, tp3: 106000, sl: 97000 });
  });

  test("Generate LONG decision when all layers align", async () => {
    (AQEA_CONFIG as any).AI_ENABLED = true;
    (AQEA_CONFIG as any).CNN_VOTING_ENABLED = true;

    mockRegimeAnalyze.mockReturnValue({ state: "TRENDING_BULL", score: 80, confidence: 80 });
    mockMultiTFCalculate.mockResolvedValue({ score: 85, direction: "BULLISH" });
    mockValidateTrade.mockResolvedValue({ allowed: true, positionSize: 200, riskScore: 90 });
    mockCalculateLevels.mockReturnValue({ tp1: 102000, tp2: 104000, tp3: 106000, sl: 97000 });

    currentPreds = [{
      predictor: "CNN_1D_V1",
      direction: "LONG",
      confidence: 0.85,
      probability: 0.85
    }];
    mockGetAllPredictions.mockResolvedValue(currentPreds);
    mockGetAuthorizedPredictions.mockResolvedValue(currentPreds);

    const res = await AQEAEngine.decide(symbol, userId, baseContext);

    expect(res.decision).toBe("LONG");
    expect(res.riskApproved).toBe(true);
    expect(res.reasons).toContain("TRENDING_BULL");
  });

  // 🛡️ Regression for the negative-EV fallback fix: the SAME strongly-aligned
  // technical setup that produces LONG above must stay HOLD once the ensemble
  // EV gate explicitly fails (evPassesGate === false). Previously the finalScore
  // fallback ignored the EV veto and opened the trade anyway.
  test("EV gate (evPassesGate=false) blocks the technical fallback → HOLD", async () => {
    (AQEA_CONFIG as any).AI_ENABLED = true;
    (AQEA_CONFIG as any).CNN_VOTING_ENABLED = true;

    // Same aligned inputs as the LONG test, but the ensemble now vetoes on EV.
    LakshmiMasterRouter.route = async (...args: any[]) => {
      const r: any = await __origRoute(...args);
      if (r?.ensembleFusion) Object.assign(r.ensembleFusion, { evPassesGate: false, expectedValue: -0.12 });
      return r;
    };

    mockRegimeAnalyze.mockReturnValue({ state: "TRENDING_BULL", score: 80, confidence: 80 });
    mockMultiTFCalculate.mockResolvedValue({ score: 85, direction: "BULLISH" });
    mockValidateTrade.mockResolvedValue({ allowed: true, positionSize: 200, riskScore: 90 });

    currentPreds = [{ predictor: "CNN_1D_V1", direction: "LONG", confidence: 0.85, probability: 0.85 }];
    mockGetAllPredictions.mockResolvedValue(currentPreds);
    mockGetAuthorizedPredictions.mockResolvedValue(currentPreds);

    const res = await AQEAEngine.decide(symbol, userId, baseContext);

    expect(res.decision).toBe("HOLD");
    expect(res.reasons.some((r: string) => r.includes("EV_GATE: BLOCKED_NEGATIVE_EV_FALLBACK"))).toBe(true);
  });

  // A failed gate that only means "no strong ensemble view" (plain HOLD, EV 0,
  // probabilities leaning the same way) must NOT veto the technical fallback —
  // that was vetoing 100% of decisions and stopped all entries after 09-22.
  const withFusion = (patch: Record<string, number | boolean>) => {
    LakshmiMasterRouter.route = async (...args: any[]) => {
      const r: any = await __origRoute(...args);
      if (r?.ensembleFusion) Object.assign(r.ensembleFusion, { direction: "HOLD", evPassesGate: false, expectedValue: 0, ...patch });
      return r;
    };
  };
  const alignedLong = async () => {
    (AQEA_CONFIG as any).AI_ENABLED = true;
    (AQEA_CONFIG as any).CNN_VOTING_ENABLED = true;
    mockRegimeAnalyze.mockReturnValue({ state: "TRENDING_BULL", score: 80, confidence: 80 });
    mockMultiTFCalculate.mockResolvedValue({ score: 85, direction: "BULLISH" });
    mockValidateTrade.mockResolvedValue({ allowed: true, positionSize: 200, riskScore: 90 });
    currentPreds = [{ predictor: "CNN_1D_V1", direction: "LONG", confidence: 0.85, probability: 0.85 }];
    mockGetAllPredictions.mockResolvedValue(currentPreds);
    mockGetAuthorizedPredictions.mockResolvedValue(currentPreds);
    return AQEAEngine.decide(symbol, userId, baseContext);
  };

  test("no-view HOLD leaning the same way does not veto the technical fallback", async () => {
    withFusion({ buyProbability: 0.42, sellProbability: 0.28, holdProbability: 0.30 });
    const res = await alignedLong();
    expect(res.decision).toBe("LONG");
    expect(res.reasons.some((r: string) => r.includes("EV_GATE"))).toBe(false);
  });

  // PAPER-only Bayesian floor: a directional call whose posterior clears
  // PAPER_BAYES_FLOOR but not the regime threshold is admitted (and tagged) in
  // PAPER; LIVE keeps the full threshold; below the floor stays vetoed.
  describe("PAPER Bayesian floor", () => {
    const failBayes = async (posterior: number) => {
      const { AdaptiveBayesianGate } = await import("../../src/services/aqea/bayesian/AdaptiveBayesianGate.js");
      jest.spyOn(AdaptiveBayesianGate, "evaluate").mockImplementation((...args: any[]) => ({
        passesGate: false, posteriorProbability: posterior, calibratedProbability: posterior, requiredThreshold: 0.78,
        priorOdds: 1, likelihoodRatio: 1, calibrationMethod: "ANALYTICAL_FALLBACK", sampleCount: 0,
        calibrationConfidence: 0, rejectionReason: "POSTERIOR_BELOW_THRESHOLD", regime: args[3] ?? "TRENDING_BULL", meta: {},
      }) as any);
    };
    afterEach(async () => { await approveBayesianGate(jest); });

    test("PAPER: posterior above the floor is admitted and tagged", async () => {
      await failBayes(0.50);
      withFusion({ buyProbability: 0.46, sellProbability: 0.21, holdProbability: 0.33 });
      const res = await alignedLong();
      expect(res.decision).toBe("LONG");
      expect(res.reasons.some((r: string) => r.startsWith("BAYESIAN_GATE: PAPER_RELAXED"))).toBe(true);
    });

    test("PAPER: posterior below the floor is still vetoed", async () => {
      await failBayes(0.40);
      withFusion({ buyProbability: 0.46, sellProbability: 0.21, holdProbability: 0.33 });
      const res = await alignedLong();
      expect(res.decision).toBe("HOLD");
      expect(res.reasons).toContain("BAYESIAN_GATE: POSTERIOR_BELOW_THRESHOLD");
    });

    test("LIVE: the same posterior is vetoed (full regime threshold)", async () => {
      await failBayes(0.50);
      withFusion({ buyProbability: 0.46, sellProbability: 0.21, holdProbability: 0.33 });
      (AQEA_CONFIG as any).AI_ENABLED = true;
      (AQEA_CONFIG as any).CNN_VOTING_ENABLED = true;
      currentPreds = [{ predictor: "CNN_1D_V1", direction: "LONG", confidence: 0.85, probability: 0.85 }];
      mockGetAllPredictions.mockResolvedValue(currentPreds);
      mockGetAuthorizedPredictions.mockResolvedValue(currentPreds);
      const res = await AQEAEngine.decide(symbol, userId, { ...baseContext, mode: "LIVE" });
      expect(res.decision).toBe("HOLD");
      expect(res.reasons.some((r: string) => r.includes("PAPER_RELAXED"))).toBe(false);
    });
  });

  test("no-view HOLD leaning the opposite way still vetoes the technical fallback", async () => {
    withFusion({ buyProbability: 0.28, sellProbability: 0.42, holdProbability: 0.30 });
    const res = await alignedLong();
    expect(res.decision).toBe("HOLD");
    expect(res.reasons.some((r: string) => r.includes("fusion leans opposite"))).toBe(true);
  });

  test("Generate HOLD decision if regime score is too low", async () => {
    currentPreds = [];
    mockGetAllPredictions.mockResolvedValue([]);
    mockGetAuthorizedPredictions.mockResolvedValue([]);

    if (RegimeEngine?.analyze) {
      jest.spyOn(RegimeEngine, "analyze").mockReturnValue({ state: "RANGING", score: 50, confidence: 50 } as any);
    }
    mockRegimeAnalyze.mockReturnValue({ state: "RANGING", score: 50, confidence: 50 });
    mockMultiTFCalculate.mockResolvedValue({ score: 85, direction: "BULLISH" });
    mockValidateTrade.mockResolvedValue({ allowed: true, positionSize: 200, riskScore: 90 });

    const res = await AQEAEngine.decide(symbol, userId, baseContext);

    expect(res.decision).toBe("HOLD");
  });
});

describe("Shadow Simulator Integration", () => {
  const userId = "507f1f77bcf86cd799439011";
  const symbol = "BTCUSDT";

  test("Open and update shadow position", async () => {
    const entryPrice = 100000;
    const levels = { tp1: 102000, tp2: 104000, tp3: 106000, sl: 97000 };

    ShadowSimulator.openPosition(userId, symbol, "BUY", entryPrice, levels, 0.01);
    expect(ShadowSimulator.hasPosition(userId, symbol)).toBe(true);

    mockEvaluateExit.mockReturnValue({ shouldExit: true, type: "PARTIAL", qtyPct: 0.25, reason: "TP1_HIT" });
    
    await ShadowSimulator.update(userId, symbol, 102500);
    expect(ShadowSimulator.hasPosition(userId, symbol)).toBe(true);

    mockEvaluateExit.mockReturnValue({ shouldExit: true, type: "FULL", qtyPct: 1.0, reason: "STOP_LOSS" });
    await ShadowSimulator.update(userId, symbol, 96000);
    expect(ShadowSimulator.hasPosition(userId, symbol)).toBe(false);
  });
});
