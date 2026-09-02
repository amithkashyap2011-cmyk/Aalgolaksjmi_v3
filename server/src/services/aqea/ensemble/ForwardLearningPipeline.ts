/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — 12-Stage Forward-Learning Pipeline Orchestrator
 * ═══════════════════════════════════════════════════════════════════
 * Formal implementation of the 12-step quantitative governance cycle:
 *
 *  1. PERSIST
 *     ↓
 *  2. COLLECT ≥100 genuine OOS observations
 *     ↓
 *  3. CALIBRATE
 *     ↓
 *  4. MODEL CONTRIBUTION (Leave-One-Out)
 *     ↓
 *  5. CORRELATION / REDUNDANCY (Effective N_eff)
 *     ↓
 *  6. SUBSET SEARCH (S* = argmax Utility(S))
 *     ↓
 *  7. COST-ADJUSTED EV (DynamicCostModel)
 *     ↓
 *  8. BOOTSTRAP CONFIDENCE INTERVAL (Block Bootstrap CI > 0)
 *     ↓
 *  9. UNTOUCHED FORWARD VALIDATION (Holdout Walk-Forward)
 *     ↓
 * 10. MODEL WEIGHT UPDATE (Bayesian Shrinkage)
 *     ↓
 * 11. ONLY THEN consider retraining
 *     ↓
 * 12. ONLY THEN consider promotion
 */

import { ForwardTelemetryStore, ModelOOSScorecard, ModelLeaveOneOutContribution } from "./ForwardTelemetryStore.js";
import { ModelCorrelationEngine, CorrelationMatrix } from "./ModelCorrelationEngine.js";
import { ModelSubsetOptimizer, SubsetSearchResult, SubsetEvaluation } from "./ModelSubsetOptimizer.js";
import { StatisticalTests, BootstrapCI, PairedComparisonResult } from "./StatisticalTests.js";
import { ModelPromotionPolicy, PromotionEvaluationResult } from "./ModelPromotionPolicy.js";
import { ModelScorecardRegistry } from "./ModelScorecard.js";
import { DynamicCostModel } from "./DynamicCostModel.js";
import { BiasControlEngine, BiasAuditReport } from "../governance/BiasControlEngine.js";
import { AQEA_CONFIG } from "../config.js";

// ═══════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════

export interface ForwardLearningPipelineReport {
  timestamp: number;
  stage:
    | "STAGE_1_PERSISTENCE_READY"
    | "STAGE_2_COLLECTING_OOS_DATA"
    | "STAGE_3_CALIBRATION_COMPLETE"
    | "STAGE_4_CONTRIBUTION_ANALYZED"
    | "STAGE_5_CORRELATION_AUDITED"
    | "STAGE_6_SUBSET_OPTIMIZED"
    | "STAGE_7_COST_EV_VERIFIED"
    | "STAGE_8_BOOTSTRAP_VALIDATED"
    | "STAGE_9_FORWARD_HOLDOUT_PASSED"
    | "STAGE_10_WEIGHTS_UPDATED"
    | "STAGE_11_RETRAINING_EVALUATED"
    | "STAGE_12_PROMOTION_EVALUATED";
  sampleCount: number;
  minRequiredSamples: number;
  hasSufficientData: boolean;
  governanceStatus: {
    paperValidationActive: boolean;
    livePromotionBlocked: boolean;
    modelRetrainingDeferred: boolean;
    architectureFrozen: boolean;
  };
  scorecards: Record<string, ModelOOSScorecard>;
  leaveOneOutAttributions: Record<string, ModelLeaveOneOutContribution>;
  biasAudit?: BiasAuditReport;
  correlationMatrix?: CorrelationMatrix;
  subsetOptimization?: SubsetSearchResult;
  bootstrapConfidenceInterval?: BootstrapCI;
  holdoutValidation?: {
    holdoutSampleCount: number;
    holdoutNetEV: number;
    holdoutBrier: number;
    passed: boolean;
  };
  weightUpdates?: Record<string, number>;
  retrainingCandidates: {
    modelName: string;
    justified: boolean;
    reasons: string[];
  }[];
  promotionCandidates: {
    modelName: string;
    eligible: boolean;
    reasons: string[];
  }[];
  summary: string;
}

// ═══════════════════════════════════════════════════════════════════
//  Pipeline Orchestrator
// ═══════════════════════════════════════════════════════════════════

export class ForwardLearningPipeline {
  private static MIN_OOS_SAMPLES = AQEA_CONFIG.SUBSET_OPTIMIZER?.MIN_OOS_SAMPLES ?? 100;

