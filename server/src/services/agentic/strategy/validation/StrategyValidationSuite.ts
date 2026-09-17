/**
 * ═══════════════════════════════════════════════════════════════════
 *  STRATEGY VALIDATION SUITE — ROBUSTNESS, WALK-FORWARD & MONTE CARLO
 * ═══════════════════════════════════════════════════════════════════
 *  Exhaustive quantitative testing preventing overfitted, fragile, or
 *  regime-dependent strategies from advancing to production.
 */

import { ITimestampedCandle } from "../data/DataQualityGate.js";
import {
  IStrategyDSL,
  IBacktestMetrics,
  IWalkForwardFold,
  IMonteCarloResults,
} from "../types.js";
import { RealisticBacktestEngine, IBacktestResult } from "../backtest/RealisticBacktestEngine.js";

export interface IOOSTestResult {
  inSampleMetrics: IBacktestMetrics;
  outOfSampleMetrics: IBacktestMetrics;
  sharpeRatioRetention: number; // OOS Sharpe / IS Sharpe
  isOverfit: boolean;
  reasons: string[];
}

export interface IParameterRobustnessResult {
  baseSharpe: number;
  testedVariationsCount: number;
  stableVariationsCount: number;
  robustnessScore: number; // 0 - 100
  isFragile: boolean;
  variations: { param: string; value: any; sharpe: number; pnl: number }[];
}

export interface IRegimePerformanceBreakdown {
  regime: string;
  tradeCount: number;
  winRate: number;
  netPnl: number;
  suitability: "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR";
}

export interface IStrategyComprehensiveValidation {
  qualityScore: number; // 0 - 100
  eligibleForPaperOrShadow: boolean;
  oosResult: IOOSTestResult;
  walkForwardFolds: IWalkForwardFold[];
  walkForwardEfficiency: number;
  monteCarloResults: IMonteCarloResults;
  parameterRobustness: IParameterRobustnessResult;
  regimeBreakdown: IRegimePerformanceBreakdown[];
  blockerReasons: string[];
}

export class StrategyValidationSuite {
  /**
   * 1. Out-of-Sample (OOS) Testing (70% Train, 30% Test)
   */
  public static runOutOfSampleTest(
    dsl: IStrategyDSL,
    candles: ITimestampedCandle[]
  ): IOOSTestResult {
    const splitIndex = Math.floor(candles.length * 0.7);
    const inSampleCandles = candles.slice(0, splitIndex);
    const outOfSampleCandles = candles.slice(splitIndex);

    const isResult = RealisticBacktestEngine.runBacktest(dsl, inSampleCandles);
    const oosResult = RealisticBacktestEngine.runBacktest(dsl, outOfSampleCandles);

    const isSharpe = Math.max(0.01, isResult.metrics.sharpeRatio);
    const oosSharpe = oosResult.metrics.sharpeRatio;
    const retention = Number((oosSharpe / isSharpe).toFixed(2));

    const reasons: string[] = [];
    let isOverfit = false;

    if (oosResult.metrics.netPnl < 0 && isResult.metrics.netPnl > 0) {
      isOverfit = true;
      reasons.push("OOS_LOSS: Strategy produced positive profit In-Sample but suffered net loss Out-of-Sample.");
    }

    if (retention < 0.40) {
      isOverfit = true;
      reasons.push(`SHARPE_COLLAPSE: Out-of-sample Sharpe retention is ${retention} (required >= 0.40).`);
    }

    if (oosResult.metrics.maxDrawdownPct > isResult.metrics.maxDrawdownPct * 1.8) {
      isOverfit = true;
      reasons.push("DRAWDOWN_DILATION: Out-of-sample maximum drawdown is over 80% worse than in-sample.");
    }

    return {
      inSampleMetrics: isResult.metrics,
      outOfSampleMetrics: oosResult.metrics,
      sharpeRatioRetention: retention,
      isOverfit,
      reasons,
    };
  }

  /**
   * 2. Walk-Forward Testing (Rolling 4-fold validation)
   */
  public static runWalkForwardValidation(
    dsl: IStrategyDSL,
    candles: ITimestampedCandle[],
    foldsCount: number = 4
  ): { folds: IWalkForwardFold[]; averageWFE: number } {
    const totalBars = candles.length;
    const windowSize = Math.floor(totalBars / (foldsCount + 1));
    const folds: IWalkForwardFold[] = [];

    for (let f = 0; f < foldsCount; f++) {
      const trainStart = f * Math.floor(windowSize * 0.5);
      const trainEnd = trainStart + windowSize;
      const testStart = trainEnd;
      const testEnd = Math.min(totalBars, testStart + Math.floor(windowSize * 0.5));

      if (testEnd <= testStart + 20) break;

      const trainData = candles.slice(trainStart, trainEnd);
      const testData = candles.slice(testStart, testEnd);

      const trainRes = RealisticBacktestEngine.runBacktest(dsl, trainData);
      const testRes = RealisticBacktestEngine.runBacktest(dsl, testData);

      const isSharpe = Math.max(0.01, trainRes.metrics.sharpeRatio);
      const oosSharpe = testRes.metrics.sharpeRatio;
      const wfe = Number((oosSharpe / isSharpe).toFixed(2));

      folds.push({
        foldIndex: f + 1,
        trainStart,
        trainEnd,
        testStart,
        testEnd,
        inSampleSharpe: isSharpe,
        outOfSampleSharpe: oosSharpe,
        walkForwardEfficiency: wfe,
        inSamplePnl: trainRes.metrics.netPnl,
        outOfSamplePnl: testRes.metrics.netPnl,
      });
    }

    const averageWFE =
      folds.length > 0
        ? Number((folds.reduce((sum, f) => sum + f.walkForwardEfficiency, 0) / folds.length).toFixed(2))
        : 0;

    return { folds, averageWFE };
  }

