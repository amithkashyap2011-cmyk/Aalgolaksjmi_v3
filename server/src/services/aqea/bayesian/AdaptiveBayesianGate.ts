/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Adaptive Bayesian Conviction Gate (Phase 6)
 * ═══════════════════════════════════════════════════════════════════
 * Calibrated Bayesian conviction gate with dynamic regime adaptation,
 * empirical base rates, and bounded posterior computation.
 */

import { Standardized15Features } from "../pipeline/FeaturePipeline.js";
import { AnyRegime } from "../regimeEngine.js";

export interface BayesianCalibrationRecord {
  regime: string;
  realizedOutcome: "WIN" | "LOSS";
  priorOdds: number;
  posteriorProbability: number;
  timestamp: number;
}

export interface BayesianEvaluationResult {
  passesGate: boolean;
  posteriorProbability: number;
  calibratedProbability: number;
  requiredThreshold: number;
  priorOdds: number;
  likelihoodRatio: number;
  calibrationMethod: "EMPIRICAL_BASE_RATE" | "ANALYTICAL_PRIOR_FALLBACK";
  sampleCount: number;
  calibrationConfidence: number;
  rejectionReason: string | null;
  regime: AnyRegime;
  meta: any;
}

export class AdaptiveBayesianGate {
  private static calibrationRecords: BayesianCalibrationRecord[] = [];
  private static MIN_EMPIRICAL_SAMPLES = 25;

  public static recordOutcome(record: BayesianCalibrationRecord): void {
    this.calibrationRecords.push(record);
    if (this.calibrationRecords.length > 1000) {
      this.calibrationRecords.shift();
    }
  }

