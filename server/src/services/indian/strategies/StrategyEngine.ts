/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Central Indian Strategy Engine & Market Router
 * ═══════════════════════════════════════════════════════════════════
 */

import { IIndianStrategy, StrategyEvaluationContext } from "./IIndianStrategy.js";
import { DirectionalOptionStrategy } from "./DirectionalOptionStrategy.js";
import { MultiLegSpreadStrategy } from "./MultiLegSpreadStrategy.js";
import { IndianTradeSignal, IndianStrategyType, IndianTradeObject } from "../types.js";
import { IndianRiskManager } from "../risk/IndianRiskManager.js";
import { InstrumentMaster } from "../InstrumentMaster.js";

export class StrategyEngine {
  private static strategies: Map<IndianStrategyType, IIndianStrategy> = new Map<IndianStrategyType, IIndianStrategy>([
    ["LONG_CALL", new DirectionalOptionStrategy(true)],
    ["LONG_PUT", new DirectionalOptionStrategy(false)],
    ["BULL_CALL_SPREAD", new MultiLegSpreadStrategy("BULL_CALL_SPREAD")],
    ["BEAR_PUT_SPREAD", new MultiLegSpreadStrategy("BEAR_PUT_SPREAD")],
    ["LONG_STRADDLE", new MultiLegSpreadStrategy("LONG_STRADDLE")],
    ["IRON_CONDOR", new MultiLegSpreadStrategy("IRON_CONDOR")],
  ]);

  public static getStrategy(type: IndianStrategyType): IIndianStrategy | undefined {
    return this.strategies.get(type);
  }

  public static getAllStrategies(): IIndianStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Evaluates all registered strategies and returns the top-ranked signal
   */
  public static routeMarket(context: StrategyEvaluationContext): IndianTradeSignal | null {
    const candidateSignals: IndianTradeSignal[] = [];

    for (const strategy of this.strategies.values()) {
      try {
        const signal = strategy.evaluate(context);
        if (signal && signal.tradeScore >= 70) {
          candidateSignals.push(signal);
        }
      } catch (err) {
        console.error(`[STRATEGY_ROUTER] Error evaluating ${strategy.strategyName}:`, err);
      }
    }

    if (candidateSignals.length === 0) return null;

    // Rank candidates by highest trade score and confidence
    candidateSignals.sort((a, b) => (b.tradeScore + b.confidence) - (a.tradeScore + a.confidence));
    return candidateSignals[0];
  }
}
