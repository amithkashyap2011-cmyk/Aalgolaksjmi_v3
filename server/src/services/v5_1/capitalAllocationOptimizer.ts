/*
 * ─── Dynamic Capital Allocation Optimizer ────────────────────
 *
 * Replaces fixed (50%/30%/20%) percentages with dynamic risk-adjusted formula:
 * W_i = (ExpectedEdge_i * Health_i * Sharpe_i) / (Drawdown_i * Volatility_i)
 */

import { CapitalAllocation } from "../../models/CapitalAllocation.js";

export interface StrategyAllocationInput {
  strategyId: string;
  strategyName: string;
  expectedEdgeR: number;
  healthScore: number; // 0 - 100
  sharpeRatio: number;
  maxDrawdownPct: number;
  volatilityRatio: number;
}

export class CapitalAllocationOptimizer {
  public static calculateDynamicAllocation(
    strategies: StrategyAllocationInput[],
    totalCapitalUsdt: number
  ): any {
    const snapshotId = "CAP_" + Date.now();
    const rawWeights = strategies.map((s) => {
      const dd = Math.max(1.0, s.maxDrawdownPct);
      const vol = Math.max(0.5, s.volatilityRatio);
      const rawScore = (s.expectedEdgeR * (s.healthScore / 100) * Math.max(0.5, s.sharpeRatio)) / (dd * vol);
      return { strategyId: s.strategyId, strategyName: s.strategyName, rawScore };
    });

    const sumRaw = rawWeights.reduce((sum, w) => sum + w.rawScore, 0);

    const allocations = rawWeights.map((w) => {
      const weightPct = sumRaw > 0 ? +((w.rawScore / sumRaw) * 100).toFixed(2) : +(100 / strategies.length).toFixed(2);
      const allocatedCapitalUsdt = +((totalCapitalUsdt * weightPct) / 100).toFixed(2);
      return {
        strategyId: w.strategyId,
        strategyName: w.strategyName,
        dynamicWeightPct: weightPct,
        allocatedCapitalUsdt,
      };
    });

    return {
      snapshotId,
      allocations,
      totalCapitalUsdt,
      portfolioHeatPct: 10.0,
    };
  }
}