  /**
   * Evaluates the trade setup using Bayesian conviction calculation.
   */
  public static evaluate(
    compositeProbability: number,
    compositeUncertainty: number,
    features: Standardized15Features,
    regime: AnyRegime,
    direction: "LONG" | "SHORT" | "HOLD" = "HOLD"
  ): BayesianEvaluationResult {
    const rStr = String(regime || "RANGING");

    // Check if empirical calibration observations exist for this regime
    const regimeRecords = this.calibrationRecords.filter(r => r.regime === rStr);
    let priorOdds = 0.50;
    let calibrationMethod: "EMPIRICAL_BASE_RATE" | "ANALYTICAL_PRIOR_FALLBACK" = "ANALYTICAL_PRIOR_FALLBACK";
    let calibrationConfidence = 0.60;

    if (regimeRecords.length >= this.MIN_EMPIRICAL_SAMPLES) {
      const empiricalWinRate = regimeRecords.filter(r => r.realizedOutcome === "WIN").length / regimeRecords.length;
      priorOdds = Math.min(0.70, Math.max(0.30, empiricalWinRate));
      calibrationMethod = "EMPIRICAL_BASE_RATE";
      calibrationConfidence = Math.min(0.95, 0.60 + (regimeRecords.length / 200) * 0.35);
    } else {
      // Analytical baseline priors by market regime
      if (rStr.includes("TRENDING")) priorOdds = 0.58;
      else if (rStr === "BREAKOUT") priorOdds = 0.54;
      else if (rStr === "HIGH_VOLATILITY") priorOdds = 0.42;
      else if (rStr === "CRISIS") priorOdds = 0.30;
      else if (rStr === "SIDEWAYS" || regime === "RANGING") priorOdds = 0.48;
    }

    const obScore = Math.abs(features.orderBook?.imbalance ?? 0);
    const cvdScore = Math.min(1.0, Math.abs(features.cvd?.cvdScore ?? 0) / 50);
    const smcScore = ((features.smc?.orderBlock ? 0.3 : 0) + (features.smc?.fvg ? 0.3 : 0) + (features.smc?.bos ? 0.4 : 0));
    const microEvidence = (smcScore * 0.4) + (cvdScore * 0.3) + (obScore * 0.3);

    const safeProb = Number.isFinite(compositeProbability) ? compositeProbability : 0.50;
    const safeUncertainty = Number.isFinite(compositeUncertainty) ? compositeUncertainty : 0.0;

    const clampedProb = Math.min(0.98, Math.max(0.02, safeProb));
    const modelLikelihoodRatio = clampedProb / (1 - clampedProb);
    const microMultiplier = 1 + ((microEvidence - 0.3) * 0.3);
    const likelihoodRatio = modelLikelihoodRatio * microMultiplier;

    const priorRatio = priorOdds / (1 - priorOdds);
    const posteriorOdds = priorRatio * likelihoodRatio;
    const posteriorBefore = posteriorOdds / (1 + posteriorOdds);
    let posteriorProbability = posteriorBefore;

    // Apply uncertainty discount penalty
    const confidenceFactor = 1 - safeUncertainty * 0.10;
    posteriorProbability = Math.min(0.999, Math.max(0.001, posteriorProbability * confidenceFactor));

    let requiredThreshold = 0.82;

    if (rStr === "CRISIS" || regime === "WEATHER_STRESS") {
      requiredThreshold = 0.93;
    } else if (rStr === "HIGH_VOLATILITY") {
      requiredThreshold = 0.88;
    } else if (rStr === "TRENDING_UP" || regime === "TRENDING_DOWN" || regime === "TRENDING_BULL" || regime === "TRENDING_BEAR") {
      requiredThreshold = 0.78;
    } else if (rStr === "BREAKOUT" || regime === "TRANSITION") {
      requiredThreshold = 0.80;
    } else if (rStr === "MEAN_REVERSION" || regime === "LOW_VOLATILITY") {
      requiredThreshold = 0.82;
    }

    if (features.atr?.volatilityState === "EXTREME") {
      requiredThreshold += 0.03;
    }

    requiredThreshold = Number(Math.min(0.95, Math.max(0.70, requiredThreshold)).toFixed(4));
    posteriorProbability = Number(posteriorProbability.toFixed(4));

    const lQuality = Number(modelLikelihoodRatio.toFixed(4));
    const lConfidence = Number(confidenceFactor.toFixed(4));
    const lAdx = Number((priorOdds / 0.50).toFixed(4)); // relative to neutral 0.50
    const lHtf = 1.0;
    const lSmart = Number(microMultiplier.toFixed(4));

    // Determine largest negative/suppressing factor (lowest relative multiplier)
    const factorMap: Record<string, number> = {
      quality: lQuality,
      confidence: lConfidence,
      adx: lAdx,
      smart: lSmart
    };
    let largestNegativeLikelihoodFactor = "quality";
    let minFactorVal = Infinity;
    for (const [k, v] of Object.entries(factorMap)) {
      if (v < minFactorVal) {
        minFactorVal = v;
        largestNegativeLikelihoodFactor = k;
      }
    }

    const passesGate = direction === "HOLD" ? true : posteriorProbability >= requiredThreshold;
    const rejectionReason = passesGate
      ? null
      : `BAYESIAN_CONVICTION_INSUFFICIENT: Posterior ${posteriorProbability} < Required Threshold ${requiredThreshold} in ${regime}`;

    return {
      passesGate,
      posteriorProbability,
      calibratedProbability: posteriorProbability,
      requiredThreshold,
      priorOdds: Number(priorOdds.toFixed(4)),
      likelihoodRatio: Number(likelihoodRatio.toFixed(4)),
      calibrationMethod,
      sampleCount: regimeRecords.length,
      calibrationConfidence: Number(calibrationConfidence.toFixed(4)),
      rejectionReason,
      regime,
      meta: {
        direction,
        modelLikelihoodRatio: lQuality,
        microMultiplier: lSmart,
        uncertaintyPenalty: Number((compositeUncertainty * 0.10).toFixed(4)),
        posteriorOdds: Number(posteriorOdds.toFixed(4)),
        posteriorBefore: Number(posteriorBefore.toFixed(4)),
        posteriorFinal: posteriorProbability,
        lQuality,
        lConfidence,
        lAdx,
        lHtf,
        lSmart,
        largestNegativeLikelihoodFactor
      }
    };
  }
}
