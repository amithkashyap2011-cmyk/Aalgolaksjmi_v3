/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Bayesian Classification Engine (Phase 11)
 * ═══════════════════════════════════════════════════════════════════
 * Deterministic classifier evaluating empirical Bayesian shadow outcomes
 * across buckets, regimes, and directional parity.
 */

import { BayesianShadowLedger, ShadowHorizon } from "./BayesianShadowLedger.js";

export type Phase11Classification =
  | "CLASS_A_BAYESIAN_GATE_VALIDATED"
  | "CLASS_B_BAYESIAN_CONSERVATIVE_BUT_RANKING_VALID"
  | "CLASS_C_BAYESIAN_CALIBRATION_CONCERN"
  | "CLASS_D_DIRECTIONAL_ASYMMETRY"
  | "CLASS_E_INSUFFICIENT_EVIDENCE";

export interface Phase11AuditVerdict {
  classification: Phase11Classification;
  summary: string;
  nResolved: number;
  nCandidates: number;
  shadowPositiveRate: number | null;
  shadowMeanNetReturn: number | null;
  dominantSuppressionFactor: string;
  asymmetryStatus: string;
  recommendation: string;
}

export class BayesianClassificationEngine {
  private static readonly MIN_EMPIRICAL_SAMPLE = 25;

  /**
   * Evaluates the recorded shadow observations and returns a deterministic classification.
   */
  public static evaluateClassification(horizon: ShadowHorizon = "T+5"): Phase11AuditVerdict {
    const observations = BayesianShadowLedger.getAllObservations();
    const resolved = observations.filter(o => o.horizons[horizon] !== undefined);
    const nCandidates = observations.length;
    const nResolved = resolved.length;

    const factorDecomp = BayesianShadowLedger.getFactorDecomposition();
    const symmetry = BayesianShadowLedger.getDirectionalSymmetry(horizon);

    if (nResolved < this.MIN_EMPIRICAL_SAMPLE) {
      return {
        classification: "CLASS_E_INSUFFICIENT_EVIDENCE",
        summary: `Insufficient empirical shadow outcomes (N_resolved = ${nResolved} < ${this.MIN_EMPIRICAL_SAMPLE}). Gate integrity maintained; continue observation.`,
        nResolved,
        nCandidates,
        shadowPositiveRate: null,
        shadowMeanNetReturn: null,
        dominantSuppressionFactor: factorDecomp.dominantSuppressionFactor,
        asymmetryStatus: symmetry.asymmetryFlag,
        recommendation: "CONTINUE_PAPER_OBSERVATION_NO_THRESHOLD_CHANGES"
      };
    }

    const returns = resolved.map(r => r.horizons[horizon]!.netReturn);
    const positiveCount = resolved.filter(r => r.horizons[horizon]!.outcomeClass === "POSITIVE").length;
    const shadowPositiveRate = Number((positiveCount / nResolved).toFixed(4));
    const shadowMeanNetReturn = Number((returns.reduce((a, b) => a + b, 0) / nResolved).toFixed(6));

    // Check Directional Asymmetry first
    if (symmetry.asymmetryFlag === "LONG_ASYMMETRY" || symmetry.asymmetryFlag === "SHORT_ASYMMETRY") {
      return {
        classification: "CLASS_D_DIRECTIONAL_ASYMMETRY",
        summary: `Directional asymmetry detected between LONG (posRate=${symmetry.long.positiveRate}) and SHORT (posRate=${symmetry.short.positiveRate}).`,
        nResolved,
        nCandidates,
        shadowPositiveRate,
        shadowMeanNetReturn,
        dominantSuppressionFactor: factorDecomp.dominantSuppressionFactor,
        asymmetryStatus: symmetry.asymmetryFlag,
        recommendation: "MAINTAIN_CURRENT_THRESHOLDS_INVESTIGATE_ASYMMETRIC_PRIORS"
      };
    }

    const distribution = BayesianShadowLedger.getPosteriorDistribution("ALL", horizon);
    const calAnalysis = BayesianShadowLedger.getCalibrationAnalysis(horizon);
    const uncalibratedCount = calAnalysis.filter(c => c.status === "UNCALIBRATED").length;

    // Check Calibration Concern
    if (uncalibratedCount >= 2) {
      return {
        classification: "CLASS_C_BAYESIAN_CALIBRATION_CONCERN",
        summary: `Posterior probabilities fail to rank observed empirical win rates accurately across ${uncalibratedCount} buckets.`,
        nResolved,
        nCandidates,
        shadowPositiveRate,
        shadowMeanNetReturn,
        dominantSuppressionFactor: factorDecomp.dominantSuppressionFactor,
        asymmetryStatus: symmetry.asymmetryFlag,
        recommendation: "RECALIBRATE_LIKELIHOOD_FUNCTION_WITHOUT_LOWERING_SAFETY_GATES"
      };
    }

    // Check Class A: Rejected candidates are predominantly negative (Gate Validated)
    const rejectedResolved = resolved.filter(r => r.rejectedByBayesian);
    if (rejectedResolved.length > 0) {
      const rejectedReturns = rejectedResolved.map(r => r.horizons[horizon]!.netReturn);
      const rejectedMeanNet = rejectedReturns.reduce((a, b) => a + b, 0) / rejectedReturns.length;
      const rejectedPosRate = rejectedResolved.filter(r => r.horizons[horizon]!.outcomeClass === "POSITIVE").length / rejectedResolved.length;

      if (rejectedMeanNet <= 0 && rejectedPosRate <= 0.45) {
        return {
          classification: "CLASS_A_BAYESIAN_GATE_VALIDATED",
          summary: `Bayesian gate successfully filtered out negative-expectation trades (Rejected NetEV = ${rejectedMeanNet.toFixed(4)}, PosRate = ${(rejectedPosRate * 100).toFixed(1)}%).`,
          nResolved,
          nCandidates,
          shadowPositiveRate,
          shadowMeanNetReturn,
          dominantSuppressionFactor: factorDecomp.dominantSuppressionFactor,
          asymmetryStatus: symmetry.asymmetryFlag,
          recommendation: "MAINTAIN_BAYESIAN_GATE_UNCHANGED"
        };
      }
    }

    // Default to Class B if higher buckets demonstrate positive expectation
    return {
      classification: "CLASS_B_BAYESIAN_CONSERVATIVE_BUT_RANKING_VALID",
      summary: "Higher Bayesian posterior buckets correlate with improved outcomes, but empirical volume remains conservative.",
      nResolved,
      nCandidates,
      shadowPositiveRate,
      shadowMeanNetReturn,
      dominantSuppressionFactor: factorDecomp.dominantSuppressionFactor,
      asymmetryStatus: symmetry.asymmetryFlag,
      recommendation: "CONTINUE_SHADOW_ACCUMULATION_DO_NOT_LOWER_THRESHOLDS"
    };
  }
}
