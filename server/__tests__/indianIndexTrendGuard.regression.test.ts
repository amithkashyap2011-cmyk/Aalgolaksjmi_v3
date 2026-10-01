import { describe, it, expect, afterEach, jest } from "@jest/globals";
import { classifyIndexTrend, blockedDirections } from "../src/services/indianMarket/indexTrendGuard.js";
import { StrategyEngine } from "../src/services/indianMarket/strategyEngine.js";

const ctx: any = { underlying: "AXISBANK", spotPrice: 1200, bars1m: [], bars5m: [], bars15m: [], regime: "TRENDING_BULL", timestamp: new Date() };
const sig = (direction: string, tradeScore: number) => ({ strategy: { id: `S_${direction}`, constructTrade: jest.fn(() => ({})) } as any, signal: { direction, tradeScore } as any });

describe("Indian index trend guard", () => {
  afterEach(() => jest.restoreAllMocks());

  it("classifies the 2026-10-01 close (NIFTY -0.88, SENSEX -0.79, BANKNIFTY -0.33) as DOWN and blocks BULLISH", () => {
    const r = classifyIndexTrend([-0.88, -0.79, -0.33]);
    expect(r.bias).toBe("DOWN");
    expect(blockedDirections(r.bias)).toEqual(["BULLISH"]);
  });

  it("blocks BEARISH in a rising market and nothing in a flat one", () => {
    expect(blockedDirections(classifyIndexTrend([0.7, 0.6, 0.4]).bias)).toEqual(["BEARISH"]);
    expect(blockedDirections(classifyIndexTrend([0.1, -0.2, 0.05]).bias)).toEqual([]);
  });

  it("fails OPEN with fewer than two index readings (no view from missing/simulated data)", () => {
    expect(classifyIndexTrend([-2]).bias).toBe("UNKNOWN");
    expect(classifyIndexTrend([]).bias).toBe("UNKNOWN");
    expect(blockedDirections("UNKNOWN")).toEqual([]);
  });

  it("respects a custom threshold", () => {
    expect(classifyIndexTrend([-0.3, -0.3], 0.25).bias).toBe("DOWN");
    expect(classifyIndexTrend([-0.3, -0.3], 0.5).bias).toBe("FLAT");
  });

  it("engine drops a blocked direction but still trades the other one", () => {
    jest.spyOn(StrategyEngine, "evaluateAll").mockReturnValue([sig("BULLISH", 90), sig("BEARISH", 80)] as any);
    expect(StrategyEngine.evaluateAndConstructBestTrade(ctx, 1e5, 1, undefined, ["BULLISH"])?.strategy.id).toBe("S_BEARISH");
  });

  it("engine returns no trade when every qualifying strategy is blocked", () => {
    jest.spyOn(StrategyEngine, "evaluateAll").mockReturnValue([sig("BULLISH", 90)] as any);
    expect(StrategyEngine.evaluateAndConstructBestTrade(ctx, 1e5, 1, undefined, ["BULLISH"])).toBeNull();
  });
});
