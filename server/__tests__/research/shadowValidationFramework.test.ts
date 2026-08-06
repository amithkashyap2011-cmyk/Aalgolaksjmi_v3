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
      model: jest.fn().mockReturnValue({ index: jest.fn() }),
      Schema: MockSchema
    },
    Schema: MockSchema,
    model: jest.fn().mockReturnValue({ index: jest.fn() })
  };
});

const mockCreate = jest.fn().mockImplementation(() => Promise.resolve({})) as any;
jest.unstable_mockModule("../../src/models/ResearchPromotionAudit.js", () => ({
  ResearchPromotionAudit: { create: mockCreate }
}));

const mockEvaluate = jest.fn() as any;
const mockAnalyze = jest.fn() as any;
const mockCheck = jest.fn() as any;

jest.unstable_mockModule("../../src/services/aqea/research/alphaAttribution.js", () => ({
  AlphaAttributionEngine: { evaluate: mockEvaluate }
}));

jest.unstable_mockModule("../../src/services/aqea/research/significanceAnalyzer.js", () => ({
  SignificanceAnalyzer: { analyze: mockAnalyze }
}));

jest.unstable_mockModule("../../src/services/aqea/research/redundancyMonitor.js", () => ({
  RedundancyMonitor: { check: mockCheck }
}));

let ShadowValidationFramework: any, AlphaAttributionEngine: any, SignificanceAnalyzer: any, RedundancyMonitor: any, ResearchPromotionAudit: any;
beforeAll(async () => {
  ({ ShadowValidationFramework } = await import("../../src/services/aqea/research/shadowValidationFramework.js"));
  ({ AlphaAttributionEngine } = await import("../../src/services/aqea/research/alphaAttribution.js") as any);
  ({ SignificanceAnalyzer } = await import("../../src/services/aqea/research/significanceAnalyzer.js") as any);
  ({ RedundancyMonitor } = await import("../../src/services/aqea/research/redundancyMonitor.js") as any);
  ({ ResearchPromotionAudit } = await import("../../src/models/ResearchPromotionAudit.js") as any);
});

describe("Shadow Validation Framework", () => {
  jest.setTimeout(30000);

  beforeEach(() => {
    jest.clearAllMocks();
    if (AlphaAttributionEngine?.evaluate) jest.spyOn(AlphaAttributionEngine, "evaluate");
    if (SignificanceAnalyzer?.analyze) jest.spyOn(SignificanceAnalyzer, "analyze");
    if (RedundancyMonitor?.check) jest.spyOn(RedundancyMonitor, "check");
    if (ResearchPromotionAudit?.create) jest.spyOn(ResearchPromotionAudit, "create").mockResolvedValue({} as any);
  });

  test("promotes model if all gates pass", async () => {
    jest.spyOn(AlphaAttributionEngine, "evaluate").mockResolvedValue({
      uniqueAlphaRate: 0.15,
      profitFactorContribution: 0.10,
      sharpeContribution: 0.10,
      drawdownImpact: 0.005,
      correlationToEnsemble: 0.5
    } as any);

    jest.spyOn(SignificanceAnalyzer, "analyze").mockResolvedValue({
      statisticallySignificant: true,
      pValue: 0.01
    } as any);

    jest.spyOn(RedundancyMonitor, "check").mockResolvedValue({
      pearson: 0.5,
      spearman: 0.5,
      redundant: false
    } as any);

    const predictions = new Array(2500).fill({});
    const baselineOutcomes = new Array(2500).fill({});
    const returns = [0.01, 0.02];

    const result = await ShadowValidationFramework.validateForPromotion(
      "MAMBA", predictions, baselineOutcomes, returns, ["CNN"], { "CNN": [0.01, 0.01] }
    );

    expect(result.eligible).toBe(true);
    expect(result.reasons).toContain("All scientific validation gates passed. Eligible for voting review.");
  });

  test("denies promotion if trades < 2000", async () => {
    jest.spyOn(AlphaAttributionEngine, "evaluate").mockResolvedValue({
      uniqueAlphaRate: 0.15,
      profitFactorContribution: 0.10,
      sharpeContribution: 0.10,
      drawdownImpact: 0.005,
      correlationToEnsemble: 0.5
    } as any);
    jest.spyOn(SignificanceAnalyzer, "analyze").mockResolvedValue({ statisticallySignificant: true, pValue: 0.01 } as any);
    jest.spyOn(RedundancyMonitor, "check").mockResolvedValue({ pearson: 0.5, spearman: 0.5, redundant: false } as any);

    const predictions = new Array(1500).fill({});
    const result = await ShadowValidationFramework.validateForPromotion("MAMBA", predictions, [], [], [], {});

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Insufficient trades: 1500 < 2000");
  });

  test("denies promotion if highly redundant", async () => {
    jest.spyOn(AlphaAttributionEngine, "evaluate").mockResolvedValue({
      uniqueAlphaRate: 0.15,
      profitFactorContribution: 0.10,
      sharpeContribution: 0.10,
      drawdownImpact: 0.005,
      correlationToEnsemble: 0.5
    } as any);
    jest.spyOn(SignificanceAnalyzer, "analyze").mockResolvedValue({ statisticallySignificant: true, pValue: 0.01 } as any);
    jest.spyOn(RedundancyMonitor, "check").mockResolvedValue({ pearson: 0.90, spearman: 0.90, redundant: true } as any);

    const predictions = new Array(2500).fill({});
    const result = await ShadowValidationFramework.validateForPromotion("MAMBA", predictions, [], [], ["CNN"], { "CNN": [] });

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Redundant with CNN (corr: 0.90)");
    expect(result.reasons).toContain("Excessive Correlation: 0.900 > 0.85");
  });

  test("denies promotion if not statistically significant", async () => {
    jest.spyOn(AlphaAttributionEngine, "evaluate").mockResolvedValue({
      uniqueAlphaRate: 0.15,
      profitFactorContribution: 0.10,
      sharpeContribution: 0.10,
      drawdownImpact: 0.005,
      correlationToEnsemble: 0.5
    } as any);
    jest.spyOn(SignificanceAnalyzer, "analyze").mockResolvedValue({ statisticallySignificant: false, pValue: 0.06 } as any);
    jest.spyOn(RedundancyMonitor, "check").mockResolvedValue({ pearson: 0.5, spearman: 0.5, redundant: false } as any);

    const predictions = new Array(2500).fill({});
    const result = await ShadowValidationFramework.validateForPromotion("MAMBA", predictions, [], [], [], {});

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Not statistically significant (p-value: 0.060 >= 0.05)");
  });
});
