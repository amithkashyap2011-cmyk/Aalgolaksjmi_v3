/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Model Subset Optimizer (Phase 9 & 10)
 * ═══════════════════════════════════════════════════════════════════
 * Finds the smallest combination of models that maximizes
 * risk-adjusted forward net expected value after transaction costs.
 *
 * Search Strategy:
 * - Exhaustive for subsets of size 1–4
 * - Greedy forward selection for larger subsets
 * - Each subset evaluated using chronological OOS walk-forward data
 *
 * Utility(S) = E[NetReturn] - λ_DD·MaxDD - λ_T·Turnover - λ_C·|S|
 *
 * λ parameters are loaded from SubsetOptimizerConfig and can be
 * overridden without code changes.
 */

import { ForwardTelemetryStore, ForwardTelemetryRecord } from "./ForwardTelemetryStore.js";
import { AQEA_CONFIG } from "../config.js";

// ═══════════════════════════════════════════════════════════════════
//  Configuration
// ═══════════════════════════════════════════════════════════════════

export interface SubsetOptimizerConfig {
  lambdaDrawdown: number;          // Penalty for max drawdown (default: 2.0)
  lambdaExpectedShortfall: number; // Penalty for tail risk (default: 1.5)
  lambdaTurnover: number;          // Penalty for turnover (default: 0.5)
  lambdaComplexity: number;        // Penalty per model in subset (default: 0.01)
  minOOSSamples: number;           // Minimum OOS samples for valid evaluation (default: 30)
  maxSubsetSize: number;           // Max subset size to evaluate (default: 10)
  exhaustiveMaxSize: number;       // Exhaustive up to this size, greedy beyond (default: 4)
  minNetEV: number;                // Minimum net EV to qualify (default: 0.0)
  maxDrawdown: number;             // Maximum drawdown % to qualify (default: 15.0)
  minProfitFactor: number;         // Minimum profit factor to qualify (default: 1.30)
  maxBrier: number;                // Maximum Brier score to qualify (default: 0.24)
  maxECE: number;                  // Maximum ECE score to qualify (default: 0.08)
}

export const DEFAULT_SUBSET_CONFIG: SubsetOptimizerConfig = {
  lambdaDrawdown: AQEA_CONFIG.SUBSET_OPTIMIZER?.LAMBDA_DRAWDOWN ?? 2.0,
  lambdaExpectedShortfall: AQEA_CONFIG.SUBSET_OPTIMIZER?.LAMBDA_EXPECTED_SHORTFALL ?? 1.5,
  lambdaTurnover: AQEA_CONFIG.SUBSET_OPTIMIZER?.LAMBDA_TURNOVER ?? 0.5,
  lambdaComplexity: AQEA_CONFIG.SUBSET_OPTIMIZER?.LAMBDA_COMPLEXITY ?? 0.01,
  minOOSSamples: AQEA_CONFIG.SUBSET_OPTIMIZER?.MIN_EVAL_SAMPLES ?? 30,
  maxSubsetSize: AQEA_CONFIG.SUBSET_OPTIMIZER?.MAX_SUBSET_SIZE ?? 10,
  exhaustiveMaxSize: AQEA_CONFIG.SUBSET_OPTIMIZER?.EXHAUSTIVE_MAX_SIZE ?? 4,
  minNetEV: AQEA_CONFIG.SUBSET_OPTIMIZER?.MIN_NET_EV ?? 0.0,
  maxDrawdown: AQEA_CONFIG.SUBSET_OPTIMIZER?.MAX_DRAWDOWN ?? 15.0,
  minProfitFactor: AQEA_CONFIG.SUBSET_OPTIMIZER?.MIN_PROFIT_FACTOR ?? 1.30,
  maxBrier: AQEA_CONFIG.SUBSET_OPTIMIZER?.MAX_BRIER ?? 0.24,
  maxECE: AQEA_CONFIG.SUBSET_OPTIMIZER?.MAX_ECE ?? 0.08
};

// ═══════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════

export interface SubsetEvaluation {
  models: string[];
  subsetSize: number;
  netEV: number;
  grossReturn: number;
  maxDrawdown: number;
  profitFactor: number;
  winRate: number;
  brierScore: number;
  sharpe: number;
  sortino: number;
  turnover: number;
  sampleCount: number;
  utilityScore: number;
  passesConstraints: boolean;
  constraintViolations: string[];
}

export interface SubsetSearchResult {
  optimalSubset: SubsetEvaluation | null;
  allEvaluations: SubsetEvaluation[];
  searchMethod: "EXHAUSTIVE" | "GREEDY_FORWARD" | "HYBRID";
  totalSubsetsEvaluated: number;
  sufficientData: boolean;
  dataDeficiency: string | null;
  config: SubsetOptimizerConfig;
}

// ═══════════════════════════════════════════════════════════════════
//  Optimizer
// ═══════════════════════════════════════════════════════════════════

