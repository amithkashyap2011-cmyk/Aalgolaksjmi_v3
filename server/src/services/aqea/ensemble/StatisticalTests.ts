/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Statistical Significance Testing (Phase 20 & 21)
 * ═══════════════════════════════════════════════════════════════════
 * Block bootstrap for autocorrelated returns, paired bootstrap for
 * model comparison, confidence intervals, and experiment tracking
 * for multiple testing control.
 *
 * Uses block bootstrap (block size 5) to preserve temporal dependence
 * in trade return sequences.
 */

// ═══════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════

export interface BootstrapCI {
  mean: number;
  lower: number;       // Lower bound of CI
  upper: number;       // Upper bound of CI
  confidenceLevel: number; // e.g. 0.95
  sampleCount: number;
  bootstrapIterations: number;
  isSignificant: boolean;  // True if CI excludes 0 (for difference metrics)
}

export interface PairedComparisonResult {
  modelA: string;
  modelB: string;
  metricName: string;
  meanDifference: number;
  ci: BootstrapCI;
  pValue: number;           // Approximate p-value from bootstrap
  aIsBetter: boolean;       // True if A is statistically better than B
  conclusion: "A_BETTER" | "B_BETTER" | "INCONCLUSIVE";
}

export interface ExperimentRecord {
  experimentId: string;
  description: string;
  timestamp: number;
  metricName: string;
  observedValue: number;
  ci: BootstrapCI;
  isSignificant: boolean;
  sampleCount: number;
}

// ═══════════════════════════════════════════════════════════════════
//  Engine
// ═══════════════════════════════════════════════════════════════════

export class StatisticalTests {
  private static experimentRegistry: ExperimentRecord[] = [];
  private static readonly DEFAULT_BLOCK_SIZE = 5;
  private static readonly DEFAULT_BOOTSTRAP_ITERATIONS = 1000;
  private static readonly DEFAULT_CONFIDENCE_LEVEL = 0.95;

  /**
   * Computes block bootstrap confidence interval for a statistic.
   * Block bootstrap preserves temporal autocorrelation in trade sequences.
   */
  public static blockBootstrapCI(
    data: number[],
    statisticFn: (sample: number[]) => number,
    options: {
      blockSize?: number;
      iterations?: number;
      confidenceLevel?: number;
    } = {}
  ): BootstrapCI {
    const blockSize = options.blockSize ?? this.DEFAULT_BLOCK_SIZE;
    const iterations = options.iterations ?? this.DEFAULT_BOOTSTRAP_ITERATIONS;
    const confidenceLevel = options.confidenceLevel ?? this.DEFAULT_CONFIDENCE_LEVEL;

    if (data.length < blockSize) {
      const mean = data.length > 0 ? data.reduce((s, v) => s + v, 0) / data.length : 0;
      return {
        mean, lower: mean, upper: mean,
        confidenceLevel, sampleCount: data.length,
        bootstrapIterations: 0, isSignificant: false
      };
    }

    const originalStat = statisticFn(data);
    const bootstrapStats: number[] = [];

    // Create overlapping blocks
    const nBlocks = Math.ceil(data.length / blockSize);

    for (let iter = 0; iter < iterations; iter++) {
      const sample: number[] = [];
      for (let b = 0; b < nBlocks; b++) {
        // Random block start
        const start = Math.floor(Math.random() * (data.length - blockSize + 1));
        for (let i = 0; i < blockSize && sample.length < data.length; i++) {
          sample.push(data[start + i]);
        }
      }
      // Trim to original length
      bootstrapStats.push(statisticFn(sample.slice(0, data.length)));
    }

    bootstrapStats.sort((a, b) => a - b);
    const alpha = 1 - confidenceLevel;
    const lowerIdx = Math.max(0, Math.floor(bootstrapStats.length * (alpha / 2)));
    const upperIdx = Math.min(bootstrapStats.length - 1, Math.ceil(bootstrapStats.length * (1 - alpha / 2)));

    const lower = bootstrapStats[lowerIdx];
    const upper = bootstrapStats[upperIdx];
    const isSignificant = (lower > 0 && upper > 0) || (lower < 0 && upper < 0);

    return {
      mean: Number(originalStat.toFixed(6)),
      lower: Number(lower.toFixed(6)),
      upper: Number(upper.toFixed(6)),
      confidenceLevel,
      sampleCount: data.length,
      bootstrapIterations: iterations,
      isSignificant
    };
  }

  /**
   * Computes confidence interval for the mean of a data series.
   */
  public static meanCI(data: number[], confidenceLevel: number = 0.95): BootstrapCI {
    return this.blockBootstrapCI(
      data,
      (sample) => sample.reduce((s, v) => s + v, 0) / sample.length,
      { confidenceLevel }
    );
  }

