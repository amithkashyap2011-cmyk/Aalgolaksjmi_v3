/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Multi-Leg Options Spread Strategy (Spreads, Straddles, Condor)
 * ═══════════════════════════════════════════════════════════════════
 */

import { IIndianStrategy, StrategyEvaluationContext } from "./IIndianStrategy.js";
import { IndianTradeSignal, IndianStrategyType, IndianStrategyLeg } from "../types.js";
import { StrikeSelector } from "../StrikeSelector.js";
import { ExpiryResolver } from "../ExpiryResolver.js";
import { InstrumentMaster } from "../InstrumentMaster.js";

export class MultiLegSpreadStrategy implements IIndianStrategy {
  public readonly strategyName: IndianStrategyType;
  public readonly description: string;
  public readonly isMultiLeg = true;

  constructor(strategyType: IndianStrategyType) {
    this.strategyName = strategyType;
    this.description = `Multi-Leg Options Strategy: ${strategyType}`;
  }

  public evaluate(context: StrategyEvaluationContext): IndianTradeSignal | null {
    const rsi = context.rsi14 || 50;
    const adx = context.adx14 || 25;
    const spot = context.spotPrice;
    const vwap = context.vwap || spot;

    let confidence = 75;
    const reasons: string[] = [];

    switch (this.strategyName) {
      case "BULL_CALL_SPREAD":
        if (rsi > 55 && spot > vwap) {
          confidence = 82;
          reasons.push("MODERATE_BULLISH_BIAS", "SPREAD_HEDGED_DOWNSIDE", `RSI=${rsi}`);
          break;
        }
        return null;

      case "BEAR_PUT_SPREAD":
        if (rsi < 45 && spot < vwap) {
          confidence = 82;
          reasons.push("MODERATE_BEARISH_BIAS", "SPREAD_HEDGED_UPSIDE", `RSI=${rsi}`);
          break;
        }
        return null;

      case "LONG_STRADDLE":
        if (adx > 32) { // Strong expected volatility expansion
          confidence = 85;
          reasons.push("HIGH_VOLATILITY_EXPANSION_EXPECTED", `ADX=${adx}`);
          break;
        }
        return null;

      case "IRON_CONDOR":
        if (rsi >= 45 && rsi <= 55 && adx < 20) { // Sideways range-bound
          confidence = 80;
          reasons.push("RANGE_BOUND_CONSOLIDATION", "LOW_ADX_NEUTRAL_DECAY", `ADX=${adx}`);
          break;
        }
        return null;

      default:
        return null;
    }

    return {
      signalId: `SIG_${this.strategyName}_${Date.now()}`,
      timestamp: Date.now(),
      underlying: context.underlying,
      direction: this.strategyName.includes("BEAR") ? "SHORT" : "LONG",
      strategy: this.strategyName,
      confidence,
      tradeScore: confidence,
      entryReasons: reasons,
      expiryType: "NEAREST_VALID_EXPIRY",
      indicators: { rsi, adx, vwap, atr: context.atr14 }
    };
  }

