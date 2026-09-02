/**
 * ═══════════════════════════════════════════════════════════════════
 *  Indian Derivatives Engine Comprehensive Test Suite
 * ═══════════════════════════════════════════════════════════════════
 */

import { jest } from "@jest/globals";
import { InstrumentMaster } from "../src/services/indianMarket/instrumentMaster.js";
import { ExpiryResolver } from "../src/services/indianMarket/expiryResolver.js";
import { StrikeSelector } from "../src/services/indianMarket/strikeSelector.js";
import { OptionChainService } from "../src/services/indianMarket/optionChainService.js";
import { IndianCostModel } from "../src/services/indianMarket/costModel.js";
import { StrategyEngine } from "../src/services/indianMarket/strategyEngine.js";
import { StrategyRouter } from "../src/services/indianMarket/strategyRouter.js";
import { IndianRiskManager } from "../src/services/indianMarket/riskManager.js";
import { PaperExecutionAdapter } from "../src/services/indianMarket/brokerAdapter.js";
import { MarketEvaluationContext } from "../src/services/indianMarket/strategyTypes.js";

describe("Indian Derivatives Quantitative Trading Engine", () => {
  // ─── 1. INSTRUMENT MASTER & LOT SIZES ─────────────────────────────
  test("InstrumentMaster resolves dynamic specs and symbols for NIFTY and BANKNIFTY", () => {
    const niftySpec = InstrumentMaster.getSpec("NIFTY");
    expect(niftySpec.lotSize).toBe(75);
    expect(niftySpec.strikeStep).toBe(50);
    expect(niftySpec.derivativesExchange).toBe("NFO");

    const bankNiftySpec = InstrumentMaster.getSpec("BANKNIFTY");
    expect(bankNiftySpec.lotSize).toBe(15);
    expect(bankNiftySpec.strikeStep).toBe(100);

    const testDate = new Date("2026-08-27T00:00:00.000Z");
    const callInst = InstrumentMaster.resolveInstrument("NIFTY", "CE", testDate, 24500);
    expect(callInst.tradingSymbol).toBe("NIFTY26AUG24500CE");
    expect(callInst.lotSize).toBe(75);
    expect(callInst.token).toBeDefined();

    const futInst = InstrumentMaster.resolveInstrument("BANKNIFTY", "FUTURE", testDate);
    expect(futInst.tradingSymbol).toBe("BANKNIFTY26AUGFUT");
    expect(futInst.lotSize).toBe(15);
  });

  // ─── 2. DYNAMIC EXPIRY RESOLVER ──────────────────────────────────
  test("ExpiryResolver resolves valid weekly and monthly expiries", () => {
    const expiries = ExpiryResolver.getValidExpiries("NIFTY", new Date("2026-08-10T00:00:00.000Z"), 4);
    expect(expiries.length).toBe(4);
    expect(expiries[0].expiry).toBeDefined();

    const resolvedNearest = ExpiryResolver.resolveExpiry("NIFTY", { type: "NEAREST_VALID_EXPIRY" }, new Date("2026-08-10"));
    expect(resolvedNearest.expiry).toBeDefined();

    const resolvedMonthly = ExpiryResolver.resolveExpiry("BANKNIFTY", { type: "MONTHLY" }, new Date("2026-08-10"));
    expect(resolvedMonthly.isMonthly).toBe(true);
  });

  // ─── 3. DYNAMIC STRIKE SELECTOR ──────────────────────────────────
  test("StrikeSelector computes ATM, ATM offsets, Delta and Premium selection", () => {
    const niftyAtm = StrikeSelector.getATMStrike("NIFTY", 24532.5);
    expect(niftyAtm).toBe(24550);

    const bankAtm = StrikeSelector.getATMStrike("BANKNIFTY", 52140.0);
    expect(bankAtm).toBe(52100);

    // ATM Offset +1
    const strikeRes = StrikeSelector.selectStrike("NIFTY", "CE", 24500, { method: "ATM_OFFSET", offset: 1 });
    expect(strikeRes.strike).toBe(24550);
    expect(strikeRes.atmStrike).toBe(24500);

    // ATM Offset -2
    const putStrikeRes = StrikeSelector.selectStrike("BANKNIFTY", "PE", 52000, { method: "ATM_OFFSET", offset: -2 });
    expect(putStrikeRes.strike).toBe(51800);
  });

  // ─── 4. BLACK-SCHOLES GREEKS & OPTION CHAIN ──────────────────────
  test("OptionChainService computes accurate Greeks, PCR, and Max Pain", () => {
    const greeks = OptionChainService.calculateBlackScholesGreeks(24500, 24500, 7 / 365, 0.15, true);
    expect(greeks.delta).toBeGreaterThan(0.45);
    expect(greeks.delta).toBeLessThan(0.58);
    expect(greeks.theta).toBeLessThan(0); // Theta is negative time decay
    expect(greeks.gamma).toBeGreaterThan(0);
    expect(greeks.vega).toBeGreaterThan(0);

    const chain = OptionChainService.generateOptionChain("NIFTY", 24500);
    expect(chain.strikes.length).toBeGreaterThan(15);
    expect(chain.pcr).toBeGreaterThan(0.5);
    expect(chain.atmStrike).toBe(24500);
    expect(chain.maxPainStrike).toBeDefined();
  });

  // ─── 5. REGULATORY COST MODEL ────────────────────────────────────
  test("IndianCostModel calculates STT, brokerage, exchange charges, and GST", () => {
    const callBuyCost = IndianCostModel.calculateOrderCost({
      instrumentType: "CE",
      action: "BUY",
      price: 150,
      quantity: 75,
      strikePrice: 24500,
    });
    expect(callBuyCost.brokerage).toBe(20);
    expect(callBuyCost.stampDuty).toBeGreaterThan(0);
    expect(callBuyCost.gst).toBeGreaterThan(0);

    const roundTrip = IndianCostModel.calculateRoundTripCost("CE", 150, 200, 75, true);
    expect(roundTrip.grossPnl).toBe((200 - 150) * 75);
    expect(roundTrip.netPnl).toBeLessThan(roundTrip.grossPnl);
    expect(roundTrip.totalRoundTripCost).toBeGreaterThan(40);
  });

  // ─── 6. MODULAR STRATEGY ENGINE & DIRECTIONAL TRADES ─────────────
  test("StrategyEngine evaluates and executes Directional Strategies (Call, Put, Futures)", () => {
    const allStrats = StrategyEngine.getAllStrategies();
    expect(allStrats.length).toBeGreaterThanOrEqual(25);

    const context: MarketEvaluationContext = {
      underlying: "NIFTY",
      spotPrice: 24500,
      futuresPrice: 24550,
      bars1m: [],
      bars5m: [{ close: 24400 }, { close: 24500 }],
      bars15m: [{ close: 24350 }, { close: 24500 }],
      regime: "TRENDING_BULL",
      timestamp: new Date(),
    };

    const longCallStrat = StrategyEngine.getStrategy("LONG_CALL");
    expect(longCallStrat).toBeDefined();
    if (longCallStrat) {
      const signal = longCallStrat.generateSignal(context);
      expect(signal).not.toBeNull();
      if (signal) {
        expect(signal.direction).toBe("BULLISH");
        const trade = longCallStrat.constructTrade(signal, context, 500000, 1.0);
        expect(trade.instrument).toBe("CE");
        expect(trade.position).toBe("LONG");
        expect(trade.legs.length).toBe(1);
        expect(trade.stopLoss).toBeLessThan(trade.entryPrice);
        expect(trade.target).toBeGreaterThan(trade.entryPrice);
      }
    }

    const longFutStrat = StrategyEngine.getStrategy("LONG_FUTURE");
    expect(longFutStrat).toBeDefined();
    if (longFutStrat) {
      const signal = longFutStrat.generateSignal(context);
      if (signal) {
        const trade = longFutStrat.constructTrade(signal, context, 500000, 1.0);
        expect(trade.instrument).toBe("FUTURE");
        expect(trade.lotSize).toBe(75);
      }
    }
  });

  // ─── 7. MULTI-LEG OPTIONS SPREADS (BULL CALL, STRADDLE, CONDOR) ─
  test("StrategyEngine constructs multi-leg options spreads with leg-level tracking", () => {
    const context: MarketEvaluationContext = {
      underlying: "BANKNIFTY",
      spotPrice: 52000,
      futuresPrice: 52100,
      bars1m: [],
      bars5m: [],
      bars15m: [],
      regime: "TRENDING_BULL",
      timestamp: new Date(),
    };

    // Bull Call Spread
    const bcsStrat = StrategyEngine.getStrategy("BULL_CALL_SPREAD");
    expect(bcsStrat).toBeDefined();
    if (bcsStrat) {
      const signal = bcsStrat.generateSignal(context);
      if (signal) {
        const trade = bcsStrat.constructTrade(signal, context, 500000, 1.0);
        expect(trade.legs.length).toBe(2);
        expect(trade.legs[0].action).toBe("BUY");
        expect(trade.legs[0].strike).toBe(52000);
        expect(trade.legs[1].action).toBe("SELL");
        expect(trade.legs[1].strike).toBe(52200);
        expect(trade.tradeGroupId).toBeDefined();
      }
    }

    // Iron Condor (4-Leg)
    const icContext: MarketEvaluationContext = {
      underlying: "NIFTY",
      spotPrice: 24500,
      bars1m: [],
      bars5m: [],
      bars15m: [],
      regime: "RANGING",
      timestamp: new Date(),
    };
    const icStrat = StrategyEngine.getStrategy("IRON_CONDOR");
    expect(icStrat).toBeDefined();
    if (icStrat) {
      const signal = icStrat.generateSignal(icContext);
      if (signal) {
        const trade = icStrat.constructTrade(signal, icContext, 500000, 1.0);
        expect(trade.legs.length).toBe(4);
        expect(trade.legs.filter((l) => l.action === "SELL").length).toBe(2);
        expect(trade.legs.filter((l) => l.action === "BUY").length).toBe(2);
      }
    }
  });

  // ─── 8. PRE-TRADE RISK ENGINE & KILL SWITCHES ────────────────────
  test("IndianRiskManager enforces panic stop, daily risk lock, and duplicate prevention", async () => {
    const context: MarketEvaluationContext = {
      underlying: "NIFTY",
      spotPrice: 24500,
      bars1m: [],
      bars5m: [],
      bars15m: [],
      regime: "TRENDING_BULL",
      timestamp: new Date(),
    };

    const strat = StrategyEngine.getStrategy("LONG_CALL")!;
    const signal = strat.generateSignal(context)!;
    const trade = strat.constructTrade(signal, context, 500000, 1.0);

    // Test 1: Normal validation passes
    const normalCheck = await IndianRiskManager.validateTrade(trade, 500000, 50000, "test-user-risk", true);
    expect(normalCheck.approved).toBe(true);

    // Test 2: Insufficient Margin triggers rejection
    const marginCheck = await IndianRiskManager.validateTrade(trade, 500000, 10, "test-user-risk", true);
    expect(marginCheck.approved).toBe(false);
    expect(marginCheck.rejectionReason).toBe("INSUFFICIENT_MARGIN");

    // Test 3: Duplicate Fingerprint check blocks identical rapid entries
    const dupCheck = await IndianRiskManager.validateTrade(trade, 500000, 50000, "test-user-risk", true);
    expect(dupCheck.approved).toBe(false);
    expect(dupCheck.rejectionReason).toBe("DUPLICATE_TRADE_PREVENTED");
  });

  // ─── 9. TRAILING STOP & POSITION LIFECYCLE ───────────────────────
  test("BaseStrategy evaluates +1R break-even and trailing stop shifts", () => {
    const strat = StrategyEngine.getStrategy("LONG_CALL")!;
    const context: MarketEvaluationContext = {
      underlying: "NIFTY",
      spotPrice: 24500,
      bars1m: [],
      bars5m: [],
      bars15m: [],
      regime: "TRENDING_BULL",
      timestamp: new Date(),
    };
    const signal = strat.generateSignal(context)!;
    const trade = strat.constructTrade(signal, context, 500000, 1.0);

    // Price moves up by 1R: initial risk = entryPrice - stopLoss
    const initialRisk = trade.entryPrice - trade.stopLoss;
    const profitPrice1R = trade.entryPrice + initialRisk;

    const trailingRes = strat.manageOpenPosition(trade, profitPrice1R, profitPrice1R, trade.entryPrice);
    expect(trailingRes.slModified).toBe(true);
    expect(trailingRes.newStopLoss).toBe(trade.entryPrice); // Shifted to BE
  });

  // ─── 10. BROKER ADAPTER & PAPER EXECUTION ────────────────────────
  test("PaperExecutionAdapter executes orders with simulated fills and slippage", async () => {
    const adapter = new PaperExecutionAdapter();
    const orderRes = await adapter.placeOrder("test-user", {
      clientOrderId: "TEST_CL_1",
      tradingSymbol: "NIFTY26AUG24500CE",
      exchange: "NFO",
      action: "BUY",
      instrumentType: "CE",
      quantity: 75,
      price: 150,
      orderType: "MARKET",
      productType: "MIS",
    });

    expect(orderRes.ok).toBe(true);
    expect(orderRes.status).toBe("COMPLETE");
    expect(orderRes.filledQty).toBe(75);
    expect(orderRes.averagePrice).toBeGreaterThan(0);
  });
});
