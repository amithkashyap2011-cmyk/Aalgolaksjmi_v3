/*
 * ─── evaluateLongEntry / evaluateShortEntry — unit tests ────
 *
 * These are pure functions extracted from handleLong/handleShort in
 * autoTradeEngine.ts (previously measured at 9.79% coverage, mocking
 * ~15 modules deep to reach this logic at all). No mocking needed here —
 * every input is plain data.
 */
import { evaluateLongEntry, evaluateShortEntry, type EntryEvaluationInput } from "../src/services/autoTradeEngine.decisionLogic";
import { UnifiedSizingEngine } from "../src/services/aqea/unifiedSizingEngine";

describe("UnifiedSizingEngine loss-streak protection", () => {
  test("never turns a non-positive Kelly edge into a minimum-risk trade", () => {
    expect(UnifiedSizingEngine.effectiveRiskFromKelly(0)).toBe(0);
    expect(UnifiedSizingEngine.effectiveRiskFromKelly(-0.1)).toBe(0);
    expect(UnifiedSizingEngine.effectiveRiskFromKelly(0.02)).toBeGreaterThan(0);
  });
});

function baseInput(overrides: Partial<EntryEvaluationInput> = {}): EntryEvaluationInput {
  return {
    existing: undefined,
    aqeaDecision: {
      riskApproved: true,
      positionSize: 100,
      leverage: 5,
      confidence: 80,
      meta: { indicators: { close: 50000 } },
      decisionPath: { cnnVote: "LONG", ppoVote: "LONG", transformerVote: "LONG", mambaVote: "LONG", regime: "TRENDING_BULL", coreScore: 80, finalScore: 80 },
    } as any,
    riskProfile: { positionSize: undefined, leverage: undefined, sl: 49000, tp1: 51000 },
    symbol: "BTCUSDT",
    ...overrides,
  };
}

