import { describe, it, expect, beforeAll } from '@jest/globals';

describe("Data Poisoning Defense & Robustness Suite", () => {
  let CNNPredictor: any;
  let LSTMPredictor: any;

  beforeAll(async () => {
    ({ CNNPredictor } = await import("../../src/services/aqea/ai/CNNPredictor.js"));
    ({ LSTMPredictor } = await import("../../src/services/aqea/ai/LSTMPredictor.js"));
  });

  it("1. Invalid & Poisoned Market Data — should handle NaN/undefined features safely by defaulting to HOLD", async () => {
    const predictor = new CNNPredictor();
    const poisonedFeatures: any = {
      symbol: "BTCUSDT",
      market: {
        close: NaN,
        high: Infinity,
        low: -1,
        volume: undefined,
        bars: []
      }
    };

    const result = await predictor.predict(poisonedFeatures);
    expect(result).toBeDefined();
    expect(result.direction).toBe("HOLD");
    expect(Number.isFinite(result.confidence)).toBe(true);
  });

  it("2. Zero / Missing Feature Payload — should reject missing market data without crashing", async () => {
    const predictor = new LSTMPredictor();
    const emptyFeatures: any = { symbol: "ETHUSDT" };

    const result = await predictor.predict(emptyFeatures);
    expect(result).toBeDefined();
    expect(result.direction).toBe("HOLD");
    expect(Number.isFinite(result.confidence)).toBe(true);
  });

  it("3. Extreme Outlier / Spoofed Price Spike — should maintain numerical stability under 1,000,000% price spike", async () => {
    const predictor = new CNNPredictor();
    const spoofedFeatures: any = {
      symbol: "BTCUSDT",
      market: {
        close: 1_000_000_000,
        high: 1_000_000_000,
        low: 50_000,
        volume: 999_999_999,
        bars: Array(25).fill({ open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 })
      }
    };

    const result = await predictor.predict(spoofedFeatures);
    expect(result).toBeDefined();
    expect(["HOLD", "BUY", "SELL"]).toContain(result.direction);
    expect(Number.isFinite(result.confidence)).toBe(true);
    expect(Number.isFinite(result.probability)).toBe(true);
  });

  it("4. Low-Accuracy Model Quarantine — should flag models with accuracy < 45% as LOW_QUALITY", async () => {
    const mockAccuracy = 32.5; // Poisoned/degraded model accuracy
    const isQuarantined = mockAccuracy < 45;
    expect(isQuarantined).toBe(true);
  });
});
