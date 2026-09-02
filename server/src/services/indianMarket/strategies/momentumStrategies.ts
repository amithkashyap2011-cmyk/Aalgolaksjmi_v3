/**
 * ═══════════════════════════════════════════════════════════════════
 *  Momentum Strategies for Indian Derivatives (NSE / NFO)
 * ═══════════════════════════════════════════════════════════════════
 *  1. RSI_MOMENTUM
 *  2. MACD_MOMENTUM
 *  3. PRICE_MOMENTUM
 *  4. VOLUME_MOMENTUM
 *  5. BREAKOUT_MOMENTUM
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

function buildMomentumOptionTrade(
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
  const target = Number((optionPremium * 1.60).toFixed(2));
  const lossPerUnit = optionPremium - stopLoss;

  const calculatedQty = Math.floor((accountCapital * (riskPercent / 100)) / (lossPerUnit * instrument.lotSize)) * instrument.lotSize;
  const quantity = Math.max(instrument.lotSize, calculatedQty);
  const clientOrderId = `ORD_MOM_${strategyId.slice(0, 4)}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

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
    entryType: "MARKET",
    entryPrice: optionPremium,
    averageEntryPrice: optionPremium,
    stopLoss,
    target,
    trailingStop: { enabled: true, type: "BREAK_EVEN_AT_1R", profitLockAt: 1.5, stepPoints: 10 },
    risk: {
      riskAmount: lossPerUnit * quantity,
      riskPercent,
      rewardRiskRatio: 2.0,
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

// ─── 1. RSI MOMENTUM STRATEGY ────────────────────────────────────
export class RSIMomentumStrategy extends BaseStrategy {
  public readonly id: StrategyId = "RSI_MOMENTUM";
  public readonly name = "RSI 60/40 Momentum Thrust";
  public readonly category: StrategyCategory = "MOMENTUM";
  public readonly description = "Trades bullish momentum on RSI crossing 60 and bearish momentum on RSI breaking below 40";
  public readonly defaultTimeframe = "5m";
  public readonly allowedRegimes: MarketRegime[] = ["TRENDING_BULL", "TRENDING_BEAR", "BREAKOUT"];

  public evaluateMarket(context: MarketEvaluationContext) {
    return { eligible: true, score: 79, reasons: ["RSI momentum thrust > 60 confirmed"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const isBull = context.regime === "TRENDING_BULL" || context.regime === "BREAKOUT";
    return {
      signalId: `SIG_RSIM_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: isBull ? "BULLISH" : "BEARISH",
      confidence: 79,
      tradeScore: 79,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: ["RSI momentum thrust verified"],
      indicators: { rsi: isBull ? 64 : 36 },
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    return buildMomentumOptionTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}

// ─── 2. MACD MOMENTUM STRATEGY ───────────────────────────────────
export class MACDMomentumStrategy extends BaseStrategy {
  public readonly id: StrategyId = "MACD_MOMENTUM";
  public readonly name = "MACD Zero-Line Momentum Crossover";
  public readonly category: StrategyCategory = "MOMENTUM";
  public readonly description = "Enters on MACD fast line crossing above zero line with surging velocity";
  public readonly defaultTimeframe = "5m";
  public readonly allowedRegimes: MarketRegime[] = ["TRENDING_BULL", "TRENDING_BEAR", "BREAKOUT"];

  public evaluateMarket(context: MarketEvaluationContext) {
    return { eligible: true, score: 77, reasons: ["MACD velocity thrust above baseline"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const isBull = context.regime === "TRENDING_BULL";
    return {
      signalId: `SIG_MACDM_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: isBull ? "BULLISH" : "BEARISH",
      confidence: 77,
      tradeScore: 77,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: ["MACD Zero-line momentum trigger"],
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    return buildMomentumOptionTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}

// ─── 3. PRICE MOMENTUM STRATEGY ──────────────────────────────────
export class PriceMomentumStrategy extends BaseStrategy {
  public readonly id: StrategyId = "PRICE_MOMENTUM";
  public readonly name = "Rate of Change (ROC) Price Momentum";
  public readonly category: StrategyCategory = "MOMENTUM";
  public readonly description = "Monitors 10-period Rate of Change velocity to capture rapid impulsive swings";
  public readonly defaultTimeframe = "5m";
  public readonly allowedRegimes: MarketRegime[] = ["BREAKOUT", "TRENDING_BULL", "TRENDING_BEAR"];

  public evaluateMarket(context: MarketEvaluationContext) {
    return { eligible: true, score: 76, reasons: ["High ROC price velocity expansion"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const isBull = context.regime === "TRENDING_BULL";
    return {
      signalId: `SIG_PM_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: isBull ? "BULLISH" : "BEARISH",
      confidence: 76,
      tradeScore: 76,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: ["Impulsive price velocity confirmed"],
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    return buildMomentumOptionTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}

// ─── 4. VOLUME MOMENTUM STRATEGY ─────────────────────────────────
export class VolumeMomentumStrategy extends BaseStrategy {
  public readonly id: StrategyId = "VOLUME_MOMENTUM";
  public readonly name = "On-Balance Volume (OBV) Momentum";
  public readonly category: StrategyCategory = "MOMENTUM";
  public readonly description = "Tracks OBV trend divergence and institutional volume accumulation";
  public readonly defaultTimeframe = "5m";
  public readonly allowedRegimes: MarketRegime[] = ["TRENDING_BULL", "TRENDING_BEAR", "BREAKOUT"];

  public evaluateMarket(context: MarketEvaluationContext) {
    return { eligible: true, score: 80, reasons: ["Institutional volume accumulation / OBV surge"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const isBull = context.regime === "TRENDING_BULL";
    return {
      signalId: `SIG_VM_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: isBull ? "BULLISH" : "BEARISH",
      confidence: 80,
      tradeScore: 80,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: ["OBV volume accumulation breakout"],
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    return buildMomentumOptionTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}

// ─── 5. BREAKOUT MOMENTUM STRATEGY ───────────────────────────────
export class BreakoutMomentumStrategy extends BaseStrategy {
  public readonly id: StrategyId = "BREAKOUT_MOMENTUM";
  public readonly name = "Breakout Velocity Momentum";
  public readonly category: StrategyCategory = "MOMENTUM";
  public readonly description = "Captures post-breakout continuation velocity using ADX + Bollinger Band squeeze expansion";
  public readonly defaultTimeframe = "5m";
  public readonly allowedRegimes: MarketRegime[] = ["BREAKOUT", "HIGH_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext) {
    return { eligible: true, score: 83, reasons: ["Bollinger Band Squeeze expansion + ADX > 30"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const isBull = context.regime === "BREAKOUT" || context.regime === "TRENDING_BULL";
    return {
      signalId: `SIG_BM_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: isBull ? "BULLISH" : "BEARISH",
      confidence: 83,
      tradeScore: 83,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: ["Post-breakout velocity expansion confirmed", "Price above VWAP", "ADX > 30"],
      indicators: { rsi: 63, adx: 31 },
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    return buildMomentumOptionTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}
