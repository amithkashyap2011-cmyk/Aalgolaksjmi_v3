/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Model Correlation & Redundancy Engine (Phase 7)
 * ═══════════════════════════════════════════════════════════════════
 * Computes pairwise prediction correlation between models and
 * calculates effective number of independent information sources.
 *
 * This replaces the naive 1/√(N_family) penalty with mathematically
 * justified dependence adjustment based on actual prediction data.
 *
 * Requires ≥ MIN_CORRELATION_SAMPLES paired observations before
 * switching from prior-based penalty to empirical correlation.
 */

import { ForwardTelemetryStore } from "./ForwardTelemetryStore.js";

// ═══════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════

export interface PairwiseCorrelation {
  modelA: string;
  modelB: string;
  probabilityCorrelation: number;  // Pearson on P(BUY) vectors
  directionalAgreement: number;    // Fraction where both agree on direction
  residualCorrelation: number;     // Pearson on prediction errors
  pairedSampleCount: number;
}

export interface CorrelationMatrix {
  models: string[];
  matrix: number[][];          // N×N Pearson correlation matrix
  directionalMatrix: number[][]; // N×N directional agreement matrix
  effectiveN: number;          // Effective number of independent models
  sampleCount: number;
  isCalibrated: boolean;       // True if sufficient data exists
}

export interface EffectiveIndependenceResult {
  effectiveFraction: number;   // 0 to 1: fraction of true independent info
  effectiveModelCount: number; // Adjusted N_eff
  rawModelCount: number;
  averageCorrelation: number;
  isCalibrated: boolean;
  method: "EMPIRICAL_CORRELATION" | "PRIOR_FAMILY_BASED";
}

// ═══════════════════════════════════════════════════════════════════
//  Engine
// ═══════════════════════════════════════════════════════════════════

export class ModelCorrelationEngine {
  public static readonly MIN_CORRELATION_SAMPLES = 30;

  /**
   * Computes the full N×N pairwise correlation matrix for given models.
   */
  public static computeCorrelationMatrix(modelNames: string[]): CorrelationMatrix {
    const n = modelNames.length;
    const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    const directionalMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

    const vectors = ForwardTelemetryStore.getModelPredictionVectors(modelNames);
    const resolved = ForwardTelemetryStore.getResolvedRecords();
    const sampleCount = resolved.length;
    const isCalibrated = sampleCount >= this.MIN_CORRELATION_SAMPLES;

    if (!isCalibrated) {
      // Return identity matrix (each model is assumed independent)
      for (let i = 0; i < n; i++) {
        matrix[i][i] = 1.0;
        directionalMatrix[i][i] = 1.0;
      }
      return {
        models: modelNames,
        matrix,
        directionalMatrix,
        effectiveN: n,
        sampleCount,
        isCalibrated: false
      };
    }

    // Compute pairwise correlations
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1.0;
      directionalMatrix[i][i] = 1.0;

      for (let j = i + 1; j < n; j++) {
        const pair = this.computePairwise(
          modelNames[i], modelNames[j],
          vectors[modelNames[i]], vectors[modelNames[j]],
          resolved
        );
        matrix[i][j] = pair.probabilityCorrelation;
        matrix[j][i] = pair.probabilityCorrelation;
        directionalMatrix[i][j] = pair.directionalAgreement;
        directionalMatrix[j][i] = pair.directionalAgreement;
      }
    }

    // Compute effective N using average pairwise correlation
    const avgCorr = this.computeAverageOffDiagonal(matrix, n);
    const effectiveN = this.computeEffectiveN(n, avgCorr);

