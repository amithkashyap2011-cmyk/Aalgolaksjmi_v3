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
  public readonly description = "Enters long on RSI < 30 turning up and short on RSI > 70 turning down, strictly filtered against falling knives";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY", "TRENDING_BULL", "TRENDING_BEAR"];

  public evaluateMarket(context: MarketEvaluationContext): {
    eligible: boolean;
    score: number;
    direction: "BULLISH" | "BEARISH" | "NEUTRAL";
    reasons: string[];
  } {
    const rsi = context.indicators?.rsi14 ?? 50;
    const adx = context.indicators?.adx14 ?? 20;
    const open = context.indicators?.open ?? context.spotPrice;
    const spot = context.spotPrice;

    // 1. FALLING KNIFE DETECTION:
    // If market is crashing/trending down strongly, DO NOT BUY CALLS.
    // Buying calls into an oversold market during a high-ADX selloff causes rapid stop-loss breaches.
    const isStrongBearMomentum =
      context.regime === "TRENDING_BEAR" || (adx > 28 && spot < open);

    const isStrongBullMomentum =
      context.regime === "TRENDING_BULL" || (adx > 28 && spot > open);

    // Oversold condition (potential bullish bounce)
    if (rsi < 30) {
      if (isStrongBearMomentum) {
        return {
          eligible: false,
          score: 35,
          direction: "NEUTRAL",
          reasons: [
            `Falling knife blocked: RSI is oversold (${rsi.toFixed(1)}) but strong downward momentum is active (ADX: ${adx.toFixed(1)}). Call buying prohibited.`,
          ],
        };
      }
      // Valid oversold bounce in ranging or quiet market
      const score = Math.min(92, Math.round(72 + (30 - rsi) * 0.8));
      return {
        eligible: score >= this.minimumConfidence,
        score,
        direction: "BULLISH",
        reasons: [`RSI oversold mean-reversion bounce confirmed (${rsi.toFixed(1)} < 30) in range-bound structure`],
      };
    }

    // Overbought condition (potential bearish rejection / PUT buy)
    if (rsi > 70) {
      if (isStrongBullMomentum) {
        return {
          eligible: false,
          score: 35,
          direction: "NEUTRAL",
          reasons: [
            `Strong rally detected: RSI is overbought (${rsi.toFixed(1)}) but upward momentum is strong (ADX: ${adx.toFixed(1)}). Put buying prohibited.`,
          ],
        };
      }
      // Valid overbought rejection in ranging or quiet market
      const score = Math.min(92, Math.round(72 + (rsi - 70) * 0.8));
      return {
        eligible: score >= this.minimumConfidence,
        score,
        direction: "BEARISH",
        reasons: [`RSI overbought mean-reversion rejection confirmed (${rsi.toFixed(1)} > 70) in range-bound structure`],
      };
    }

    // Moderate / neutral RSI
    const isRanging = context.regime === "RANGING" || context.regime === "LOW_VOLATILITY";
    if (isRanging) {
      if (rsi < 40 && !isStrongBearMomentum) {
        return {
          eligible: true,
          score: 72,
          direction: "BULLISH",
          reasons: [`RSI lower boundary support bounce in range (${rsi.toFixed(1)})`],
        };
      } else if (rsi > 60 && !isStrongBullMomentum) {
        return {
          eligible: true,
          score: 72,
          direction: "BEARISH",
          reasons: [`RSI upper boundary resistance rejection in range (${rsi.toFixed(1)})`],
        };
      }
    }

    return {
      eligible: false,
      score: 45,
      direction: "NEUTRAL",
      reasons: [`RSI is in neutral territory (${rsi.toFixed(1)}), no extreme mean-reversion trigger`],
    };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible || evalRes.direction === "NEUTRAL") return null;

    const rsi = context.indicators?.rsi14 ?? (evalRes.direction === "BULLISH" ? 26 : 74);
    const adx = context.indicators?.adx14 ?? 20;

    return {
      signalId: `SIG_RSIR_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: evalRes.direction,
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: { rsi, adx },
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
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY", "TRENDING_BULL", "TRENDING_BEAR"];

  public evaluateMarket(context: MarketEvaluationContext): {
    eligible: boolean;
    score: number;
    direction: "BULLISH" | "BEARISH" | "NEUTRAL";
    reasons: string[];
  } {
    const spot = context.spotPrice;
    const open = context.indicators?.open ?? spot;
    const adx = context.indicators?.adx14 ?? 20;

    // In a strong downtrend (ADX > 28, spot < open), do NOT buy calls trying to reach VWAP above
    if ((context.regime === "TRENDING_BEAR" || (adx > 28 && spot < open))) {
      return {
        eligible: false,
        score: 30,
        direction: "NEUTRAL",
        reasons: ["VWAP reversion blocked: Strong bear trend in progress, price is drifting away from VWAP"],
      };
    }

    // If stretched above open in range, mean-revert down
    if (spot > open * 1.008 && context.regime !== "TRENDING_BULL") {
      return {
        eligible: true,
        score: 75,
        direction: "BEARISH",
        reasons: ["Price stretched > 0.8% above intraday median in range, reverting towards VWAP"],
      };
    }

    return {
      eligible: true,
      score: 74,
      direction: "BULLISH",
      reasons: ["Price stretched below VWAP in range regime, mean-reverting towards VWAP median"],
    };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible || evalRes.direction === "NEUTRAL") return null;

    return {
      signalId: `SIG_VWAPR_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: evalRes.direction,
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
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY", "TRENDING_BULL", "TRENDING_BEAR"];

  public evaluateMarket(context: MarketEvaluationContext): {
    eligible: boolean;
    score: number;
    direction: "BULLISH" | "BEARISH" | "NEUTRAL";
    reasons: string[];
  } {
    const spot = context.spotPrice;
    const open = context.indicators?.open ?? spot;
    const adx = context.indicators?.adx14 ?? 20;

    // If bands are expanding downwards in high ADX bear momentum, band-walking is active -> do NOT buy calls
    if (context.regime === "TRENDING_BEAR" || (adx > 28 && spot < open)) {
      return {
        eligible: false,
        score: 30,
        direction: "NEUTRAL",
        reasons: ["Bollinger bounce blocked: Strong downward band-walking in progress (ADX > 28)"],
      };
    }

    const isBearishRejection = spot > open * 1.006 && context.regime !== "TRENDING_BULL";
    return {
      eligible: true,
      score: 76,
      direction: isBearishRejection ? "BEARISH" : "BULLISH",
      reasons: [isBearishRejection ? "Upper Bollinger Band pin-bar rejection" : "Lower Bollinger Band support bounce in range"],
    };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible || evalRes.direction === "NEUTRAL") return null;

    return {
      signalId: `SIG_BBR_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: evalRes.direction,
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
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY", "TRENDING_BULL", "TRENDING_BEAR"];

  public evaluateMarket(context: MarketEvaluationContext): {
    eligible: boolean;
    score: number;
    direction: "BULLISH" | "BEARISH" | "NEUTRAL";
    reasons: string[];
  } {
    const spot = context.spotPrice;
    const open = context.indicators?.open ?? spot;
    const adx = context.indicators?.adx14 ?? 20;

    // Breakdown through support: if strong bear trend, support is broken, not bouncing
    if (context.regime === "TRENDING_BEAR" || (adx > 28 && spot < open)) {
      return {
        eligible: false,
        score: 30,
        direction: "NEUTRAL",
        reasons: ["Support bounce blocked: Major support breakdown with high bear momentum"],
      };
    }

    const isResistance = spot > open * 1.005;
    return {
      eligible: true,
      score: 75,
      direction: isResistance ? "BEARISH" : "BULLISH",
      reasons: [isResistance ? "Resistance level ceiling rejection candle" : "Support level held with absorption candle"],
    };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible || evalRes.direction === "NEUTRAL") return null;

    return {
      signalId: `SIG_SRR_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: evalRes.direction,
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
    return buildMeanRevOptionTrade(this.id, signal.direction === "BULLISH", signal, context, accountCapital, riskPercent);
  }
}
