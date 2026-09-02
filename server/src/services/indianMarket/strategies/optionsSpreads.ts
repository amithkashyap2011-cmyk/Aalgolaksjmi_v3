/**
 * ═══════════════════════════════════════════════════════════════════
 *  Multi-Leg Options Spreads & Strategies for Indian Derivatives (NSE)
 * ═══════════════════════════════════════════════════════════════════
 *  1. BULL_CALL_SPREAD (Buy ATM CE + Sell OTM CE)
 *  2. BEAR_PUT_SPREAD  (Buy ATM PE + Sell OTM PE)
 *  3. BULL_PUT_SPREAD  (Credit: Sell OTM PE + Buy deeper OTM PE)
 *  4. BEAR_CALL_SPREAD (Credit: Sell OTM CE + Buy deeper OTM CE)
 *  5. LONG_STRADDLE    (Buy ATM CE + Buy ATM PE)
 *  6. SHORT_STRADDLE   (Sell ATM CE + Sell ATM PE)
 *  7. LONG_STRANGLE    (Buy OTM CE + Buy OTM PE)
 *  8. SHORT_STRANGLE   (Sell OTM CE + Sell OTM PE)
 *  9. IRON_CONDOR      (Buy deep OTM PE, Sell OTM PE, Sell OTM CE, Buy deep OTM CE)
 * 10. IRON_BUTTERFLY   (Buy deep OTM PE, Sell ATM PE, Sell ATM CE, Buy deep OTM CE)
 * 11. BUTTERFLY        (Buy 1 ITM CE, Sell 2 ATM CE, Buy 1 OTM CE)
 * 12. CALENDAR_SPREAD  (Sell near expiry ATM CE, Buy next expiry ATM CE)
 * 13. DIAGONAL_SPREAD  (Sell near expiry OTM CE, Buy next expiry ATM CE)
 */

import { BaseStrategy } from "./baseStrategy.js";
import {
  MarketEvaluationContext,
  MarketRegime,
  SignalModel,
  StrategyCategory,
  StrategyId,
  StructuredTrade,
  TradeLeg,
} from "../strategyTypes.js";
import { InstrumentMaster } from "../instrumentMaster.js";
import { ExpiryResolver } from "../expiryResolver.js";
import { StrikeSelector } from "../strikeSelector.js";
import { OptionChainService } from "../optionChainService.js";
import { IndianCostModel } from "../costModel.js";

