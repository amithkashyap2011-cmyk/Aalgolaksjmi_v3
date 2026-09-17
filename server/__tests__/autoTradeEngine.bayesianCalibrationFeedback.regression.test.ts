import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Regression: closed trades must feed AdaptiveBayesianGate's ───────
 * ─── empirical calibration ─────────────────────────────────────────────
 *
 * AdaptiveBayesianGate.recordOutcome() was never called anywhere in the
 * codebase. calibrationRecords stayed permanently empty no matter how
 * many trades closed, so evaluate() could never leave its strict
 * ANALYTICAL_PRIOR_FALLBACK thresholds (0.78-0.95) for the regime-specific
 * EMPIRICAL_BASE_RATE win rate it's designed to converge toward once 25+
 * outcomes exist for a regime. A gate named "Adaptive" that structurally
 * could never adapt — the actual reason live trading almost never cleared
 * its own confidence bar, independent of whether the underlying model
 * signal was any good.
 *
 * Fixed by: (1) persisting the Bayesian evaluation's priorOdds/posterior
 * onto the trade's decisionPath at entry (engine.ts), and (2) calling
 * AdaptiveBayesianGate.recordOutcome() with the trade's regime and
 * realized WIN/LOSS when handleExit() fully closes a position.
 */
import { jest } from "@jest/globals";

jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getKlines: (jest.fn() as any).mockResolvedValue([]),
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
  getTickerPrice: (jest.fn() as any).mockResolvedValue(50000),
  getTickerPriceSync: (jest.fn() as any).mockResolvedValue(50000),
}));

import mongoose from "mongoose";

let paper: any, Trade: any, handleExit: any, AdaptiveBayesianGate: any;

const testUserId = new mongoose.Types.ObjectId().toString();
const SYMBOL = "BTCUSDT";
const minimalFeatures = {} as any;

beforeAll(async () => {
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
  paper = await import("../src/services/paperState.js");
  ({ Trade } = await import("../src/models/Trade.js"));
  ({ handleExit } = await import("../src/services/autoTradeEngine.js"));
  ({ AdaptiveBayesianGate } = await import("../src/services/aqea/bayesian/AdaptiveBayesianGate.js"));
});

afterAll(async () => {
  if (Trade && mongoose.connection.readyState === 1) {
    try { await Trade.deleteMany({ userId: testUserId }); } catch { /* ignore */ }
  }
  await disconnectMongo();
});

async function openPositionWithDecisionPath(symbol: string, regime: string, entryPrice: number, quantity: number) {
  const trade = await Trade.create({
    userId: testUserId,
    mode: "PAPER",
    symbol,
    side: "BUY",
    quantity,
    entryPrice,
    accountType: "SPOT",
    status: "OPEN",
    decisionPath: { source: "test-fixture" },
    meta: {
      aqea: {
        decisionPath: { regime, bayesianPriorOdds: 0.5, bayesianPosterior: 0.6 },
      },
    },
  });
  paper.setPosition(testUserId, symbol, "PAPER", {
    userId: testUserId,
    symbol,
    side: "BUY",
    quantity,
    entryPrice,
    tradeId: trade._id.toString(),
    accountType: "SPOT",
    leverage: 1,
    meta: {},
  });
  return trade;
}

describe("handleExit — feeds AdaptiveBayesianGate's empirical calibration on close", () => {
  test("a single closed trade is recorded against its entry regime", async () => {
    if (skipIfNoMongo()) return;
    const regime = `TEST_REGIME_SINGLE_${Date.now()}`;

    const before = AdaptiveBayesianGate.evaluate(0.5, 0, minimalFeatures, regime, "LONG");
    expect(before.sampleCount).toBe(0);

    // Close at a higher price than entry -> a WIN.
    await openPositionWithDecisionPath(SYMBOL, regime, 100, 1);
    await handleExit(testUserId, SYMBOL, "PAPER", "SPOT", "MANUAL", 1.0, 110);

    const after = AdaptiveBayesianGate.evaluate(0.5, 0, minimalFeatures, regime, "LONG");
    expect(after.sampleCount).toBe(1);
  });

  test("25 winning closes in the same fresh regime flip calibration to EMPIRICAL_BASE_RATE", async () => {
    if (skipIfNoMongo()) return;
    const regime = `TEST_REGIME_BULK_${Date.now()}`;

    for (let i = 0; i < 25; i++) {
      await openPositionWithDecisionPath(SYMBOL, regime, 100, 1);
      await handleExit(testUserId, SYMBOL, "PAPER", "SPOT", "MANUAL", 1.0, 110); // WIN each time
    }

    const result = AdaptiveBayesianGate.evaluate(0.5, 0, minimalFeatures, regime, "LONG");
    expect(result.sampleCount).toBe(25);
    expect(result.calibrationMethod).toBe("EMPIRICAL_BASE_RATE");
    // All 25 recorded outcomes were wins -> empirical win rate 100%, clamped to the 0.70 ceiling.
    expect(result.priorOdds).toBeCloseTo(0.70, 4);
  });
});