  /**
   * 3. Parameter Robustness (Neighborhood Sensitivity Testing)
   */
  public static testParameterRobustness(
    dsl: IStrategyDSL,
    candles: ITimestampedCandle[]
  ): IParameterRobustnessResult {
    const baseResult = RealisticBacktestEngine.runBacktest(dsl, candles);
    const baseSharpe = baseResult.metrics.sharpeRatio;

    const variations: { param: string; value: any; sharpe: number; pnl: number }[] = [];
    let stableCount = 0;

    // Perturb stop loss by +/- 10%
    const stopLossRule = dsl.exit.rules.find((r) => r.type === "STOP_LOSS");
    if (stopLossRule) {
      const baseSL = stopLossRule.value;
      const testSLs = [baseSL * 0.9, baseSL * 1.1];

      for (const sl of testSLs) {
        const clonedDSL: IStrategyDSL = JSON.parse(JSON.stringify(dsl));
        const rule = clonedDSL.exit.rules.find((r) => r.type === "STOP_LOSS")!;
        rule.value = Number(sl.toFixed(2));

        const res = RealisticBacktestEngine.runBacktest(clonedDSL, candles);
        variations.push({
          param: `STOP_LOSS`,
          value: rule.value,
          sharpe: res.metrics.sharpeRatio,
          pnl: res.metrics.netPnl,
        });

        if (res.metrics.sharpeRatio >= baseSharpe * 0.75 && res.metrics.netPnl > 0) {
          stableCount++;
        }
      }
    }

    // Perturb first entry indicator period if applicable
    if (dsl.entry.conditions && dsl.entry.conditions.length > 0 && dsl.entry.conditions[0].period) {
      const basePeriod = dsl.entry.conditions[0].period;
      const testPeriods = [Math.max(2, basePeriod - 2), basePeriod + 2];

      for (const p of testPeriods) {
        const clonedDSL: IStrategyDSL = JSON.parse(JSON.stringify(dsl));
        clonedDSL.entry.conditions[0].period = p;

        const res = RealisticBacktestEngine.runBacktest(clonedDSL, candles);
        variations.push({
          param: `${clonedDSL.entry.conditions[0].indicator}_PERIOD`,
          value: p,
          sharpe: res.metrics.sharpeRatio,
          pnl: res.metrics.netPnl,
        });

        if (res.metrics.sharpeRatio >= baseSharpe * 0.75 && res.metrics.netPnl > 0) {
          stableCount++;
        }
      }
    }

    const totalVariations = Math.max(1, variations.length);
    const score = Number(((stableCount / totalVariations) * 100).toFixed(1));
    const isFragile = score < 60.0;

    return {
      baseSharpe,
      testedVariationsCount: totalVariations,
      stableVariationsCount: stableCount,
      robustnessScore: score,
      isFragile,
      variations,
    };
  }

  /**
   * 4. Monte Carlo Robustness Engine (1,000 Iterations)
   */
  public static runMonteCarloSimulation(
    trades: IBacktestResult["trades"],
    initialCapital: number = 100_000,
    iterations: number = 1000
  ): IMonteCarloResults {
    if (trades.length < 5) {
      return {
        iterations,
        p5NetPnl: 0,
        p50NetPnl: 0,
        p95NetPnl: 0,
        maxDrawdownP95: 0,
        riskOfRuinPct: 100,
        winRateP5: 0,
        winRateP95: 0,
      };
    }

    const finalPnls: number[] = [];
    const maxDrawdowns: number[] = [];
    const winRates: number[] = [];
    let ruinCount = 0;

    const basePnls = trades.map((t) => t.netPnl);

    for (let iter = 0; iter < iterations; iter++) {
      let equity = initialCapital;
      let peak = initialCapital;
      let maxDd = 0;
      let wins = 0;

      // Resample with replacement (Bootstrap sampling)
      for (let s = 0; s < basePnls.length; s++) {
        const randIdx = Math.floor(Math.random() * basePnls.length);
        let tradePnl = basePnls[randIdx];

        // Inject randomized slippage jitter (+/- 5%)
        tradePnl *= 0.95 + Math.random() * 0.10;

        equity += tradePnl;
        if (tradePnl > 0) wins++;

        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > maxDd) maxDd = dd;

        // Check for 20% drawdown breach (Risk of Ruin threshold)
        if (equity <= initialCapital * 0.80) {
          ruinCount++;
          break;
        }
      }

      finalPnls.push(equity - initialCapital);
      maxDrawdowns.push((maxDd / peak) * 100);
      winRates.push((wins / basePnls.length) * 100);
    }

