/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Directional Options Strategy (LONG_CALL & LONG_PUT)
 * ═══════════════════════════════════════════════════════════════════
 */

import { IIndianStrategy, StrategyEvaluationContext } from "./IIndianStrategy.js";
import { IndianTradeSignal, IndianStrategyType, IndianStrategyLeg } from "../types.js";
import { StrikeSelector } from "../StrikeSelector.js";
import { ExpiryResolver } from "../ExpiryResolver.js";
import { InstrumentMaster } from "../InstrumentMaster.js";

export class DirectionalOptionStrategy implements IIndianStrategy {
  public readonly strategyName: IndianStrategyType;
  public readonly description: string;
  public readonly isMultiLeg = false;

  constructor(isCall: boolean = true) {
    this.strategyName = isCall ? "LONG_CALL" : "LONG_PUT";
    this.description = isCall ? "Long Call Option on Bullish Momentum" : "Long Put Option on Bearish Breakdown";
  }

  public evaluate(context: StrategyEvaluationContext): IndianTradeSignal | null {
    const isBull = this.strategyName === "LONG_CALL";
    const rsi = context.rsi14 || 50;
    const adx = context.adx14 || 25;
    const spot = context.spotPrice;
    const vwap = context.vwap || spot;

    // Entry Conditions
    let hasSignal = false;
    let confidence = 50;
    const reasons: string[] = [];

    if (isBull) {
      if (rsi > 58 && spot > vwap && adx > 22) {
        hasSignal = true;
        confidence = Math.min(92, Math.round(55 + (rsi - 50) + (adx * 0.5)));
        reasons.push(`RSI_BULLISH: ${rsi}`, `PRICE_ABOVE_VWAP: ₹${spot} > ₹${vwap}`, `ADX_TREND: ${adx}`);
      }
    } else {
      if (rsi < 42 && spot < vwap && adx > 22) {
        hasSignal = true;
        confidence = Math.min(92, Math.round(55 + (50 - rsi) + (adx * 0.5)));
        reasons.push(`RSI_BEARISH: ${rsi}`, `PRICE_BELOW_VWAP: ₹${spot} < ₹${vwap}`, `ADX_TREND: ${adx}`);
      }
    }

    if (!hasSignal) return null;

    return {
      signalId: `SIG_${this.strategyName}_${Date.now()}`,
      timestamp: Date.now(),
      underlying: context.underlying,
      direction: isBull ? "LONG" : "SHORT",
      strategy: this.strategyName,
      confidence,
      tradeScore: confidence,
      entryReasons: reasons,
      suggestedStrikeMethod: "ATM",
      expiryType: "NEAREST_VALID_EXPIRY",
      indicators: { rsi, adx, vwap, atr: context.atr14 }
    };
  }

  public constructLegs(signal: IndianTradeSignal, spotPrice: number, quantity: number): IndianStrategyLeg[] {
    const isCall = signal.strategy === "LONG_CALL";
    const instrument = isCall ? "CE" : "PE";
    const strikeRes = StrikeSelector.selectStrike(signal.underlying, spotPrice, instrument, "ATM");
    const expiryRes = ExpiryResolver.resolveExpiry(signal.underlying, "NEAREST_VALID_EXPIRY");
    const lotSize = InstrumentMaster.getLotSize(signal.underlying);

    return [{
      legId: `LEG_1_${Date.now()}`,
      action: "BUY",
      instrument,
      strike: strikeRes.strike,
      expiry: expiryRes.expiryDate,
      quantity,
      lotSize,
      entryPrice: strikeRes.theoreticalPremiumINR,
      status: "PENDING",
      pnl: 0,
      pnlPercent: 0
    }];
  }
}
