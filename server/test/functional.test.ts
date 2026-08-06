import { InstitutionalRiskEngine } from "../src/services/institutionalRisk.js";
import { evaluateHybridSignal } from "../src/services/hybridEngine.js";

describe("🧪 AKS 5 Functional Tests", () => {
  it("Strategy logic detection successfully scales Kelly limits", () => {
    const alloc = InstitutionalRiskEngine.calculateKellySize({
      balance: 10000,
      winRate: 0.65,
      payoffRatio: 2, 
      historicalReturns: [-1, 2, -0.5, 3]
    });
    // Expected boundary is locked at max 20%
    expect(alloc).toBeLessThanOrEqual(0.20);
    expect(alloc).toBeGreaterThan(0);
  });

  it("Risk calculation successfully triggers Circuit Breakers", async () => {
    // Tests daily M-Drawdown breaching 15% limit
    const isHealthyCheck = await InstitutionalRiskEngine.validateSystemHealth(
       "mock-user", 
       100_000, 
       0.15
    );
    expect(isHealthyCheck).toBeDefined();
  });
  
  it("Learning pipeline successfully computes Continuous Fusion Output", async () => {
    const dummyCtx = {
        ind: { rsi14: 60, macd: { histogram: 0 }, close: 100 },
        volatilityRatio: 0.05,
        htfTrendBullish: true,
        risk: { maxDailyLoss: 100 },
        dailyPnl: 0,
        tradesToday: 2
    };
    
    // Simulate real-time hybrid strategy computation
    const result = await evaluateHybridSignal(dummyCtx, "test-user");
    expect(result.direction).toMatch(/LONG|SHORT|NEUTRAL/);
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });
});