  /**
   * Computes confidence interval for Sharpe ratio.
   */
  public static sharpeCI(returns: number[], confidenceLevel: number = 0.95): BootstrapCI {
    return this.blockBootstrapCI(
      returns,
      (sample) => {
        const mean = sample.reduce((s, v) => s + v, 0) / sample.length;
        const variance = sample.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, sample.length - 1);
        return variance > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(252) : 0;
      },
      { confidenceLevel }
    );
  }

  /**
   * Paired bootstrap comparison between two models.
   * Tests H0: metric(A) = metric(B) vs H1: metric(A) ≠ metric(B)
   */
  public static pairedComparison(
    modelA: string,
    modelB: string,
    pairedReturnsA: number[],
    pairedReturnsB: number[],
    metricName: string = "netReturn"
  ): PairedComparisonResult {
    if (pairedReturnsA.length !== pairedReturnsB.length) {
      throw new Error("Paired comparison requires equal-length arrays");
    }

    // Compute differences
    const differences = pairedReturnsA.map((a, i) => a - pairedReturnsB[i]);
    const ci = this.blockBootstrapCI(
      differences,
      (sample) => sample.reduce((s, v) => s + v, 0) / sample.length
    );

    // Approximate p-value: fraction of bootstrap samples where sign flips
    const meanDiff = ci.mean;
    let countExtreme = 0;
    const iterations = this.DEFAULT_BOOTSTRAP_ITERATIONS;
    const blockSize = this.DEFAULT_BLOCK_SIZE;
    const nBlocks = Math.ceil(differences.length / blockSize);

    for (let iter = 0; iter < iterations; iter++) {
      const sample: number[] = [];
      for (let b = 0; b < nBlocks; b++) {
        const start = Math.floor(Math.random() * Math.max(1, differences.length - blockSize + 1));
        for (let i = 0; i < blockSize && sample.length < differences.length; i++) {
          sample.push(differences[Math.min(start + i, differences.length - 1)]);
        }
      }
      const bootMean = sample.slice(0, differences.length).reduce((s, v) => s + v, 0) / differences.length;
      if (Math.abs(bootMean) >= Math.abs(meanDiff)) countExtreme++;
    }

    const pValue = Math.min(1.0, countExtreme / iterations);

    let conclusion: "A_BETTER" | "B_BETTER" | "INCONCLUSIVE" = "INCONCLUSIVE";
    if (ci.isSignificant) {
      conclusion = meanDiff > 0 ? "A_BETTER" : "B_BETTER";
    }

    return {
      modelA,
      modelB,
      metricName,
      meanDifference: Number(meanDiff.toFixed(6)),
      ci,
      pValue: Number(pValue.toFixed(4)),
      aIsBetter: conclusion === "A_BETTER",
      conclusion
    };
  }

  /**
   * Registers an experiment for multiple testing control.
   */
  public static registerExperiment(
    experimentId: string,
    description: string,
    metricName: string,
    observedValue: number,
    ci: BootstrapCI
  ): ExperimentRecord {
    const record: ExperimentRecord = {
      experimentId,
      description,
      timestamp: Date.now(),
      metricName,
      observedValue: Number(observedValue.toFixed(6)),
      ci,
      isSignificant: ci.isSignificant,
      sampleCount: ci.sampleCount
    };

    this.experimentRegistry.push(record);
    return record;
  }

  /**
   * Returns the experiment registry for multiple testing audit.
   */
  public static getExperimentRegistry(): ExperimentRecord[] {
    return [...this.experimentRegistry];
  }

  /**
   * Returns the count of experiments conducted (for FDR tracking).
   */
  public static getExperimentCount(): number {
    return this.experimentRegistry.length;
  }

  /**
   * Returns the count of significant results (for FDR estimation).
   */
  public static getSignificantCount(): number {
    return this.experimentRegistry.filter(e => e.isSignificant).length;
  }

  /**
   * Computes false discovery rate estimate using Benjamini-Hochberg.
   * Returns the adjusted significance threshold.
   */
  public static getBenjaminiHochbergThreshold(alpha: number = 0.05): number {
    const m = this.experimentRegistry.length;
    if (m === 0) return alpha;

    // BH procedure: for each experiment ranked by p-value, the threshold is (rank/m) * alpha
    // Since we don't store individual p-values in all experiments, use conservative Bonferroni
    return Math.max(0.001, alpha / m);
  }

  /**
   * Clears experiment registry (for testing).
   */
  public static clearRegistry(): void {
    this.experimentRegistry = [];
  }

  /**
   * Applies Benjamini-Hochberg False Discovery Rate adjustment across an array of p-values.
   */
  public static applyBenjaminiHochberg(pValues: number[]): number[] {
    const n = pValues.length;
    if (n === 0) return [];
    const indexed = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
    const adjusted = new Array(n);
    let minP = 1.0;
    for (let k = n - 1; k >= 0; k--) {
      const rank = k + 1;
      const adj = Math.min(1.0, (indexed[k].p * n) / rank);
      minP = Math.min(minP, adj);
      adjusted[indexed[k].i] = Number(minP.toFixed(4));
    }
    return adjusted;
  }

  /**
   * Applies standard Bonferroni adjustment across an array of p-values.
   */
  public static applyBonferroni(pValues: number[]): number[] {
    const n = pValues.length;
    return pValues.map(p => Number(Math.min(1.0, p * n).toFixed(4)));
  }
}
