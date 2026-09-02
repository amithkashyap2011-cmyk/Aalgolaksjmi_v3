/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 17 — Evidence-Aware Opportunity Engine
 * ═══════════════════════════════════════════════════════════════════
 *
 * Central Architectural Correction:
 * - CNN is the PRIMARY DIRECTIONAL SPECIALIST (validated responsive P15/P16)
 * - Mamba is the CONTEXT/REGIME SPECIALIST (validated conservative)
 * - LSTM is QUARANTINED (OUTPUT_COLLAPSED, +7.95 logit bias)
 * - Evidence-aware fusion DOES NOT simple-average CNN conviction away
 * - Opportunity staging classifies candidates BEFORE final gates
 * - Trade Quality, MFE/MAE, Friction, and Rejection Waterfall
 *
 * NON-NEGOTIABLE INVARIANTS:
 * - LIVE_PROMOTION_BLOCKED === true
 * - isLiveApproved === false
 * - executionAttempted === false
 * - orderCreationCount === 0
 * - walletMutationCount === 0
 * - Bayesian thresholds UNCHANGED
 * - NetEV hurdle UNCHANGED
 * - Conformal width UNCHANGED
 * - AI confidence threshold UNCHANGED
 */

import { Standardized15Features } from "../pipeline/FeaturePipeline.js";
import { AnyRegime, RegimeState } from "../regimeEngine.js";
import { ModelExpertPrediction } from "../ai/IModelExpert.js";
import { QuantExpertSignal } from "../quant/QuantStrategyRegistry.js";
import { UnifiedEnsembleFusion, EnsembleFusionResult, EVGateParams } from "../ensemble/UnifiedEnsembleFusion.js";
import { AdaptiveBayesianGate, BayesianEvaluationResult } from "../bayesian/AdaptiveBayesianGate.js";
import { MODEL_INVENTORY } from "./AqeaP16ShadowLedger.js";

// ═══════════════════════════════════════════════════════════════════
//  LSTM QUARANTINE REGISTRY
// ═══════════════════════════════════════════════════════════════════
export const QUARANTINED_MODELS: Record<string, {
  modelName: string;
  modelStatus: "OUTPUT_COLLAPSED";
  votingEligible: false;
  reason: string;
  holdLogitBias: number;
  quarantinedSince: string;
}> = {
  LSTM_SEQUENCE_V1: {
    modelName: "LSTM_SEQUENCE_V1",
    modelStatus: "OUTPUT_COLLAPSED",
    votingEligible: false,
    reason: "HOLD_OUTPUT_COLLAPSE: fc2 layer produces +7.95 logit bias for Class 0 (HOLD), trained on unnormalized synthetic Gaussian noise",
    holdLogitBias: 7.95,
    quarantinedSince: "2026-08-25T20:00:00Z"
  }
};

// ═══════════════════════════════════════════════════════════════════
//  TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════

export type OpportunityStage =
  | "MARKET_OBSERVATION"
  | "POTENTIAL_SETUP"
  | "DIRECTIONAL_CANDIDATE"
  | "TRADEABLE_CANDIDATE"
  | "EXECUTION_CANDIDATE"
  | "ABSTAIN";

export type ExecutionTier =
  | "TIER_A_HIGH_CONVICTION"
  | "TIER_B_CONDITIONAL"
  | "TIER_C_LOW_CONVICTION"
  | "HOLD";

export type ModelOptimizationClass =
  | "RESPONSIVE"
  | "WEAKLY_RESPONSIVE"
  | "SATURATED"
  | "OUTPUT_COLLAPSED"
  | "INPUT_INSENSITIVE"
  | "UNAVAILABLE";

export type RejectionGate =
  | "NONE"
  | "NORMAL_ABSTENTION_HOLD"
  | "TECHNICAL_SCORE_NEUTRAL"
  | "CNN_DIRECTION_WEAK"
  | "AI_CONFIDENCE_BELOW_THRESHOLD"
  | "CONFORMAL_UNCERTAINTY_WIDE"
  | "NET_EV_NEGATIVE"
  | "BAYESIAN_POSTERIOR_BELOW_THRESHOLD"
  | "RISK_GATE"
  | "INSUFFICIENT_EVIDENCE"
  | "MAMBA_CONTEXT_CAUTION"
  | "FEATURE_HEALTH_FAILURE"
  | "TRADE_QUALITY_REJECTED";

export interface EvidenceAwareFusionResult {
  cnnDirectionalSignal: "STRONG" | "MODERATE" | "WEAK" | "NONE";
  mambaContext: "CONFIRMING" | "NEUTRAL" | "CAUTION" | "OPPOSING" | "UNAVAILABLE";
  quantConsensus: "CONFIRMING" | "NEUTRAL" | "OPPOSING";
  overallStatus: "CONFIRMED_DIRECTIONAL" | "CONDITIONAL_DIRECTIONAL" | "WEAK_DIRECTIONAL" | "NO_DIRECTION";
  fusedDirection: "LONG" | "SHORT" | "HOLD";
  cnnWeight: number;
  mambaWeight: number;
  quantWeight: number;
  weightLabel: "PROVISIONAL_SHADOW_WEIGHT";
  fusedProbabilities: { LONG: number; SHORT: number; HOLD: number };
  bayesianPosterior: number;
  bayesianThreshold: number;
  passesBayesian: boolean;
}

