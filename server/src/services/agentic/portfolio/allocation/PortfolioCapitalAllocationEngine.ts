/**
 * ═══════════════════════════════════════════════════════════════════
 *  PORTFOLIO CAPITAL ALLOCATION & RESERVE ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Distributes capital across active strategies using risk-adjusted weighting.
 *  Strictly enforces Tiered Reserves (Active Allocation, Margin Reserve,
 *  Risk Reserve, and Emergency Reserve) guaranteeing at least 25% reserve.
 */

import {
  IStrategyAllocation,
  IReserveCapital,
  VolatilityRegime,
} from "../types.js";
import { roundTo2 } from "../capital/AuthoritativeCapitalManager.js";

export interface IStrategyCandidateMetric {
  strategyId: string;
  strategyName: string;
  expectedEdgeR: number;     // Expected payoff per unit risk (e.g. 1.5)
  winRate: number;           // e.g. 0.60 for 60%
  sharpeRatio: number;       // e.g. 1.8
  maxDrawdownPct: number;    // e.g. 6.5%
  volatilityRatio: number;   // e.g. 1.1
  confidenceScore: number;   // 0.0 - 1.0
  averageCorrelation: number;// 0.0 - 1.0 (correlation against rest of portfolio)
}

export class PortfolioCapitalAllocationEngine {
  // Governance rule: Mandatory minimum reserve of 25% of total equity
  private static readonly MIN_PORTFOLIO_RESERVE_PCT = 25.0;

  /**
   * Computes authoritative reserve tiers from current total equity and volatility regime.
   */
  public static calculateReserves(totalEquity: number, regime: VolatilityRegime = "NORMAL"): IReserveCapital {
    let marginReservePct = 10.0;
    let riskReservePct = 10.0;
    let emergencyReservePct = 5.0;

    // During high/extreme volatility shocks, expand reserves
    if (regime === "HIGH") {
      marginReservePct = 15.0;
      riskReservePct = 12.0;
      emergencyReservePct = 8.0;
    } else if (regime === "EXTREME") {
      marginReservePct = 20.0;
      riskReservePct = 15.0;
      emergencyReservePct = 15.0;
    }

    const totalReservePct = Math.max(
      this.MIN_PORTFOLIO_RESERVE_PCT,
      marginReservePct + riskReservePct + emergencyReservePct
    );
    const activeAllocationPct = roundTo2(100.0 - totalReservePct);

    const marginReserveInr = roundTo2(totalEquity * (marginReservePct / 100));
    const riskReserveInr = roundTo2(totalEquity * (riskReservePct / 100));
    const emergencyReserveInr = roundTo2(totalEquity * (emergencyReservePct / 100));
    const totalReserveInr = roundTo2(marginReserveInr + riskReserveInr + emergencyReserveInr);
    const activeAllocationInr = roundTo2(totalEquity - totalReserveInr);

    return {
      totalEquity,
      activeAllocationInr,
      activeAllocationPct,
      marginReserveInr,
      marginReservePct,
      riskReserveInr,
      riskReservePct,
      emergencyReserveInr,
      emergencyReservePct,
      totalReserveInr,
      totalReservePct,
    };
  }

  /**
   * Dynamically allocates active capital across strategies based on risk-adjusted weights.
   */
  public static allocateCapital(
    candidates: IStrategyCandidateMetric[],
    totalEquity: number,
    regime: VolatilityRegime = "NORMAL",
    existingAllocations: Map<string, IStrategyAllocation> = new Map()
  ): {
    reserves: IReserveCapital;
    allocations: IStrategyAllocation[];
  } {
    const reserves = this.calculateReserves(totalEquity, regime);
    const deployableCapital = reserves.activeAllocationInr;

    if (candidates.length === 0) {
      return { reserves, allocations: [] };
    }

    // 1. Compute raw risk-adjusted scores
    // Score_i = (Edge * Confidence * Sharpe) / (MaxDD * Volatility * (1 + CorrelationPenalty))
    const scored = candidates.map((c) => {
      const dd = Math.max(1.0, c.maxDrawdownPct);
      const vol = Math.max(0.5, c.volatilityRatio);
      const corrPenalty = 1.0 + Math.max(0, c.averageCorrelation);
      const edge = Math.max(0.2, c.expectedEdgeR);
      const sharpe = Math.max(0.5, c.sharpeRatio);
      const conf = Math.max(0.3, c.confidenceScore);

      const rawScore = (edge * conf * sharpe) / (dd * vol * corrPenalty);
      return { ...c, rawScore };
    });

    const sumRaw = scored.reduce((sum, s) => sum + s.rawScore, 0);

    // 2. Normalize to target percentage weights and allocate active capital
    const allocations: IStrategyAllocation[] = scored.map((s) => {
      const targetWeightPct = sumRaw > 0 ? roundTo2((s.rawScore / sumRaw) * 100) : roundTo2(100 / scored.length);
      const allocatedCapitalInr = roundTo2((deployableCapital * targetWeightPct) / 100);

      const existing = existingAllocations.get(s.strategyId);
      const utilizedCapitalInr = existing ? existing.utilizedCapitalInr : 0.0;
      const availableCapitalInr = roundTo2(Math.max(0, allocatedCapitalInr - utilizedCapitalInr));
      const actualWeightPct = deployableCapital > 0 ? roundTo2((utilizedCapitalInr / deployableCapital) * 100) : 0.0;
      const driftPct = roundTo2(actualWeightPct - targetWeightPct);

      // Strategy risk budget: 5% of allocated capital
      const riskBudgetInr = roundTo2(allocatedCapitalInr * 0.05);

      return {
        strategyId: s.strategyId,
        strategyName: s.strategyName,
        targetWeightPct,
        actualWeightPct,
        allocatedCapitalInr,
        utilizedCapitalInr,
        availableCapitalInr,
        riskBudgetInr,
        currentExposureInr: existing?.currentExposureInr || 0.0,
        realizedPnlInr: existing?.realizedPnlInr || 0.0,
        unrealizedPnlInr: existing?.unrealizedPnlInr || 0.0,
        drawdownPct: s.maxDrawdownPct,
        sharpeRatio: s.sharpeRatio,
        status: "ACTIVE",
        driftPct,
      };
    });

    return { reserves, allocations };
  }
}
