import { describe, it, expect } from "@jest/globals";
import { PositionManager } from "../src/services/aqea/positionManager.js";

const decision = (dir: string): any => ({ decision: dir, confidence: 90, finalScore: 10, meta: {}, reasons: [] });
const state = (accountType: "SPOT" | "FUTURES", mode: "PAPER" | "LIVE" = "PAPER"): any => ({
  side: "BUY", entryPrice: 100, sl: 95, tp1: 110, tp2: 120, tp3: 130, tp1Hit: false, tp2Hit: false, tp3Hit: false, accountType, mode,
});
const tick = (userId: string, sym: string, st: any) => PositionManager.evaluate(userId, sym, st, decision("SHORT"), 103, 2);

describe("AI trend-flip counter is scoped per book", () => {
  it("SPOT ticks do not confirm a FUTURES flip exit on the same symbol", () => {
    const u = "flip-user-1";
    tick(u, "BTCUSDT", state("SPOT"));
    tick(u, "BTCUSDT", state("SPOT"));
    // third tick is FUTURES: with a shared counter this would hit 3 and close; scoped it is tick #1
    const r = tick(u, "BTCUSDT", state("FUTURES"));
    expect(r.reason).not.toBe("AI_TREND_FLIP_EXIT");
  });

  it("three consecutive ticks in the same book still confirm the flip", () => {
    const u = "flip-user-2";
    tick(u, "ETHUSDT", state("SPOT"));
    tick(u, "ETHUSDT", state("SPOT"));
    expect(tick(u, "ETHUSDT", state("SPOT")).reason).toBe("AI_TREND_FLIP_EXIT");
  });

  it("PAPER and LIVE do not share the counter", () => {
    const u = "flip-user-3";
    tick(u, "SOLUSDT", state("SPOT", "PAPER"));
    tick(u, "SOLUSDT", state("SPOT", "PAPER"));
    expect(tick(u, "SOLUSDT", state("SPOT", "LIVE")).reason).not.toBe("AI_TREND_FLIP_EXIT");
  });
});