export class ModelSubsetOptimizer {
  /**
   * Finds the optimal model subset maximizing risk-adjusted utility.
   */
  public static search(
    candidateModels: string[],
    config: Partial<SubsetOptimizerConfig> = {}
  ): SubsetSearchResult {
    const cfg: SubsetOptimizerConfig = { ...DEFAULT_SUBSET_CONFIG, ...config };
    const resolved = ForwardTelemetryStore.getResolvedRecords();

    if (resolved.length < cfg.minOOSSamples) {
      return {
        optimalSubset: null,
        allEvaluations: [],
        searchMethod: "EXHAUSTIVE",
        totalSubsetsEvaluated: 0,
        sufficientData: false,
        dataDeficiency: `Insufficient OOS data: ${resolved.length}/${cfg.minOOSSamples} required`,
        config: cfg
      };
    }

    const allEvaluations: SubsetEvaluation[] = [];
    const n = Math.min(candidateModels.length, cfg.maxSubsetSize);

    // Phase 1: Exhaustive search for small subsets
    for (let size = 1; size <= Math.min(n, cfg.exhaustiveMaxSize); size++) {
      const subsets = this.generateCombinations(candidateModels.slice(0, n), size);
      for (const subset of subsets) {
        const evaluation = this.evaluateSubset(subset, resolved, cfg);
        allEvaluations.push(evaluation);
      }
    }

    // Phase 2: Greedy forward selection for larger subsets
    if (n > cfg.exhaustiveMaxSize) {
      const greedyResults = this.greedyForwardSelection(candidateModels.slice(0, n), resolved, cfg);
      for (const eval_ of greedyResults) {
        // Avoid duplicates
        const key = eval_.models.sort().join(",");
        if (!allEvaluations.some(e => e.models.sort().join(",") === key)) {
          allEvaluations.push(eval_);
        }
      }
    }

    // Find optimal: highest utility among constraint-passing subsets
    const passing = allEvaluations.filter(e => e.passesConstraints);
    passing.sort((a, b) => b.utilityScore - a.utilityScore);

    return {
      optimalSubset: passing.length > 0 ? passing[0] : null,
      allEvaluations: allEvaluations.sort((a, b) => b.utilityScore - a.utilityScore),
      searchMethod: n > cfg.exhaustiveMaxSize ? "HYBRID" : "EXHAUSTIVE",
      totalSubsetsEvaluated: allEvaluations.length,
      sufficientData: true,
      dataDeficiency: null,
      config: cfg
    };
  }

  /**
   * Evaluates a single model subset using chronological OOS data.
   */
  public static evaluateSubset(
    models: string[],
    records: ForwardTelemetryRecord[],
    config: SubsetOptimizerConfig
  ): SubsetEvaluation {
    // Filter to records where at least one model in subset participated
    const relevant = records.filter(r => {
      return models.some(m => r.modelBreakdowns[m]?.participating === true);
    });

    if (relevant.length === 0) {
      return this.emptyEvaluation(models, config);
    }

    // Compute subset-weighted ensemble for each record
    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalReturn = 0;
    let brierSum = 0;
    const returns: number[] = [];
    let directionChanges = 0;
    let prevDirection: string | null = null;

    for (const r of relevant) {
      if (!r.outcome) continue;

      // Compute subset-weighted probability
      let wLong = 0, wShort = 0, wHold = 0, totalW = 0;
      for (const m of models) {
        const snap = r.modelBreakdowns[m];
        if (!snap || !snap.participating) continue;
        const w = Math.max(0.001, snap.effectiveWeight);
        wLong += w * snap.probLong;
        wShort += w * snap.probShort;
        wHold += w * snap.probHold;
        totalW += w;
      }

      if (totalW <= 0) continue;

      // Normalize
      const pLong = wLong / totalW;
      const pShort = wShort / totalW;
      const subsetDir = pLong > pShort ? "LONG" : (pShort > pLong ? "SHORT" : "HOLD");

      // Track turnover
      if (prevDirection && prevDirection !== subsetDir) directionChanges++;
      prevDirection = subsetDir;

      // Brier score: using outcome binary
      const actualBinary = r.outcome.outcomeResult === "WIN" ? 1 : 0;
      const predProb = subsetDir === "LONG" ? pLong : (subsetDir === "SHORT" ? pShort : 0.5);
      brierSum += Math.pow(predProb - actualBinary, 2);

      // PnL attribution
      const ret = r.outcome.realizedReturn;
      returns.push(ret);
      totalReturn += ret;

      if (r.outcome.outcomeResult === "WIN") {
        wins++;
        grossProfit += Math.max(0, ret);
      } else if (r.outcome.outcomeResult === "LOSS") {
        losses++;
        grossLoss += Math.abs(ret);
      }
    }

    const total = returns.length;
    if (total === 0) return this.emptyEvaluation(models, config);

    const winRate = wins / total;
    const netEV = totalReturn / total;
    const brierScore = brierSum / total;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 5.0 : 1.0);
    const turnover = total > 1 ? directionChanges / (total - 1) : 0;