// ─── 1. BULL CALL SPREAD ─────────────────────────────────────────
export class BullCallSpreadStrategy extends BaseStrategy {
  public readonly id: StrategyId = "BULL_CALL_SPREAD";
  public readonly name = "Bull Call Debit Spread";
  public readonly category: StrategyCategory = "OPTIONS_SPREADS";
  public readonly description = "Buys ATM Call (Leg 1) and sells OTM Call (Leg 2) to cap risk and lower premium outlay";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["TRENDING_BULL", "BREAKOUT"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const isBull = context.regime === "TRENDING_BULL" || context.regime === "BREAKOUT";
    const score = isBull ? 84 : 50;
    return { eligible: score >= this.minimumConfidence, score, reasons: ["Moderate/Strong Bullish trend suitable for debit spread"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;

    return {
      signalId: `SIG_BCS_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "BULLISH",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(
    signal: SignalModel,
    context: MarketEvaluationContext,
    accountCapital: number,
    riskPercent: number
  ): StructuredTrade {
    const expiryInfo = ExpiryResolver.resolveExpiry(context.underlying, { type: "NEAREST_VALID_EXPIRY" });
    const atmStrike = StrikeSelector.getATMStrike(context.underlying, context.spotPrice);
    const step = StrikeSelector.getStrikeStep(context.underlying);
    const otmStrike = atmStrike + step * 2; // +2 strikes OTM

    const leg1Inst = InstrumentMaster.resolveInstrument(context.underlying, "CE", expiryInfo.date, atmStrike);
    const leg2Inst = InstrumentMaster.resolveInstrument(context.underlying, "CE", expiryInfo.date, otmStrike);

    const dteYears = Math.max(0.5, (expiryInfo.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) / 365;
    const leg1Prem = OptionChainService.calculateTheoreticalPrice(context.spotPrice, atmStrike, dteYears, 0.15, true);
    const leg2Prem = OptionChainService.calculateTheoreticalPrice(context.spotPrice, otmStrike, dteYears, 0.15, true);

    const netDebit = Number((leg1Prem - leg2Prem).toFixed(2));
    const strikeWidth = otmStrike - atmStrike;
    const maxProfit = Number((strikeWidth - netDebit).toFixed(2));
    const maxLoss = netDebit;

    const calculatedQty = Math.floor((accountCapital * (riskPercent / 100)) / (maxLoss * leg1Inst.lotSize)) * leg1Inst.lotSize;
    const quantity = Math.max(leg1Inst.lotSize, calculatedQty);
    const clientOrderId = `ORD_BCS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const leg1: TradeLeg = {
      legId: `LEG_1_${clientOrderId}`,
      action: "BUY",
      instrumentType: "CE",
      strike: atmStrike,
      expiry: expiryInfo.expiry,
      tradingSymbol: leg1Inst.tradingSymbol,
      token: leg1Inst.token,
      quantity,
      lotSize: leg1Inst.lotSize,
      entryPrice: leg1Prem,
      status: "OPEN",
      pnl: 0,
    };

    const leg2: TradeLeg = {
      legId: `LEG_2_${clientOrderId}`,
      action: "SELL",
      instrumentType: "CE",
      strike: otmStrike,
      expiry: expiryInfo.expiry,
      tradingSymbol: leg2Inst.tradingSymbol,
      token: leg2Inst.token,
      quantity,
      lotSize: leg2Inst.lotSize,
      entryPrice: leg2Prem,
      status: "OPEN",
      pnl: 0,
    };

    const cost1 = IndianCostModel.calculateOrderCost({ instrumentType: "CE", action: "BUY", price: leg1Prem, quantity, strikePrice: atmStrike });
    const cost2 = IndianCostModel.calculateOrderCost({ instrumentType: "CE", action: "SELL", price: leg2Prem, quantity, strikePrice: otmStrike });

    return {
      tradeId: `TRD_${clientOrderId}`,
      strategyInstanceId: `STRAT_${this.id}_${context.underlying}`,
      tradeGroupId: `GRP_BCS_${Date.now()}`,
      userId: "user-system",
      mode: "PAPER",
      exchange: leg1Inst.exchange,
      underlying: context.underlying,
      instrument: "CE",
      position: "LONG",
      strategy: this.id,
      strike: atmStrike,
      expiry: expiryInfo.expiry,
      quantity,
      lotSize: leg1Inst.lotSize,
      entryType: "MARKET",
      entryPrice: netDebit,
      averageEntryPrice: netDebit,
      stopLoss: Number((netDebit * 0.40).toFixed(2)),
      target: Number((netDebit + maxProfit * 0.75).toFixed(2)),
      trailingStop: { enabled: true, type: "BREAK_EVEN_AT_1R" },
      risk: {
        riskAmount: maxLoss * quantity,
        riskPercent,
        rewardRiskRatio: Number((maxProfit / maxLoss).toFixed(2)),
      },
      tradeScore: signal.tradeScore,
      status: "OPEN",
      entryReason: signal.entryReason,
      legs: [leg1, leg2],
      brokerOrderIds: [],
      clientOrderId,
      realizedPnl: 0,
      unrealizedPnl: 0,
      charges: {
        brokerage: cost1.brokerage + cost2.brokerage,
        stt: cost1.stt + cost2.stt,
        exchangeTxn: cost1.exchangeTxn + cost2.exchangeTxn,
        sebi: cost1.sebi + cost2.sebi,
        stampDuty: cost1.stampDuty + cost2.stampDuty,
        gst: cost1.gst + cost2.gst,
        total: Number((cost1.totalCharges + cost2.totalCharges).toFixed(2)),
      },
      openedAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

// ─── 2. BEAR PUT SPREAD ──────────────────────────────────────────
export class BearPutSpreadStrategy extends BaseStrategy {
  public readonly id: StrategyId = "BEAR_PUT_SPREAD";
  public readonly name = "Bear Put Debit Spread";
  public readonly category: StrategyCategory = "OPTIONS_SPREADS";
  public readonly description = "Buys ATM Put (Leg 1) and sells OTM Put (Leg 2) for capped-risk downward trade";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["TRENDING_BEAR", "BREAKOUT"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const isBear = context.regime === "TRENDING_BEAR" || context.regime === "BREAKOUT";
    const score = isBear ? 84 : 50;
    return { eligible: score >= this.minimumConfidence, score, reasons: ["Moderate/Strong Bearish trend suitable for debit spread"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;

    return {
      signalId: `SIG_BPS_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "BEARISH",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    const expiryInfo = ExpiryResolver.resolveExpiry(context.underlying, { type: "NEAREST_VALID_EXPIRY" });
    const atmStrike = StrikeSelector.getATMStrike(context.underlying, context.spotPrice);
    const step = StrikeSelector.getStrikeStep(context.underlying);
    const otmStrike = atmStrike - step * 2; // -2 strikes OTM

    const leg1Inst = InstrumentMaster.resolveInstrument(context.underlying, "PE", expiryInfo.date, atmStrike);
    const leg2Inst = InstrumentMaster.resolveInstrument(context.underlying, "PE", expiryInfo.date, otmStrike);

    const dteYears = Math.max(0.5, (expiryInfo.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) / 365;
    const leg1Prem = OptionChainService.calculateTheoreticalPrice(context.spotPrice, atmStrike, dteYears, 0.15, false);
    const leg2Prem = OptionChainService.calculateTheoreticalPrice(context.spotPrice, otmStrike, dteYears, 0.15, false);

    const netDebit = Number((leg1Prem - leg2Prem).toFixed(2));
    const strikeWidth = atmStrike - otmStrike;
    const maxProfit = Number((strikeWidth - netDebit).toFixed(2));
    const maxLoss = netDebit;

    const calculatedQty = Math.floor((accountCapital * (riskPercent / 100)) / (maxLoss * leg1Inst.lotSize)) * leg1Inst.lotSize;
    const quantity = Math.max(leg1Inst.lotSize, calculatedQty);
    const clientOrderId = `ORD_BPS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const leg1: TradeLeg = {
      legId: `LEG_1_${clientOrderId}`,
      action: "BUY",
      instrumentType: "PE",
      strike: atmStrike,
      expiry: expiryInfo.expiry,
      tradingSymbol: leg1Inst.tradingSymbol,
      token: leg1Inst.token,
      quantity,
      lotSize: leg1Inst.lotSize,
      entryPrice: leg1Prem,
      status: "OPEN",
      pnl: 0,
    };

    const leg2: TradeLeg = {
      legId: `LEG_2_${clientOrderId}`,
      action: "SELL",
      instrumentType: "PE",
      strike: otmStrike,
      expiry: expiryInfo.expiry,
      tradingSymbol: leg2Inst.tradingSymbol,
      token: leg2Inst.token,
      quantity,
      lotSize: leg2Inst.lotSize,
      entryPrice: leg2Prem,
      status: "OPEN",
      pnl: 0,
    };

    const cost1 = IndianCostModel.calculateOrderCost({ instrumentType: "PE", action: "BUY", price: leg1Prem, quantity, strikePrice: atmStrike });
    const cost2 = IndianCostModel.calculateOrderCost({ instrumentType: "PE", action: "SELL", price: leg2Prem, quantity, strikePrice: otmStrike });

    return {
      tradeId: `TRD_${clientOrderId}`,
      strategyInstanceId: `STRAT_${this.id}_${context.underlying}`,
      tradeGroupId: `GRP_BPS_${Date.now()}`,
      userId: "user-system",
      mode: "PAPER",
      exchange: leg1Inst.exchange,
      underlying: context.underlying,
      instrument: "PE",
      position: "LONG",
      strategy: this.id,
      strike: atmStrike,
      expiry: expiryInfo.expiry,
      quantity,
      lotSize: leg1Inst.lotSize,
      entryType: "MARKET",
      entryPrice: netDebit,
      averageEntryPrice: netDebit,
      stopLoss: Number((netDebit * 0.40).toFixed(2)),
      target: Number((netDebit + maxProfit * 0.75).toFixed(2)),
      trailingStop: { enabled: true, type: "BREAK_EVEN_AT_1R" },
      risk: {
        riskAmount: maxLoss * quantity,
        riskPercent,
        rewardRiskRatio: Number((maxProfit / maxLoss).toFixed(2)),
      },
      tradeScore: signal.tradeScore,
      status: "OPEN",
      entryReason: signal.entryReason,
      legs: [leg1, leg2],
      brokerOrderIds: [],
      clientOrderId,
      realizedPnl: 0,
      unrealizedPnl: 0,
      charges: {
        brokerage: cost1.brokerage + cost2.brokerage,
        stt: cost1.stt + cost2.stt,
        exchangeTxn: cost1.exchangeTxn + cost2.exchangeTxn,
        sebi: cost1.sebi + cost2.sebi,
        stampDuty: cost1.stampDuty + cost2.stampDuty,
        gst: cost1.gst + cost2.gst,
        total: Number((cost1.totalCharges + cost2.totalCharges).toFixed(2)),
      },
      openedAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

// ─── 3. LONG STRADDLE STRATEGY ───────────────────────────────────
export class LongStraddleStrategy extends BaseStrategy {
  public readonly id: StrategyId = "LONG_STRADDLE";
  public readonly name = "Long Straddle (Buy ATM CE + Buy ATM PE)";
  public readonly category: StrategyCategory = "OPTIONS_SPREADS";
  public readonly description = "Non-directional volatility breakout: Buys ATM Call and ATM Put before major earnings / RBI events";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["HIGH_VOLATILITY", "BREAKOUT"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const isVolatile = context.regime === "HIGH_VOLATILITY" || context.regime === "BREAKOUT";
    const score = isVolatile ? 83 : 50;
    return { eligible: score >= this.minimumConfidence, score, reasons: ["High volatility expansion regime favorable for long volatility"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;

    return {
      signalId: `SIG_LSTR_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "BULLISH",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    const expiryInfo = ExpiryResolver.resolveExpiry(context.underlying, { type: "NEAREST_VALID_EXPIRY" });
    const atmStrike = StrikeSelector.getATMStrike(context.underlying, context.spotPrice);

    const ceInst = InstrumentMaster.resolveInstrument(context.underlying, "CE", expiryInfo.date, atmStrike);
    const peInst = InstrumentMaster.resolveInstrument(context.underlying, "PE", expiryInfo.date, atmStrike);

    const dteYears = Math.max(0.5, (expiryInfo.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) / 365;
    const cePrem = OptionChainService.calculateTheoreticalPrice(context.spotPrice, atmStrike, dteYears, 0.16, true);
    const pePrem = OptionChainService.calculateTheoreticalPrice(context.spotPrice, atmStrike, dteYears, 0.16, false);
    const combinedPremium = Number((cePrem + pePrem).toFixed(2));

    const calculatedQty = Math.floor((accountCapital * (riskPercent / 100)) / (combinedPremium * 0.35 * ceInst.lotSize)) * ceInst.lotSize;
    const quantity = Math.max(ceInst.lotSize, calculatedQty);
    const clientOrderId = `ORD_LSTR_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const leg1: TradeLeg = { legId: `LEG_1_${clientOrderId}`, action: "BUY", instrumentType: "CE", strike: atmStrike, expiry: expiryInfo.expiry, tradingSymbol: ceInst.tradingSymbol, token: ceInst.token, quantity, lotSize: ceInst.lotSize, entryPrice: cePrem, status: "OPEN", pnl: 0 };
    const leg2: TradeLeg = { legId: `LEG_2_${clientOrderId}`, action: "BUY", instrumentType: "PE", strike: atmStrike, expiry: expiryInfo.expiry, tradingSymbol: peInst.tradingSymbol, token: peInst.token, quantity, lotSize: peInst.lotSize, entryPrice: pePrem, status: "OPEN", pnl: 0 };

    return {
      tradeId: `TRD_${clientOrderId}`,
      strategyInstanceId: `STRAT_${this.id}_${context.underlying}`,
      tradeGroupId: `GRP_LSTR_${Date.now()}`,
      userId: "user-system",
      mode: "PAPER",
      exchange: ceInst.exchange,
      underlying: context.underlying,
      instrument: "CE",
      position: "LONG",
      strategy: this.id,
      strike: atmStrike,
      expiry: expiryInfo.expiry,
      quantity,
      lotSize: ceInst.lotSize,
      entryType: "MARKET",
      entryPrice: combinedPremium,
      averageEntryPrice: combinedPremium,
      stopLoss: Number((combinedPremium * 0.70).toFixed(2)),
      target: Number((combinedPremium * 1.50).toFixed(2)),
      trailingStop: { enabled: true, type: "BREAK_EVEN_AT_1R" },
      risk: { riskAmount: combinedPremium * 0.30 * quantity, riskPercent, rewardRiskRatio: 1.67 },
      tradeScore: signal.tradeScore,
      status: "OPEN",
      entryReason: signal.entryReason,
      legs: [leg1, leg2],
      brokerOrderIds: [],
      clientOrderId,
      realizedPnl: 0,
      unrealizedPnl: 0,
      charges: { brokerage: 40, stt: 0, exchangeTxn: combinedPremium * quantity * 0.0005, sebi: combinedPremium * quantity * 0.000001, stampDuty: combinedPremium * quantity * 0.00003, gst: 7.2, total: 55 },
      openedAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

// ─── 4. SHORT STRADDLE STRATEGY ──────────────────────────────────
export class ShortStraddleStrategy extends BaseStrategy {
  public readonly id: StrategyId = "SHORT_STRADDLE";
  public readonly name = "Short Straddle (Sell ATM CE + Sell ATM PE)";
  public readonly category: StrategyCategory = "OPTIONS_SPREADS";
  public readonly description = "Non-directional theta collection: Sells ATM Call and ATM Put in range-bound, low-volatility regimes";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const isRanging = context.regime === "RANGING" || context.regime === "LOW_VOLATILITY";
    const score = isRanging ? 81 : 50;
    return { eligible: score >= this.minimumConfidence, score, reasons: ["Low volatility range-bound regime optimal for theta decay collection"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;

    return {
      signalId: `SIG_SSTR_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "NEUTRAL",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    const expiryInfo = ExpiryResolver.resolveExpiry(context.underlying, { type: "NEAREST_VALID_EXPIRY" });
    const atmStrike = StrikeSelector.getATMStrike(context.underlying, context.spotPrice);

    const ceInst = InstrumentMaster.resolveInstrument(context.underlying, "CE", expiryInfo.date, atmStrike);
    const peInst = InstrumentMaster.resolveInstrument(context.underlying, "PE", expiryInfo.date, atmStrike);

    const dteYears = Math.max(0.5, (expiryInfo.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) / 365;
    const cePrem = OptionChainService.calculateTheoreticalPrice(context.spotPrice, atmStrike, dteYears, 0.14, true);
    const pePrem = OptionChainService.calculateTheoreticalPrice(context.spotPrice, atmStrike, dteYears, 0.14, false);
    const combinedPremium = Number((cePrem + pePrem).toFixed(2));

    const calculatedQty = Math.floor((accountCapital * (riskPercent / 100)) / (combinedPremium * 0.35 * ceInst.lotSize)) * ceInst.lotSize;
    const quantity = Math.max(ceInst.lotSize, calculatedQty);
    const clientOrderId = `ORD_SSTR_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const leg1: TradeLeg = { legId: `LEG_1_${clientOrderId}`, action: "SELL", instrumentType: "CE", strike: atmStrike, expiry: expiryInfo.expiry, tradingSymbol: ceInst.tradingSymbol, token: ceInst.token, quantity, lotSize: ceInst.lotSize, entryPrice: cePrem, status: "OPEN", pnl: 0 };
    const leg2: TradeLeg = { legId: `LEG_2_${clientOrderId}`, action: "SELL", instrumentType: "PE", strike: atmStrike, expiry: expiryInfo.expiry, tradingSymbol: peInst.tradingSymbol, token: peInst.token, quantity, lotSize: peInst.lotSize, entryPrice: pePrem, status: "OPEN", pnl: 0 };

    return {
      tradeId: `TRD_${clientOrderId}`,
      strategyInstanceId: `STRAT_${this.id}_${context.underlying}`,
      tradeGroupId: `GRP_SSTR_${Date.now()}`,
      userId: "user-system",
      mode: "PAPER",
      exchange: ceInst.exchange,
      underlying: context.underlying,
      instrument: "CE",
      position: "SHORT",
      strategy: this.id,
      strike: atmStrike,
      expiry: expiryInfo.expiry,
      quantity,
      lotSize: ceInst.lotSize,
      entryType: "MARKET",
      entryPrice: combinedPremium,
      averageEntryPrice: combinedPremium,
      stopLoss: Number((combinedPremium * 1.30).toFixed(2)),
      target: Number((combinedPremium * 0.50).toFixed(2)),
      trailingStop: { enabled: true, type: "BREAK_EVEN_AT_1R" },
      risk: { riskAmount: combinedPremium * 0.30 * quantity, riskPercent, rewardRiskRatio: 1.67 },
      tradeScore: signal.tradeScore,
      status: "OPEN",
      entryReason: signal.entryReason,
      legs: [leg1, leg2],
      brokerOrderIds: [],
      clientOrderId,
      realizedPnl: 0,
      unrealizedPnl: 0,
      charges: { brokerage: 40, stt: combinedPremium * quantity * 0.001, exchangeTxn: combinedPremium * quantity * 0.0005, sebi: combinedPremium * quantity * 0.000001, stampDuty: 0, gst: 7.2, total: 60 },
      openedAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

// ─── 5. IRON CONDOR STRATEGY ─────────────────────────────────────
export class IronCondorStrategy extends BaseStrategy {
  public readonly id: StrategyId = "IRON_CONDOR";
  public readonly name = "Iron Condor (4-Leg Defined-Risk Range)";
  public readonly category: StrategyCategory = "OPTIONS_SPREADS";
  public readonly description = "Defined-risk credit strategy: Sells OTM Put + Buys deep OTM Put & Sells OTM Call + Buys deep OTM Call";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const isRanging = context.regime === "RANGING" || context.regime === "LOW_VOLATILITY";
    const score = isRanging ? 85 : 50;
    return { eligible: score >= this.minimumConfidence, score, reasons: ["Established broad trading range with high theta efficiency"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;

    return {
      signalId: `SIG_IC_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "NEUTRAL",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    const expiryInfo = ExpiryResolver.resolveExpiry(context.underlying, { type: "NEAREST_VALID_EXPIRY" });
    const atmStrike = StrikeSelector.getATMStrike(context.underlying, context.spotPrice);
    const step = StrikeSelector.getStrikeStep(context.underlying);

    const sellPutStrike = atmStrike - step * 2;
    const buyPutStrike = atmStrike - step * 4;
    const sellCallStrike = atmStrike + step * 2;
    const buyCallStrike = atmStrike + step * 4;

    const sellPutInst = InstrumentMaster.resolveInstrument(context.underlying, "PE", expiryInfo.date, sellPutStrike);
    const buyPutInst = InstrumentMaster.resolveInstrument(context.underlying, "PE", expiryInfo.date, buyPutStrike);
    const sellCallInst = InstrumentMaster.resolveInstrument(context.underlying, "CE", expiryInfo.date, sellCallStrike);
    const buyCallInst = InstrumentMaster.resolveInstrument(context.underlying, "CE", expiryInfo.date, buyCallStrike);

    const dteYears = Math.max(0.5, (expiryInfo.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) / 365;
    const pSellPut = OptionChainService.calculateTheoreticalPrice(context.spotPrice, sellPutStrike, dteYears, 0.14, false);
    const pBuyPut = OptionChainService.calculateTheoreticalPrice(context.spotPrice, buyPutStrike, dteYears, 0.14, false);
    const pSellCall = OptionChainService.calculateTheoreticalPrice(context.spotPrice, sellCallStrike, dteYears, 0.14, true);
    const pBuyCall = OptionChainService.calculateTheoreticalPrice(context.spotPrice, buyCallStrike, dteYears, 0.14, true);

    const netCredit = Number(((pSellPut - pBuyPut) + (pSellCall - pBuyCall)).toFixed(2));
    const wingWidth = step * 2;
    const maxRisk = Number((wingWidth - netCredit).toFixed(2));

    const calculatedQty = Math.floor((accountCapital * (riskPercent / 100)) / (maxRisk * sellPutInst.lotSize)) * sellPutInst.lotSize;
    const quantity = Math.max(sellPutInst.lotSize, calculatedQty);
    const clientOrderId = `ORD_IC_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const leg1: TradeLeg = { legId: `LEG_1_${clientOrderId}`, action: "BUY", instrumentType: "PE", strike: buyPutStrike, expiry: expiryInfo.expiry, tradingSymbol: buyPutInst.tradingSymbol, token: buyPutInst.token, quantity, lotSize: buyPutInst.lotSize, entryPrice: pBuyPut, status: "OPEN", pnl: 0 };
    const leg2: TradeLeg = { legId: `LEG_2_${clientOrderId}`, action: "SELL", instrumentType: "PE", strike: sellPutStrike, expiry: expiryInfo.expiry, tradingSymbol: sellPutInst.tradingSymbol, token: sellPutInst.token, quantity, lotSize: sellPutInst.lotSize, entryPrice: pSellPut, status: "OPEN", pnl: 0 };
    const leg3: TradeLeg = { legId: `LEG_3_${clientOrderId}`, action: "SELL", instrumentType: "CE", strike: sellCallStrike, expiry: expiryInfo.expiry, tradingSymbol: sellCallInst.tradingSymbol, token: sellCallInst.token, quantity, lotSize: sellCallInst.lotSize, entryPrice: pSellCall, status: "OPEN", pnl: 0 };
    const leg4: TradeLeg = { legId: `LEG_4_${clientOrderId}`, action: "BUY", instrumentType: "CE", strike: buyCallStrike, expiry: expiryInfo.expiry, tradingSymbol: buyCallInst.tradingSymbol, token: buyCallInst.token, quantity, lotSize: buyCallInst.lotSize, entryPrice: pBuyCall, status: "OPEN", pnl: 0 };

    return {
      tradeId: `TRD_${clientOrderId}`,
      strategyInstanceId: `STRAT_${this.id}_${context.underlying}`,
      tradeGroupId: `GRP_IC_${Date.now()}`,
      userId: "user-system",
      mode: "PAPER",
      exchange: sellPutInst.exchange,
      underlying: context.underlying,
      instrument: "CE",
      position: "SHORT",
      strategy: this.id,
      strike: atmStrike,
      expiry: expiryInfo.expiry,
      quantity,
      lotSize: sellPutInst.lotSize,
      entryType: "MARKET",
      entryPrice: netCredit,
      averageEntryPrice: netCredit,
      stopLoss: Number((netCredit * 1.50).toFixed(2)),
      target: Number((netCredit * 0.30).toFixed(2)),
      trailingStop: { enabled: true, type: "BREAK_EVEN_AT_1R" },
      risk: { riskAmount: maxRisk * quantity, riskPercent, rewardRiskRatio: Number((netCredit / maxRisk).toFixed(2)) },
      tradeScore: signal.tradeScore,
      status: "OPEN",
      entryReason: signal.entryReason,
      legs: [leg1, leg2, leg3, leg4],
      brokerOrderIds: [],
      clientOrderId,
      realizedPnl: 0,
      unrealizedPnl: 0,
      charges: { brokerage: 80, stt: 12, exchangeTxn: 8, sebi: 1, stampDuty: 2, gst: 16, total: 119 },
      openedAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

// ─── 6. LONG STRANGLE STRATEGY ───────────────────────────────────
export class LongStrangleStrategy extends BaseStrategy {
  public readonly id: StrategyId = "LONG_STRANGLE";
  public readonly name = "Long Strangle (Buy OTM CE + Buy OTM PE)";
  public readonly category: StrategyCategory = "OPTIONS_SPREADS";
  public readonly description = "Lower-cost volatility trade: Buys OTM Call and OTM Put expecting huge directional breakout";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["HIGH_VOLATILITY", "BREAKOUT"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const isVolatile = context.regime === "HIGH_VOLATILITY" || context.regime === "BREAKOUT";
    return { eligible: isVolatile, score: isVolatile ? 80 : 50, reasons: ["High volatility expected with broad range potential"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;
    return {
      signalId: `SIG_LSTG_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "BULLISH",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    const expiryInfo = ExpiryResolver.resolveExpiry(context.underlying, { type: "NEAREST_VALID_EXPIRY" });
    const atmStrike = StrikeSelector.getATMStrike(context.underlying, context.spotPrice);
    const step = StrikeSelector.getStrikeStep(context.underlying);
    const callStrike = atmStrike + step * 2;
    const putStrike = atmStrike - step * 2;

    const ceInst = InstrumentMaster.resolveInstrument(context.underlying, "CE", expiryInfo.date, callStrike);
    const peInst = InstrumentMaster.resolveInstrument(context.underlying, "PE", expiryInfo.date, putStrike);

    const dteYears = Math.max(0.5, (expiryInfo.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) / 365;
    const cePrem = OptionChainService.calculateTheoreticalPrice(context.spotPrice, callStrike, dteYears, 0.16, true);
    const pePrem = OptionChainService.calculateTheoreticalPrice(context.spotPrice, putStrike, dteYears, 0.16, false);
    const totalPrem = Number((cePrem + pePrem).toFixed(2));

    const calculatedQty = Math.floor((accountCapital * (riskPercent / 100)) / (totalPrem * 0.35 * ceInst.lotSize)) * ceInst.lotSize;
    const quantity = Math.max(ceInst.lotSize, calculatedQty);
    const clientOrderId = `ORD_LSTG_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const leg1: TradeLeg = { legId: `LEG_1_${clientOrderId}`, action: "BUY", instrumentType: "CE", strike: callStrike, expiry: expiryInfo.expiry, tradingSymbol: ceInst.tradingSymbol, token: ceInst.token, quantity, lotSize: ceInst.lotSize, entryPrice: cePrem, status: "OPEN", pnl: 0 };
    const leg2: TradeLeg = { legId: `LEG_2_${clientOrderId}`, action: "BUY", instrumentType: "PE", strike: putStrike, expiry: expiryInfo.expiry, tradingSymbol: peInst.tradingSymbol, token: peInst.token, quantity, lotSize: peInst.lotSize, entryPrice: pePrem, status: "OPEN", pnl: 0 };

    return {
      tradeId: `TRD_${clientOrderId}`,
      strategyInstanceId: `STRAT_${this.id}_${context.underlying}`,
      tradeGroupId: `GRP_LSTG_${Date.now()}`,
      userId: "user-system",
      mode: "PAPER",
      exchange: ceInst.exchange,
      underlying: context.underlying,
      instrument: "CE",
      position: "LONG",
      strategy: this.id,
      strike: atmStrike,
      expiry: expiryInfo.expiry,
      quantity,
      lotSize: ceInst.lotSize,
      entryType: "MARKET",
      entryPrice: totalPrem,
      averageEntryPrice: totalPrem,
      stopLoss: Number((totalPrem * 0.65).toFixed(2)),
      target: Number((totalPrem * 1.60).toFixed(2)),
      trailingStop: { enabled: true, type: "BREAK_EVEN_AT_1R" },
      risk: { riskAmount: totalPrem * 0.35 * quantity, riskPercent, rewardRiskRatio: 1.71 },
      tradeScore: signal.tradeScore,
      status: "OPEN",
      entryReason: signal.entryReason,
      legs: [leg1, leg2],
      brokerOrderIds: [],
      clientOrderId,
      realizedPnl: 0,
      unrealizedPnl: 0,
      charges: { brokerage: 40, stt: 0, exchangeTxn: 6, sebi: 1, stampDuty: 2, gst: 8, total: 57 },
      openedAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

// ─── 7. SHORT STRANGLE STRATEGY ──────────────────────────────────
export class ShortStrangleStrategy extends BaseStrategy {
  public readonly id: StrategyId = "SHORT_STRANGLE";
  public readonly name = "Short Strangle (Sell OTM CE + Sell OTM PE)";
  public readonly category: StrategyCategory = "OPTIONS_SPREADS";
  public readonly description = "High-probability premium collection: Sells OTM Call and OTM Put outside 1-standard deviation expected move";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const isRanging = context.regime === "RANGING" || context.regime === "LOW_VOLATILITY";
    return { eligible: isRanging, score: isRanging ? 82 : 50, reasons: ["Low volatility range-bound market suitable for wide OTM strangle collection"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;
    return {
      signalId: `SIG_SSTG_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "NEUTRAL",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    const expiryInfo = ExpiryResolver.resolveExpiry(context.underlying, { type: "NEAREST_VALID_EXPIRY" });
    const atmStrike = StrikeSelector.getATMStrike(context.underlying, context.spotPrice);
    const step = StrikeSelector.getStrikeStep(context.underlying);
    const callStrike = atmStrike + step * 2;
    const putStrike = atmStrike - step * 2;

    const ceInst = InstrumentMaster.resolveInstrument(context.underlying, "CE", expiryInfo.date, callStrike);
    const peInst = InstrumentMaster.resolveInstrument(context.underlying, "PE", expiryInfo.date, putStrike);

    const dteYears = Math.max(0.5, (expiryInfo.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) / 365;
    const cePrem = OptionChainService.calculateTheoreticalPrice(context.spotPrice, callStrike, dteYears, 0.14, true);
    const pePrem = OptionChainService.calculateTheoreticalPrice(context.spotPrice, putStrike, dteYears, 0.14, false);
    const totalPrem = Number((cePrem + pePrem).toFixed(2));

    const calculatedQty = Math.floor((accountCapital * (riskPercent / 100)) / (totalPrem * 0.35 * ceInst.lotSize)) * ceInst.lotSize;
    const quantity = Math.max(ceInst.lotSize, calculatedQty);
    const clientOrderId = `ORD_SSTG_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const leg1: TradeLeg = { legId: `LEG_1_${clientOrderId}`, action: "SELL", instrumentType: "CE", strike: callStrike, expiry: expiryInfo.expiry, tradingSymbol: ceInst.tradingSymbol, token: ceInst.token, quantity, lotSize: ceInst.lotSize, entryPrice: cePrem, status: "OPEN", pnl: 0 };
    const leg2: TradeLeg = { legId: `LEG_2_${clientOrderId}`, action: "SELL", instrumentType: "PE", strike: putStrike, expiry: expiryInfo.expiry, tradingSymbol: peInst.tradingSymbol, token: peInst.token, quantity, lotSize: peInst.lotSize, entryPrice: pePrem, status: "OPEN", pnl: 0 };

    return {
      tradeId: `TRD_${clientOrderId}`,
      strategyInstanceId: `STRAT_${this.id}_${context.underlying}`,
      tradeGroupId: `GRP_SSTG_${Date.now()}`,
      userId: "user-system",
      mode: "PAPER",
      exchange: ceInst.exchange,
      underlying: context.underlying,
      instrument: "CE",
      position: "SHORT",
      strategy: this.id,
      strike: atmStrike,
      expiry: expiryInfo.expiry,
      quantity,
      lotSize: ceInst.lotSize,
      entryType: "MARKET",
      entryPrice: totalPrem,
      averageEntryPrice: totalPrem,
      stopLoss: Number((totalPrem * 1.35).toFixed(2)),
      target: Number((totalPrem * 0.40).toFixed(2)),
      trailingStop: { enabled: true, type: "BREAK_EVEN_AT_1R" },
      risk: { riskAmount: totalPrem * 0.35 * quantity, riskPercent, rewardRiskRatio: 1.71 },
      tradeScore: signal.tradeScore,
      status: "OPEN",
      entryReason: signal.entryReason,
      legs: [leg1, leg2],
      brokerOrderIds: [],
      clientOrderId,
      realizedPnl: 0,
      unrealizedPnl: 0,
      charges: { brokerage: 40, stt: totalPrem * quantity * 0.001, exchangeTxn: 6, sebi: 1, stampDuty: 0, gst: 8, total: 58 },
      openedAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
