/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Dynamic Strike Selector Engine (ATM, OTM, ITM, Delta, PCR)
 * ═══════════════════════════════════════════════════════════════════
 */

import { InstrumentMaster } from "./InstrumentMaster.js";
import { StrikeSelectionMethod, IndianInstrumentType } from "./types.js";

export interface StrikeSelectionResult {
  strike: number;
  atmStrike: number;
  strikeOffset: number;
  methodUsed: StrikeSelectionMethod;
  estimatedDelta: number;
  theoreticalPremiumINR: number;
}

export class StrikeSelector {
  /**
   * Computes the nearest ATM strike based on underlying contract interval
   */
  public static getAtmStrike(underlying: string, spotPrice: number): number {
    const interval = InstrumentMaster.getStrikeInterval(underlying);
    return Math.round(spotPrice / interval) * interval;
  }

  /**
   * Resolves specific strike price dynamically
   */
  public static selectStrike(
    underlying: string,
    spotPrice: number,
    instrument: IndianInstrumentType,
    method: StrikeSelectionMethod = "ATM",
    offset: number = 0,
    targetDelta: number = 0.50
  ): StrikeSelectionResult {
    const interval = InstrumentMaster.getStrikeInterval(underlying);
    const atmStrike = this.getAtmStrike(underlying, spotPrice);

    let selectedStrike = atmStrike;
    let effectiveOffset = offset;

    switch (method) {
      case "ATM":
        selectedStrike = atmStrike;
        effectiveOffset = 0;
        break;

      case "ATM_OFFSET":
      case "OTM":
      case "ITM":
        if (method === "OTM") {
          effectiveOffset = instrument === "CE" ? Math.abs(offset || 1) : -Math.abs(offset || 1);
        } else if (method === "ITM") {
          effectiveOffset = instrument === "CE" ? -Math.abs(offset || 1) : Math.abs(offset || 1);
        }
        selectedStrike = atmStrike + (effectiveOffset * interval);
        break;

      case "DELTA":
        // Approximate delta matching based on strike distance
        const steps = Math.round((0.50 - Math.min(0.90, Math.max(0.10, targetDelta))) * 10);
        effectiveOffset = instrument === "CE" ? steps : -steps;
        selectedStrike = atmStrike + (effectiveOffset * interval);
        break;

      default:
        selectedStrike = atmStrike;
        effectiveOffset = 0;
    }

    // Estimate delta and premium
    const strikeDiff = (selectedStrike - spotPrice);
    const moneyness = instrument === "CE" ? -strikeDiff : strikeDiff;
    const estDelta = Number((0.50 + (moneyness / (spotPrice * 0.04))).toFixed(2));
    const clampedDelta = Math.max(0.05, Math.min(0.95, estDelta));

    // Synthetic Black-Scholes estimate for intrinsic + time value
    const intrinsic = Math.max(0, instrument === "CE" ? spotPrice - selectedStrike : selectedStrike - spotPrice);
    const timeValue = Math.max(15, (spotPrice * 0.008) * (1 - Math.abs(clampedDelta - 0.5)));
    const theoreticalPremium = Number((intrinsic + timeValue).toFixed(2));

    return {
      strike: selectedStrike,
      atmStrike,
      strikeOffset: effectiveOffset,
      methodUsed: method,
      estimatedDelta: clampedDelta,
      theoreticalPremiumINR: theoreticalPremium
    };
  }

  /**
   * Generates a complete strike ladder around spot
   */
  public static getStrikeLadder(underlying: string, spotPrice: number, numStrikes: number = 5): {
    strikes: number[];
    atmStrike: number;
    interval: number;
  } {
    const interval = InstrumentMaster.getStrikeInterval(underlying);
    const atm = this.getAtmStrike(underlying, spotPrice);
    const strikes: number[] = [];

    for (let i = -numStrikes; i <= numStrikes; i++) {
      strikes.push(atm + (i * interval));
    }

    return {
      strikes,
      atmStrike: atm,
      interval
    };
  }
}