describe.each([
  ["evaluateLongEntry", evaluateLongEntry],
  ["evaluateShortEntry", evaluateShortEntry],
])("%s", (_name, evaluate) => {
  test("blocks when a position already exists for the symbol", () => {
    const result = evaluate(baseInput({ existing: { symbol: "BTCUSDT" } }));
    expect(result.ok).toBe(false);
    if (!result.ok && !result.silent) {
      expect(result.reason).toContain("Existing active position");
    } else {
      throw new Error("expected a non-silent rejection");
    }
  });

  test("blocks when AQEA's own risk approval is false", () => {
    const result = evaluate(baseInput({ aqeaDecision: { ...baseInput().aqeaDecision, riskApproved: false } }));
    expect(result.ok).toBe(false);
    if (!result.ok && !result.silent) expect(result.reason).toContain("Risk parameters check failed");
  });

  test.each([
    [-100, 5], [Infinity, 5], [100, -5], [100, Infinity],
  ])("blocks on invalid size/leverage combination (%p, %p)", (positionSize, leverage) => {
    const result = evaluate(baseInput({ riskProfile: { positionSize, leverage, sl: 1, tp1: 2 } }));
    expect(result.ok).toBe(false);
    if (!result.ok && !result.silent) expect(result.reason).toContain("Invalid size or leverage");
  });

  test("riskProfile.positionSize=0 or NaN is an explicit rejection, never a fallback allocation", () => {
    const zeroResult = evaluate(baseInput({ riskProfile: { positionSize: 0, leverage: 5, sl: 1, tp1: 2 } }));
    expect(zeroResult.ok).toBe(false);
    if (!zeroResult.ok && !zeroResult.silent) expect(zeroResult.reason).toContain("Invalid size or leverage");

    const nanResult = evaluate(baseInput({ riskProfile: { positionSize: NaN, leverage: 5, sl: 1, tp1: 2 } }));
    expect(nanResult.ok).toBe(false);
    if (!nanResult.ok && !nanResult.silent) expect(nanResult.reason).toContain("Invalid size or leverage");
  });

  test.each([0, -100, NaN, Infinity])("blocks when currentPrice (%p) cannot be resolved", (close) => {
    const input = baseInput();
    input.aqeaDecision = { ...input.aqeaDecision, meta: { indicators: { close } } };
    const result = evaluate(input);
    expect(result.ok).toBe(false);
    if (!result.ok && !result.silent) expect(result.reason).toContain("Entry price could not be resolved");
  });

  test("silently rejects (no alert reason) when computed quantity underflows to exactly 0 — matches the original's bare `return;`", () => {
    // Both allocUsdt and currentPrice individually pass their own
    // finite/positive checks, but their quotient underflows below
    // float64's smallest representable positive value and becomes exactly
    // 0 — verified directly: Number.MIN_VALUE / Number.MAX_VALUE === 0.
    const input = baseInput({ riskProfile: { positionSize: Number.MIN_VALUE, leverage: 1, sl: 1, tp1: 2 } });
    input.aqeaDecision = { ...input.aqeaDecision, meta: { indicators: { close: Number.MAX_VALUE } } };
    const result = evaluate(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.silent).toBe(true);
  });

  test("throws FATAL_EXPLAINABILITY_ERROR when decisionPath is missing entirely", () => {
    const input = baseInput();
    input.aqeaDecision = { ...input.aqeaDecision, decisionPath: undefined };
    expect(() => evaluate(input)).toThrow(/FATAL_EXPLAINABILITY_ERROR/);
  });

  test("approves and computes the correct quantity/leverage/decisionPath when every check passes", () => {
    const result = evaluate(baseInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.allocUsdt).toBe(100);
      expect(result.leverage).toBe(5);
      expect(result.currentPrice).toBe(50000);
      expect(result.quantity).toBeCloseTo(100 / 50000, 10);
      expect(result.authorizedVotes).toEqual({ CNN: "LONG", PPO: "LONG", TRANSFORMER: "LONG" });
      expect(result.shadowVotes).toEqual({ MAMBA: "LONG" });
    }
  });

  test("riskProfile's positionSize/leverage take precedence over aqeaDecision's when both are set", () => {
    const input = baseInput({ riskProfile: { positionSize: 250, leverage: 8, sl: 1, tp1: 2 } });
    const result = evaluate(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.allocUsdt).toBe(250);
      expect(result.leverage).toBe(8);
    }
  });

  test("falls back to aqeaDecision's leverage, then to 10, when riskProfile provides neither", () => {
    const input = baseInput({ riskProfile: { positionSize: 50, leverage: undefined, sl: 1, tp1: 2 } });
    input.aqeaDecision = { ...input.aqeaDecision, leverage: undefined };
    const result = evaluate(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.leverage).toBe(10);
  });

  test("blocks when AI confidence is below 68% by default", () => {
    const input = baseInput({ aqeaDecision: { ...baseInput().aqeaDecision, confidence: 60 } as any });
    const result = evaluate(input);
    expect(result.ok).toBe(false);
    if (!result.ok && !result.silent) {
      expect(result.reason).toContain("AI conviction below minimum threshold");
    }
  });

  test("permits aggressive AI confidence when minConvictionThreshold is explicitly configured lower (e.g. 40%)", () => {
    const input = baseInput({
      aqeaDecision: {
        ...baseInput().aqeaDecision,
        confidence: 59,
        decisionPath: { ...baseInput().aqeaDecision.decisionPath, regime: "RANGING" }
      } as any,
      minConvictionThreshold: 0.40,
    });
    const result = evaluate(input);
    expect(result.ok).toBe(true);
  });

  test("blocks counter-trend trades during opposing regime when confidence < 75%", () => {
    const isLong = evaluate === evaluateLongEntry;
    const opposingRegime = isLong ? "TRENDING_BEAR" : "TRENDING_BULL";
    const input = baseInput({
      aqeaDecision: {
        ...baseInput().aqeaDecision,
        confidence: 70, // >= 68% but < 75%
        decisionPath: { ...baseInput().aqeaDecision.decisionPath, regime: opposingRegime }
      } as any
    });
    const result = evaluate(input);
    expect(result.ok).toBe(false);
    if (!result.ok && !result.silent) {
      expect(result.reason).toContain("Counter-trend");
    }
  });
});