    return {
      models: modelNames,
      matrix,
      directionalMatrix,
      effectiveN,
      sampleCount,
      isCalibrated: true
    };
  }

  /**
   * Computes effective independence adjustment for a family of models.
   * Returns a multiplier in [0, 1] that represents the fraction of
   * truly independent information the family contributes.
   */
  public static getEffectiveIndependence(
    familyModelNames: string[],
    fallbackFamilyCount: number
  ): EffectiveIndependenceResult {
    const n = familyModelNames.length;
    if (n <= 1) {
      return {
        effectiveFraction: 1.0,
        effectiveModelCount: 1,
        rawModelCount: n,
        averageCorrelation: 0,
        isCalibrated: false,
        method: "PRIOR_FAMILY_BASED"
      };
    }

    const resolvedCount = ForwardTelemetryStore.getResolvedCount();

    if (resolvedCount < this.MIN_CORRELATION_SAMPLES) {
      // Fall back to prior family-based penalty: max(0.30, 1/√N)
      const priorPenalty = Math.max(0.30, 1.0 / Math.sqrt(fallbackFamilyCount));
      return {
        effectiveFraction: priorPenalty,
        effectiveModelCount: Math.max(1, Math.round(n * priorPenalty)),
        rawModelCount: n,
        averageCorrelation: 0,
        isCalibrated: false,
        method: "PRIOR_FAMILY_BASED"
      };
    }

    // Compute empirical correlation within this family
    const corrMatrix = this.computeCorrelationMatrix(familyModelNames);
    const avgCorr = this.computeAverageOffDiagonal(corrMatrix.matrix, n);
    const effectiveN = this.computeEffectiveN(n, avgCorr);
    const effectiveFraction = Number(Math.min(1.0, Math.max(0.15, effectiveN / n)).toFixed(4));

    return {
      effectiveFraction,
      effectiveModelCount: Math.max(1, Math.round(effectiveN)),
      rawModelCount: n,
      averageCorrelation: Number(avgCorr.toFixed(4)),
      isCalibrated: true,
      method: "EMPIRICAL_CORRELATION"
    };
  }

  /**
   * Gets all pairwise correlations for a set of models.
   */
  public static getAllPairwise(modelNames: string[]): PairwiseCorrelation[] {
    const vectors = ForwardTelemetryStore.getModelPredictionVectors(modelNames);
    const resolved = ForwardTelemetryStore.getResolvedRecords();
    const pairs: PairwiseCorrelation[] = [];

    for (let i = 0; i < modelNames.length; i++) {
      for (let j = i + 1; j < modelNames.length; j++) {
        pairs.push(this.computePairwise(
          modelNames[i], modelNames[j],
          vectors[modelNames[i]], vectors[modelNames[j]],
          resolved
        ));
      }
    }

    return pairs;
  }

  // ─── Private Helpers ───

  /**
   * Computes Pearson correlation between two arrays, ignoring NaN-paired entries.
   */
  private static pearsonCorrelation(x: number[], y: number[]): number {
    const pairs: [number, number][] = [];
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      if (!isNaN(x[i]) && !isNaN(y[i]) && isFinite(x[i]) && isFinite(y[i])) {
        pairs.push([x[i], y[i]]);
      }
    }

    if (pairs.length < 5) return 0; // Insufficient data

    const n = pairs.length;
    const meanX = pairs.reduce((s, p) => s + p[0], 0) / n;
    const meanY = pairs.reduce((s, p) => s + p[1], 0) / n;

    let covXY = 0, varX = 0, varY = 0;
    for (const [xi, yi] of pairs) {
      covXY += (xi - meanX) * (yi - meanY);
      varX += (xi - meanX) ** 2;
      varY += (yi - meanY) ** 2;
    }

    const denom = Math.sqrt(varX * varY);
    if (denom < 1e-12) return 0;

    return Number(Math.min(1.0, Math.max(-1.0, covXY / denom)).toFixed(6));
  }

  private static computePairwise(
    nameA: string, nameB: string,
    vectorsA: number[][], vectorsB: number[][],
    resolved: any[]
  ): PairwiseCorrelation {
    // Extract P(LONG) for probability correlation
    const pLongA: number[] = vectorsA.map(v => v[0]);
    const pLongB: number[] = vectorsB.map(v => v[0]);
    const probabilityCorrelation = this.pearsonCorrelation(pLongA, pLongB);

    // Directional agreement: fraction of times both models agree on argmax direction
    let agreeCount = 0;
    let pairCount = 0;
    for (let i = 0; i < Math.min(vectorsA.length, vectorsB.length); i++) {
      if (isNaN(vectorsA[i][0]) || isNaN(vectorsB[i][0])) continue;
      pairCount++;

      const dirA = vectorsA[i][0] > vectorsA[i][1] ? "LONG" : (vectorsA[i][1] > vectorsA[i][0] ? "SHORT" : "HOLD");
      const dirB = vectorsB[i][0] > vectorsB[i][1] ? "LONG" : (vectorsB[i][1] > vectorsB[i][0] ? "SHORT" : "HOLD");
      if (dirA === dirB) agreeCount++;
    }
    const directionalAgreement = pairCount > 0 ? Number((agreeCount / pairCount).toFixed(4)) : 0.5;

    // Residual correlation: correlation of prediction errors relative to outcome
    const errA: number[] = [];
    const errB: number[] = [];
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      if (!r.outcome) continue;
      const snapA = r.modelBreakdowns[nameA];
      const snapB = r.modelBreakdowns[nameB];
      if (!snapA?.participating || !snapB?.participating) continue;

      const actualBinary = r.outcome.outcomeResult === "WIN" ? 1 : 0;
      errA.push(snapA.probLong - actualBinary);
      errB.push(snapB.probLong - actualBinary);
    }
    const residualCorrelation = this.pearsonCorrelation(errA, errB);

    return {
      modelA: nameA,
      modelB: nameB,
      probabilityCorrelation,
      directionalAgreement,
      residualCorrelation,
      pairedSampleCount: pairCount
    };
  }

  /**
   * Computes average off-diagonal correlation.
   */
  private static computeAverageOffDiagonal(matrix: number[][], n: number): number {
    if (n <= 1) return 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        sum += Math.abs(matrix[i][j]);
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  /**
   * Computes effective number of independent models given average pairwise correlation.
   * Uses the formula: N_eff = N / (1 + (N-1) * avg_corr)
   * This is the standard formula from portfolio theory for effective diversification.
   */
  private static computeEffectiveN(n: number, avgCorrelation: number): number {
    if (n <= 1) return n;
    const clampedCorr = Math.min(1.0, Math.max(0, avgCorrelation));
    const denominator = 1 + (n - 1) * clampedCorr;
    return Math.max(1, n / denominator);
  }
}
