/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Dynamic Exit Engine
 * ═══════════════════════════════════════════════════════════════════
 */

export interface ExitSignal {
  shouldExit: boolean;
  type: "PARTIAL" | "FULL" | "NONE";
  qtyPct: number;
  reason: string;
  newStopLoss?: number;
}

export interface TradeExitState {
  side: "BUY" | "SELL";
  entryPrice: number;
  tp1: number;
  tp2: number;
  tp3: number;
  sl: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  /** AI_MOMENTUM_EXHAUSTION already banked its 50% — it must fire once, not every tick. */
  momentumPartialTaken?: boolean;
  /** Sizes the breakeven fee buffer; unset keeps the futures-sized 0.1%. */
  accountType?: "SPOT" | "FUTURES";
  /** Book (with accountType) that scopes per-position agent state such as the AI-flip counter. */
  mode?: "PAPER" | "LIVE";
}

/**
 * Breakeven stop offset from entry. It must clear the round-trip taker fees
 * (+ a little slippage) or a "breakeven" exit still books a loss: SPOT pays
 * 0.1% per side, so the old flat 0.1% buffer closed SPOT winners at a net
 * loss (DOT 2026-09-27: SL 1.26026, exit 1.2600, -$0.0003). FUTURES pays
 * 0.04% per side.
 */
export function breakevenBufferPct(accountType?: "SPOT" | "FUTURES"): number {
  return accountType === "SPOT" ? 0.0025 : 0.001;
}

export class ExitEngine {
  /**
   * Calculates the 3-stage Take Profit levels and Stop Loss based on ATR.
   */
  public static calculateLevels(side: "BUY" | "SELL", entryPrice: number, atr: number) {
    const direction = side === "BUY" ? 1 : -1;
    
    // 🛡️ STRATEGY PARAMETER TUNING: Enforce minimum ATR floor to prevent micro-targets eating fees
    const minAtr = entryPrice * 0.004; // 0.4% minimum ATR
    const effectiveAtr = Math.max(atr, minAtr);
    
    return {
      tp1: entryPrice + (direction * effectiveAtr * 2.0),
      tp2: entryPrice + (direction * effectiveAtr * 3.5),
      tp3: entryPrice + (direction * effectiveAtr * 5.0),
      sl: entryPrice - (direction * effectiveAtr * 1.2),
    };
  }

  /**
   * Evaluates current price against TP/SL levels and trailing logic.
   */
  public static evaluateExit(
    currentPrice: number,
    state: TradeExitState,
    trailingStop?: number
  ): ExitSignal {
    const isLong = state.side === "BUY";
    
    // 1. Stop Loss Check
    if (isLong ? currentPrice <= state.sl : currentPrice >= state.sl) {
      return { shouldExit: true, type: "FULL", qtyPct: 1.0, reason: "STOP_LOSS" };
    }

    // 1b. Volatility Expansion Early Micro-Stop: If position drawdown exceeds 3.5% before TP1, trigger early risk cut
    const unrealizedLossPct = isLong
      ? (state.entryPrice - currentPrice) / (state.entryPrice > 0 ? state.entryPrice : Number.EPSILON)
      : (currentPrice - state.entryPrice) / (state.entryPrice > 0 ? state.entryPrice : Number.EPSILON);
    if (!state.tp1Hit && unrealizedLossPct >= 0.035) {
      return { shouldExit: true, type: "FULL", qtyPct: 1.0, reason: "VOLATILITY_EXPANSION_MICRO_STOP" };
    }

    // (Ratios divide by the real entry price — a Math.max(entry, 1) floor made
    // sub-$1 coins' % moves ~0, so these stops never fired for ADA/DOGE/PEPE…)
    // 1c. Instant Breakeven Elevation (+0.75x ATR Profit Lock): Never allow a winning move to become a loss
    const profitRatio = isLong
      ? (currentPrice - state.entryPrice) / (state.entryPrice > 0 ? state.entryPrice : Number.EPSILON)
      : (state.entryPrice - currentPrice) / (state.entryPrice > 0 ? state.entryPrice : Number.EPSILON);
    const bePct = breakevenBufferPct(state.accountType);
    const feeBufferSL = isLong ? state.entryPrice * (1 + bePct) : state.entryPrice * (1 - bePct);
    const isBelowTp1 = isLong ? currentPrice < state.tp1 : currentPrice > state.tp1;
    if (!state.tp1Hit && isBelowTp1 && profitRatio >= 0.005 && (isLong ? state.sl < feeBufferSL : state.sl > feeBufferSL)) {
      return { shouldExit: false, type: "NONE", qtyPct: 0, reason: "BREAKEVEN_ELEVATION", newStopLoss: feeBufferSL };
    }

    // 2. Trailing Stop Check (if TP2 hit or provided)
    if (trailingStop) {
      if (isLong ? currentPrice <= trailingStop : currentPrice >= trailingStop) {
        return { shouldExit: true, type: "FULL", qtyPct: 1.0, reason: "TRAILING_STOP" };
      }
    }

    // 3. Take Profit 3 (Full Exit)
    if (!state.tp3Hit) {
      if (isLong ? currentPrice >= state.tp3 : currentPrice <= state.tp3) {
        return { shouldExit: true, type: "FULL", qtyPct: 1.0, reason: "TP3_HIT" };
      }
    }

    // 4. Take Profit 2 (Partial 50%, Move SL to Entry)
    if (!state.tp2Hit) {
      if (isLong ? currentPrice >= state.tp2 : currentPrice <= state.tp2) {
        return { 
          shouldExit: true, 
          type: "PARTIAL", 
          qtyPct: 0.50, 
          reason: "TP2_HIT", 
          newStopLoss: state.entryPrice 
        };
      }
    }

    // 5. Take Profit 1 (Partial 25%)
    if (!state.tp1Hit) {
      if (isLong ? currentPrice >= state.tp1 : currentPrice <= state.tp1) {
        return { shouldExit: true, type: "PARTIAL", qtyPct: 0.25, reason: "TP1_HIT", newStopLoss: state.entryPrice };
      }
    }

    return { shouldExit: false, type: "NONE", qtyPct: 0, reason: "" };
  }

  /**
   * Prioritized Trailing Stop Calculation
   */
  public static calculateTrailingStop(
    supertrend: number,
    ema20: number,
    atrTrail: number,
    isLong: boolean
  ): number {
    // Priority: Supertrend > EMA20 > ATR Trail
    if (isLong) {
       return Math.max(supertrend, ema20, atrTrail);
    } else {
       // For shorts, we want the lowest value to trail down
       return Math.min(supertrend, ema20, atrTrail);
    }
  }
}