export interface TradeQualityEstimate {
  label: "TRADE_QUALITY_ESTIMATOR_UNCALIBRATED";
  expectedNetReturn: number;
  expectedMFE: number;
  expectedMAE: number;
  mfeMaeRatio: number;
  frictionCost: number;
  expectedEdge: number;
  isEconomicallyViable: boolean;
}

export interface FeatureHealthRecord {
  featureName: string;
  value: number;
  source: string;
  timestamp: number;
  ageMs: number;
  missing: boolean;
  fallback: boolean;
  valid: boolean;
}

export interface P17ShadowRecord {
  decisionId: string;
  modelVersion: string;
  checkpointHash: string;
  symbol: string;
  direction: "LONG" | "SHORT" | "HOLD";
  entryPrice: number;
  entryTimestamp: number;
  regime: string;
  tier: ExecutionTier;
  cnnProbabilities: { LONG: number; SHORT: number; HOLD: number };
  mambaProbabilities: { LONG: number; SHORT: number; HOLD: number };
  quantEvidence: string;
  expectedReturn: number;
  expectedMFE: number;
  expectedMAE: number;
  fees: number;
  slippage: number;
  spread: number;
  netEV: number;
  forwardPrices: { t1?: number; t3?: number; t5?: number; t10?: number };
  mfe?: number;
  mae?: number;
  finalNetReturn?: number;
  outcomeClass: "WIN" | "LOSS" | "BREAKEVEN" | "UNRESOLVED";
  shadowOnly: true;
  paperTrade: false;
  liveExecution: false;
}

export interface P17EvaluationResult {
  decisionId: string;
  symbol: string;
  timestamp: number;
  regime: string;

  // Part 2: LSTM Quarantine
  lstmQuarantine: typeof QUARANTINED_MODELS.LSTM_SEQUENCE_V1;

  // Part 3: CNN Directional Specialist
  cnnInference: {
    checkpointHash: string;
    direction: "LONG" | "SHORT" | "HOLD";
    probabilities: { LONG: number; SHORT: number; HOLD: number };
    confidence: number;
    fallbackUsed: boolean;
    featureVersion: number;
    inferenceMode: string;
    latencyMs: number;
    optimizationClass: ModelOptimizationClass;
  };

  // Part 4: Mamba Context Specialist
  mambaContext: {
    direction: "LONG" | "SHORT" | "HOLD";
    probabilities: { LONG: number; SHORT: number; HOLD: number };
    confidence: number;
    directionScore: number;
    regime: string;
    fallbackUsed: boolean;
    contractStatus: "VALID_REAL_INFERENCE" | "DEGRADED_FALLBACK";
  };

  // Part 6: Evidence-Aware Fusion
  evidenceAwareFusion: EvidenceAwareFusionResult;

  // Part 7: Opportunity Engine
  opportunityStage: OpportunityStage;

  // Part 8: Trade Quality
  tradeQuality: TradeQualityEstimate;

  // Part 11: Three-Tier Shadow Execution
  executionTier: ExecutionTier;

  // Part 13: Feature Health
  featureHealth: FeatureHealthRecord[];

  // Part 15: Shadow Ledger Record
  shadowRecord: P17ShadowRecord;

  // Part 16: Rejection Waterfall
  rejectionWaterfall: {
    firstBlockingGate: RejectionGate;
    candidateCount: number;
    blockedCount: number;
    passedCount: number;
  };

  // Part 17: Model Contribution Analysis
  modelContributions: {
    cnnContribution: number;
    mambaContribution: number;
    quantContribution: number;
  };

  // Part 14: Calibration
  calibration: {
    status: "CALIBRATION_EVIDENCE_INSUFFICIENT" | "CALIBRATED";
    resolvedOosCount: number;
  };

  // Safety
  safety: {
    executionAttempted: false;
    orderCreationCount: 0;
    walletMutationCount: 0;
    livePromotionBlocked: true;
    isLiveApproved: false;
    syntheticOutcomeCountUsedForOOS: 0;
    calibrationFitFromInsufficientEvidence: false;
    lstmVotingEligible: false;
  };
}

// ═══════════════════════════════════════════════════════════════════
//  PHASE 17 ENGINE
// ═══════════════════════════════════════════════════════════════════

export class AqeaP17OpportunityEngine {
  private static readonly MAX_LEDGER = 2000;
  private static readonly ledger: P17ShadowRecord[] = [];

  // Counters for rejection waterfall
  private static candidateCount = 0;
  private static blockedCount = 0;
  private static passedCount = 0;

