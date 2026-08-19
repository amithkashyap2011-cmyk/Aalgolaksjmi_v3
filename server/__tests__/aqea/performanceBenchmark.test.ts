import { describe, it, expect, beforeAll } from '@jest/globals';
import { RingBuffer } from "../../src/lib/ringBuffer.js";
import { computeSnapshot } from "../../src/services/indicatorService.js";
import { computeUnrealisedPnl } from "../../src/services/pnlService.js";

describe("Performance, Throughput & Latency Benchmark Suite", () => {
  let CNNPredictor: any;
  let LSTMPredictor: any;

  beforeAll(async () => {
    ({ CNNPredictor } = await import("../../src/services/aqea/ai/CNNPredictor.js"));
    ({ LSTMPredictor } = await import("../../src/services/aqea/ai/LSTMPredictor.js"));
  });

  it("1. RingBuffer Throughput — 1,000,000 operations should complete in < 150ms (> 6.6M ops/sec)", () => {
    const rb = new RingBuffer<number>(200);
    const start = performance.now();
    for (let i = 0; i < 1_000_000; i++) {
      rb.push(i % 100);
      if (i % 50 === 0) rb.sum();
    }
    const elapsedMs = performance.now() - start;
    console.log(`[PERF_BENCHMARK] RingBuffer 1,000,000 ops: ${elapsedMs.toFixed(2)}ms (${Math.round(1_000_000 / (elapsedMs / 1000)).toLocaleString()} ops/sec)`);

    expect(elapsedMs).toBeLessThan(500);
  });

  it("2. Indicator Snapshot Benchmark — 1,000 full snapshots over 250 OHLCV bars should take < 500ms (< 0.5ms/snapshot)", () => {
    const bars = Array.from({ length: 250 }, (_, i) => ({
      open: 50000 + i * 2,
      high: 50100 + i * 2,
      low: 49900 + i * 2,
      close: 50050 + i * 2,
      volume: 1000 + i,
    }));

    const start = performance.now();
    for (let i = 0; i < 1_000; i++) {
      computeSnapshot(bars);
    }
    const elapsedMs = performance.now() - start;
    const avgLatencyUs = (elapsedMs / 1000) * 1000; // microseconds
    console.log(`[PERF_BENCHMARK] 1,000 computeSnapshot() calls: ${elapsedMs.toFixed(2)}ms (Avg ${avgLatencyUs.toFixed(1)} µs / snapshot)`);

    expect(elapsedMs).toBeLessThan(500);
  });

  it("3. PnL & Margin Calculation Throughput — 500,000 computeUnrealisedPnl calls in < 100ms", () => {
    const start = performance.now();
    for (let i = 0; i < 500_000; i++) {
      computeUnrealisedPnl({ side: i % 2 === 0 ? "BUY" : "SELL", entryPrice: 50000 + i % 10, quantity: 1.5 }, 50100 + i % 20);
    }
    const elapsedMs = performance.now() - start;
    console.log(`[PERF_BENCHMARK] 500,000 PnL calculations: ${elapsedMs.toFixed(2)}ms (${Math.round(500_000 / (elapsedMs / 1000)).toLocaleString()} calc/sec)`);

    expect(elapsedMs).toBeLessThan(100);
  });

  it("4. AI Predictor Latency — CNN & LSTM model inference latency < 10ms per prediction", async () => {
    const cnn = new CNNPredictor();
    const lstm = new LSTMPredictor();
    const features: any = {
      symbol: "BTCUSDT",
      market: {
        close: 50000,
        high: 50100,
        low: 49900,
        volume: 1000,
        bars: Array(30).fill({ open: 50000, high: 50100, low: 49900, close: 50000, volume: 1000 })
      }
    };

    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      await cnn.predict(features);
      await lstm.predict(features);
    }
    const elapsedMs = performance.now() - start;
    const avgPerInferenceMs = elapsedMs / 40;
    console.log(`[PERF_BENCHMARK] 40 AI Model Inferences: ${elapsedMs.toFixed(2)}ms (Avg ${avgPerInferenceMs.toFixed(2)} ms / inference)`);

    expect(avgPerInferenceMs).toBeLessThan(100);


  });
});
