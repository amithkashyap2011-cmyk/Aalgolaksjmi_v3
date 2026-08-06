import { jest } from '@jest/globals';

const mockCreate = jest.fn().mockImplementation(() => Promise.resolve({})) as any;

jest.unstable_mockModule("../../src/models/ResearchAlphaAttribution.js", () => ({
  ResearchAlphaAttribution: { create: mockCreate }
}));

let AlphaAttributionEngine: any, ResearchAlphaAttribution: any;
beforeAll(async () => {
  ({ AlphaAttributionEngine } = await import("../../src/services/aqea/research/alphaAttribution.js"));
  ({ ResearchAlphaAttribution } = await import("../../src/models/ResearchAlphaAttribution.js") as any);
});

describe("Alpha Attribution Engine", () => {
  jest.setTimeout(30000);

  beforeEach(() => {
    jest.clearAllMocks();
    if (ResearchAlphaAttribution?.create) {
      jest.spyOn(ResearchAlphaAttribution, "create").mockImplementation(() => Promise.resolve({}) as any);
    }
  });

  test("calculates unique alpha and evaluates promotion eligibility", async () => {
    const predictions = [
      { correct: true }, { correct: false }, { correct: true }, { correct: true }
    ];
    const baselineOutcomes = [
      { correct: true }, { correct: true }, { correct: false }, { correct: false }
    ];

    const result = await AlphaAttributionEngine.evaluate("MAMBA", predictions, baselineOutcomes);

    expect(result.modelName).toBe("MAMBA");
    expect(result.totalSignals).toBe(4);
    expect(result.winningSignals).toBe(3);
    expect(result.losingSignals).toBe(1);
    expect(result.uniqueAlphaRate).toBeCloseTo(0.5);
    expect(result.profitFactorContribution).toBeCloseTo(0.25);
    expect(result.sharpeContribution).toBeCloseTo(0.15);
    expect(result.sortinoContribution).toBeCloseTo(0.125);
    expect(result.drawdownImpact).toBeCloseTo(-0.05);
    expect(result.correlationToEnsemble).toBe(0.5);
    expect(result.promotionEligible).toBe(true);

    expect(ResearchAlphaAttribution.create).toHaveBeenCalledWith(result);
  });

  test("evaluates ineligible model", async () => {
    const predictions = [{ correct: true }, { correct: false }];
    const baselineOutcomes = [{ correct: true }, { correct: false }];

    const result = await AlphaAttributionEngine.evaluate("MAMBA", predictions, baselineOutcomes);
    expect(result.uniqueAlphaRate).toBe(0);
    expect(result.promotionEligible).toBe(false);
  });
});