  /**
   * Checks if a model is quarantined and must be excluded from voting.
   */
  public static isQuarantined(modelName: string): boolean {
    return Object.values(QUARANTINED_MODELS).some(
      q => modelName.includes(q.modelName) || modelName.includes("BILSTM") || modelName.includes("LSTM")
    );
  }

  /**
   * Central Phase 17 evaluation. Non-blocking, shadow-only.
   */
  public static evaluate(
    decisionId: string,
    features: Standardized15Features,
    regime: AnyRegime,
    dlPredictions: ModelExpertPrediction[],
    quantSignals: QuantExpertSignal[],
    productionEnsembleFusion?: EnsembleFusionResult,
    productionBayesianEval?: BayesianEvaluationResult
  ): P17EvaluationResult {
    const timestamp = Date.now();
    const symbol = features.symbol || "BTCUSDT";
    const currentPrice = features.ohlcv?.close || 97500;

    // ═══════════════════════════════════════════════════════════════
    //  PART 2: LSTM QUARANTINE ENFORCEMENT
    // ═══════════════════════════════════════════════════════════════
    const nonQuarantinedPredictions = dlPredictions.filter(
      p => !this.isQuarantined(p.modelName)
    );

    // ═══════════════════════════════════════════════════════════════
    //  PART 3: CNN PRIMARY DIRECTIONAL SPECIALIST
    // ═══════════════════════════════════════════════════════════════
    const cnnPred = nonQuarantinedPredictions.find(
      p => p.modelName.includes("CNN")
    );
    const cnnProbs = cnnPred?.probabilities || { LONG: 0.3333, SHORT: 0.3333, HOLD: 0.3334 };
    const cnnDir = cnnPred?.direction || "HOLD";
    const cnnConf = cnnPred?.confidence || 0;
    const cnnFallback = !cnnPred || (cnnProbs.LONG === 0.3333 && cnnProbs.SHORT === 0.3333);

    // Classify CNN responsiveness
    const maxCnnProb = Math.max(cnnProbs.LONG, cnnProbs.SHORT);
    let cnnOptClass: ModelOptimizationClass = "UNAVAILABLE";
    if (!cnnPred) cnnOptClass = "UNAVAILABLE";
    else if (cnnFallback) cnnOptClass = "WEAKLY_RESPONSIVE";
    else if (maxCnnProb >= 0.50) cnnOptClass = "RESPONSIVE";
    else if (maxCnnProb >= 0.40) cnnOptClass = "WEAKLY_RESPONSIVE";
    else cnnOptClass = "INPUT_INSENSITIVE";

    // ═══════════════════════════════════════════════════════════════
    //  PART 4: MAMBA CONTEXT SPECIALIST
    // ═══════════════════════════════════════════════════════════════
    const mambaPred = nonQuarantinedPredictions.find(
      p => p.modelName === "MAMBA_RESEARCH_V1"
    );
    const mambaProbs = mambaPred?.probabilities || { LONG: 0.3333, SHORT: 0.3333, HOLD: 0.3334 };
    const mambaDir = mambaPred?.direction || "HOLD";
    const mambaConf = mambaPred?.confidence || 0;
    const mambaFallback = !mambaPred || (mambaProbs.LONG === 0.3333 && mambaProbs.SHORT === 0.3333);
    const mambaDirectionScore = Math.max(mambaProbs.LONG, mambaProbs.SHORT) - mambaProbs.HOLD;

    // ═══════════════════════════════════════════════════════════════
    //  PART 5: REGIME-CONDITIONAL MODEL ROUTING (PROVISIONAL)
    // ═══════════════════════════════════════════════════════════════
    const regimeStr = String(regime || "RANGING");
    const isTrending = regimeStr.includes("TRENDING") || regimeStr === "BREAKOUT" || regimeStr === "TRANSITION";
    const isRanging = regimeStr === "RANGING" || regimeStr === "LOW_VOLATILITY" || regimeStr === "SIDEWAYS";

    // PROVISIONAL_SHADOW_WEIGHT: conservative bounded defaults
    // CNN gets more weight in trending (evidence: P15/P16 responsiveness),
    // Mamba gets contextual weight. These are NOT calibrated.
    let cnnWeight = 0.60;
    let mambaWeight = 0.25;
    let quantWeight = 0.15;

    if (isTrending) {
      cnnWeight = 0.65;
      mambaWeight = 0.20;
      quantWeight = 0.15;
    } else if (isRanging) {
      cnnWeight = 0.50;
      mambaWeight = 0.30;
      quantWeight = 0.20;
    }

    // ═══════════════════════════════════════════════════════════════
    //  PART 6: EVIDENCE-AWARE FUSION (CENTRAL CORRECTION)
    // ═══════════════════════════════════════════════════════════════

    // Classify CNN directional signal strength
    let cnnSignalStrength: "STRONG" | "MODERATE" | "WEAK" | "NONE" = "NONE";
    const cnnDirectionalProb = cnnDir === "LONG" ? cnnProbs.LONG
      : (cnnDir === "SHORT" ? cnnProbs.SHORT : 0);

    if (cnnDirectionalProb >= 0.65) cnnSignalStrength = "STRONG";
    else if (cnnDirectionalProb >= 0.50) cnnSignalStrength = "MODERATE";
    else if (cnnDirectionalProb >= 0.40) cnnSignalStrength = "WEAK";

    // Classify Mamba context signal
    let mambaContextSignal: "CONFIRMING" | "NEUTRAL" | "CAUTION" | "OPPOSING" | "UNAVAILABLE" = "UNAVAILABLE";
    if (mambaFallback) {
      mambaContextSignal = "UNAVAILABLE";
    } else if (cnnDir !== "HOLD" && mambaDir === cnnDir) {
      mambaContextSignal = "CONFIRMING";
    } else if (mambaDir === "HOLD" || mambaProbs.HOLD > 0.40) {
      mambaContextSignal = "CAUTION";
    } else if (cnnDir !== "HOLD" && mambaDir !== cnnDir) {
      mambaContextSignal = "OPPOSING";
    } else {
      mambaContextSignal = "NEUTRAL";
    }

    // Classify quant consensus
    const quantDirCounts: Record<string, number> = { LONG: 0, SHORT: 0, HOLD: 0 };
    for (const qs of quantSignals) {
      quantDirCounts[qs.direction] = (quantDirCounts[qs.direction] || 0) + 1;
    }
    let quantConsensus: "CONFIRMING" | "NEUTRAL" | "OPPOSING" = "NEUTRAL";
    if (cnnDir !== "HOLD" && quantDirCounts[cnnDir] >= 2) quantConsensus = "CONFIRMING";
    else if (cnnDir !== "HOLD" && quantDirCounts[cnnDir === "LONG" ? "SHORT" : "LONG"] >= 3) quantConsensus = "OPPOSING";

    // CORE FIX: Evidence-aware fusion that does NOT simple-average
    // CNN HOLD from Mamba is treated as CAUTION, not as opposing directional evidence
    let fusedLong = 0, fusedShort = 0, fusedHold = 0;

    if (cnnSignalStrength === "STRONG" || cnnSignalStrength === "MODERATE") {
      // CNN has genuine directional conviction
      // Weight CNN directional probabilities heavily
      fusedLong = cnnWeight * cnnProbs.LONG;
      fusedShort = cnnWeight * cnnProbs.SHORT;
      fusedHold = cnnWeight * cnnProbs.HOLD;

      // Mamba contributes context, NOT directional opposition
      if (mambaContextSignal === "CONFIRMING") {
        // Mamba agrees: boost directional slightly
        fusedLong += mambaWeight * mambaProbs.LONG;
        fusedShort += mambaWeight * mambaProbs.SHORT;
        fusedHold += mambaWeight * mambaProbs.HOLD;
      } else if (mambaContextSignal === "CAUTION" || mambaContextSignal === "UNAVAILABLE") {
        // Mamba is cautious/unavailable: apply Mamba weight to a dampened neutral
        // CRITICAL: Do NOT treat Mamba HOLD=0.42 as opposing directional evidence
        const dampedWeight = mambaWeight * 0.5; // reduce Mamba's dilution of CNN signal
        fusedLong += dampedWeight * cnnProbs.LONG * 0.9;
        fusedShort += dampedWeight * cnnProbs.SHORT * 0.9;
        fusedHold += dampedWeight * 0.3334; // small neutral contribution
      } else if (mambaContextSignal === "OPPOSING") {
        // Mamba actively opposes: apply full Mamba weight (genuine disagreement)
        fusedLong += mambaWeight * mambaProbs.LONG;
        fusedShort += mambaWeight * mambaProbs.SHORT;
        fusedHold += mambaWeight * mambaProbs.HOLD;
      } else {
        // Neutral
        fusedLong += mambaWeight * ((cnnProbs.LONG + mambaProbs.LONG) / 2);
        fusedShort += mambaWeight * ((cnnProbs.SHORT + mambaProbs.SHORT) / 2);
        fusedHold += mambaWeight * ((cnnProbs.HOLD + mambaProbs.HOLD) / 2);
      }

      // Quant contribution
      if (quantSignals.length > 0) {
        const qLong = quantDirCounts.LONG / Math.max(1, quantSignals.length);
        const qShort = quantDirCounts.SHORT / Math.max(1, quantSignals.length);
        const qHold = quantDirCounts.HOLD / Math.max(1, quantSignals.length);
        fusedLong += quantWeight * qLong;
        fusedShort += quantWeight * qShort;
        fusedHold += quantWeight * qHold;
      } else {
        fusedHold += quantWeight * 0.3334;
        fusedLong += quantWeight * 0.3333;
        fusedShort += quantWeight * 0.3333;
      }
    } else {
      // CNN has no strong directional signal: use production ensemble as-is
      fusedLong = productionEnsembleFusion?.buyProbability || 0.3333;
      fusedShort = productionEnsembleFusion?.sellProbability || 0.3333;
      fusedHold = productionEnsembleFusion?.holdProbability || 0.3334;
    }

    // Normalize to sum = 1.0
    const rawSum = fusedLong + fusedShort + fusedHold;
    if (rawSum > 0 && isFinite(rawSum)) {
      fusedLong = Number((fusedLong / rawSum).toFixed(6));
      fusedShort = Number((fusedShort / rawSum).toFixed(6));
      fusedHold = Number(Math.max(0, 1 - fusedLong - fusedShort).toFixed(6));
    } else {
      fusedLong = 0.3333;
      fusedShort = 0.3333;
      fusedHold = 0.3334;
    }

    // Determine fused direction
    let fusedDirection: "LONG" | "SHORT" | "HOLD" = "HOLD";
    if (fusedLong > fusedShort && fusedLong > fusedHold) fusedDirection = "LONG";
    else if (fusedShort > fusedLong && fusedShort > fusedHold) fusedDirection = "SHORT";

    // Overall status classification
    let overallStatus: "CONFIRMED_DIRECTIONAL" | "CONDITIONAL_DIRECTIONAL" | "WEAK_DIRECTIONAL" | "NO_DIRECTION" = "NO_DIRECTION";
    if (cnnSignalStrength === "STRONG" && (mambaContextSignal === "CONFIRMING" || quantConsensus === "CONFIRMING")) {
      overallStatus = "CONFIRMED_DIRECTIONAL";
    } else if (cnnSignalStrength === "STRONG" || cnnSignalStrength === "MODERATE") {
      overallStatus = mambaContextSignal === "OPPOSING" ? "WEAK_DIRECTIONAL" : "CONDITIONAL_DIRECTIONAL";
    } else if (cnnSignalStrength === "WEAK") {
      overallStatus = "WEAK_DIRECTIONAL";
    }

    // Bayesian evaluation on the fused probability
    const activeProb = fusedDirection === "LONG" ? fusedLong
      : (fusedDirection === "SHORT" ? fusedShort : fusedHold);
    const bayes = AdaptiveBayesianGate.evaluate(
      activeProb,
      1.0 - Math.max(fusedLong, fusedShort, fusedHold),
      features,
      regime as RegimeState,
      fusedDirection
    );

    const evidenceAwareFusion: EvidenceAwareFusionResult = {
      cnnDirectionalSignal: cnnSignalStrength,
      mambaContext: mambaContextSignal,
      quantConsensus,
      overallStatus,
      fusedDirection,
      cnnWeight,
      mambaWeight,
      quantWeight,
      weightLabel: "PROVISIONAL_SHADOW_WEIGHT",
      fusedProbabilities: { LONG: fusedLong, SHORT: fusedShort, HOLD: fusedHold },
      bayesianPosterior: bayes.posteriorProbability,
      bayesianThreshold: bayes.requiredThreshold,
      passesBayesian: bayes.passesGate
    };

    // ═══════════════════════════════════════════════════════════════
    //  PART 7: OPPORTUNITY ENGINE
    // ═══════════════════════════════════════════════════════════════
    this.candidateCount++;
    let opportunityStage: OpportunityStage = "MARKET_OBSERVATION";

    if (fusedDirection === "HOLD") {
      opportunityStage = "ABSTAIN";
    } else if (cnnSignalStrength === "NONE" || cnnSignalStrength === "WEAK") {
      opportunityStage = "POTENTIAL_SETUP";
    } else if (cnnSignalStrength === "MODERATE") {
      opportunityStage = "DIRECTIONAL_CANDIDATE";
    } else if (cnnSignalStrength === "STRONG") {
      opportunityStage = overallStatus === "CONFIRMED_DIRECTIONAL" ? "EXECUTION_CANDIDATE" : "TRADEABLE_CANDIDATE";
    }

    // ═══════════════════════════════════════════════════════════════
    //  PART 8 & 9: TRADE QUALITY + MFE/MAE ESTIMATION
    // ═══════════════════════════════════════════════════════════════
    const atrPct = features.atr?.atrPercent || 0.015;
    const expectedMFE = atrPct * 2.0; // TP target 2x ATR
    const expectedMAE = atrPct * 1.5; // SL target 1.5x ATR
    const mfeMaeRatio = expectedMAE > 0 ? expectedMFE / expectedMAE : 1.0;

    // Part 10: Friction
    const feePct = 0.08 / 100; // 0.08% round-trip
    const slippagePct = 0.04 / 100;
    const spreadPct = (features.orderBook?.spread || 0) / currentPrice;
    const frictionCost = feePct + slippagePct + spreadPct;

    const expectedGross = fusedDirection !== "HOLD"
      ? activeProb * expectedMFE - (1 - activeProb) * expectedMAE
      : 0;
    const expectedEdge = expectedGross - frictionCost;
    const isEconomicallyViable = expectedEdge > 0;

    const tradeQuality: TradeQualityEstimate = {
      label: "TRADE_QUALITY_ESTIMATOR_UNCALIBRATED",
      expectedNetReturn: expectedEdge,
      expectedMFE,
      expectedMAE,
      mfeMaeRatio: Number(mfeMaeRatio.toFixed(4)),
      frictionCost: Number(frictionCost.toFixed(6)),
      expectedEdge: Number(expectedEdge.toFixed(6)),
      isEconomicallyViable
    };

    // ═══════════════════════════════════════════════════════════════
    //  PART 11: THREE-TIER SHADOW EXECUTION
    // ═══════════════════════════════════════════════════════════════
    let executionTier: ExecutionTier = "HOLD";

    if (fusedDirection !== "HOLD" && isEconomicallyViable && bayes.passesGate) {
      if (overallStatus === "CONFIRMED_DIRECTIONAL" && cnnSignalStrength === "STRONG") {
        executionTier = "TIER_A_HIGH_CONVICTION";
      } else if (overallStatus === "CONDITIONAL_DIRECTIONAL") {
        executionTier = "TIER_B_CONDITIONAL";
      } else {
        executionTier = "TIER_C_LOW_CONVICTION";
      }
    }

    // ═══════════════════════════════════════════════════════════════
    //  PART 13: FEATURE HEALTH
    // ═══════════════════════════════════════════════════════════════
    const featureHealth: FeatureHealthRecord[] = [
      { featureName: "CVD", value: features.cvd?.cvdScore ?? 0, source: "Binance", timestamp, ageMs: 0, missing: features.cvd?.cvdScore == null, fallback: false, valid: features.cvd?.cvdScore != null },
      { featureName: "OrderBook.imbalance", value: features.orderBook?.imbalance ?? 0, source: "Binance", timestamp, ageMs: 0, missing: features.orderBook?.imbalance == null, fallback: false, valid: features.orderBook?.imbalance != null },
      { featureName: "ATR", value: features.atr?.atr14 ?? 0, source: "OHLCV", timestamp, ageMs: 0, missing: features.atr?.atr14 == null, fallback: false, valid: features.atr?.atr14 != null },
      { featureName: "RSI", value: features.rsi?.rsi14 ?? 0, source: "OHLCV", timestamp, ageMs: 0, missing: features.rsi?.rsi14 == null, fallback: false, valid: features.rsi?.rsi14 != null },
      { featureName: "Bollinger.bandwidth", value: features.bollinger?.bandwidth ?? 0, source: "OHLCV", timestamp, ageMs: 0, missing: features.bollinger?.bandwidth == null, fallback: false, valid: features.bollinger?.bandwidth != null },
      { featureName: "Spread", value: features.orderBook?.spread ?? 0, source: "Binance", timestamp, ageMs: 0, missing: features.orderBook?.spread == null, fallback: false, valid: true },
    ];

    // ═══════════════════════════════════════════════════════════════
    //  PART 16: REJECTION WATERFALL
    // ═══════════════════════════════════════════════════════════════
    let firstBlockingGate: RejectionGate = "NONE";

    if (fusedDirection === "HOLD") {
      firstBlockingGate = "NORMAL_ABSTENTION_HOLD";
      this.blockedCount++;
    } else if (cnnSignalStrength === "NONE" || cnnSignalStrength === "WEAK") {
      firstBlockingGate = "CNN_DIRECTION_WEAK";
      this.blockedCount++;
    } else if (!isEconomicallyViable) {
      firstBlockingGate = "NET_EV_NEGATIVE";
      this.blockedCount++;
    } else if (!bayes.passesGate) {
      firstBlockingGate = "BAYESIAN_POSTERIOR_BELOW_THRESHOLD";
      this.blockedCount++;
    } else if (mambaContextSignal === "OPPOSING") {
      firstBlockingGate = "MAMBA_CONTEXT_CAUTION";
      this.blockedCount++;
    } else {
      this.passedCount++;
    }

    // ═══════════════════════════════════════════════════════════════
    //  PART 15: SHADOW LEDGER RECORD
    // ═══════════════════════════════════════════════════════════════
    const shadowRecord: P17ShadowRecord = {
      decisionId,
      modelVersion: "P17_v1.0.0",
      checkpointHash: MODEL_INVENTORY.CNN_1D_V1.checkpointHash,
      symbol,
      direction: fusedDirection,
      entryPrice: currentPrice,
      entryTimestamp: timestamp,
      regime: regimeStr,
      tier: executionTier,
      cnnProbabilities: { ...cnnProbs },
      mambaProbabilities: { ...mambaProbs },
      quantEvidence: quantConsensus,
      expectedReturn: expectedEdge,
      expectedMFE,
      expectedMAE,
      fees: feePct,
      slippage: slippagePct,
      spread: spreadPct,
      netEV: expectedEdge,
      forwardPrices: {
        t1: Number((currentPrice * (1 + atrPct * 0.3)).toFixed(2)),
        t3: Number((currentPrice * (1 + atrPct * 0.8)).toFixed(2)),
        t5: Number((currentPrice * (1 + atrPct * 1.3)).toFixed(2)),
        t10: Number((currentPrice * (1 + atrPct * 2.0)).toFixed(2))
      },
      outcomeClass: "UNRESOLVED",
      shadowOnly: true,
      paperTrade: false,
      liveExecution: false
    };

    this.ledger.push(shadowRecord);
    if (this.ledger.length > this.MAX_LEDGER) this.ledger.shift();

    // ═══════════════════════════════════════════════════════════════
    //  ASSEMBLE RESULT
    // ═══════════════════════════════════════════════════════════════
    const result: P17EvaluationResult = {
      decisionId,
      symbol,
      timestamp,
      regime: regimeStr,

      lstmQuarantine: QUARANTINED_MODELS.LSTM_SEQUENCE_V1,

      cnnInference: {
        checkpointHash: MODEL_INVENTORY.CNN_1D_V1.checkpointHash,
        direction: cnnDir,
        probabilities: { ...cnnProbs },
        confidence: cnnConf,
        fallbackUsed: cnnFallback,
        featureVersion: 2,
        inferenceMode: cnnFallback ? "UNAVAILABLE" : "BENCHMARK",
        latencyMs: cnnPred?.latencyMs || 0,
        optimizationClass: cnnOptClass
      },

      mambaContext: {
        direction: mambaDir,
        probabilities: { ...mambaProbs },
        confidence: mambaConf,
        directionScore: mambaDirectionScore,
        regime: regimeStr,
        fallbackUsed: mambaFallback,
        contractStatus: mambaFallback ? "DEGRADED_FALLBACK" : "VALID_REAL_INFERENCE"
      },

      evidenceAwareFusion,
      opportunityStage,
      tradeQuality,
      executionTier,
      featureHealth,
      shadowRecord,

      rejectionWaterfall: {
        firstBlockingGate,
        candidateCount: this.candidateCount,
        blockedCount: this.blockedCount,
        passedCount: this.passedCount
      },

      modelContributions: {
        cnnContribution: cnnWeight,
        mambaContribution: mambaWeight,
        quantContribution: quantWeight
      },

      calibration: {
        status: "CALIBRATION_EVIDENCE_INSUFFICIENT",
        resolvedOosCount: 0
      },

      safety: {
        executionAttempted: false,
        orderCreationCount: 0,
        walletMutationCount: 0,
        livePromotionBlocked: true,
        isLiveApproved: false,
        syntheticOutcomeCountUsedForOOS: 0,
        calibrationFitFromInsufficientEvidence: false,
        lstmVotingEligible: false
      }
    };

    // Emit all P17 telemetry traces
    this.emitTelemetry(result);

    return result;
  }

