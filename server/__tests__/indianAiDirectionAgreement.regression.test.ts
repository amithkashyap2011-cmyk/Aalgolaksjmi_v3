import { describe, it, expect, afterEach, jest } from "@jest/globals";
import { StrategyEngine } from "../src/services/indianMarket/strategyEngine.js";

const ctx: any = { underlying: "KOTAKBANK", spotPrice: 400, bars1m: [], bars5m: [], bars15m: [], regime: "TRENDING_BULL", timestamp: new Date() };

function fakeSignal(direction: "BULLISH" | "BEARISH" | "NEUTRAL", tradeScore: number) {
  const constructTrade = jest.fn(() => ({ marker: `${direction}-trade` }));
  return { strategy: { id: `S_${direction}`, constructTrade } as any, signal: { direction, tradeScore } as any, constructTrade };
}

describe("Indian auto-trader honours the AI scan's direction", () => {
  afterEach(() => jest.restoreAllMocks());

  it("blocks a BULLISH rule strategy when the AI says SHORT (the KOTAKBANK/AXISBANK bull-call-spread losses)", () => {
    const bull = fakeSignal("BULLISH", 90);
    jest.spyOn(StrategyEngine, "evaluateAll").mockReturnValue([bull] as any);
    expect(StrategyEngine.evaluateAndConstructBestTrade(ctx, 100000, 1, "SHORT")).toBeNull();
    expect(bull.constructTrade).not.toHaveBeenCalled();
  });

  it("blocks a BEARISH rule strategy when the AI says LONG", () => {
    jest.spyOn(StrategyEngine, "evaluateAll").mockReturnValue([fakeSignal("BEARISH", 90)] as any);
    expect(StrategyEngine.evaluateAndConstructBestTrade(ctx, 100000, 1, "LONG")).toBeNull();
  });

  it("falls through to the next-best strategy that agrees, skipping a higher-scored contradicting one", () => {
    const bear = fakeSignal("BEARISH", 95);
    const bull = fakeSignal("BULLISH", 80);
    jest.spyOn(StrategyEngine, "evaluateAll").mockReturnValue([bear, bull] as any);
    const r = StrategyEngine.evaluateAndConstructBestTrade(ctx, 100000, 1, "LONG");
    expect(r?.strategy.id).toBe("S_BULLISH");
  });

  it("allows direction-neutral strategies whatever the AI says", () => {
    jest.spyOn(StrategyEngine, "evaluateAll").mockReturnValue([fakeSignal("NEUTRAL", 85)] as any);
    expect(StrategyEngine.evaluateAndConstructBestTrade(ctx, 100000, 1, "SHORT")?.strategy.id).toBe("S_NEUTRAL");
  });

  it("is unchanged when no AI direction is supplied (manual / override-symbol path)", () => {
    jest.spyOn(StrategyEngine, "evaluateAll").mockReturnValue([fakeSignal("BULLISH", 90)] as any);
    expect(StrategyEngine.evaluateAndConstructBestTrade(ctx, 100000, 1)?.strategy.id).toBe("S_BULLISH");
  });
});
