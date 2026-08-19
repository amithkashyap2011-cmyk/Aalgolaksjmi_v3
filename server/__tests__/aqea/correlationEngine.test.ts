import { CorrelationEngine } from "../../src/services/aqea/correlationEngine";

describe("CorrelationEngine — Dynamic Pearson & Portfolio Linkage Tests", () => {
  test("calculatePearson returns 1.0 for perfectly co-moving series", () => {
    const seriesA = [100, 102, 104, 108, 110];
    const seriesB = [200, 204, 208, 216, 220]; // 2x returns of A
    const r = CorrelationEngine.calculatePearson(seriesA, seriesB);
    expect(r).toBeCloseTo(1.0, 2);
  });

  test("calculatePearson returns -1.0 for inversely moving series", () => {
    const seriesA = [100, 110, 105, 120, 115];
    const seriesB = [100, 90, 95, 80, 85];
    const r = CorrelationEngine.calculatePearson(seriesA, seriesB);
    expect(r).toBeCloseTo(-1.0, 2);
  });

  test("calculatePearson handles insufficient data gracefully", () => {
    expect(CorrelationEngine.calculatePearson([100], [100])).toBe(0);
    expect(CorrelationEngine.calculatePearson([], [])).toBe(0);
  });

  test("analyze returns DECOUPLED when no open symbols are passed", async () => {
    const res = await CorrelationEngine.analyze([]);
    expect(res.correlationHeat).toBe(0);
    expect(res.dominantCluster).toBe("DECOUPLED");
    expect(res.pairCorrelations).toEqual({});
  });

  test("analyze computes pairCorrelations and dominant cluster when price histories are supplied", async () => {
    const histories = {
      BTCUSDT: [50000, 51000, 52000, 51500, 53000],
      ETHUSDT: [3000, 3060, 3120, 3090, 3180],
      SOLUSDT: [100, 95, 105, 90, 110]
    };

    const res = await CorrelationEngine.analyze(["BTCUSDT", "ETHUSDT", "SOLUSDT"], histories);
    expect(res.pairCorrelations["BTC-ETH"]).toBeDefined();
    expect(res.pairCorrelations["BTC-ETH"]).toBeGreaterThan(0.8);
    expect(res.correlationHeat).toBeGreaterThan(0);
    expect(res.dominantCluster).toBeDefined();
  });
});
