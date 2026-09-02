/**
 * ═══════════════════════════════════════════════════════════════════
 *  Indian Derivatives Dynamic Strike Selection Engine
 * ═══════════════════════════════════════════════════════════════════
 *  Selects option strikes dynamically without hardcoding:
 *   - ATM (At-The-Money)
 *   - ATM+1, ATM-1, ATM+2, ATM-2, etc. (ATM Offset)
 *   - ITM (In-The-Money) / OTM (Out-of-The-Money)
 *   - DELTA-based strike selection (e.g. target delta = 0.40)
 *   - PREMIUM-based strike selection (e.g. target premium = ₹150)
 */

import {
  InstrumentType,
  OptionChainData,
  StrikeSelectionConfig,
  UnderlyingSymbol,
} from "./strategyTypes.js";

export class StrikeSelector {
  /**
   * Returns default strike step interval for standard Indian indices
   */
  public static getStrikeStep(underlying: UnderlyingSymbol): number {
    const sym = underlying.toUpperCase();
    if (sym.includes("BANKNIFTY")) return 100;
    if (sym.includes("SENSEX") || sym.includes("BANKEX")) return 100;
    if (sym.includes("MIDCP")) return 25;
    if (sym.includes("FINNIFTY")) return 50;
    if (sym.includes("NIFTY")) return 50;
    return 10; // Equities default
  }

  /**
   * Computes At-The-Money (ATM) strike given current underlying spot price
   */
  public static getATMStrike(
    underlying: UnderlyingSymbol,
    spotPrice: number
  ): number {
    const step = this.getStrikeStep(underlying);
    return Math.round(spotPrice / step) * step;
  }

  /**
   * Resolves target strike based on configuration and market data
   */
  public static selectStrike(
    underlying: UnderlyingSymbol,
    optionType: "CE" | "PE",
    spotPrice: number,
    config: StrikeSelectionConfig,
    optionChain?: OptionChainData
  ): {
    strike: number;
    atmStrike: number;
    offset: number;
    selectionReason: string;
  } {
    const step = this.getStrikeStep(underlying);
    const atmStrike = this.getATMStrike(underlying, spotPrice);

    // 1. EXACT_STRIKE
    if (config.method === "EXACT_STRIKE" && config.exactStrike) {
      const offset = (config.exactStrike - atmStrike) / step;
      return {
        strike: config.exactStrike,
        atmStrike,
        offset,
        selectionReason: `Exact strike configured: ${config.exactStrike}`,
      };
    }

    // 2. ATM_OFFSET (e.g. offset = 0 for ATM, +1 for ATM+1, -1 for ATM-1)
    if (config.method === "ATM_OFFSET" || !config.method) {
      const offset = config.offset || 0;
      const strike = atmStrike + offset * step;
      const desc =
        offset === 0
          ? "ATM"
          : offset > 0
          ? `ATM+${offset} (${offset * step} pts above ATM)`
          : `ATM${offset} (${Math.abs(offset * step)} pts below ATM)`;
      return {
        strike,
        atmStrike,
        offset,
        selectionReason: `${desc} selected based on spot ₹${spotPrice.toFixed(2)}`,
      };
    }

    // 3. DELTA-BASED STRIKE SELECTION
    if (config.method === "DELTA" && config.targetDelta && optionChain) {
      const targetDelta = Math.abs(config.targetDelta);
      let bestStrike = atmStrike;
      let minDeltaDiff = Infinity;

      for (const s of optionChain.strikes) {
        const greek = optionType === "CE" ? s.call.greeks : s.put.greeks;
        const currentDelta = Math.abs(greek.delta);
        const diff = Math.abs(currentDelta - targetDelta);
        if (diff < minDeltaDiff) {
          minDeltaDiff = diff;
          bestStrike = s.strike;
        }
      }

      const offset = (bestStrike - atmStrike) / step;
      return {
        strike: bestStrike,
        atmStrike,
        offset,
        selectionReason: `Delta-based strike ${bestStrike} closest to target delta ${targetDelta}`,
      };
    }

    // 4. PREMIUM-BASED STRIKE SELECTION
    if (config.method === "PREMIUM" && config.targetPremium && optionChain) {
      const targetPrem = config.targetPremium;
      let bestStrike = atmStrike;
      let minPremDiff = Infinity;

      for (const s of optionChain.strikes) {
        const currentLtp = optionType === "CE" ? s.call.ltp : s.put.ltp;
        const diff = Math.abs(currentLtp - targetPrem);
        if (diff < minPremDiff && currentLtp > 0) {
          minPremDiff = diff;
          bestStrike = s.strike;
        }
      }

      const offset = (bestStrike - atmStrike) / step;
      return {
        strike: bestStrike,
        atmStrike,
        offset,
        selectionReason: `Premium-based strike ${bestStrike} closest to target ₹${targetPrem}`,
      };
    }

    // Default fallback
    return {
      strike: atmStrike,
      atmStrike,
      offset: 0,
      selectionReason: `Fallback ATM strike selected for spot ₹${spotPrice.toFixed(2)}`,
    };
  }

  /**
   * Generates a strike ladder around ATM
   */
  public static getStrikeLadder(
    underlying: UnderlyingSymbol,
    spotPrice: number,
    numStrikesAbove: number = 10,
    numStrikesBelow: number = 10
  ): number[] {
    const step = this.getStrikeStep(underlying);
    const atm = this.getATMStrike(underlying, spotPrice);
    const strikes: number[] = [];

    for (let i = -numStrikesBelow; i <= numStrikesAbove; i++) {
      strikes.push(atm + i * step);
    }
    return strikes;
  }
}