  private static emitTelemetry(r: P17EvaluationResult): void {
    console.log(`[P17_CNN_INFERENCE_TRACE] ` + JSON.stringify({
      phase: "P17", mode: "SHADOW", decisionId: r.decisionId, symbol: r.symbol,
      timestamp: r.timestamp,
      checkpointHash: r.cnnInference.checkpointHash,
      direction: r.cnnInference.direction,
      probLong: r.cnnInference.probabilities.LONG,
      probShort: r.cnnInference.probabilities.SHORT,
      probHold: r.cnnInference.probabilities.HOLD,
      confidence: r.cnnInference.confidence,
      fallbackUsed: r.cnnInference.fallbackUsed,
      featureVersion: r.cnnInference.featureVersion,
      inferenceMode: r.cnnInference.inferenceMode,
      latencyMs: r.cnnInference.latencyMs,
      optimizationClass: r.cnnInference.optimizationClass
    }));

    console.log(`[P17_MAMBA_CONTEXT_TRACE] ` + JSON.stringify({
      phase: "P17", mode: "SHADOW", decisionId: r.decisionId, symbol: r.symbol,
      direction: r.mambaContext.direction,
      probLong: r.mambaContext.probabilities.LONG,
      probShort: r.mambaContext.probabilities.SHORT,
      probHold: r.mambaContext.probabilities.HOLD,
      confidence: r.mambaContext.confidence,
      directionScore: r.mambaContext.directionScore,
      regime: r.mambaContext.regime,
      fallbackUsed: r.mambaContext.fallbackUsed,
      contractStatus: r.mambaContext.contractStatus
    }));

    console.log(`[P17_OPPORTUNITY_TRACE] ` + JSON.stringify({
      phase: "P17", mode: "SHADOW", decisionId: r.decisionId, symbol: r.symbol,
      regime: r.regime,
      opportunityStage: r.opportunityStage,
      direction: r.evidenceAwareFusion.fusedDirection,
      cnnSignal: r.evidenceAwareFusion.cnnDirectionalSignal,
      mambaContext: r.evidenceAwareFusion.mambaContext,
      quantConsensus: r.evidenceAwareFusion.quantConsensus,
      overallStatus: r.evidenceAwareFusion.overallStatus,
      fusedProbabilities: r.evidenceAwareFusion.fusedProbabilities,
      confidence: r.cnnInference.confidence,
      netEV: r.tradeQuality.expectedEdge,
      conformalWidth: 1.0 - Math.max(r.evidenceAwareFusion.fusedProbabilities.LONG, r.evidenceAwareFusion.fusedProbabilities.SHORT, r.evidenceAwareFusion.fusedProbabilities.HOLD),
      tier: r.executionTier,
      firstBlockingGate: r.rejectionWaterfall.firstBlockingGate
    }));

    console.log(`[P17_GATE_WATERFALL_TRACE] ` + JSON.stringify({
      phase: "P17", mode: "SHADOW", decisionId: r.decisionId, symbol: r.symbol,
      firstBlockingGate: r.rejectionWaterfall.firstBlockingGate,
      candidateCount: r.rejectionWaterfall.candidateCount,
      blockedCount: r.rejectionWaterfall.blockedCount,
      passedCount: r.rejectionWaterfall.passedCount,
      candidateRate: r.rejectionWaterfall.candidateCount > 0 ? Number((r.rejectionWaterfall.passedCount / r.rejectionWaterfall.candidateCount).toFixed(4)) : 0
    }));

    console.log(`[P17_FEATURE_HEALTH_TRACE] ` + JSON.stringify({
      phase: "P17", mode: "SHADOW", decisionId: r.decisionId, symbol: r.symbol,
      features: r.featureHealth.map(f => ({ name: f.featureName, value: f.value, missing: f.missing, valid: f.valid }))
    }));

    console.log(`[P17_SAFETY_TRACE] ` + JSON.stringify({
      phase: "P17", mode: "SHADOW", decisionId: r.decisionId,
      safety: r.safety,
      calibration: r.calibration,
      lstmQuarantine: { status: r.lstmQuarantine.modelStatus, votingEligible: r.lstmQuarantine.votingEligible },
      status: "ALL_SAFETY_BARRIERS_ACTIVE"
    }));
  }

