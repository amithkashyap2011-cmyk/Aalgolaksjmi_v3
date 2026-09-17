/**
 * ═══════════════════════════════════════════════════════════════════
 *  STRATEGY COMPETITION & CONFLICT RESOLUTION MANAGER
 * ═══════════════════════════════════════════════════════════════════
 *  Evaluates simultaneous signals competing for capital.
 *  Detects conflicting opposing signals (e.g. BUY vs SELL NIFTY) and
 *  differentiates between Intentional Hedges, Partial Hedges, and
 *  unintended directional cancel-outs.
 */

import { roundTo2 } from "../capital/AuthoritativeCapitalManager.js";

export interface ICandidateSignal {
  signalId: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  underlying: string;
  direction: "BUY" | "SELL";
  instrumentType: "EQUITY" | "FUTURE" | "CE" | "PE";
  quantity: number;
  expectedEdgeR: number;
  confidence: number;
  sharpeRatio: number;
  capitalRequired: number;
  timestamp: number;
}

export interface ICompetitionEvaluationResult {
  selectedSignals: ICandidateSignal[];
  rejectedSignals: Array<{ signal: ICandidateSignal; reason: string }>;
  conflictsResolved: Array<{
    description: string;
    resolution: "HEDGE_APPROVED" | "HIGHER_CONFIDENCE_SELECTED" | "NET_DELTA_ADJUSTED";
  }>;
  totalCapitalCommitted: number;
}

export class StrategyCompetitionManager {
  /**
   * Resolves simultaneous candidate signals competing for available capital.
   */
  public static resolveCompetition(
    signals: ICandidateSignal[],
    availableDeployableCapital: number
  ): ICompetitionEvaluationResult {
    const selectedSignals: ICandidateSignal[] = [];
    const rejectedSignals: Array<{ signal: ICandidateSignal; reason: string }> = [];
    const conflictsResolved: Array<{
      description: string;
      resolution: "HEDGE_APPROVED" | "HIGHER_CONFIDENCE_SELECTED" | "NET_DELTA_ADJUSTED";
    }> = [];

    // 1. Group signals by underlying index/stock
    const byUnderlying = new Map<string, ICandidateSignal[]>();
    for (const s of signals) {
      const norm = s.underlying.toUpperCase();
      if (!byUnderlying.has(norm)) {
        byUnderlying.set(norm, []);
      }
      byUnderlying.get(norm)!.push(s);
    }

    const filteredSignals: ICandidateSignal[] = [];

    // 2. Evaluate Conflicts within each underlying
    for (const [normUnderlying, group] of byUnderlying.entries()) {
      if (group.length <= 1) {
        filteredSignals.push(...group);
        continue;
      }

      // Determine effective delta direction:
      // BUY FUTURE, BUY EQUITY, BUY CE, SELL PE -> Positive Delta (+1)
      // SELL FUTURE, SELL EQUITY, SELL CE, BUY PE -> Negative Delta (-1)
      const getDeltaSign = (s: ICandidateSignal) => {
        if (s.instrumentType === "PE") {
          return s.direction === "BUY" ? -1 : 1;
        }
        return s.direction === "BUY" ? 1 : -1;
      };

      const posDeltaSignals = group.filter((s) => getDeltaSign(s) > 0);
      const negDeltaSignals = group.filter((s) => getDeltaSign(s) < 0);

      // Check for opposing delta on same underlying
      if (posDeltaSignals.length > 0 && negDeltaSignals.length > 0) {
        // Evaluate if this represents a structural option hedge (e.g. Long Future + Long Put or Long Stock + Short Call)
        const hasOptions = group.some((s) => s.instrumentType === "CE" || s.instrumentType === "PE");
        const hasUnderlyingCashOrFuture = group.some(
          (s) => s.instrumentType === "EQUITY" || s.instrumentType === "FUTURE"
        );

        if (hasOptions && hasUnderlyingCashOrFuture) {
          // Valid delta hedge recognized!
          conflictsResolved.push({
            description: `HEDGE_DETECTED: Recognized structural delta hedge between derivative and underlying on ${normUnderlying}.`,
            resolution: "HEDGE_APPROVED",
          });
          filteredSignals.push(...group);
        } else {
          // Direct directional conflict (e.g. Strategy A BUY Future vs Strategy B SELL Future)
          // Rank by (confidence * expectedEdgeR * sharpeRatio)
          const score = (s: ICandidateSignal) => s.confidence * s.expectedEdgeR * s.sharpeRatio;
          const bestPos = posDeltaSignals.reduce((prev, curr) => (score(curr) > score(prev) ? curr : prev), posDeltaSignals[0]);
          const bestNeg = negDeltaSignals.reduce((prev, curr) => (score(curr) > score(prev) ? curr : prev), negDeltaSignals[0]);

          const winner = score(bestPos) >= score(bestNeg) ? bestPos : bestNeg;
          const loser = winner === bestPos ? bestNeg : bestPos;

          conflictsResolved.push({
            description: `CONFLICT_RESOLVED: Strategy ${winner.strategyName} (${winner.direction}) outperformed ${loser.strategyName} (${loser.direction}) on ${normUnderlying}.`,
            resolution: "HIGHER_CONFIDENCE_SELECTED",
          });

          filteredSignals.push(winner);
          for (const s of group) {
            if (s !== winner) {
              rejectedSignals.push({
                signal: s,
                reason: `OPPOSING_DIRECTION_CONFLICT: Superseded by higher-confidence strategy ${winner.strategyName}.`,
              });
            }
          }
        }
      } else {
        filteredSignals.push(...group);
      }
    }

    // 3. Rank remaining candidates by risk-adjusted score: (Edge * Confidence * Sharpe)
    filteredSignals.sort((a, b) => {
      const scoreA = a.expectedEdgeR * a.confidence * a.sharpeRatio;
      const scoreB = b.expectedEdgeR * b.confidence * b.sharpeRatio;
      return scoreB - scoreA;
    });

    // 4. Allocate capital within deployable limit
    let currentCommitted = 0;
    for (const candidate of filteredSignals) {
      if (currentCommitted + candidate.capitalRequired <= availableDeployableCapital) {
        selectedSignals.push(candidate);
        currentCommitted += candidate.capitalRequired;
      } else {
        rejectedSignals.push({
          signal: candidate,
          reason: `INSUFFICIENT_PORTFOLIO_CAPITAL: Candidate requires ₹${candidate.capitalRequired}, remaining deployable: ₹${
            availableDeployableCapital - currentCommitted
          }.`,
        });
      }
    }

    return {
      selectedSignals,
      rejectedSignals,
      conflictsResolved,
      totalCapitalCommitted: roundTo2(currentCommitted),
    };
  }
}
