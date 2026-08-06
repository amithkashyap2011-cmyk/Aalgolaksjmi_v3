/**
 * ─── LNNPredictor Unit Tests ─────────────────────────────
 * Tests Liquid Neural Network continuous-time differential inference.
 */

import { LNNPredictor } from "../src/services/aqea/ai/LNNPredictor.js";

describe("LNNPredictor", () => {
  let predictor: LNNPredictor;

  beforeEach(() => {
    predictor = new LNNPredictor();
  });

  test("returns healthy state", async () => {
    const healthy = await predictor.isHealthy();
    expect(healthy).toBe(true);
  });

  test("predicts LONG for strong bullish technical indicators", async () => {
    const features: any = {
      symbol: "BTCUSDT",
      market: { close: 50000, rsi: 75, adx: 35, atr: 500, bars: [] }
    };

    const res = await (predictor as any).runInference(features);
    expect(res.direction).toBe("LONG");
    expect(res.confidence).toBeGreaterThanOrEqual(0.70);
  });

  test("predicts SHORT for strong bearish technical indicators", async () => {
    const features: any = {
      symbol: "BTCUSDT",
      market: { close: 50000, rsi: 25, adx: 35, atr: 500, bars: [] }
    };

    const res = await (predictor as any).runInference(features);
    expect(res.direction).toBe("SHORT");
    expect(res.confidence).toBeGreaterThanOrEqual(0.70);
  });

  test("returns HOLD for neutral market conditions", async () => {
    const features: any = {
      symbol: "BTCUSDT",
      market: { close: 50000, rsi: 50, adx: 15, atr: 500, bars: [] }
    };

    const res = await (predictor as any).runInference(features);
    expect(res.direction).toBe("HOLD");
  });
});
