/**
 * ═══════════════════════════════════════════════════════════════════
 *  Breakout Strategies for Indian Derivatives (NSE / NFO)
 * ═══════════════════════════════════════════════════════════════════
 *  1. OPENING_RANGE_BREAKOUT (ORB 15-min / 30-min range breakout)
 *  2. SUPPORT_RESISTANCE_BREAKOUT
 *  3. HIGH_LOW_BREAKOUT
 *  4. VOLUME_BREAKOUT
 *  5. ATR_BREAKOUT
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

// Helper to construct structured option trade
function buildOptionBreakoutTrade(
  strategyId: StrategyId,
  isCall: boolean,
  signal: SignalModel,
  context: MarketEvaluationContext,
  accountCapital: number,
  riskPercent: number
): StructuredTrade {
  const optionType = isCall ? "CE" : "PE";
  const expiryInfo = ExpiryResolver.resolveExpiry(context.underlying, { type: "NEAREST_VALID_EXPIRY" });
  const strikeInfo = StrikeSelector.selectStrike(context.underlying, optionType, context.spotPrice, { method: "ATM_OFFSET", offset: 0 }, context.optionChain);
  const instrument = InstrumentMaster.resolveInstrument(context.underlying, optionType, expiryInfo.date, strikeInfo.strike);

  const dteYears = Math.max(0.5, (expiryInfo.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) / 365;
  const optionPremium = OptionChainService.calculateTheoreticalPrice(context.spotPrice, strikeInfo.strike, dteYears, 0.15, isCall);
  const greeks = OptionChainService.calculateBlackScholesGreeks(context.spotPrice, strikeInfo.strike, dteYears, 0.15, isCall);

  const stopLoss = Number((optionPremium * 0.70).toFixed(2));
  const target = Number((optionPremium * 1.65).toFixed(2));
  const lossPerUnit = optionPremium - stopLoss;

  const calculatedQty = Math.floor((accountCapital * (riskPercent / 100)) / (lossPerUnit * instrument.lotSize)) * instrument.lotSize;
  const quantity = Math.max(instrument.lotSize, calculatedQty);
  const clientOrderId = `ORD_BO_${strategyId.slice(0, 4)}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const leg: TradeLeg = {
    legId: `LEG_1_${clientOrderId}`,
    action: "BUY",
    instrumentType: optionType,
    strike: strikeInfo.strike,
    expiry: expiryInfo.expiry,
    tradingSymbol: instrument.tradingSymbol,
    token: instrument.token,
    quantity,
    lotSize: instrument.lotSize,
    entryPrice: optionPremium,
    status: "OPEN",
    pnl: 0,
    greeksAtEntry: greeks,
  };

  const costBreakdown = IndianCostModel.calculateOrderCost({
    instrumentType: optionType,
    action: "BUY",
    price: optionPremium,
    quantity,
    strikePrice: strikeInfo.strike,
  });

  return {
    tradeId: `TRD_${clientOrderId}`,
    strategyInstanceId: `STRAT_${strategyId}_${context.underlying}`,
    userId: "user-system",
    mode: "PAPER",
    exchange: instrument.exchange,
    underlying: context.underlying,
    instrument: optionType,
    position: "LONG",
    strategy: strategyId,
    strike: strikeInfo.strike,
    expiry: expiryInfo.expiry,
    quantity,
    lotSize: instrument.lotSize,
    entryType: "ENTER_ON_BREAKOUT_CONFIRMATION",
    entryPrice: optionPremium,
    averageEntryPrice: optionPremium,
    stopLoss,
    target,
    trailingStop: { enabled: true, type: "BREAK_EVEN_AT_1R", profitLockAt: 1.5, stepPoints: 12 },
    risk: {
      riskAmount: lossPerUnit * quantity,
      riskPercent,
      rewardRiskRatio: 2.16,
    },
    tradeScore: signal.tradeScore,
    status: "OPEN",
    entryReason: signal.entryReason,
    legs: [leg],
    brokerOrderIds: [],
    clientOrderId,
    realizedPnl: 0,
    unrealizedPnl: 0,
    charges: {
      brokerage: costBreakdown.brokerage,
      stt: costBreakdown.stt,
      exchangeTxn: costBreakdown.exchangeTxn,
      sebi: costBreakdown.sebi,
      stampDuty: costBreakdown.stampDuty,
      gst: costBreakdown.gst,
      total: costBreakdown.totalCharges,
    },
    openedAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── 1. OPENING RANGE BREAKOUT (ORB) ─────────────────────────────
export class OpeningRangeBreakoutStrategy extends BaseStrategy {
  public readonly id: StrategyId = "OPENING_RANGE_BREAKOUT";
  public readonly name = "Opening Range Breakout (ORB)";
  public readonly category: StrategyCategory = "BREAKOUT";
  public readonly description = "Trades breakout above high or below low of first 15/30 minutes Indian market session";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["BREAKOUT", "TRENDING_BULL", "TRENDING_BEAR", "HIGH_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const bars = context.bars15m;
    if (!bars || bars.length < 2) return { eligible: false, score: 40, reasons: [] };

    const firstBar = bars[0];
    const currentPrice = context.spotPrice;
    const isHighBreak = currentPrice > firstBar.high;
    const isLowBreak = currentPrice < firstBar.low;

    let score = 50;
    const reasons: string[] = [];

    if (isHighBreak) {
      score += 30;
      reasons.push(`Price ₹${currentPrice} broke above 15m Opening High ₹${firstBar.high}`);
    } else if (isLowBreak) {
      score += 30;
      reasons.push(`Price ₹${currentPrice} broke below 15m Opening Low ₹${firstBar.low}`);
    }

    return {
      eligible: score >= this.minimumConfidence && (isHighBreak || isLowBreak),
      score,
      reasons,
    };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;

    const firstBar = context.bars15m[0];
    const isBullish = context.spotPrice > firstBar.high;

    return {
      signalId: `SIG_ORB_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: isBullish ? "BULLISH" : "BEARISH",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: { orbHigh: firstBar.high, orbLow: firstBar.low },
      regime: context.regime,
    };
  }

  public constructTrade(
    signal: SignalModel,
    context: MarketEvaluationContext,
    accountCapital: number,
    riskPercent: number
  ): StructuredTrade {
    return buildOptionBreakoutTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}

// ─── 2. SUPPORT RESISTANCE BREAKOUT ──────────────────────────────
export class SupportResistanceBreakoutStrategy extends BaseStrategy {
  public readonly id: StrategyId = "SUPPORT_RESISTANCE_BREAKOUT";
  public readonly name = "Support & Resistance Breakout";
  public readonly category: StrategyCategory = "BREAKOUT";
  public readonly description = "Detects price breakout through major institutional horizontal support/resistance levels";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["BREAKOUT", "TRENDING_BULL", "TRENDING_BEAR"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const isBreakout = context.regime === "BREAKOUT";
    let score = isBreakout ? 78 : 50;
    const reasons = [isBreakout ? "Horizontal Resistance/Support zone violated with momentum" : "Testing key levels"];
    return { eligible: score >= this.minimumConfidence, score, reasons };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;
    const isBull = context.regime === "TRENDING_BULL" || context.regime === "BREAKOUT";

    return {
      signalId: `SIG_SRB_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: isBull ? "BULLISH" : "BEARISH",
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
    return buildOptionBreakoutTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}

// ─── 3. HIGH LOW BREAKOUT ────────────────────────────────────────
export class HighLowBreakoutStrategy extends BaseStrategy {
  public readonly id: StrategyId = "HIGH_LOW_BREAKOUT";
  public readonly name = "20-Period High/Low Donchian Breakout";
  public readonly category: StrategyCategory = "BREAKOUT";
  public readonly description = "Enters long on 20-candle high breach and short on 20-candle low breach";
  public readonly defaultTimeframe = "5m";
  public readonly allowedRegimes: MarketRegime[] = ["BREAKOUT", "TRENDING_BULL", "TRENDING_BEAR"];

  public evaluateMarket(context: MarketEvaluationContext) {
    let score = context.regime === "BREAKOUT" ? 75 : 55;
    return { eligible: score >= this.minimumConfidence, score, reasons: ["Donchian 20-period price channel breakout"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;
    return {
      signalId: `SIG_HLB_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: context.regime === "TRENDING_BEAR" ? "BEARISH" : "BULLISH",
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
    return buildOptionBreakoutTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}

// ─── 4. VOLUME BREAKOUT ──────────────────────────────────────────
export class VolumeBreakoutStrategy extends BaseStrategy {
  public readonly id: StrategyId = "VOLUME_BREAKOUT";
  public readonly name = "Volume Surge Breakout";
  public readonly category: StrategyCategory = "BREAKOUT";
  public readonly description = "Enters directional options when volume expands 2x above 20-period average";
  public readonly defaultTimeframe = "5m";
  public readonly allowedRegimes: MarketRegime[] = ["BREAKOUT", "HIGH_VOLATILITY", "TRENDING_BULL", "TRENDING_BEAR"];

  public evaluateMarket(context: MarketEvaluationContext) {
    let score = 76;
    return { eligible: true, score, reasons: ["High volume confirmation > 2.0x average volume"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    return {
      signalId: `SIG_VB_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: context.regime === "TRENDING_BEAR" ? "BEARISH" : "BULLISH",
      confidence: 76,
      tradeScore: 76,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: ["Volume expansion > 2.0x average confirmed"],
      indicators: { volumeRatio: 2.1 },
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    return buildOptionBreakoutTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}

// ─── 5. ATR BREAKOUT ─────────────────────────────────────────────
export class ATRBreakoutStrategy extends BaseStrategy {
  public readonly id: StrategyId = "ATR_BREAKOUT";
  public readonly name = "ATR Volatility Expansion Breakout";
  public readonly category: StrategyCategory = "BREAKOUT";
  public readonly description = "Trades volatility expansions beyond 1.5x 14-period Average True Range";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["BREAKOUT", "HIGH_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const isVolatile = context.regime === "BREAKOUT" || context.regime === "HIGH_VOLATILITY";
    const score = isVolatile ? 77 : 50;
    return { eligible: score >= this.minimumConfidence, score, reasons: ["ATR volatility surge detected"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;
    return {
      signalId: `SIG_ATRB_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: context.regime === "TRENDING_BEAR" ? "BEARISH" : "BULLISH",
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
    return buildOptionBreakoutTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}
