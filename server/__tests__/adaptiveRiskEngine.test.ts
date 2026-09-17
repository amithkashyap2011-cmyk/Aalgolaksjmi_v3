/*
 * ─── AdaptiveRiskEngine — position-size hard-block regression ───
 *
 * Locks in the fix for the `Math.max(10, …)` floor that used to return a
 * $10 notional even when sizeScale had been driven to 0 by a HARD BLOCK
 * (quality REJECT, portfolio heat > 40, or a weather crisis). A hard-blocked
 * size must now stay 0; the $10 minimum applies only to genuinely-nonzero
 * sizes. weatherIntelligenceEngine.getRiskAdjustment is pinned to a neutral
 * 1.0x so the assertions don't depend on ambient weather state.
 */
import { jest } from '@jest/globals';

let AdaptiveRiskEngine: any, weatherIntelligenceEngine: any;

beforeAll(async () => {
  ({ AdaptiveRiskEngine } = await import("../src/services/adaptiveRiskEngine.js"));
  ({ weatherIntelligenceEngine } = await import("../src/services/weatherIntelligenceEngine.js"));
});

beforeEach(() => {
  jest.spyOn(weatherIntelligenceEngine, "getRiskAdjustment").mockReturnValue({
    leverageMultiplier: 1.0, sizeMultiplier: 1.0, riskLimitMultiplier: 1.0,
  } as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const regime: any = { regime: "NEUTRAL" };
const base = { entry: 100, atr: 1, balance: 100000 };

describe("AdaptiveRiskEngine — size-zero hard-block", () => {
  test("quality REJECT hard-blocks the size to 0 (not $10)", () => {
    const p = AdaptiveRiskEngine.calculate("BUY", { rating: "REJECT", score: 10 } as any, regime, 0, base);
    expect(p.positionSize).toBe(0);
  });

  test("portfolio heat > 40 hard-blocks the size to 0 (not $10)", () => {
    const p = AdaptiveRiskEngine.calculate("BUY", { rating: "GOOD", score: 80 } as any, regime, 45, base);
    expect(p.positionSize).toBe(0);
  });

  test("weather crisis (sizeMultiplier 0) hard-blocks the size to 0", () => {
    jest.spyOn(weatherIntelligenceEngine, "getRiskAdjustment").mockReturnValue({
      leverageMultiplier: 0.5, sizeMultiplier: 0, riskLimitMultiplier: 0.5,
    } as any);
    const p = AdaptiveRiskEngine.calculate("BUY", { rating: "GOOD", score: 80 } as any, regime, 0, base);
    expect(p.positionSize).toBe(0);
  });

  test("a genuinely-nonzero-but-tiny size is still floored to $10", () => {
    // balance 500 → 500 * 0.01 * 1 = 5 → floored up to 10.
    const p = AdaptiveRiskEngine.calculate("BUY", { rating: "GOOD", score: 80 } as any, regime, 0, { entry: 100, atr: 1, balance: 500 });
    expect(p.positionSize).toBe(10);
  });

  test("a normal size passes through unfloored", () => {
    // balance 100000 → 100000 * 0.01 * 1 = 1000.
    const p = AdaptiveRiskEngine.calculate("BUY", { rating: "GOOD", score: 80 } as any, regime, 0, base);
    expect(p.positionSize).toBe(1000);
  });
});
