import { jest } from '@jest/globals';

jest.unstable_mockModule("mongoose", () => {
  class MockSchema {
    static Types: any = { ObjectId: "ObjectId" };
    index() {}
  }
  return {
    default: {
      connection: { readyState: 1 },
      Types: { ObjectId: class { id: any; constructor(id: any) { this.id = id; } toString() { return this.id; } static isValid() { return true; } } },
      model: jest.fn().mockReturnValue({ index: jest.fn(), create: jest.fn(), find: (jest.fn() as any).mockResolvedValue([]), updateOne: jest.fn() }),
      Schema: MockSchema
    },
    Schema: MockSchema,
    model: jest.fn().mockReturnValue({ index: jest.fn(), create: jest.fn(), find: (jest.fn() as any).mockResolvedValue([]), updateOne: jest.fn() })
  };
});

const mockCreate = jest.fn().mockImplementation(() => Promise.resolve({})) as any;
jest.unstable_mockModule("../../src/models/ResearchPromotionAudit.js", () => ({ ResearchPromotionAudit: { create: mockCreate } }));
jest.unstable_mockModule("../../src/models/ResearchAlphaAttribution.js", () => ({ ResearchAlphaAttribution: { create: mockCreate } }));
jest.unstable_mockModule("../../src/models/ResearchStatisticalReport.js", () => ({ ResearchStatisticalReport: { create: mockCreate } }));
jest.unstable_mockModule("../../src/models/ResearchRedundancyReport.js", () => ({ ResearchRedundancyReport: { create: mockCreate } }));
jest.unstable_mockModule("../../src/models/AqeaTradeAnalytics.js", () => ({ AqeaTradeAnalytics: { create: mockCreate, updateOne: jest.fn() } }));

let ShadowValidationFramework: any, MambaFeatureMapper: any;
let ResearchAlphaAttribution: any, ResearchPromotionAudit: any, ResearchStatisticalReport: any, ResearchRedundancyReport: any;

beforeAll(async () => {
  ({ ShadowValidationFramework } = await import("../../src/services/aqea/research/shadowValidationFramework.js") as any);
  ({ MambaFeatureMapper } = await import("../../src/services/aqea/research/mambaFeatureMapper.js") as any);
  ({ ResearchAlphaAttribution } = await import("../../src/models/ResearchAlphaAttribution.js") as any);
  ({ ResearchPromotionAudit } = await import("../../src/models/ResearchPromotionAudit.js") as any);
  ({ ResearchStatisticalReport } = await import("../../src/models/ResearchStatisticalReport.js") as any);
  ({ ResearchRedundancyReport } = await import("../../src/models/ResearchRedundancyReport.js") as any);
});

describe("Mamba Shadow Validation Program (Phase 2.1C)", () => {
  jest.setTimeout(60000);

  beforeEach(() => {
    jest.clearAllMocks();
    if (ResearchAlphaAttribution?.create) jest.spyOn(ResearchAlphaAttribution, "create").mockResolvedValue({} as any);
    if (ResearchPromotionAudit?.create) jest.spyOn(ResearchPromotionAudit, "create").mockResolvedValue({} as any);
    if (ResearchStatisticalReport?.create) jest.spyOn(ResearchStatisticalReport, "create").mockResolvedValue({} as any);
    if (ResearchRedundancyReport?.create) jest.spyOn(ResearchRedundancyReport, "create").mockResolvedValue({} as any);
  });

  test("validates Mamba and generates Promotion Audit", async () => {
    const TOTAL_TRADES = 2000;

    const predictions = Array.from({ length: TOTAL_TRADES }, (_, i) => ({
      correct: i % 10 < 6,
      confidence: 0.85
    }));

    const baselineOutcomes = Array.from({ length: TOTAL_TRADES }, (_, i) => ({
      correct: i % 10 < 4
    }));

    const returns = Array.from({ length: TOTAL_TRADES }, (_, i) => {
        if (i % 10 < 6) return 0.02;
        return -0.01;
    });

    const peerModels = ["CNN", "SmartMoney", "OrderFlow"];
    const peerSeries: Record<string, number[]> = {
        "CNN": Array.from({ length: TOTAL_TRADES }, (_, i) => i % 2 === 0 ? 0.01 : -0.01),
        "SmartMoney": Array.from({ length: TOTAL_TRADES }, (_, i) => i % 3 === 0 ? 0.01 : -0.01),
        "OrderFlow": Array.from({ length: TOTAL_TRADES }, (_, i) => i % 4 === 0 ? 0.01 : -0.01),
    };

    const start = performance.now();
    for(let i = 0; i < 50; i++) {
      MambaFeatureMapper.map({
        userId: "test", symbol: "BTCUSDT", decision: "LONG",
        market: { open: 1, high: 2, low: 0, close: 1, volume: 100, atr: 10, adx: 20, rsi: 50, macd: 1, vwap: 1, ema20: 1, ema50: 1, ema200: 1 },
        regime: { state: "RANGING", score: 50 },
        orderFlow: { cvd: 1, delta: 1, oiExpansion: 1, fundingRate: 0.0001, liquidationScore: 0 },
        smartMoney: { liquiditySweep: true, bos: false, orderBlock: false, fvg: false, poc: 1 },
        execution: { positionSize: 100, stopLoss: 0.5, takeProfit: 2 }
      });
    }
    const end = performance.now();
    const latency = (end - start) / 50;
    expect(latency).toBeLessThan(50);

    const report = await ShadowValidationFramework.validateForPromotion(
      "MAMBA_V2", predictions, baselineOutcomes, returns, peerModels, peerSeries
    );

    expect(report.modelName).toBe("MAMBA_V2");
    expect(report.metrics.trades).toBe(2000);
  });
});
