import { jest } from '@jest/globals';
import type { FeatureVector } from "../../src/services/aqea/featureStore.js";

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
      model: jest.fn().mockReturnValue({ index: jest.fn(), create: (jest.fn() as any).mockResolvedValue({}) }),
      Schema: MockSchema
    },
    Schema: MockSchema,
    model: jest.fn().mockReturnValue({ index: jest.fn(), create: (jest.fn() as any).mockResolvedValue({}) })
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

jest.unstable_mockModule("../../src/services/aqea/AqeaAudit.js", () => ({
  AqeaAuditService: {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    critical: jest.fn(),
    error: jest.fn(),
  },
}));

jest.unstable_mockModule("../../src/models/AIPredictionTelemetry.js", () => ({
  AIPredictionTelemetry: { create: (jest.fn() as any).mockResolvedValue({}) },
  ModelAccuracyMetrics: { findOne: (jest.fn() as any).mockReturnValue({ lean: () => Promise.resolve({ rolling100_accuracy: 85 }) }) }
}));

// @ts-ignore — mock systemManager so serviceDiscovery returns a valid URL
jest.unstable_mockModule("../../src/services/systemManager.js", () => ({
  systemManager: {
    getService: (jest.fn() as any).mockReturnValue({ url: "http://localhost:8000", status: "HEALTHY" }),
    registerService: jest.fn(),
    getAllServices: jest.fn().mockReturnValue([]),
    on: jest.fn(),
    emit: jest.fn(),
  }
}));

// @ts-ignore — mock the endpoint registry itself so buildEndpointUrl never calls real serviceDiscovery
jest.unstable_mockModule("../../src/config/aiEndpointRegistry.js", () => ({
  AI_ENDPOINTS: {
    CNN: "/predict/cnn",
    PPO: "/predict/ppo-execution",
    MAMBA: "/research/predict/mamba",
    TRANSFORMER: "/research/predict/transformer-micro",
    HEALTH: "/health",
    MODEL_HEALTH: "/health/models",
    GOVERNANCE: "/health/governance"
  },
  buildEndpointUrl: (jest.fn() as any).mockImplementation((path: string) =>
    Promise.resolve(`http://localhost:8000${path}`)
  )
}));

// @ts-ignore — also mock serviceDiscovery directly
jest.unstable_mockModule("../../src/config/serviceDiscovery.js", () => ({
  getQuantEngineURL: (jest.fn() as any).mockResolvedValue("http://localhost:8000"),
  isReachable: (jest.fn() as any).mockResolvedValue(true),
  isQuantEngineAvailable: (jest.fn() as any).mockResolvedValue(true),
  discoveryEvents: { on: jest.fn(), emit: jest.fn() }
}));

let PredictorRegistry: any, AQEA_CONFIG: any, AqeaAuditService: any;
beforeAll(async () => {
  ({ PredictorRegistry } = await import("../../src/services/aqea/ai/PredictorRegistry.js"));
  ({ AQEA_CONFIG } = await import("../../src/services/aqea/config.js"));
  ({ AqeaAuditService } = await import("../../src/services/aqea/AqeaAudit.js") as any);
});

jest.setTimeout(60000);

// Mock fetch for Python service
(global as any).fetch = jest.fn((url: string) => {
  if (url.includes("/health/models")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ cnn: "HEALTHY", ppo: "HEALTHY", mamba: "HEALTHY", transformer: "HEALTHY" }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ direction: "LONG", confidence: 0.85, probability: 0.85 }),
  });
});

describe("AQEA Phase 4C: CNN Shadow Predictor", () => {
  const symbol = "BTCUSDT";
  const userId = "507f1f77bcf86cd799439011";

  const baseFeatures: FeatureVector = {
    userId,
    symbol,
    decision: "LONG",
    market: {
      open: 100000, high: 101000, low: 99000, close: 100500, volume: 1000,
      atr: 1000, adx: 30, rsi: 60, macd: 50, 
      macdValue: 50, macdSignal: 40, macdHistogram: 10,
      vwap: 100200,
      ema20: 100100, ema50: 99500, ema200: 98000
    },
    regime: { state: "TRENDING_BULL", score: 80 },
    orderFlow: { cvd: 100, delta: 50, oiExpansion: 0.01, fundingRate: 0.0001, liquidationScore: 20 },
    smartMoney: { liquiditySweep: false, bos: true, orderBlock: true, fvg: false, poc: 100000 },
    execution: { positionSize: 200, stopLoss: 98000, takeProfit: 105000 }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(AQEA_CONFIG, "AI_ENABLED", { value: true, writable: true, configurable: true });
    Object.defineProperty(AQEA_CONFIG, "CNN_VOTING_ENABLED", { value: true, writable: true, configurable: true });
  });

  test("CNN Predictor is registered and functional", async () => {
    const predictor = PredictorRegistry.getPredictor("CNN");
    expect(predictor.getHealth().name).toBe("CNN_1D_V1");
    
    // Spy on runInference to bypass ESM mock-chain issues with serviceDiscovery
    const runInferenceSpy = jest.spyOn(predictor as any, "runInference").mockResolvedValue({
      direction: "LONG",
      confidence: 0.85,
      probability: 0.85
    } as any);

    const prediction = await predictor.predict(baseFeatures);
    expect(prediction.direction).toBe("LONG");
    expect(prediction.confidence).toBe(0.85);
    expect(prediction.predictor).toBe("CNN_1D_V1");
    expect(runInferenceSpy).toHaveBeenCalledWith(baseFeatures);

    runInferenceSpy.mockRestore();
  });

  test("CNN Predictor returns HOLD when AI is disabled", async () => {
    Object.defineProperty(AQEA_CONFIG, "AI_ENABLED", { value: false, writable: true, configurable: true });
    const predictor = PredictorRegistry.getPredictor("CNN");
    
    const prediction = await predictor.predict(baseFeatures);
    expect(prediction.direction).toBe("HOLD");
    expect(prediction.confidence).toBe(0);
  });
});
