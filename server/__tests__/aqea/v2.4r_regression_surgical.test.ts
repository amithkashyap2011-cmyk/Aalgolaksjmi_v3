import { jest } from '@jest/globals';
import { SmartMoneyEngine } from "../../src/services/aqea/smartMoneyEngine.js";
import { RegimeEngine } from "../../src/services/aqea/regimeEngine.js";
import { PredictorRegistry } from "../../src/services/aqea/ai/PredictorRegistry.js";

describe("AQEA v2.4R Regression Tests (Surgical)", () => {
  
  test("Defect #1: SmartMoneyEngine processes bars correctly (not emptyResult)", () => {
    // raw OF result
    const ofResult: any = { votingScore: 50, pressure: "NEUTRAL" };
    // Actual bars
    const bars = Array(60).fill({ close: 50000, high: 50100, low: 49900, open: 50000, volume: 1000 });

    const result = SmartMoneyEngine.analyze(bars, ofResult);
    
    // If it were Defect #1, it would return emptyResult (score 50, no diagnostics)
    // Here we check if it actually analyzed something
    expect(result.score).toBeDefined();
    // Since bars are all identical, it might still be 50, but it shouldn't be the emptyResult() fallback
    expect(result.diagnostics).toBeDefined();
  });

  test("Defect #2: RegimeEngine receives valid 200MA from context", () => {
    const ctx: any = {
      adx: 30,
      atr: 1000,
      atrTrailing: 950,
      ema200: 48000, // This is what we fixed in the mapping
      close: 50000,
      volume: 1000,
      volumeAvg: 1000,
      btcDominance: 53,
      fundingRate: 0.0001
    };

    const result = RegimeEngine.analyze(ctx);
    
    // Price (50000) > EMA200 (48000) and ADX > 25 should be TRENDING_BULL
    expect(result.state).toBe("TRENDING_BULL");
    // Score should be > 70
    expect(result.score).toBeGreaterThan(70);
  });

  test("Defect #3: PPO returns structured metadata on failure", async () => {
    const ppo = PredictorRegistry.getPredictor("PPO");
    
    // Mock runInference to throw
    (ppo as any).runInference = (jest.fn() as any).mockRejectedValue(new Error("Connection Failed"));

    const result = await ppo.predict({} as any);
    expect(result.meta).toBeDefined();
    expect(result.meta.recommendedAction).toBe("UNAVAILABLE");
    expect(result.meta.reason).toBe("SERVICE_OFFLINE");
  });
});
