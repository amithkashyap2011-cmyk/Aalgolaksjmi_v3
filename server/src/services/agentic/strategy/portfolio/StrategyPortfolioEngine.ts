/**
 * ═══════════════════════════════════════════════════════════════════
 *  STRATEGY PORTFOLIO & CORRELATION ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Evaluates portfolio-level interactions across active strategies:
 *   - Signal clustering detection (simultaneous directional bets)
 *   - Cross-strategy correlation analysis
 *   - Aggregate underlying exposure caps
 *   - Portfolio drawdown risk
 */

import { IStrategyDSL } from "../types.js";

export interface IStrategySignalInput {
  strategyId: string;
  strategyName: string;
  symbol: string;
  direction: "BUY" | "SELL";
  quantity: number;
  timestamp: number;
}

export interface IPortfolioAllocationCheck {
  allowed: boolean;
  activeSignalsCount: number;
  aggregateExposureUnits: number;
  correlatedSignalsDetected: boolean;
  warnings: string[];
  rejectionReason?: string;
}

export class StrategyPortfolioEngine {
  private static readonly MAX_AGGREGATE_EXPOSURE_PER_SYMBOL = 10; // Max 10 lots across all strategies
  private static readonly MAX_CONCURRENT_PORTFOLIO_SIGNALS = 15;

  /**
   * Evaluates a candidate signal against all currently active strategy signals.
   */
  public static evaluatePortfolioRisk(
    candidate: IStrategySignalInput,
    activeSignals: IStrategySignalInput[]
  ): IPortfolioAllocationCheck {
    const warnings: string[] = [];

    // 1. Check max concurrent portfolio-wide signals
    if (activeSignals.length >= this.MAX_CONCURRENT_PORTFOLIO_SIGNALS) {
      return {
        allowed: false,
        activeSignalsCount: activeSignals.length,
        aggregateExposureUnits: 0,
        correlatedSignalsDetected: true,
        warnings,
        rejectionReason: `MAX_PORTFOLIO_SIGNALS_EXCEEDED: Active signals count (${activeSignals.length}) reached limit (${this.MAX_CONCURRENT_PORTFOLIO_SIGNALS}).`,
      };
    }

    // 2. Check same underlying directional clustering
    const sameSymbolSameDirection = activeSignals.filter(
      (s) => s.symbol.toUpperCase() === candidate.symbol.toUpperCase() && s.direction === candidate.direction
    );

    const totalQty = sameSymbolSameDirection.reduce((sum, s) => sum + s.quantity, candidate.quantity);

    if (totalQty > this.MAX_AGGREGATE_EXPOSURE_PER_SYMBOL) {
      return {
        allowed: false,
        activeSignalsCount: activeSignals.length,
        aggregateExposureUnits: totalQty,
        correlatedSignalsDetected: true,
        warnings,
        rejectionReason: `AGGREGATE_EXPOSURE_BREACH: Combined exposure for ${candidate.symbol} ${candidate.direction} (${totalQty}) exceeds safe cap (${this.MAX_AGGREGATE_EXPOSURE_PER_SYMBOL}).`,
      };
    }

    // 3. Warning for correlated strategies on same underlying
    let correlatedSignalsDetected = false;
    if (sameSymbolSameDirection.length >= 2) {
      correlatedSignalsDetected = true;
      warnings.push(
        `HIGH_CORRELATION_CLUSTER: ${sameSymbolSameDirection.length + 1} strategies simultaneously proposing ${
          candidate.direction
        } on ${candidate.symbol}.`
      );
    }

    return {
      allowed: true,
      activeSignalsCount: activeSignals.length + 1,
      aggregateExposureUnits: totalQty,
      correlatedSignalsDetected,
      warnings,
    };
  }

  /**
   * Calculates pairwise Pearson correlation matrix between strategies.
   */
  public static calculateCorrelationMatrix(
    strategyReturns: Record<string, number[]>
  ): Record<string, Record<string, number>> {
    const matrix: Record<string, Record<string, number>> = {};
    const strategyIds = Object.keys(strategyReturns);

    for (const idA of strategyIds) {
      matrix[idA] = {};
      for (const idB of strategyIds) {
        if (idA === idB) {
          matrix[idA][idB] = 1.0;
        } else {
          matrix[idA][idB] = this.pearsonCorrelation(strategyReturns[idA], strategyReturns[idB]);
        }
      }
    }

    return matrix;
  }

  private static pearsonCorrelation(arrA: number[], arrB: number[]): number {
    const len = Math.min(arrA.length, arrB.length);
    if (len < 3) return 0.0;

    let sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, sumAB = 0;
    for (let i = 0; i < len; i++) {
      const a = arrA[i];
      const b = arrB[i];
      sumA += a;
      sumB += b;
      sumA2 += a * a;
      sumB2 += b * b;
      sumAB += a * b;
    }

    const numerator = len * sumAB - sumA * sumB;
    const denominator = Math.sqrt((len * sumA2 - sumA * sumA) * (len * sumB2 - sumB * sumB));

    if (denominator === 0) return 0.0;
    return Number((numerator / denominator).toFixed(2));
  }
}
