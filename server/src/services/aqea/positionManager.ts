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

/** The AI's view of a symbol on one evaluation tick. */
export interface AiPositionView {
  /** Final decision after entry gates (EV, Bayesian, risk, ...). */
  decision: string;
  /** Fused ensemble direction before any entry gate. */
  fusedDirection: string;
}

export interface ProfitBookingSignal {
  book: boolean;
  reason: string;
  netProfitPct: number;
}

/** Evaluations in a row the AI must lean against a position before banking it. */
const PROFIT_BOOKING_CONFIRMATIONS = 2;
/** Minimum profit after round-trip fees when there is no usable stop-loss to size R. */
const MIN_NET_PROFIT_PCT = 0.002;

export class PositionManager {
  /**
   * Tracks consecutive AI signals to prevent whipsaw closures.
   * Format: `userId:symbol:direction` -> count
   */
  private static signalState = new Map<string, number>();
  private static profitBookingState = new Map<string, number>();

  /**
   * AI profit booking: close a position that is in profit after round-trip
   * fees once the AI view turns against it on consecutive evaluations. Uses
   * the fused ensemble direction as well as the gated decision — entry gates
   * decide whether to OPEN a trade and rarely emit the opposite side, so
   * relying on the gated decision alone almost never banks a gain. Never
   * closes at a loss; losing positions are left to SL/risk exits.
   */
  public static evaluateProfitBooking(
    positionKey: string,
    position: { side: string; entryPrice: number; sl?: number },
    view: AiPositionView,
    currentPrice: number,
    feePctPerSide: number,
    minProfitR = 0.3,
  ): ProfitBookingSignal {
    const isLong = position.side === "BUY";
    const grossPct = isLong
      ? currentPrice / position.entryPrice - 1
      : 1 - currentPrice / position.entryPrice;
    const netProfitPct = grossPct - 2 * feePctPerSide;

    const sl = position.sl ?? 0;
    const slOnLossSide = sl > 0 && (isLong ? sl < position.entryPrice : sl > position.entryPrice);
    const riskPct = slOnLossSide ? Math.abs(position.entryPrice - sl) / position.entryPrice : 0;
    const minNetPct = Math.max(minProfitR * riskPct, MIN_NET_PROFIT_PCT);

    const opposite = isLong ? "SHORT" : "LONG";
    const aiAgainst = view.decision === opposite || view.fusedDirection === opposite;

    if (!(netProfitPct >= minNetPct) || !aiAgainst) {
      this.profitBookingState.delete(positionKey);
      return { book: false, reason: "", netProfitPct };
    }

    const count = (this.profitBookingState.get(positionKey) ?? 0) + 1;
    if (count < PROFIT_BOOKING_CONFIRMATIONS) {
      this.profitBookingState.set(positionKey, count);
      return { book: false, reason: "", netProfitPct };
    }
    this.profitBookingState.delete(positionKey);
    return { book: true, reason: "AI_BOOK_PROFIT", netProfitPct };
  }

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
