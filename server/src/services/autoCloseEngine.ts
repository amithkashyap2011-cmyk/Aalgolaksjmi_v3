/*
 * ─── Auto Close Engine (V8.0) ─────────────────────────
 *
 * Implements sophisticated exit logic for capital preservation.
 */

import { ITrade } from "../models/Trade.js";
import { RegimeStatus } from "./regimeDetectionEngine.js";

export interface AutoCloseTrigger {
  triggered: boolean;
  reason: string;
  action: "CLOSE" | "PARTIAL_CLOSE" | "MOVE_SL_TO_BE";
}

export class AutoCloseEngine {
  public static check(trade: ITrade, context: { price: number; regime: RegimeStatus; sentiment: any; whaleActivity: any }): AutoCloseTrigger {
    const { price, regime, sentiment, whaleActivity } = context;
    const pnlPct = ((price - trade.entryPrice) / trade.entryPrice) * (trade.side === "BUY" ? 1 : -1) * 100;

    // 1. Profit Lock (e.g., lock 50% of gains if price drops 20% from peak)
    // (Requires tracking peak price which is handled in autoTradeEngine.ts but I can add logic here)

    // 2. Break Even Protection (Move SL to entry if profit > 1%)
    if (pnlPct > 1.0 && trade.sl !== trade.entryPrice) {
       return { triggered: true, reason: "BREAK_EVEN_PROTECTION", action: "MOVE_SL_TO_BE" };
    }

    // 3. Sentiment Collapse Exit — DISABLED: previously used RSI as a fear/greed
    // proxy which contradicted mean-reversion entries. Real sentiment API needed.
    // if (sentiment && sentiment.fearGreed < 20) { ... }

    // 4. Whale Dump Exit — HARDENED: Require BOTH volume spike AND adverse price
    // movement to prevent false closures on bullish breakout volume spikes.
    // Old rule: any volume > 3x avg → instant close (massive false positive rate).
    // New rule: volume > 5x avg AND price moved against the position by > 1%.
    if (whaleActivity && whaleActivity.dumpDetected && whaleActivity.priceDropPct !== undefined) {
       const isAdverseMove = trade.side === "BUY"
         ? whaleActivity.priceDropPct > 0.01   // Price dropped > 1% (bad for LONG)
         : whaleActivity.priceDropPct < -0.01; // Price rose > 1% (bad for SHORT)
       if (isAdverseMove) {
         return { triggered: true, reason: "WHALE_DUMP_DETECTION", action: "CLOSE" };
       }
    }

    // 5. Trend Reversal Exit
    if (regime.regime === "BEAR_CAPITULATION" && trade.side === "BUY") {
       return { triggered: true, reason: "TREND_REVERSAL_REGIME", action: "CLOSE" };
    }

    // 6. Volatility Exit
    if (regime.volatility === "EXTREME") {
       return { triggered: true, reason: "EXTREME_VOLATILITY_GUARD", action: "CLOSE" };
    }

    return { triggered: false, reason: "", action: "CLOSE" };
  }
}
