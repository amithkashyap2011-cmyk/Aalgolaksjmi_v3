/**
 * ═══════════════════════════════════════════════════════════════════
 *  Base Strategy Abstract Class for Indian Market Strategies
 * ═══════════════════════════════════════════════════════════════════
 */

import {
  EntryType,
  ExitType,
  InstrumentType,
  MarketEvaluationContext,
  MarketRegime,
  SignalModel,
  StrategyCategory,
  StrategyId,
  StructuredTrade,
  TradeDirection,
  TradeLeg,
  TradeStatus,
  UnderlyingSymbol,
} from "../strategyTypes.js";
import { InstrumentMaster } from "../instrumentMaster.js";
import { ExpiryResolver } from "../expiryResolver.js";
import { StrikeSelector } from "../strikeSelector.js";
import { OptionChainService } from "../optionChainService.js";
import { IndianCostModel } from "../costModel.js";

export abstract class BaseStrategy {
  public abstract readonly id: StrategyId;
  public abstract readonly name: string;
  public abstract readonly category: StrategyCategory;
  public abstract readonly description: string;
  public abstract readonly defaultTimeframe: string;
  public abstract readonly allowedRegimes: MarketRegime[];

  public enabled: boolean = true;
  public minimumConfidence: number = 70; // 0-100 threshold
  public maxTradesPerDay: number = 5;
  public defaultRiskRewardRatio: number = 2.0;

  /**
   * 1. Evaluate market context against strategy indicators
   */
  public abstract evaluateMarket(context: MarketEvaluationContext): {
    eligible: boolean;
    score: number;
    reasons: string[];
  };

  /**
   * 2. Generate structured trading signal
   */
  public abstract generateSignal(context: MarketEvaluationContext): SignalModel | null;

  /**
   * 3. Validate entry rules & conditions
   */
  public validateEntry(signal: SignalModel, context: MarketEvaluationContext): boolean {
    if (!this.enabled) return false;
    if (signal.confidence < this.minimumConfidence) return false;
    if (signal.direction === "NEUTRAL") return false;
    if (!this.allowedRegimes.includes(context.regime)) return false;
    return true;
  }

  /**
   * 4. Construct complete Trade Object with legs & risk metrics
   */
  public abstract constructTrade(
    signal: SignalModel,
    context: MarketEvaluationContext,
    accountCapital: number,
    riskPercent: number
  ): StructuredTrade;

  /**
   * 5. Position Sizing calculation
   */
  public calculatePositionSize(
    accountCapital: number,
    riskPercent: number,
    lossPerUnit: number,
    lotSize: number
  ): number {
    if (lossPerUnit <= 0 || lotSize <= 0) return lotSize;
    const maxRiskAmount = accountCapital * (riskPercent / 100);
    const calculatedQty = Math.floor(maxRiskAmount / (lossPerUnit * lotSize)) * lotSize;
    return Math.max(lotSize, calculatedQty);
  }

  /**
   * 6. Manage open position / evaluate trailing stop modifications
   */
  public manageOpenPosition(
    trade: StructuredTrade,
    currentPrice: number,
    highSinceEntry: number,
    lowSinceEntry: number
  ): {
    slModified: boolean;
    newStopLoss?: number;
    reason?: string;
  } {
    if (!trade.trailingStop.enabled) return { slModified: false };

    const isLong = trade.position === "LONG";
    const initialRisk = Math.abs(trade.entryPrice - trade.stopLoss);
    if (initialRisk <= 0) return { slModified: false };

    const currentProfit = isLong ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;
    const rMultiple = currentProfit / initialRisk;

    // Rule 1: Break-even at +1.0R
    if (rMultiple >= 0.98) {
      const targetSL = trade.entryPrice;
      if (isLong && trade.stopLoss < targetSL) {
        return { slModified: true, newStopLoss: targetSL, reason: "Break-Even Shift (+1.0R reached)" };
      }
      if (!isLong && trade.stopLoss > targetSL) {
        return { slModified: true, newStopLoss: targetSL, reason: "Break-Even Shift (+1.0R reached)" };
      }
    }

    // Rule 2: Profit Lock at +1.5R (lock +0.5R)
    if (rMultiple >= 1.48 && (trade.trailingStop.profitLockAt ?? 1.5) <= 1.5) {
      const lockedSL = isLong ? trade.entryPrice + 0.5 * initialRisk : trade.entryPrice - 0.5 * initialRisk;
      if (isLong && trade.stopLoss < lockedSL) {
        return { slModified: true, newStopLoss: Number(lockedSL.toFixed(2)), reason: "Profit-Lock Shift (+1.5R -> locked +0.5R)" };
      }
      if (!isLong && trade.stopLoss > lockedSL) {
        return { slModified: true, newStopLoss: Number(lockedSL.toFixed(2)), reason: "Profit-Lock Shift (+1.5R -> locked +0.5R)" };
      }
    }

    // Rule 3: Continuous Step Trailing at +2.0R+
    if (rMultiple >= 2.0) {
      const stepDistance = (trade.trailingStop.stepPoints || initialRisk * 0.5);
      const stepSL = isLong ? currentPrice - stepDistance : currentPrice + stepDistance;
      if (isLong && stepSL > trade.stopLoss) {
        return { slModified: true, newStopLoss: Number(stepSL.toFixed(2)), reason: "Step Trailing Stop update (+2R+ step trail)" };
      }
      if (!isLong && stepSL < trade.stopLoss) {
        return { slModified: true, newStopLoss: Number(stepSL.toFixed(2)), reason: "Step Trailing Stop update (+2R+ step trail)" };
      }
    }

    return { slModified: false };
  }

  /**
   * 7. Evaluate exit condition
   */
  public evaluateExit(
    trade: StructuredTrade,
    currentPrice: number,
    currentSignal?: SignalModel
  ): {
    shouldExit: boolean;
    exitType?: ExitType;
    reason?: string;
  } {
    const isLong = trade.position === "LONG";

    // 1. Stop Loss Hit
    if (isLong && currentPrice <= trade.stopLoss) {
      return { shouldExit: true, exitType: "STOP_LOSS", reason: `Stop-Loss triggered (LTP ₹${currentPrice} <= SL ₹${trade.stopLoss})` };
    }
    if (!isLong && currentPrice >= trade.stopLoss) {
      return { shouldExit: true, exitType: "STOP_LOSS", reason: `Stop-Loss triggered (LTP ₹${currentPrice} >= SL ₹${trade.stopLoss})` };
    }

    // 2. Target Hit
    if (isLong && currentPrice >= trade.target) {
      return { shouldExit: true, exitType: "TARGET", reason: `Target profit hit (LTP ₹${currentPrice} >= Target ₹${trade.target})` };
    }
    if (!isLong && currentPrice <= trade.target) {
      return { shouldExit: true, exitType: "TARGET", reason: `Target profit hit (LTP ₹${currentPrice} <= Target ₹${trade.target})` };
    }

    // 3. Signal Reversal Exit
    if (currentSignal && currentSignal.confidence >= 75) {
      if (isLong && currentSignal.direction === "BEARISH") {
        return { shouldExit: true, exitType: "SIGNAL_REVERSAL", reason: `Signal reversed to BEARISH with ${currentSignal.confidence}% confidence` };
      }
      if (!isLong && currentSignal.direction === "BULLISH") {
        return { shouldExit: true, exitType: "SIGNAL_REVERSAL", reason: `Signal reversed to BULLISH with ${currentSignal.confidence}% confidence` };
      }
    }

    return { shouldExit: false };
  }
}
