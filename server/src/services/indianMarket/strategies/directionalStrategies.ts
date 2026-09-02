/**
 * ═══════════════════════════════════════════════════════════════════
 *  Directional Strategies for Indian Derivatives (NSE / NFO)
 * ═══════════════════════════════════════════════════════════════════
 *  1. LONG_CALL (NIFTY/BANKNIFTY CE Buy)
 *  2. LONG_PUT (NIFTY/BANKNIFTY PE Buy)
 *  3. LONG_FUTURE (NIFTY/BANKNIFTY Futures Long)
 *  4. SHORT_FUTURE (NIFTY/BANKNIFTY Futures Short)
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

// Helper to calculate basic RSI from bar closes
function calculateRsi(bars: any[], period = 14): number {
  if (!bars || bars.length < period + 1) return 50;
  const closes = bars.map((b) => b.close ?? b.ltp ?? b);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(1));
}

// ─── 1. LONG CALL STRATEGY (CE BUY) ──────────────────────────────
export class LongCallStrategy extends BaseStrategy {
  public readonly id: StrategyId = "LONG_CALL";
  public readonly name = "Index Call Option Buy (Long CE)";
  public readonly category: StrategyCategory = "DIRECTIONAL";
  public readonly description = "Buys ATM / slightly ITM Call options during bullish momentum / breakout expansions";
  public readonly defaultTimeframe = "5m";
  public readonly allowedRegimes: MarketRegime[] = ["TRENDING_BULL", "BREAKOUT", "HIGH_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const rsi = calculateRsi(context.bars5m);
    const pcr = context.optionChain?.pcr ?? 1.0;
    const isBullRegime = context.regime === "TRENDING_BULL" || context.regime === "BREAKOUT";

    let score = 50;
    const reasons: string[] = [];

    if (isBullRegime) {
      score += 20;
      reasons.push("Bullish market regime confirmed");
    }
    if (rsi >= 58 && rsi <= 78) {
      score += 15;
      reasons.push(`RSI momentum bullish (${rsi})`);
    }
    if (pcr >= 1.05) {
      score += 10;
      reasons.push(`PCR bullish sentiment (${pcr})`);
    }

    return {
      eligible: score >= this.minimumConfidence,
      score,
      reasons,
    };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;

    const rsi = calculateRsi(context.bars5m);
    return {
      signalId: `SIG_LC_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "BULLISH",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: { rsi, pcr: context.optionChain?.pcr },
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
    const strikeInfo = StrikeSelector.selectStrike(context.underlying, "CE", context.spotPrice, { method: "ATM_OFFSET", offset: 0 }, context.optionChain);
    const instrument = InstrumentMaster.resolveInstrument(context.underlying, "CE", expiryInfo.date, strikeInfo.strike);

    const dteYears = Math.max(0.5, (expiryInfo.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) / 365;
    const optionPremium = OptionChainService.calculateTheoreticalPrice(context.spotPrice, strikeInfo.strike, dteYears, 0.15, true);
    const greeks = OptionChainService.calculateBlackScholesGreeks(context.spotPrice, strikeInfo.strike, dteYears, 0.15, true);

    const stopLoss = Number((optionPremium * 0.70).toFixed(2)); // 30% stop loss on premium
    const target = Number((optionPremium * 1.60).toFixed(2)); // 60% profit target (1:2 RR)
    const lossPerUnit = optionPremium - stopLoss;

    const quantity = this.calculatePositionSize(accountCapital, riskPercent, lossPerUnit, instrument.lotSize);
    const clientOrderId = `ORD_LC_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const leg: TradeLeg = {
      legId: `LEG_1_${clientOrderId}`,
      action: "BUY",
      instrumentType: "CE",
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
      instrumentType: "CE",
      action: "BUY",
      price: optionPremium,
      quantity,
      strikePrice: strikeInfo.strike,
    });

    return {
      tradeId: `TRD_${clientOrderId}`,
      strategyInstanceId: `STRAT_${this.id}_${context.underlying}`,
      userId: "user-system",
      mode: "PAPER",
      exchange: instrument.exchange,
      underlying: context.underlying,
      instrument: "CE",
      position: "LONG",
      strategy: this.id,
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
}

// ─── 2. LONG PUT STRATEGY (PE BUY) ──────────────────────────────
export class LongPutStrategy extends BaseStrategy {
  public readonly id: StrategyId = "LONG_PUT";
  public readonly name = "Index Put Option Buy (Long PE)";
  public readonly category: StrategyCategory = "DIRECTIONAL";
  public readonly description = "Buys ATM / slightly ITM Put options during bearish breakdowns / downward momentum";
  public readonly defaultTimeframe = "5m";
  public readonly allowedRegimes: MarketRegime[] = ["TRENDING_BEAR", "BREAKOUT", "HIGH_VOLATILITY"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const rsi = calculateRsi(context.bars5m);
    const pcr = context.optionChain?.pcr ?? 1.0;
    const isBearRegime = context.regime === "TRENDING_BEAR" || context.regime === "BREAKOUT";

    let score = 50;
    const reasons: string[] = [];

    if (isBearRegime) {
      score += 20;
      reasons.push("Bearish market regime confirmed");
    }
    if (rsi <= 42 && rsi >= 22) {
      score += 15;
      reasons.push(`RSI downward momentum (${rsi})`);
    }
    if (pcr <= 0.85) {
      score += 10;
      reasons.push(`PCR bearish sentiment (${pcr})`);
    }

    return {
      eligible: score >= this.minimumConfidence,
      score,
      reasons,
    };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;

    const rsi = calculateRsi(context.bars5m);
    return {
      signalId: `SIG_LP_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "BEARISH",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: { rsi, pcr: context.optionChain?.pcr },
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
    const strikeInfo = StrikeSelector.selectStrike(context.underlying, "PE", context.spotPrice, { method: "ATM_OFFSET", offset: 0 }, context.optionChain);
    const instrument = InstrumentMaster.resolveInstrument(context.underlying, "PE", expiryInfo.date, strikeInfo.strike);

    const dteYears = Math.max(0.5, (expiryInfo.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) / 365;
    const optionPremium = OptionChainService.calculateTheoreticalPrice(context.spotPrice, strikeInfo.strike, dteYears, 0.15, false);
    const greeks = OptionChainService.calculateBlackScholesGreeks(context.spotPrice, strikeInfo.strike, dteYears, 0.15, false);

    const stopLoss = Number((optionPremium * 0.70).toFixed(2));
    const target = Number((optionPremium * 1.60).toFixed(2));
    const lossPerUnit = optionPremium - stopLoss;

    const quantity = this.calculatePositionSize(accountCapital, riskPercent, lossPerUnit, instrument.lotSize);
    const clientOrderId = `ORD_LP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const leg: TradeLeg = {
      legId: `LEG_1_${clientOrderId}`,
      action: "BUY",
      instrumentType: "PE",
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
      instrumentType: "PE",
      action: "BUY",
      price: optionPremium,
      quantity,
      strikePrice: strikeInfo.strike,
    });

    return {
      tradeId: `TRD_${clientOrderId}`,
      strategyInstanceId: `STRAT_${this.id}_${context.underlying}`,
      userId: "user-system",
      mode: "PAPER",
      exchange: instrument.exchange,
      underlying: context.underlying,
      instrument: "PE",
      position: "LONG",
      strategy: this.id,
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
}

// ─── 3. LONG FUTURE STRATEGY ─────────────────────────────────────
export class LongFutureStrategy extends BaseStrategy {
  public readonly id: StrategyId = "LONG_FUTURE";
  public readonly name = "Index Future Long Position";
  public readonly category: StrategyCategory = "DIRECTIONAL";
  public readonly description = "Enters Long index futures contract on strong multi-timeframe trend alignment";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["TRENDING_BULL", "BREAKOUT"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const rsi = calculateRsi(context.bars15m);
    let score = 50;
    const reasons: string[] = [];

    if (context.regime === "TRENDING_BULL") {
      score += 25;
      reasons.push("Strong 15m Bullish Trend Regime");
    }
    if (rsi >= 55 && rsi <= 72) {
      score += 15;
      reasons.push(`Healthy Trend RSI (${rsi})`);
    }

    return {
      eligible: score >= this.minimumConfidence,
      score,
      reasons,
    };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;

    return {
      signalId: `SIG_LF_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "BULLISH",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: { rsi: calculateRsi(context.bars15m) },
      regime: context.regime,
    };
  }

  public constructTrade(
    signal: SignalModel,
    context: MarketEvaluationContext,
    accountCapital: number,
    riskPercent: number
  ): StructuredTrade {
    const expiryInfo = ExpiryResolver.resolveExpiry(context.underlying, { type: "MONTHLY" });
    const instrument = InstrumentMaster.resolveInstrument(context.underlying, "FUTURE", expiryInfo.date);
    const entryPrice = context.futuresPrice || Number((context.spotPrice * 1.002).toFixed(2));

    const atrEst = entryPrice * 0.008; // 0.8% ATR stop
    const stopLoss = Number((entryPrice - atrEst).toFixed(2));
    const target = Number((entryPrice + atrEst * 2.0).toFixed(2));
    const lossPerUnit = entryPrice - stopLoss;

    const quantity = this.calculatePositionSize(accountCapital, riskPercent, lossPerUnit, instrument.lotSize);
    const clientOrderId = `ORD_LF_${Date.now()}`;

    const leg: TradeLeg = {
      legId: `LEG_1_${clientOrderId}`,
      action: "BUY",
      instrumentType: "FUTURE",
      strike: 0,
      expiry: expiryInfo.expiry,
      tradingSymbol: instrument.tradingSymbol,
      token: instrument.token,
      quantity,
      lotSize: instrument.lotSize,
      entryPrice,
      status: "OPEN",
      pnl: 0,
    };

    const costBreakdown = IndianCostModel.calculateOrderCost({
      instrumentType: "FUTURE",
      action: "BUY",
      price: entryPrice,
      quantity,
    });

    return {
      tradeId: `TRD_${clientOrderId}`,
      strategyInstanceId: `STRAT_${this.id}_${context.underlying}`,
      userId: "user-system",
      mode: "PAPER",
      exchange: instrument.exchange,
      underlying: context.underlying,
      instrument: "FUTURE",
      position: "LONG",
      strategy: this.id,
      expiry: expiryInfo.expiry,
      quantity,
      lotSize: instrument.lotSize,
      entryType: "MARKET",
      entryPrice,
      averageEntryPrice: entryPrice,
      stopLoss,
      target,
      trailingStop: { enabled: true, type: "BREAK_EVEN_AT_1R", profitLockAt: 1.5, stepPoints: 25 },
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
}

// ─── 4. SHORT FUTURE STRATEGY ────────────────────────────────────
export class ShortFutureStrategy extends BaseStrategy {
  public readonly id: StrategyId = "SHORT_FUTURE";
  public readonly name = "Index Future Short Position";
  public readonly category: StrategyCategory = "DIRECTIONAL";
  public readonly description = "Sells short index futures contract on strong multi-timeframe bearish alignment";
  public readonly defaultTimeframe = "15m";
  public readonly allowedRegimes: MarketRegime[] = ["TRENDING_BEAR", "BREAKOUT"];

  public evaluateMarket(context: MarketEvaluationContext) {
    const rsi = calculateRsi(context.bars15m);
    let score = 50;
    const reasons: string[] = [];

    if (context.regime === "TRENDING_BEAR") {
      score += 25;
      reasons.push("Strong 15m Bearish Trend Regime");
    }
    if (rsi <= 45 && rsi >= 28) {
      score += 15;
      reasons.push(`Healthy Trend RSI (${rsi})`);
    }

    return {
      eligible: score >= this.minimumConfidence,
      score,
      reasons,
    };
  }

  public generateSignal(context: MarketEvaluationContext): SignalModel | null {
    const evalRes = this.evaluateMarket(context);
    if (!evalRes.eligible) return null;

    return {
      signalId: `SIG_SF_${Date.now()}`,
      timestamp: new Date().toISOString(),
      underlying: context.underlying,
      direction: "BEARISH",
      confidence: evalRes.score,
      tradeScore: evalRes.score,
      strategy: this.id,
      timeframe: this.defaultTimeframe,
      entryReason: evalRes.reasons,
      indicators: { rsi: calculateRsi(context.bars15m) },
      regime: context.regime,
    };
  }

  public constructTrade(
    signal: SignalModel,
    context: MarketEvaluationContext,
    accountCapital: number,
    riskPercent: number
  ): StructuredTrade {
    const expiryInfo = ExpiryResolver.resolveExpiry(context.underlying, { type: "MONTHLY" });
    const instrument = InstrumentMaster.resolveInstrument(context.underlying, "FUTURE", expiryInfo.date);
    const entryPrice = context.futuresPrice || Number((context.spotPrice * 0.998).toFixed(2));

    const atrEst = entryPrice * 0.008;
    const stopLoss = Number((entryPrice + atrEst).toFixed(2));
    const target = Number((entryPrice - atrEst * 2.0).toFixed(2));
    const lossPerUnit = stopLoss - entryPrice;

    const quantity = this.calculatePositionSize(accountCapital, riskPercent, lossPerUnit, instrument.lotSize);
    const clientOrderId = `ORD_SF_${Date.now()}`;

    const leg: TradeLeg = {
      legId: `LEG_1_${clientOrderId}`,
      action: "SELL",
      instrumentType: "FUTURE",
      strike: 0,
      expiry: expiryInfo.expiry,
      tradingSymbol: instrument.tradingSymbol,
      token: instrument.token,
      quantity,
      lotSize: instrument.lotSize,
      entryPrice,
      status: "OPEN",
      pnl: 0,
    };

    const costBreakdown = IndianCostModel.calculateOrderCost({
      instrumentType: "FUTURE",
      action: "SELL",
      price: entryPrice,
      quantity,
    });

    return {
      tradeId: `TRD_${clientOrderId}`,
      strategyInstanceId: `STRAT_${this.id}_${context.underlying}`,
      userId: "user-system",
      mode: "PAPER",
      exchange: instrument.exchange,
      underlying: context.underlying,
      instrument: "FUTURE",
      position: "SHORT",
      strategy: this.id,
      expiry: expiryInfo.expiry,
      quantity,
      lotSize: instrument.lotSize,
      entryType: "MARKET",
      entryPrice,
      averageEntryPrice: entryPrice,
      stopLoss,
      target,
      trailingStop: { enabled: true, type: "BREAK_EVEN_AT_1R", profitLockAt: 1.5, stepPoints: 25 },
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
}