    // Sharpe & Sortino
    const meanReturn = netEV;
    const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / Math.max(1, total - 1);
    const sharpe = variance > 0 ? (meanReturn / Math.sqrt(variance)) * Math.sqrt(252) : 0;

    const downReturns = returns.filter(r => r < 0);
    const downVar = downReturns.reduce((s, r) => s + r ** 2, 0) / Math.max(1, downReturns.length);
    const sortino = downVar > 0 ? (meanReturn / Math.sqrt(downVar)) * Math.sqrt(252) : sharpe;

    // Max Drawdown
    let peak = 0, running = 0, maxDD = 0;
    for (const r of returns) {
      running += r;
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDD) maxDD = dd;
    }

    // Utility function
    const utility = netEV
      - config.lambdaDrawdown * (maxDD / 100)
      - config.lambdaTurnover * turnover
      - config.lambdaComplexity * models.length;

    // Constraint checking
    const violations: string[] = [];
    if (netEV < config.minNetEV) violations.push(`NET_EV_NEGATIVE: ${netEV.toFixed(4)} < ${config.minNetEV}`);
    if (maxDD > config.maxDrawdown) violations.push(`MAX_DD_EXCEEDED: ${maxDD.toFixed(2)}% > ${config.maxDrawdown}%`);
    if (profitFactor < config.minProfitFactor) violations.push(`PF_LOW: ${profitFactor.toFixed(2)} < ${config.minProfitFactor}`);
    if (brierScore > config.maxBrier) violations.push(`BRIER_HIGH: ${brierScore.toFixed(4)} > ${config.maxBrier}`);
    if (total < config.minOOSSamples) violations.push(`INSUFFICIENT_SAMPLES: ${total} < ${config.minOOSSamples}`);

    return {
      models,
      subsetSize: models.length,
      netEV: Number(netEV.toFixed(6)),
      grossReturn: Number(totalReturn.toFixed(4)),
      maxDrawdown: Number(maxDD.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      winRate: Number(winRate.toFixed(4)),
      brierScore: Number(brierScore.toFixed(4)),
      sharpe: Number(Math.min(5.0, Math.max(-2.0, sharpe)).toFixed(2)),
      sortino: Number(Math.min(6.0, Math.max(-2.0, sortino)).toFixed(2)),
      turnover: Number(turnover.toFixed(4)),
      sampleCount: total,
      utilityScore: Number(utility.toFixed(6)),
      passesConstraints: violations.length === 0,
      constraintViolations: violations
    };
  }

  // ─── Private Helpers ───

  private static emptyEvaluation(models: string[], config: SubsetOptimizerConfig): SubsetEvaluation {
    return {
      models, subsetSize: models.length, netEV: 0, grossReturn: 0,
      maxDrawdown: 0, profitFactor: 1.0, winRate: 0.5, brierScore: 0.25,
      sharpe: 0, sortino: 0, turnover: 0, sampleCount: 0,
      utilityScore: -config.lambdaComplexity * models.length,
      passesConstraints: false,
      constraintViolations: [`INSUFFICIENT_SAMPLES: 0 < ${config.minOOSSamples}`]
    };
  }

  /**
   * Generates all combinations of size k from arr.
   */
  private static generateCombinations(arr: string[], k: number): string[][] {
    if (k > arr.length || k <= 0) return [];
    if (k === arr.length) return [arr];
    if (k === 1) return arr.map(a => [a]);

    const result: string[][] = [];
    const recurse = (start: number, current: string[]) => {
      if (current.length === k) {
        result.push([...current]);
        return;
      }
      for (let i = start; i <= arr.length - (k - current.length); i++) {
        current.push(arr[i]);
        recurse(i + 1, current);
        current.pop();
      }
    };
    recurse(0, []);
    return result;
  }

  /**
   * Greedy forward selection: start with best single model, add models
   * one at a time that maximize utility.
   */
  private static greedyForwardSelection(
    candidates: string[],
    records: ForwardTelemetryRecord[],
    config: SubsetOptimizerConfig
  ): SubsetEvaluation[] {
    const results: SubsetEvaluation[] = [];
    const selected: string[] = [];
    const remaining = new Set(candidates);

    while (remaining.size > 0 && selected.length < config.maxSubsetSize) {
      let bestCandidate: string | null = null;
      let bestUtility = -Infinity;
      let bestEval: SubsetEvaluation | null = null;

      for (const candidate of remaining) {
        const trial = [...selected, candidate];
        const evaluation = this.evaluateSubset(trial, records, config);

        if (evaluation.utilityScore > bestUtility) {
          bestUtility = evaluation.utilityScore;
          bestCandidate = candidate;
          bestEval = evaluation;
        }
      }

      if (!bestCandidate || !bestEval) break;

      // Check if adding this model actually improves utility
      if (selected.length > 0) {
        const prevEval = results[results.length - 1];
        if (bestEval.utilityScore <= prevEval.utilityScore) {
          break; // Diminishing returns — stop
        }
      }

      selected.push(bestCandidate);
      remaining.delete(bestCandidate);
      results.push(bestEval);
    }

    return results;
  }
}
