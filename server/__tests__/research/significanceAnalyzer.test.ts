import { jest } from '@jest/globals';

const mockCreate = jest.fn().mockImplementation(() => Promise.resolve({})) as any;

jest.unstable_mockModule("../../src/models/ResearchStatisticalReport.js", () => ({
  ResearchStatisticalReport: { create: mockCreate }
}));

let SignificanceAnalyzer: any, ResearchStatisticalReport: any;
beforeAll(async () => {
  ({ SignificanceAnalyzer } = await import("../../src/services/aqea/research/significanceAnalyzer.js"));
  ({ ResearchStatisticalReport } = await import("../../src/models/ResearchStatisticalReport.js") as any);
});

describe("Significance Analyzer", () => {
  jest.setTimeout(30000);

  beforeEach(() => {
    jest.clearAllMocks();
    if (ResearchStatisticalReport?.create) {
      jest.spyOn(ResearchStatisticalReport, "create").mockImplementation(() => Promise.resolve({}) as any);
    }
  });

  test("analyzes significance and persists report", async () => {
    const returns = [0.01, -0.005, 0.02, 0.015];

    const result = await SignificanceAnalyzer.analyze("MAMBA", returns);

    expect(result).toHaveProperty("pValue");
    expect(result).toHaveProperty("statisticallySignificant");
    expect(result.confidence95).toBe(0.95);
    expect(result.bootstrapMean).toBeCloseTo(0.01);
    expect(result.bootstrapStdDev).toBeGreaterThan(0);
    expect(result.walkForwardPF).toBe(1.5);
    expect(result.walkForwardSharpe).toBe(1.2);

    expect(ResearchStatisticalReport.create).toHaveBeenCalledWith(expect.objectContaining({
      modelName: "MAMBA",
      pValue: result.pValue
    }));
  });
});