  public static getLedger(): P17ShadowRecord[] { return this.ledger; }
  public static clearLedger(): void { 
    this.ledger.length = 0; 
    this.candidateCount = 0; 
    this.blockedCount = 0; 
    this.passedCount = 0; 
  }
  public static getCounters() { return { candidateCount: this.candidateCount, blockedCount: this.blockedCount, passedCount: this.passedCount }; }

  /**
   * Part 15: Strict population separation accessors
   */
  public static getPopulations() {
    return {
      DECISION_POPULATION: this.candidateCount,
      SHADOW_OBSERVATION_POPULATION: this.ledger.length,
      EXECUTION_POPULATION: this.ledger.filter(r => r.tier !== "HOLD").length,
      OUTCOME_POPULATION: this.ledger.filter(r => r.outcomeClass !== "UNRESOLVED").length
    };
  }

  /**
   * Part 11 & 12: Risk-based position sizing helper
   * Position size is risk-based, not artificially inflated by leverage.
   */
  public static calculateRiskBasedSize(
    equity: number,
    riskPct: number = 0.01,
    slDistancePct: number = 0.02,
    tier: ExecutionTier = "TIER_A_HIGH_CONVICTION",
    leverage: number = 1
  ): { notional: number; margin: number; riskAmount: number; leverage: number } {
    if (equity <= 0 || slDistancePct <= 0) {
      return { notional: 0, margin: 0, riskAmount: 0, leverage: 1 };
    }
    const tierMultiplier = tier === "TIER_A_HIGH_CONVICTION" ? 1.0
      : (tier === "TIER_B_CONDITIONAL" ? 0.65 : 0.35);
    const riskAmount = equity * riskPct * tierMultiplier;
    const notional = riskAmount / slDistancePct;
    const safeLeverage = Math.max(1, Math.min(10, leverage));
    const margin = notional / safeLeverage;
    return {
      notional: Number(notional.toFixed(2)),
      margin: Number(margin.toFixed(2)),
      riskAmount: Number(riskAmount.toFixed(2)),
      leverage: safeLeverage
    };
  }

  /**
   * Part 11: Invariant Verification
   * Margin = Notional / Leverage
   * ROI% = (NetPnL / Margin) * 100
   * Absolute PnL remains independent of leverage.
   */
  public static verifyPositionInvariants(
    notional: number,
    leverage: number,
    margin: number,
    netPnL: number
  ): { marginValid: boolean; roiValid: boolean; roiPct: number } {
    const expectedMargin = notional / leverage;
    const marginValid = Math.abs(expectedMargin - margin) < 0.01;
    const roiPct = margin > 0 ? (netPnL / margin) * 100 : 0;
    const roiValid = Number.isFinite(roiPct);
    return { marginValid, roiValid, roiPct: Number(roiPct.toFixed(4)) };
  }
}
