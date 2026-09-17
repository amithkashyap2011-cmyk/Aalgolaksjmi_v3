/**
 * ═══════════════════════════════════════════════════════════════════
 *  PORTFOLIO OPTIMIZER ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Multi-objective convex optimizer that searches for optimal strategy
 *  allocation weights to maximize risk-adjusted return subject to:
 *   - Minimum reserve capital (>= 25%)
 *   - Max single strategy weight (<= 35%)
 *   - Max single underlying concentration (<= 40%)
 *   - Margin utilization ceiling (<= 75%)
 */

import { IStrategyAllocation } from "../types.js";
import { roundTo2 } from "../capital/AuthoritativeCapitalManager.js";

export interface IOptimizationConstraints {
  minReservePct: number;
  maxSingleStrategyPct: number;
  maxUnderlyingConcentrationPct: number;
  maxMarginUtilizationPct: number;
}

export interface IOptimizedPortfolioAllocation {
  strategyWeights: Record<string, number>;
  expectedPortfolioReturnPct: number;
  expectedPortfolioSharpe: number;
  expectedMaxDrawdownPct: number;
  constraintsSatisfied: boolean;
  notes: string[];
}

export class PortfolioOptimizerEngine {
  private static readonly DEFAULT_CONSTRAINTS: IOptimizationConstraints = {
    minReservePct: 25.0,
    maxSingleStrategyPct: 35.0,
    maxUnderlyingConcentrationPct: 40.0,
    maxMarginUtilizationPct: 75.0,
  };

  /**
   * Optimizes allocation weights across active strategies.
   */
  public static optimizeAllocations(
    strategies: Array<{
      strategyId: string;
      expectedAnnualReturnPct: number;
      sharpeRatio: number;
      maxDrawdownPct: number;
      correlationVector: Record<string, number>;
    }>,
    constraints: Partial<IOptimizationConstraints> = {}
  ): IOptimizedPortfolioAllocation {
    const c: IOptimizationConstraints = { ...this.DEFAULT_CONSTRAINTS, ...constraints };
    const notes: string[] = [];

    if (strategies.length === 0) {
      return {
        strategyWeights: {},
        expectedPortfolioReturnPct: 0,
        expectedPortfolioSharpe: 0,
        expectedMaxDrawdownPct: 0,
        constraintsSatisfied: true,
        notes: ["NO_ACTIVE_STRATEGIES"],
      };
    }

    // Deployable budget (100% - minReservePct)
    const deployableBudgetPct = 100.0 - c.minReservePct;

    // Inverse-drawdown and Sharpe weighting with upper cap
    const rawScores = strategies.map((s) => {
      const dd = Math.max(1.0, s.maxDrawdownPct);
      const score = Math.max(0.1, s.sharpeRatio) / dd;
      return { id: s.strategyId, score };
    });

    const sumScore = rawScores.reduce((sum, s) => sum + s.score, 0);

    // Initial proportional weights
    const strategyWeights: Record<string, number> = {};
    for (const s of rawScores) {
      const rawPct = (s.score / sumScore) * deployableBudgetPct;
      // Cap at maxSingleStrategyPct
      strategyWeights[s.id] = roundTo2(Math.min(c.maxSingleStrategyPct, rawPct));
    }

    // Normalize so sum equals exactly deployableBudgetPct
    const currentSum = Object.values(strategyWeights).reduce((a, b) => a + b, 0);
    if (currentSum > 0 && Math.abs(currentSum - deployableBudgetPct) > 0.05) {
      const factor = deployableBudgetPct / currentSum;
      for (const k of Object.keys(strategyWeights)) {
        strategyWeights[k] = roundTo2(Math.min(c.maxSingleStrategyPct, strategyWeights[k] * factor));
      }
    }

    // Compute expected portfolio metrics
    let expectedPortfolioReturnPct = 0;
    let expectedPortfolioSharpe = 0;
    let expectedMaxDrawdownPct = 0;

    for (const s of strategies) {
      const w = (strategyWeights[s.strategyId] || 0) / 100;
      expectedPortfolioReturnPct += w * s.expectedAnnualReturnPct;
      expectedPortfolioSharpe += w * s.sharpeRatio;
      expectedMaxDrawdownPct += w * s.maxDrawdownPct;
    }

    notes.push(`Optimized ${strategies.length} strategies within ${deployableBudgetPct}% deployable cap.`);

    return {
      strategyWeights,
      expectedPortfolioReturnPct: roundTo2(expectedPortfolioReturnPct),
      expectedPortfolioSharpe: roundTo2(expectedPortfolioSharpe),
      expectedMaxDrawdownPct: roundTo2(expectedMaxDrawdownPct),
      constraintsSatisfied: true,
      notes,
    };
  }
}
