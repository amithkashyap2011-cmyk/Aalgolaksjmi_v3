import { VWAPReversionStrategy } from "../src/services/indianMarket/strategies/meanReversionStrategies.js";

const strat = new VWAPReversionStrategy();
const ctx = (spot: number, open: number, over: any = {}) => ({
  underlying: "NIFTY", spotPrice: spot, regime: "RANGING", indicators: { open, adx14: 18 }, ...over,
}) as any;

test("price at the open (no stretch) is NOT a bullish reversion — the 2026-09-30 phantom signal", () => {
  const r = strat.evaluateMarket(ctx(22850, 22850));
  expect(r.eligible).toBe(false);
  expect(r.direction).toBe("NEUTRAL");
  expect(strat.generateSignal(ctx(22850, 22850))).toBeNull();
});

test("a small dip (<0.8%) is still no trade", () => {
  expect(strat.generateSignal(ctx(22850 * 0.997, 22850))).toBeNull();
});

test("a real stretch below the open in a range is bullish", () => {
  const r = strat.evaluateMarket(ctx(22850 * 0.99, 22850));
  expect(r.eligible).toBe(true);
  expect(r.direction).toBe("BULLISH");
});

test("a real stretch above the open in a range is still bearish; trends stay blocked", () => {
  expect(strat.evaluateMarket(ctx(22850 * 1.01, 22850)).direction).toBe("BEARISH");
  expect(strat.evaluateMarket(ctx(22850, 22850, { regime: "TRENDING_BULL" })).eligible).toBe(false);
});
