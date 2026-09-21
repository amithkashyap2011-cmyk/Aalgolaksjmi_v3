import { describe, test, expect, beforeEach } from "@jest/globals";
import { StrategyEngine } from "../src/services/indianMarket/strategyEngine.js";
import { IndianRiskManager } from "../src/services/indianMarket/riskManager.js";
import { MarketEvaluationContext, StructuredTrade } from "../src/services/indianMarket/strategyTypes.js";

describe("Indian Market Safeguards & Profit Protection", () => {
  const userId = "test-user-safeguards";

  beforeEach(async () => {
    await IndianRiskManager.resetDailyRiskLock(userId);
  });

  // ─── 1. FALLING KNIFE PREVENTION IN RSI REVERSAL ─────────────────
  test("RSIReversalStrategy blocks Call buying during strong bear momentum (falling knife)", () => {
    const strat = StrategyEngine.getStrategy("RSI_REVERSAL")!;
    expect(strat).toBeDefined();

    // Oversold (RSI 22) but in a strong downtrend (ADX 35, spot < open)
    const fallingKnifeContext: MarketEvaluationContext = {
      underlying: "NIFTY",
      spotPrice: 24500,
      bars1m: [],
      bars5m: [],
      bars15m: [],
      regime: "TRENDING_BEAR",
      timestamp: new Date(),
      indicators: {
        rsi14: 22,
        adx14: 35,
        open: 24700,
      },
    };

    const evaluation = strat.evaluateMarket(fallingKnifeContext);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons[0]).toContain("Falling knife blocked");

    const signal = strat.generateSignal(fallingKnifeContext);
    expect(signal).toBeNull();
  });

  test("RSIReversalStrategy generates BEARISH Put buying signal when overbought (RSI > 70)", () => {
    const strat = StrategyEngine.getStrategy("RSI_REVERSAL")!;
    expect(strat).toBeDefined();

    const overboughtContext: MarketEvaluationContext = {
      underlying: "NIFTY",
      spotPrice: 24800,
      bars1m: [],
      bars5m: [],
      bars15m: [],
      regime: "RANGING",
      timestamp: new Date(),
      indicators: {
        rsi14: 75,
        adx14: 18,
        open: 24750,
      },
    };

    const evaluation = strat.evaluateMarket(overboughtContext);
    expect(evaluation.eligible).toBe(true);

    const signal = strat.generateSignal(overboughtContext);
    expect(signal).not.toBeNull();
    expect(signal?.direction).toBe("BEARISH");

    const trade = strat.constructTrade(signal!, overboughtContext, 500000, 1.0);
    expect(trade.instrument).toBe("PE");
    expect(trade.position).toBe("LONG");
  });

  // ─── 2. STRIKE LOSS COOLDOWN ─────────────────────────────────────
  test("IndianRiskManager places losing strikes into a 45m cooldown", async () => {
    const tradeStrike24600: StructuredTrade = {
      tradeId: "TRADE_24600_1",
      strategy: "RSI_REVERSAL",
      underlying: "NIFTY",
      instrument: "CE",
      position: "LONG",
      strike: 24600,
      entryPrice: 120,
      stopLoss: 90,
      target: 180,
      quantity: 150,
      lotSize: 75,
      legs: [],
      risk: {
        maxLoss: 4500,
        riskRewardRatio: 2.0,
        riskAmount: 4500,
      },
      timeInForce: "DAY",
      productType: "MIS",
      accountType: "INDIAN_NSE",
    };

    // First trade on 24600 passes risk check
    const check1 = await IndianRiskManager.validateTrade(tradeStrike24600, 500000, 50000, userId, true);
    expect(check1.approved).toBe(true);

    // Record a loss on 24600 CE
    await IndianRiskManager.recordTradeOutcome(userId, -4500, -4500, {
      underlying: "NIFTY",
      strike: 24600,
      instrument: "CE",
      symbol: "NIFTY26SEP24600CE",
    });

    // An immediate re-attempt on 24600 CE must be blocked by STRIKE_LOSS_COOLDOWN_ACTIVE
    const tradeStrike24600Attempt2: StructuredTrade = {
      ...tradeStrike24600,
      tradeId: "TRADE_24600_2",
    };
    const check2 = await IndianRiskManager.validateTrade(tradeStrike24600Attempt2, 500000, 50000, userId, true);
    expect(check2.approved).toBe(false);
    expect(check2.rejectionReason).toBe("STRIKE_LOSS_COOLDOWN_ACTIVE");
    expect(check2.checks["STRIKE_LOSS_COOLDOWN"].passed).toBe(false);

    // But a different strike (24400 CE) with a distinct strategy is not blocked
    const tradeStrike24400: StructuredTrade = {
      ...tradeStrike24600,
      tradeId: "TRADE_24400_1",
      strategy: "MOMENTUM_BREAKOUT",
      strike: 24400,
    };
    const check3 = await IndianRiskManager.validateTrade(tradeStrike24400, 500000, 50000, userId, true);
    expect(check3.approved).toBe(true);
  });

  // ─── 3. CONSECUTIVE LOSS PROFIT-PROTECTION PAUSE ─────────────────
  test("IndianRiskManager activates a 30m pause on 3 consecutive losses even if dailyPnL > 0", async () => {
    // Simulate user had a profitable morning (+₹25,000)
    await IndianRiskManager.recordTradeOutcome(userId, 25000, 25000);

    // Now 3 consecutive losses occur
    await IndianRiskManager.recordTradeOutcome(userId, -5000, -5000);
    await IndianRiskManager.recordTradeOutcome(userId, -4000, -4000);
    await IndianRiskManager.recordTradeOutcome(userId, -4500, -4500);

    // Total dailyPnL is still net positive (+₹11,500), but consecutive losses reached 3
    const testTrade: StructuredTrade = {
      tradeId: "TRADE_AFTER_3_LOSSES",
      strategy: "MOMENTUM_BREAKOUT",
      underlying: "BANKNIFTY",
      instrument: "CE",
      position: "LONG",
      strike: 52000,
      entryPrice: 200,
      stopLoss: 160,
      target: 280,
      quantity: 15,
      lotSize: 15,
      legs: [],
      risk: {
        maxLoss: 600,
        riskRewardRatio: 2.0,
        riskAmount: 600,
      },
      timeInForce: "DAY",
      productType: "MIS",
      accountType: "INDIAN_NSE",
    };

    const result = await IndianRiskManager.validateTrade(testTrade, 500000, 50000, userId, true);
    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toBe("CONSECUTIVE_LOSS_PAUSE_ACTIVE");
    expect(result.checks["CONSECUTIVE_LOSS_PAUSE"].passed).toBe(false);
  });
});