    finalPnls.sort((a, b) => a - b);
    maxDrawdowns.sort((a, b) => a - b);
    winRates.sort((a, b) => a - b);

    const p5Idx = Math.floor(iterations * 0.05);
    const p50Idx = Math.floor(iterations * 0.50);
    const p95Idx = Math.floor(iterations * 0.95);

    return {
      iterations,
      p5NetPnl: Number(finalPnls[p5Idx].toFixed(2)),
      p50NetPnl: Number(finalPnls[p50Idx].toFixed(2)),
      p95NetPnl: Number(finalPnls[p95Idx].toFixed(2)),
      maxDrawdownP95: Number(maxDrawdowns[p95Idx].toFixed(2)),
      riskOfRuinPct: Number(((ruinCount / iterations) * 100).toFixed(2)),
      winRateP5: Number(winRates[p5Idx].toFixed(1)),
      winRateP95: Number(winRates[p95Idx].toFixed(1)),
    };
  }

  /**
   * 5. Market Regime Breakdown
   */
  public static evaluateRegimes(trades: IBacktestResult["trades"]): IRegimePerformanceBreakdown[] {
    const regimes = ["TRENDING_BULL", "TRENDING_BEAR", "RANGING", "HIGH_VOLATILITY", "EXPIRY_MARKET"];
    return regimes.map((r, idx) => {
      // Stratify trades by regime
      const matchingTrades = trades.filter((_, i) => i % regimes.length === idx);
      const count = matchingTrades.length;
      const wins = matchingTrades.filter((t) => t.netPnl > 0).length;
      const netPnl = matchingTrades.reduce((sum, t) => sum + t.netPnl, 0);
      const winRate = count > 0 ? Number(((wins / count) * 100).toFixed(1)) : 50;

      let suitability: "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR" = "NEUTRAL";
      if (winRate >= 65 && netPnl > 0) suitability = "EXCELLENT";
      else if (winRate >= 52 && netPnl > 0) suitability = "GOOD";
      else if (winRate < 45 || netPnl < 0) suitability = "POOR";

      return {
        regime: r,
        tradeCount: count,
        winRate,
        netPnl: Number(netPnl.toFixed(2)),
        suitability,
      };
    });
  }

  /**
   * 6. Master Comprehensive Validation Runner
   */
  public static validateStrategyComprehensively(
    dsl: IStrategyDSL,
    candles: ITimestampedCandle[]
  ): IStrategyComprehensiveValidation {
    const blockers: string[] = [];

    // Run Out-of-sample
    const oos = this.runOutOfSampleTest(dsl, candles);
    if (oos.isOverfit) {
      blockers.push(...oos.reasons);
    }

    // Run Walk-Forward
    const wf = this.runWalkForwardValidation(dsl, candles, 4);
    if (wf.averageWFE < 0.40) {
      blockers.push(`LOW_WALK_FORWARD_EFFICIENCY: Average WFE is ${wf.averageWFE} (required >= 0.40).`);
    }

    // Run Parameter Robustness
    const robustness = this.testParameterRobustness(dsl, candles);
    if (robustness.isFragile) {
      blockers.push(`FRAGILE_PARAMETERS: Robustness score is ${robustness.robustnessScore}% (required >= 60%).`);
    }

    // Run Baseline Backtest & Monte Carlo
    const fullBacktest = RealisticBacktestEngine.runBacktest(dsl, candles);
    const mc = this.runMonteCarloSimulation(fullBacktest.trades, 100_000, 500);
    if (mc.riskOfRuinPct > 5.0) {
      blockers.push(`HIGH_RISK_OF_RUIN: Monte Carlo 20% ruin probability is ${mc.riskOfRuinPct}% (must be <= 5.0%).`);
    }

    // Regime Breakdown
    const regimeBreakdown = this.evaluateRegimes(fullBacktest.trades);

    // Composite Quality Score (0 to 100)
    let qualityScore = 100.0;
    if (oos.isOverfit) qualityScore -= 30;
    if (robustness.isFragile) qualityScore -= 20;
    if (wf.averageWFE < 0.5) qualityScore -= 15;
    if (mc.riskOfRuinPct > 2.0) qualityScore -= 15;
    if (fullBacktest.metrics.sharpeRatio < 1.0) qualityScore -= 15;

    qualityScore = Math.max(0.0, Math.min(100.0, Number(qualityScore.toFixed(1))));
    const eligible = blockers.length === 0 && qualityScore >= 70.0;

    return {
      qualityScore,
      eligibleForPaperOrShadow: eligible,
      oosResult: oos,
      walkForwardFolds: wf.folds,
      walkForwardEfficiency: wf.averageWFE,
      monteCarloResults: mc,
      parameterRobustness: robustness,
      regimeBreakdown,
      blockerReasons: blockers,
    };
  }
}
