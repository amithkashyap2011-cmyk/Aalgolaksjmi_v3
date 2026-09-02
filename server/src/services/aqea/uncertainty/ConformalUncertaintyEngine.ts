/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Inductive Split Conformal Uncertainty Engine (Phase 4)
 * ═══════════════════════════════════════════════════════════════════
 * Implements genuine Inductive Conformal Prediction (ICP) using empirical
 * non-conformity scores from historical out-of-sample prediction errors.
 */

import { Standardized15Features } from "../pipeline/FeaturePipeline.js";
import { AnyRegime } from "../regimeEngine.js";

export interface ConformalCalibrationPoint {
  predictedProbability: number;
  realizedBinaryOutcome: number; // 1 for win, 0 for loss
  nonConformityScore: number;    // |y - p|
  regime: string;
  timestamp: number;
}

export interface UncertaintyEvaluationResult {
  passesUncertaintyGate: boolean;
  uncertaintyScore: number;
  maxAllowedUncertainty: number;
  predictionInterval: [number, number];
  intervalWidth: number;
  conformalQuantile: number;
  calibrationSampleSize: number;
  isFormallyCalibrated: boolean;
  calibrationHealth: "OPTIMAL" | "ACCEPTABLE" | "DEGRADED" | "UNCALIBRATED_FALLBACK";
  rejectionReason: string | null;
  mode?: "LIVE" | "PAPER";
}

export class ConformalUncertaintyEngine {
  private static calibrationBuffer: ConformalCalibrationPoint[] = [];
  private static MAX_CALIBRATION_SIZE = 500;
  private static MIN_REQUIRED_CALIBRATION_SAMPLES = 30;

  /**
   * Adds an out-of-sample realized outcome to the conformal calibration buffer.
   */
  public static recordCalibrationPoint(point: Omit<ConformalCalibrationPoint, "nonConformityScore">): void {
    const nonConformityScore = Math.abs(point.realizedBinaryOutcome - point.predictedProbability);
    this.calibrationBuffer.push({ ...point, nonConformityScore });
    if (this.calibrationBuffer.length > this.MAX_CALIBRATION_SIZE) {
      this.calibrationBuffer.shift();
    }
  }

  /**
   * Calculates the empirical (1 - alpha) quantile of non-conformity scores.
   */
  public static computeQuantile(significanceLevel: number = 0.10, regimeFilter?: string): number {
    let scores = this.calibrationBuffer.map(p => p.nonConformityScore);
    if (regimeFilter) {
      const regimeScores = this.calibrationBuffer.filter(p => p.regime === regimeFilter).map(p => p.nonConformityScore);
      if (regimeScores.length >= this.MIN_REQUIRED_CALIBRATION_SAMPLES) {
        scores = regimeScores;
      }
    }

    if (scores.length === 0) return 0.25; // Default uncalibrated margin

    scores.sort((a, b) => a - b);
    const n = scores.length;
    // Standard conformal quantile index: ceil((n + 1) * (1 - alpha)) / n
    const targetIdx = Math.min(n - 1, Math.max(0, Math.ceil((n + 1) * (1 - significanceLevel)) - 1));
    return scores[targetIdx];
  }

  public static getCalibrationSize(): number {
    return this.calibrationBuffer.length;
  }

  /**
   * Evaluates prediction uncertainty using Inductive Conformal Prediction.
   */
  public static evaluate(
    compositeUncertainty: number,
    compositeProbability: number,
    features: Standardized15Features,
    regime: AnyRegime,
    mode: "LIVE" | "PAPER" = "PAPER"
  ): UncertaintyEvaluationResult {
    const sampleSize = this.calibrationBuffer.length;
    const isFormallyCalibrated = sampleSize >= this.MIN_REQUIRED_CALIBRATION_SAMPLES;
    const rStr = String(regime || "RANGING");

    // Compute quantile for 90% confidence level (alpha = 0.10)
    const conformalQuantile = isFormallyCalibrated 
      ? this.computeQuantile(0.10, rStr)
      : Math.min(0.40, Math.max(0.15, compositeUncertainty * 0.35));

    const intervalLower = Number(Math.max(0.0, compositeProbability - conformalQuantile).toFixed(4));
    const intervalUpper = Number(Math.min(1.0, compositeProbability + conformalQuantile).toFixed(4));
    const intervalWidth = Number((intervalUpper - intervalLower).toFixed(4));

    let maxAllowed = 0.35;
    if (rStr === "CRISIS" || regime === "WEATHER_STRESS") maxAllowed = 0.18;
    else if (rStr === "HIGH_VOLATILITY") maxAllowed = 0.24;
    else if (rStr === "BREAKOUT") maxAllowed = 0.30;

    let passesUncertaintyGate = true;
    let rejectionReason: string | null = null;

    // Safety Gate Rule: In LIVE mode, insufficient conformal calibration must halt trading
    if (mode === "LIVE" && !isFormallyCalibrated) {
      passesUncertaintyGate = false;
      rejectionReason = `LIVE_SAFETY_REJECT: Insufficient conformal calibration (${sampleSize}/${this.MIN_REQUIRED_CALIBRATION_SAMPLES} samples required)`;
    } else if (conformalQuantile > maxAllowed) {
      passesUncertaintyGate = false;
      rejectionReason = `CONFORMAL_UNCERTAINTY_EXCESSIVE: Quantile margin ${conformalQuantile.toFixed(4)} > Max Allowed ${maxAllowed} (Interval: [${intervalLower}, ${intervalUpper}])`;
    }

    const calibrationHealth: "OPTIMAL" | "ACCEPTABLE" | "DEGRADED" | "UNCALIBRATED_FALLBACK" =
      !isFormallyCalibrated 
        ? "UNCALIBRATED_FALLBACK"
        : (conformalQuantile < 0.20 ? "OPTIMAL" : (conformalQuantile < 0.35 ? "ACCEPTABLE" : "DEGRADED"));

    return {
      passesUncertaintyGate,
      uncertaintyScore: Number(conformalQuantile.toFixed(4)),
      maxAllowedUncertainty: maxAllowed,
      predictionInterval: [intervalLower, intervalUpper],
      intervalWidth,
      conformalQuantile: Number(conformalQuantile.toFixed(4)),
      calibrationSampleSize: sampleSize,
      isFormallyCalibrated,
      calibrationHealth,
      rejectionReason,
      mode
    };
  }
}
