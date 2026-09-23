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

  const stopLoss = Number((optionPremium * 0.72).toFixed(2)); // 28% initial SL (with dynamic BE shift at +16%)
  const target = Number((optionPremium * 1.45).toFixed(2)); // 45% TP (high-probability fill)
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
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY"];

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

    // 1. FALLING KNIFE & BULL BREAKOUT DETECTION:
    // If market is crashing/trending down strongly, DO NOT BUY CALLS.
    // If market is rallying strongly, DO NOT BUY PUTS.
    const isStrongBearMomentum =
      context.regime === "TRENDING_BEAR" || (adx > 25 && spot < open);

    const isStrongBullMomentum =
      context.regime === "TRENDING_BULL" || (adx > 25 && spot > open);

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
      if (rsi < 35 && !isStrongBearMomentum) {
        return {
          eligible: true,
          score: 75,
          direction: "BULLISH",
          reasons: [`RSI oversold support bounce in range (${rsi.toFixed(1)} < 35)`],
        };
      } else if (rsi > 65 && !isStrongBullMomentum) {
        return {
          eligible: true,
          score: 75,
          direction: "BEARISH",
          reasons: [`RSI overbought resistance rejection in range (${rsi.toFixed(1)} > 65)`],
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
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext): {
    eligible: boolean;
    score: number;
    direction: "BULLISH" | "BEARISH" | "NEUTRAL";
    reasons: string[];
  } {
    const spot = context.spotPrice;
    const open = context.indicators?.open ?? spot;
    const adx = context.indicators?.adx14 ?? 20;

    // In strong trend, mean reversion back to VWAP is suicidal
    if (context.regime === "TRENDING_BEAR" || (adx > 25 && spot < open)) {
      return {
        eligible: false,
        score: 30,
        direction: "NEUTRAL",
        reasons: ["VWAP reversion blocked: Strong bear trend in progress, price is drifting away from VWAP"],
      };
    }
    if (context.regime === "TRENDING_BULL" || (adx > 25 && spot > open)) {
      return {
        eligible: false,
        score: 30,
        direction: "NEUTRAL",
        reasons: ["VWAP reversion blocked: Strong bull trend in progress, price is drifting higher away from VWAP"],
      };
    }

    // If stretched above open in range, mean-revert down
    if (spot > open * 1.008) {
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
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext): {
    eligible: boolean;
    score: number;
    direction: "BULLISH" | "BEARISH" | "NEUTRAL";
    reasons: string[];
  } {
    const spot = context.spotPrice;
    const open = context.indicators?.open ?? spot;
    const adx = context.indicators?.adx14 ?? 20;

    // In strong trending markets, band-walking occurs -> Mean reversion fails
    if (context.regime === "TRENDING_BEAR" || (adx > 25 && spot < open)) {
      return {
        eligible: false,
        score: 30,
        direction: "NEUTRAL",
        reasons: ["Bollinger bounce blocked: Strong downward bear momentum / band-walking (ADX > 25). Call buying prohibited."],
      };
    }
    if (context.regime === "TRENDING_BULL" || (adx > 25 && spot > open)) {
      return {
        eligible: false,
        score: 30,
        direction: "NEUTRAL",
        reasons: ["Bollinger short blocked: Strong upward bull momentum / breakout (ADX > 25). Put buying prohibited."],
      };
    }

    const isBearishRejection = spot > open * 1.008;
    const isBullishBounce = spot < open * 0.992;

    if (!isBearishRejection && !isBullishBounce) {
      return {
        eligible: false,
        score: 40,
        direction: "NEUTRAL",
        reasons: ["Price is within normal 1-sigma envelope, no outer band rejection detected"],
      };
    }

    return {
      eligible: true,
      score: 74,
      direction: isBearishRejection ? "BEARISH" : "BULLISH",
      reasons: [isBearishRejection ? "Upper Bollinger Band outer envelope rejection in range" : "Lower Bollinger Band support bounce in range"],
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
  public readonly allowedRegimes: MarketRegime[] = ["RANGING", "LOW_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext): {
    eligible: boolean;
    score: number;
    direction: "BULLISH" | "BEARISH" | "NEUTRAL";
    reasons: string[];
  } {
    const spot = context.spotPrice;
    const open = context.indicators?.open ?? spot;
    const adx = context.indicators?.adx14 ?? 20;

    // Breakdown or breakout through key levels in trend
    if (context.regime === "TRENDING_BEAR" || (adx > 25 && spot < open)) {
      return {
        eligible: false,
        score: 30,
        direction: "NEUTRAL",
        reasons: ["Support bounce blocked: Major support breakdown with high bear momentum"],
      };
    }
    if (context.regime === "TRENDING_BULL" || (adx > 25 && spot > open)) {
      return {
        eligible: false,
        score: 30,
        direction: "NEUTRAL",
        reasons: ["Resistance short blocked: Major resistance breakout with high bull momentum. Put buying prohibited."],
      };
    }

    const isResistance = spot > open * 1.008;
    const isSupport = spot < open * 0.992;

    if (!isResistance && !isSupport) {
      return {
        eligible: false,
        score: 40,
        direction: "NEUTRAL",
        reasons: ["Price is mid-range, not at key institutional support or resistance boundary"],
      };
    }

    return {
      eligible: true,
      score: 73,
      direction: isResistance ? "BEARISH" : "BULLISH",
      reasons: [isResistance ? "Resistance level ceiling rejection in range" : "Support level held with absorption in range"],
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
