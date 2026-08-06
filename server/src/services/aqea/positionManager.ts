/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Dynamic AI Position Manager (V4.0)
 * ═══════════════════════════════════════════════════════════════════
 */

import { AQEADecision } from "./engine.js";
import { TradeExitState } from "./exitEngine.js";

export interface PositionManagementSignal {
  action: "CLOSE_FULL" | "CLOSE_PARTIAL" | "MODIFY_STOP" | "EXTEND_TP" | "HOLD";
  qtyPct: number;
  reason: string;
  newStopLoss?: number;
  newTakeProfit?: number;
}

export class PositionManager {
  /**
   * Tracks consecutive AI signals to prevent whipsaw closures.
   * Format: `userId:symbol:direction` -> count
   */
  private static signalState = new Map<string, number>();

  /**
   * Evaluates active positions for dynamic management.
   */
  public static evaluate(
    userId: string,
    symbol: string,
    state: TradeExitState,
    aqeaDecision: AQEADecision,
    currentPrice: number,
    atr: number,
    flipExitMinProfitR = 0.3, // min profit (R) before an AI-trend-flip exit banks the trade
  ): PositionManagementSignal {
    const isLong = state.side === "BUY";
    const meta = aqeaDecision.meta || {};
    
    // 1. Calculate PnL / Risk metrics
    const pnl = isLong ? (currentPrice - state.entryPrice) : (state.entryPrice - currentPrice);
    const initialRisk = Math.abs(state.entryPrice - state.sl);
    const rMultiple = initialRisk > 0 ? pnl / initialRisk : 0;
    
    // 2. Extract component scores
    const coreScore = meta.aqeaScore || 50;
    const ofScore = meta.orderFlowScore || 50;
    const smScore = meta.smartMoneyScore || 50;
    const regime = meta.regime || "TRANSITION";
    
    // 3. Extract AI signals
    const ai = meta.aiPredictions || [];
    const cnn = ai.find((p: any) => p.predictor.includes("CNN"))?.direction || "HOLD";

    // Build tracking key for reversal detection
    const oppDir = isLong ? "SHORT" : "LONG";
    const stateKey = `${userId}:${symbol}:${oppDir}`;

    // Live directional call from the ensemble this tick.
    const decision = (aqeaDecision.decision as string) || "HOLD";
    const cnnOpp = cnn === oppDir;

    /* ── 0. AGENTIC PROFIT-TAKE ON TREND FLIP ──
       The point of an agent: if we're IN PROFIT and the live AI view has turned
       against the position — the ensemble now calls the opposite side, the CNN
       flipped, or core momentum is clearly contrary — bank the gain now instead
       of riding it back to the stop. ("Think bearish + in profit → exit.")
       Profit-gated so it never forces a loss; the strict reversal rule below
       still handles losing-side exits with multi-tick confirmation. */
    /* ── 0. AGENTIC AI TREND FLIP EXIT (Profit or Drawdown) ──
       If the live AI decision turns against the position (e.g. OPEN LONG but AI decision flips to SHORT),
       close immediately instead of holding for 12 hours into deep drawdown. */
    // 🛡️ Require full consensus reversal with high conviction (>=75%) to prevent noise panic
    const aiTurnedAgainst = decision === oppDir && (aqeaDecision.confidence || 0) >= 75;
    if (aiTurnedAgainst) {
      const count = (this.signalState.get(stateKey) || 0) + 1;
      this.signalState.set(stateKey, count);
      if (count >= 3) { // 3 consecutive tick evaluations (~3 mins)
        this.signalState.delete(stateKey);
        return { action: "CLOSE_FULL", qtyPct: 1.0, reason: "AI_TREND_FLIP_EXIT" };
      }
    } else {
      this.signalState.set(stateKey, 0);
    }

    /* ── 2. AI MOMENTUM EXHAUSTION (Partial Exit) ── */
    // If trade is in profit (>1R), but signals are weakening significantly
    if (rMultiple > 1.0) {
      const ofExhausted = isLong ? ofScore < 45 : ofScore > 55;
      const coreDecaying = isLong ? coreScore < 60 : coreScore > 40;
      
      if (ofExhausted && coreDecaying && cnn === "HOLD") {
         return { action: "CLOSE_PARTIAL", qtyPct: 0.5, reason: "AI_MOMENTUM_EXHAUSTION" };
      }
    }

    /* ── 3. PROFIT PROTECTION (Breakeven / Trailing) ── */
    if (rMultiple >= 2.0) {
       // > 2R: Move stop to 1R (Lock in profit)
       const lockPrice = isLong ? state.entryPrice + initialRisk : state.entryPrice - initialRisk;
       if ((isLong && lockPrice > state.sl) || (!isLong && lockPrice < state.sl)) {
           return { action: "MODIFY_STOP", qtyPct: 0, reason: "TRAILING_STOP", newStopLoss: lockPrice };
       }
    } else if (rMultiple >= 1.2) {
       // > 1.2R: Move to breakeven + slight spread coverage
       const bePrice = isLong ? state.entryPrice + (atr * 0.2) : state.entryPrice - (atr * 0.2);
       if ((isLong && bePrice > state.sl) || (!isLong && bePrice < state.sl)) {
          return { action: "MODIFY_STOP", qtyPct: 0, reason: "AI_PARTIAL_PROFIT", newStopLoss: bePrice };
       }
    }

    /* ── 4. AI TP EXTENSION ── */
    if (rMultiple >= 2.5) {
       const isTrending = regime === "TRENDING_BULL" || regime === "TRENDING_BEAR";
       const coreStrong = isLong ? coreScore > 90 : coreScore < 10;
       const ofStrong = isLong ? ofScore > 75 : ofScore < 25;
       const cnnAgrees = cnn === (isLong ? "LONG" : "SHORT");

       if (isTrending && coreStrong && ofStrong && cnnAgrees) {
          // Extend TP by 1 ATR
          const currentTp = isLong ? state.tp3 : state.tp3; // Simplified
          const extTp = isLong ? currentPrice + (atr * 2) : currentPrice - (atr * 2);
          
          if ((isLong && extTp > state.tp3) || (!isLong && extTp < state.tp3)) {
             return { action: "EXTEND_TP", qtyPct: 0, reason: "AI_TREND_CONTINUATION", newTakeProfit: extTp };
          }
       }
    }

    return { action: "HOLD", qtyPct: 0, reason: "" };
  }
}
