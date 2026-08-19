import { ReplayEngine, CandleData } from "../../src/services/aqea/replayEngine";

describe("ReplayEngine — Historical Replay & Candle Backtest Evaluation", () => {
  test("evaluateCandles computes realistic backtest metrics from price series", () => {
    const candles: CandleData[] = [
      { open: 100, high: 102, low: 99, close: 100, volume: 1000, timestamp: 1 },
      { open: 100, high: 103, low: 100, close: 101, volume: 1000, timestamp: 2 },
      { open: 101, high: 104, low: 101, close: 103, volume: 1000, timestamp: 3 },
      { open: 103, high: 106, low: 102, close: 105, volume: 1000, timestamp: 4 },
      { open: 105, high: 108, low: 104, close: 107, volume: 1000, timestamp: 5 },
      { open: 107, high: 110, low: 106, close: 109, volume: 1000, timestamp: 6 },
      { open: 109, high: 112, low: 108, close: 111, volume: 1000, timestamp: 7 },
      { open: 111, high: 115, low: 110, close: 114, volume: 1000, timestamp: 8 },
    ];

    const metrics = ReplayEngine.evaluateCandles(candles);
    expect(metrics).toBeDefined();
    expect(metrics.tradeCount).toBeGreaterThan(0);
    expect(metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(metrics.winRate).toBeLessThanOrEqual(100);
    expect(metrics.profitFactor).toBeGreaterThan(0);
    expect(metrics.drawdown).toBeGreaterThanOrEqual(0);
  });

  test("run returns historical baseline metrics when candles are omitted", async () => {
    const v5Metrics = await ReplayEngine.run(30, "V5");
    expect(v5Metrics.winRate).toBe(61.4);
    expect(v5Metrics.profitFactor).toBe(1.45);
    expect(v5Metrics.sharpeRatio).toBe(2.12);

    const v4Metrics = await ReplayEngine.run(30, "V4");
    expect(v4Metrics.winRate).toBe(57.2);
  });
});