  /**
   * Executes the full 12-step quantitative forward-learning cycle.
   * Fail-closed: halts at Stage 2 if N < 100 persistent OOS observations.
   */
  public static async executeCycle(
    candidateModels: string[] = [
      "MAMBA_RESEARCH_V1",
      "CNN_1D_V1_BENCHMARK",
      "BILSTM_V1_BENCHMARK",
      "AARYAN_MOMENTUM",
      "AAYUSH_MEAN_REVERSION",
      "SMC_INSTITUTIONAL",
      "ORDER_FLOW_CVD",
      "GAYATRI_24_SIGNAL",
      "OHMKARA_528HZ",
      "FINANCIAL_NLP"
    ]
  ): Promise<ForwardLearningPipelineReport> {
    const timestamp = Date.now();

    // ── STAGE 1: PERSIST ──
    const totalDecisions = ForwardTelemetryStore.getStats().totalDecisions;
    const resolvedRecords = ForwardTelemetryStore.getResolvedRecords();
    const n = resolvedRecords.length;

    // ── STAGE 2: COLLECT ≥100 GENUINE OOS OBSERVATIONS ──
    const hasSufficientData = n >= this.MIN_OOS_SAMPLES;

    if (!hasSufficientData) {
      // Reconstruct preliminary scorecards for monitoring
      const scorecards: Record<string, ModelOOSScorecard> = {};
      const loos: Record<string, ModelLeaveOneOutContribution> = {};
      for (const m of candidateModels) {
        scorecards[m] = ForwardTelemetryStore.reconstructModelScorecard(m);
        loos[m] = ForwardTelemetryStore.computeLeaveOneOutAttribution(m);
      }

      return {
        timestamp,
        stage: "STAGE_2_COLLECTING_OOS_DATA",
        sampleCount: n,
        minRequiredSamples: this.MIN_OOS_SAMPLES,
        hasSufficientData: false,
        governanceStatus: {
          paperValidationActive: true,
          livePromotionBlocked: true,
          modelRetrainingDeferred: true,
          architectureFrozen: false
        },
        scorecards,
        leaveOneOutAttributions: loos,
        retrainingCandidates: candidateModels.map(m => ({
          modelName: m,
          justified: false,
          reasons: [`INSUFFICIENT_OOS_DATA: ${n}/${this.MIN_OOS_SAMPLES} required observations`]
        })),
        promotionCandidates: candidateModels.map(m => ({
          modelName: m,
          eligible: false,
          reasons: [`INSUFFICIENT_OOS_DATA: ${n}/${this.MIN_OOS_SAMPLES} required observations`]
        })),
        summary: `STAGE 2 HALT: Persistent telemetry active. Currently collected ${n}/${this.MIN_OOS_SAMPLES} OOS observations. Retraining and live promotion strictly blocked.`
      };
    }

    // ── STAGE 3: CALIBRATE ──
    const scorecards: Record<string, ModelOOSScorecard> = {};
    for (const m of candidateModels) {
      scorecards[m] = ForwardTelemetryStore.reconstructModelScorecard(m);
    }

    // ── STAGE 4: MODEL CONTRIBUTION (LOO) ──
    const loos: Record<string, ModelLeaveOneOutContribution> = {};
    for (const m of candidateModels) {
      loos[m] = ForwardTelemetryStore.computeLeaveOneOutAttribution(m);
    }

    // ── STAGE 5: CORRELATION / REDUNDANCY ──
    const correlationMatrix = ModelCorrelationEngine.computeCorrelationMatrix(candidateModels);

    // ── STAGE 6: SUBSET SEARCH ──
    // Split into training forward (80%) and untouched holdout (20%)
    const splitIdx = Math.floor(n * 0.80);
    const trainForward = resolvedRecords.slice(0, splitIdx);
    const holdoutForward = resolvedRecords.slice(splitIdx);

    const subsetSearchResult = ModelSubsetOptimizer.search(candidateModels, {
      minOOSSamples: Math.max(30, Math.floor(this.MIN_OOS_SAMPLES * 0.8)),
      minNetEV: 0.0,
      maxDrawdown: 15.0,
      minProfitFactor: 1.30,
      maxBrier: 0.24
    });

    const optimalSubset = subsetSearchResult.optimalSubset;
    const selectedModels = optimalSubset ? optimalSubset.models : candidateModels;

    // ── STAGE 7: COST-ADJUSTED EV ──
    // Evaluate selected subset under DynamicCostModel
    const holdoutEval = ModelSubsetOptimizer.evaluateSubset(selectedModels, holdoutForward, {
      ...subsetSearchResult.config,
      minOOSSamples: holdoutForward.length
    });

    // ── STAGE 8: BOOTSTRAP CONFIDENCE INTERVAL ──
    const holdoutReturns = holdoutForward.map(r => r.outcome?.realizedReturn ?? 0);
    const bootstrapCI = StatisticalTests.meanCI(holdoutReturns, 0.95);

    // ── STAGE 9: UNTOUCHED FORWARD VALIDATION ──
    const holdoutPassed = holdoutEval.passesConstraints && bootstrapCI.isSignificant && bootstrapCI.lower > 0;

    // ── STAGE 10: MODEL WEIGHT UPDATE (With Bias Control Correction) ──
    const biasAudit = BiasControlEngine.evaluateBias(candidateModels);
    const rawWeights: Record<string, number> = {};
    const k = AQEA_CONFIG.SUBSET_OPTIMIZER?.SHRINKAGE_K_GLOBAL ?? 30;
    const reliability = n / (n + k);

    for (const m of candidateModels) {
      const card = scorecards[m];
      const isSelected = selectedModels.includes(m);
      if (!isSelected) {
        rawWeights[m] = 0.0; // Excluded from active subset
      } else {
        const pf = card.trading.profitFactor ?? 1.0;
        const rawW = Math.min(0.40, Math.max(0.05, 0.15 * (pf / 1.5)));
        rawWeights[m] = Number(((reliability * rawW) + ((1 - reliability) * 0.15)).toFixed(4));
      }
    }

    // Apply Bias Penalty: w_i* = w_i * (1 - BiasPenalty_i)
    const weightUpdates = BiasControlEngine.applyBiasAwareWeightCorrection(rawWeights, biasAudit.modelPenalties);

    // ── STAGE 11: ONLY THEN CONSIDER RETRAINING ──
    const retrainingCandidates: { modelName: string; justified: boolean; reasons: string[] }[] = [];
    for (const m of candidateModels) {
      const card = scorecards[m];
      const loo = loos[m];
      const reasons: string[] = [];
      let justified = false;

      const brier = card.predictive.brierScore;
      if (brier !== null && brier > 0.25 && loo.deltaNetEV < 0) {
        justified = true;
        reasons.push(`PERSISTENT_DEGRADATION: Brier ${brier} > 0.25, Negative LOO EV (${loo.deltaNetEV.toFixed(6)})`);
      } else {
        reasons.push("NO_RETRAINING_JUSTIFIED: Model is performing within calibrated boundaries or has positive LOO contribution");
      }

      retrainingCandidates.push({ modelName: m, justified, reasons });
    }

    // ── STAGE 12: ONLY THEN CONSIDER PROMOTION ──
    const promotionCandidates: { modelName: string; eligible: boolean; reasons: string[] }[] = [];
    for (const m of candidateModels) {
      const card = ModelScorecardRegistry.getOrCreate(m);
      const evalResult = ModelPromotionPolicy.evaluateCandidate(card);
      promotionCandidates.push({
        modelName: m,
        eligible: evalResult.eligible && holdoutPassed,
        reasons: evalResult.reasons
      });
    }

    return {
      timestamp,
      stage: "STAGE_12_PROMOTION_EVALUATED",
      sampleCount: n,
      minRequiredSamples: this.MIN_OOS_SAMPLES,
      hasSufficientData: true,
      governanceStatus: {
        paperValidationActive: true,
        livePromotionBlocked: !promotionCandidates.some(c => c.eligible),
        modelRetrainingDeferred: !retrainingCandidates.some(c => c.justified),
        architectureFrozen: false
      },
      scorecards,
      leaveOneOutAttributions: loos,
      biasAudit,
      correlationMatrix,
      subsetOptimization: subsetSearchResult,
      bootstrapConfidenceInterval: bootstrapCI,
      holdoutValidation: {
        holdoutSampleCount: holdoutForward.length,
        holdoutNetEV: holdoutEval.netEV,
        holdoutBrier: holdoutEval.brierScore,
        passed: holdoutPassed
      },
      weightUpdates,
      retrainingCandidates,
      promotionCandidates,
      summary: `STAGE 12 COMPLETE: Evaluated ${n} OOS observations across 12 governance stages. Selected minimum subset: [${selectedModels.join(", ")}]. Holdout validation passed: ${holdoutPassed}.`
    };
  }
}