  public constructLegs(signal: IndianTradeSignal, spotPrice: number, quantity: number): IndianStrategyLeg[] {
    const expiryRes = ExpiryResolver.resolveExpiry(signal.underlying, "NEAREST_VALID_EXPIRY");
    const lotSize = InstrumentMaster.getLotSize(signal.underlying);
    const atm = StrikeSelector.getAtmStrike(signal.underlying, spotPrice);
    const interval = InstrumentMaster.getStrikeInterval(signal.underlying);

    const legs: IndianStrategyLeg[] = [];

    if (signal.strategy === "BULL_CALL_SPREAD") {
      // Leg 1: Buy ATM CE
      const leg1Strike = StrikeSelector.selectStrike(signal.underlying, spotPrice, "CE", "ATM");
      legs.push({
        legId: `LEG_1_${Date.now()}`,
        action: "BUY",
        instrument: "CE",
        strike: leg1Strike.strike,
        expiry: expiryRes.expiryDate,
        quantity,
        lotSize,
        entryPrice: leg1Strike.theoreticalPremiumINR,
        status: "PENDING",
        pnl: 0,
        pnlPercent: 0
      });
      // Leg 2: Sell OTM CE (ATM + 1)
      const leg2Strike = StrikeSelector.selectStrike(signal.underlying, spotPrice, "CE", "ATM_OFFSET", 1);
      legs.push({
        legId: `LEG_2_${Date.now()}`,
        action: "SELL",
        instrument: "CE",
        strike: leg2Strike.strike,
        expiry: expiryRes.expiryDate,
        quantity,
        lotSize,
        entryPrice: leg2Strike.theoreticalPremiumINR,
        status: "PENDING",
        pnl: 0,
        pnlPercent: 0
      });
    } else if (signal.strategy === "BEAR_PUT_SPREAD") {
      // Leg 1: Buy ATM PE
      const leg1Strike = StrikeSelector.selectStrike(signal.underlying, spotPrice, "PE", "ATM");
      legs.push({
        legId: `LEG_1_${Date.now()}`,
        action: "BUY",
        instrument: "PE",
        strike: leg1Strike.strike,
        expiry: expiryRes.expiryDate,
        quantity,
        lotSize,
        entryPrice: leg1Strike.theoreticalPremiumINR,
        status: "PENDING",
        pnl: 0,
        pnlPercent: 0
      });
      // Leg 2: Sell OTM PE (ATM - 1)
      const leg2Strike = StrikeSelector.selectStrike(signal.underlying, spotPrice, "PE", "ATM_OFFSET", -1);
      legs.push({
        legId: `LEG_2_${Date.now()}`,
        action: "SELL",
        instrument: "PE",
        strike: leg2Strike.strike,
        expiry: expiryRes.expiryDate,
        quantity,
        lotSize,
        entryPrice: leg2Strike.theoreticalPremiumINR,
        status: "PENDING",
        pnl: 0,
        pnlPercent: 0
      });
    } else if (signal.strategy === "LONG_STRADDLE") {
      // Buy ATM CE + Buy ATM PE
      const ceRes = StrikeSelector.selectStrike(signal.underlying, spotPrice, "CE", "ATM");
      const peRes = StrikeSelector.selectStrike(signal.underlying, spotPrice, "PE", "ATM");
      legs.push({
        legId: `LEG_1_CE_${Date.now()}`,
        action: "BUY",
        instrument: "CE",
        strike: ceRes.strike,
        expiry: expiryRes.expiryDate,
        quantity,
        lotSize,
        entryPrice: ceRes.theoreticalPremiumINR,
        status: "PENDING",
        pnl: 0,
        pnlPercent: 0
      });
      legs.push({
        legId: `LEG_2_PE_${Date.now()}`,
        action: "BUY",
        instrument: "PE",
        strike: peRes.strike,
        expiry: expiryRes.expiryDate,
        quantity,
        lotSize,
        entryPrice: peRes.theoreticalPremiumINR,
        status: "PENDING",
        pnl: 0,
        pnlPercent: 0
      });
    } else if (signal.strategy === "IRON_CONDOR") {
      // 4 Legs: Sell OTM CE/PE, Buy further OTM wings
      const ceSell = StrikeSelector.selectStrike(signal.underlying, spotPrice, "CE", "ATM_OFFSET", 1);
      const ceBuy = StrikeSelector.selectStrike(signal.underlying, spotPrice, "CE", "ATM_OFFSET", 2);
      const peSell = StrikeSelector.selectStrike(signal.underlying, spotPrice, "PE", "ATM_OFFSET", -1);
      const peBuy = StrikeSelector.selectStrike(signal.underlying, spotPrice, "PE", "ATM_OFFSET", -2);

      legs.push(
        { legId: "LEG_1_SELL_CE", action: "SELL", instrument: "CE", strike: ceSell.strike, expiry: expiryRes.expiryDate, quantity, lotSize, entryPrice: ceSell.theoreticalPremiumINR, status: "PENDING", pnl: 0, pnlPercent: 0 },
        { legId: "LEG_2_BUY_CE", action: "BUY", instrument: "CE", strike: ceBuy.strike, expiry: expiryRes.expiryDate, quantity, lotSize, entryPrice: ceBuy.theoreticalPremiumINR, status: "PENDING", pnl: 0, pnlPercent: 0 },
        { legId: "LEG_3_SELL_PE", action: "SELL", instrument: "PE", strike: peSell.strike, expiry: expiryRes.expiryDate, quantity, lotSize, entryPrice: peSell.theoreticalPremiumINR, status: "PENDING", pnl: 0, pnlPercent: 0 },
        { legId: "LEG_4_BUY_PE", action: "BUY", instrument: "PE", strike: peBuy.strike, expiry: expiryRes.expiryDate, quantity, lotSize, entryPrice: peBuy.theoreticalPremiumINR, status: "PENDING", pnl: 0, pnlPercent: 0 }
      );
    }

    return legs;
  }
}
