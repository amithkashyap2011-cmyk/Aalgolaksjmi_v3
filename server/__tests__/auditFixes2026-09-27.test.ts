import { jest } from "@jest/globals";
import { isLoopbackRequest } from "../src/middleware/auth.js";
import { UnifiedSizingEngine } from "../src/services/aqea/unifiedSizingEngine.js";
import { ExitEngine } from "../src/services/aqea/exitEngine.js";
import { VotingRegistry } from "../src/services/aqea/votingRegistry.js";

// Fixes from the 2026-09-27 audit.
describe("S1: local-only service registration", () => {
  const req = (remoteAddress: string, xff?: string) => ({ socket: { remoteAddress }, headers: xff ? { "x-forwarded-for": xff } : {} });
  test("accepts this machine, directly or via the local proxy", () => {
    expect(isLoopbackRequest(req("127.0.0.1"))).toBe(true);
    expect(isLoopbackRequest(req("::ffff:127.0.0.1"))).toBe(true);
    expect(isLoopbackRequest(req("127.0.0.1", "127.0.0.1"))).toBe(true);
  });
  test("rejects LAN peers and LAN clients forwarded through the proxy", () => {
    expect(isLoopbackRequest(req("192.168.1.23"))).toBe(false);
    expect(isLoopbackRequest(req("127.0.0.1", "192.168.1.23"))).toBe(false);
  });
});

describe("M1: sizing uses the real stop and the real price", () => {
  // No DB in this test → rolling Kelly = MAX_RISK_PER_TRADE (2%) → half-Kelly
  // risk = 1% of balance = $10. Regime SIDEWAYS ×0.8, NORMAL ×1, heat 0 ×1.
  const base = {
    balance: 1000, price: 0.25,
    regime: { regime: "SIDEWAYS_ACCUMULATION" } as any, quality: { rating: "NORMAL" } as any,
    portfolioHeat: 0, userId: "audit-test-user", mode: "PAPER" as const, accountType: "SPOT" as const,
  };

  test("a 2% placed stop sizes to risk / 2%", async () => {
    const s = await UnifiedSizingEngine.compute({ ...base, atr: 0.0005, slDistancePct: 0.02 });
    expect(s.effectiveRiskPct).toBeCloseTo(0.01, 10);
    expect(s.positionSize).toBeCloseTo((10 / 0.02) * 0.8, 2); // $400 (old 1.5×ATR path: capped $480)
  });

  test("a $0.25 coin uses its real price: 2% ATR → 3% stop and a volatility-scaled cap", async () => {
    // ATR $0.005 = 2% of price → stop 1.5×2% = 3% → $10 / 0.03 = $333 (under the 60%×0.75 = $450 cap) → ×0.8
    // Old Math.max(price, 1): stop 0.75%, ATR ratio 0.5% → $1,333 capped at $600 → ×0.8 = $480.
    const s = await UnifiedSizingEngine.compute({ ...base, atr: 0.005 });
    expect(s.positionSize).toBeCloseTo((10 / 0.03) * 0.8, 1);
  });
});

describe("M1b: exit ratios on sub-$1 coins", () => {
  test("breakeven elevation fires on a +0.6% move for a $0.25 coin", () => {
    const sig = ExitEngine.evaluateExit(0.2515, {
      side: "BUY", entryPrice: 0.25, tp1: 0.259, tp2: 0.262, tp3: 0.265, sl: 0.245,
      tp1Hit: false, tp2Hit: false, tp3Hit: false, accountType: "SPOT",
    });
    expect(sig.reason).toBe("BREAKEVEN_ELEVATION");
  });
});

describe("M2: collapsed LSTM does not vote", () => {
  test("LSTM is SHADOW and not among authorized voters", () => {
    expect(VotingRegistry.getAuthorizedVoters()).not.toContain("LSTM");
    expect(VotingRegistry.getGovernance("LSTM" as any).affectsTrading).toBe(false);
  });
});

// Fabricated fallbacks: when the Python service errored, the Transformer and
// LSTM predictors invented an RSI/MACD momentum LONG/SHORT at 0.68–0.94
// "confidence" and reported it as the model's own vote.
describe("no fabricated model votes when the quant service fails", () => {
  const features: any = {
    symbol: "BTCUSDT",
    market: { open: 100, high: 101, low: 99, close: 100.5, volume: 1000, rsi: 72, macdHistogram: 0.5, adx: 35, ema20: 99, atr: 1 },
    regime: { state: "TRENDING_BULL" }, orderFlow: {},
  };
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = jest.spyOn(globalThis as any, "fetch").mockRejectedValue(new Error("ECONNREFUSED")); });
  afterEach(() => fetchSpy.mockRestore());

  test.each([
    ["TransformerPredictor", "../src/services/aqea/ai/TransformerPredictor.js"],
    ["LSTMPredictor", "../src/services/aqea/ai/LSTMPredictor.js"],
  ])("%s returns a neutral HOLD at confidence 0", async (name, path) => {
    const mod: any = await import(path);
    const p = new mod[name]();
    const r = await p.runInference(features);
    expect(r.direction).toBe("HOLD");
    expect(r.confidence).toBe(0);
    expect(r.meta?.fallback).toBe(true);
  });
});
