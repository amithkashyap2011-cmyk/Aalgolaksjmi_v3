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

const mockReportCreate = jest.fn().mockResolvedValue({}) as any;
jest.unstable_mockModule("../../src/models/ResearchRedundancyReport.js", () => ({
  ResearchRedundancyReport: { create: mockReportCreate }
}));

let RedundancyMonitor: any, ResearchRedundancyReport: any;
beforeAll(async () => {
  ({ RedundancyMonitor } = await import("../../src/services/aqea/research/redundancyMonitor.js"));
  ({ ResearchRedundancyReport } = await import("../../src/models/ResearchRedundancyReport.js") as any);
});

describe("Redundancy Monitor", () => {
  jest.setTimeout(30000);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("calculates redundancy correlations and persists report", async () => {
    const createSpy = jest.spyOn(ResearchRedundancyReport, "create").mockResolvedValue({} as any);
    const seriesA = [1, 2, 3];
    const seriesB = [1, 2, 3];

    const result = await RedundancyMonitor.check("MAMBA", "CNN", seriesA, seriesB);

    expect(result.modelA).toBe("MAMBA");
    expect(result.modelB).toBe("CNN");
    expect(result.pearson).toBeDefined();
    expect(result.spearman).toBeDefined();
    expect(typeof result.redundant).toBe("boolean");

    expect(createSpy).toHaveBeenCalledWith(result);
    createSpy.mockRestore();
  });
});
