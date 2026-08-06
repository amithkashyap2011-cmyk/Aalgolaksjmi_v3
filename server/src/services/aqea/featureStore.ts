/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Feature Store Service (Phase 4A)
 * ═══════════════════════════════════════════════════════════════════
 */

import { AqeaTradeAnalytics } from "../../models/AqeaTradeAnalytics.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../utils/mongoUtils.js";

export interface FeatureVector {
  userId: string;
  symbol: string;
  decision: "LONG" | "SHORT" | "HOLD" | "EXIT";
  
  market: {
    open: number; high: number; low: number; close: number; volume: number;
    atr: number; adx: number; rsi: number; 
    macd: number; macdValue: number; macdSignal: number; macdHistogram: number;
    vwap: number;
    ema20: number; ema50: number; ema200: number;
    bars?: any[];
  };

  regime: {
    state: string;
    score: number;
  };

  orderFlow: {
    cvd: number; delta: number; oiExpansion: number; fundingRate: number; liquidationScore: number;
  };

  smartMoney: {
    liquiditySweep: boolean; bos: boolean; orderBlock: boolean; fvg: boolean; poc: number;
  };

  execution: {
    positionSize: number; stopLoss: number; takeProfit: number;
  };

  ppoRecommendation?: string;

  meta?: any;
}

export class FeatureStore {
  /**
   * Persists a full feature vector at the time of trade decision.
   */
  public static async store(fv: FeatureVector): Promise<void> {
    try {
      if (mongoose.connection?.readyState !== 1) return;

      await AqeaTradeAnalytics.create({
        userId: toValidObjectId(fv.userId),
        symbol: fv.symbol,
        decision: fv.decision,
        marketFeatures: fv.market,
        regimeState: fv.regime.state,
        regimeScore: fv.regime.score,
        orderFlowFeatures: fv.orderFlow,
        smartMoneyFeatures: fv.smartMoney,
        ppoRecommendation: fv.ppoRecommendation,
        executionFeatures: fv.execution,
        meta: fv.meta || {},
        timestamp: new Date()
      });
    } catch (err) {
      console.error("[AQEA_FEATURE_STORE_ERROR]", err);
    }
  }

  /**
   * Updates feature vector with outcome and labels after trade completion.
   */
  public static async recordOutcome(
    tradeId: string, 
    outcome: { winLoss: number; rMultiple: number; profit: number; maxDrawdown: number; durationMs: number }
  ): Promise<void> {
    try {
      if (mongoose.connection?.readyState !== 1) return;

      // Logic to generate labels based on outcome
      const labels = {
        shortTerm: outcome.durationMs < 3600000 ? 1 : 0, // < 1h
        longTerm: outcome.durationMs >= 3600000 ? 1 : 0, // >= 1h
        reversal: outcome.winLoss === 1 && outcome.rMultiple > 2 ? 1 : 0,
        trendContinuation: outcome.winLoss === 1 && outcome.rMultiple <= 2 ? 1 : 0
      };

      await AqeaTradeAnalytics.updateOne(
        { "meta.tradeId": tradeId },
        { 
          $set: { 
            outcomeFeatures: outcome,
            labels: labels
          } 
        }
      );
    } catch (err) {
      console.error("[AQEA_FEATURE_STORE_OUTCOME_ERROR]", err);
    }
  }
}
