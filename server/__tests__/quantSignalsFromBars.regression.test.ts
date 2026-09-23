/*
 * Regression (2026-09-23): the backtester and quantum StrategyAgent now run the
 * LIVE quant specialists (QuantStrategyRegistry) over candles instead of a
 * separate reimplementation that shared only names; Ohmkara's Bollinger
 * distance is relative (sub-$1 coins were stuck at ~0).
 */
import { quantSignalsFromBars, STRATEGY_IDS } from "../src/services/aqea/quant/quantSignalsFromBars.js";

const series = (n: number, start: number, step: number, wiggle = 0.002) =>
  Array.from({ length: n }, (_, i) => {
    const c = start * (1 + step * i + wiggle * Math.sin(i));
    return { open: c * 0.999, high: c * 1.003, low: c * 0.997, close: c, volume: 1000 + (i % 7) * 50 };
  });

test("returns every live specialist and a consensus", () => {
  const r = quantSignalsFromBars(series(200, 100, 0.002));
  const ids = r.signals.map((s) => s.strategyId);
  for (const id of Object.values(STRATEGY_IDS)) expect(ids).toContain(id);
  expect(["LONG", "SHORT", "HOLD"]).toContain(r.consensus.direction);
});

test("candles carry no order flow, so ORDER_FLOW holds", () => {
  const r = quantSignalsFromBars(series(200, 100, 0.002));
  expect(r.signals.find((s) => s.strategyId === "ORDER_FLOW_CVD")!.direction).toBe("HOLD");
});

test("Ohmkara measures relative distance for sub-$1 coins", () => {
  // Same shape at $100 and at $0.00001: the relative distance must match.
  const big = quantSignalsFromBars(series(200, 100, -0.003));
  const tiny = quantSignalsFromBars(series(200, 0.00001, -0.003));
  const dist = (r: any) => r.signals.find((s: any) => s.strategyId === "OHMKARA_528HZ").meta.midDist;
  expect(dist(tiny)).toBeGreaterThan(0);
  expect(dist(tiny)).toBeCloseTo(dist(big), 3);
});
