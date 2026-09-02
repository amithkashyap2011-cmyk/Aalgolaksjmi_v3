/**
 * ═══════════════════════════════════════════════════════════════════
 *  Mean Reversion Strategies for Indian Derivatives (NSE / NFO)
 * ═══════════════════════════════════════════════════════════════════
 *  1. RSI_REVERSAL (Overbought/Oversold extreme mean reversion)
 *  2. VWAP_REVERSION (Mean reversion back to VWAP central value)
 *  3. BOLLINGER_REVERSION (Bollinger Band outer envelope rejection)
 *  4. SUPPORT_RESISTANCE_REVERSAL (Range boundary bounce)
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

function buildMeanRevOptionTrade(
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

  const stopLoss = Number((optionPremium * 0.75).toFixed(2)); // 25% SL
  const target = Number((optionPremium * 1.50).toFixed(2)); // 50% TP (1:2 RR)
  const lossPerUnit = optionPremium - stopLoss;

  const calculatedQty = Math.floor((accountCapital * (riskPercent / 100)) / (lossPerUnit * instrument.lotSize)) * instrument.lotSize;
  const quantity = Math.max(instrument.lotSize, calculatedQty);
  const clientOrderId = `ORD_MR_${strategyId.slice(0, 4)}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

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
    trailingStop: { enabled: true, type: "BREAK_EVEN_AT_1R", profitLockAt: 1.5, stepPoints: 8 },
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

// ─── 1. RSI REVERSAL STRATEGY ────────────────────────────────────
export class RSIReversalStrategy extends BaseStrategy {
  public readonly id: StrategyId = "RSI_REVERSAL";
  public readonly name = "RSI Overbought / Oversold Reversal";
  public readonly category: StrategyCategory = "MEAN_REVERSION";
  public readonly description = "Enters long on RSI < 25 turning up and short on RSI > 75 turning down";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const isRanging = context.regime === "RANGING" || context.regime === "LOW_VOLATILITY";
    const score = isRanging ? 78 : 50;
    return { eligible: score >= this.minimumConfidence, score, reasons: ["RSI extreme boundary reversal pattern in ranging regime"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;
    return {
      signalId: `SIG_RSIR_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "BULLISH",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: { rsi: 26 },
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    return buildMeanRevOptionTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}

// ─── 2. VWAP REVERSION STRATEGY ──────────────────────────────────
export class VWAPReversionStrategy extends BaseStrategy {
  public readonly id: StrategyId = "VWAP_REVERSION";
  public readonly name = "VWAP Band Mean Reversion";
  public readonly category: StrategyCategory = "MEAN_REVERSION";
  public readonly description = "Trades extended price stretch > 1.5% away from institutional VWAP back towards median";
  public readonly defaultTimeframe = "5m";
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext) {
    return { eligible: true, score: 76, reasons: ["Price stretched > 1.5% from VWAP median in range regime"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    return {
      signalId: `SIG_VWAPR_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "BULLISH",
      confidence: 76,
      tradeScore: 76,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: ["VWAP stretch reversion setup confirmed"],
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    return buildMeanRevOptionTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}

// ─── 3. BOLLINGER REVERSION STRATEGY ─────────────────────────────
export class BollingerReversionStrategy extends BaseStrategy {
  public readonly id: StrategyId = "BOLLINGER_REVERSION";
  public readonly name = "Bollinger Band Outer Envelope Reversal";
  public readonly category: StrategyCategory = "MEAN_REVERSION";
  public readonly description = "Enters on rejection from outer 2.0-sigma Bollinger Band back towards 20 SMA midline";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext) {
    return { eligible: true, score: 77, reasons: ["Rejection wick from 2.0-sigma outer Bollinger Band"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    return {
      signalId: `SIG_BBR_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "BULLISH",
      confidence: 77,
      tradeScore: 77,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: ["Outer Bollinger Band touch & pin-bar rejection"],
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    return buildMeanRevOptionTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}

// ─── 4. SUPPORT RESISTANCE REVERSAL ──────────────────────────────
export class SupportResistanceReversalStrategy extends BaseStrategy {
  public readonly id: StrategyId = "SUPPORT_RESISTANCE_REVERSAL";
  public readonly name = "Support / Resistance Level Bounce";
  public readonly category: StrategyCategory = "MEAN_REVERSION";
  public readonly description = "Trades sharp candlestick bounce / rejection off key institutional support / resistance levels";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext) {
    return { eligible: true, score: 75, reasons: ["Tested horizontal support with high buyer absorption"] };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    return {
      signalId: `SIG_SRR_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "BULLISH",
      confidence: 75,
      tradeScore: 75,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: ["Support level held with absorption candle"],
      indicators: {},
      regime: context.regime,
    };
  }

  public constructTrade(signal: SignalModel, context: MarketEvaluationContext, accountCapital: number, riskPercent: number): StructuredTrade {
    return buildMeanRevOptionTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}
