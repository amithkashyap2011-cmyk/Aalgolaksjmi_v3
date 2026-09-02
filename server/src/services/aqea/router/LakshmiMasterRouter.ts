/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Lakshmi Master Ensemble Router (Phase 5 & Phase 8)
 * ═══════════════════════════════════════════════════════════════════
 * Dynamic ensemble router with:
 * 1. Strict REAL_MODEL execution gating (zero weight to PROXY / SHADOW).
 * 2. Evidence family grouping to prevent double-counting.
 * 3. Empirically calibrated consensus multipliers [1.00, 1.30].
 */

import { Standardized15Features } from "../pipeline/FeaturePipeline.js";
import { AnyRegime, RegimeResponse } from "../regimeEngine.js";
import { ModernModelRegistry } from "../ai/ModernModelRegistry.js";
import { ModelExpertPrediction } from "../ai/IModelExpert.js";
import { QuantStrategyRegistry, QuantExpertSignal } from "../quant/QuantStrategyRegistry.js";
import { IBehaviorWeights } from "../../../models/Settings.js";
import { UnifiedEnsembleFusion, EnsembleFusionResult, EVGateParams } from "../ensemble/UnifiedEnsembleFusion.js";

export type EvidenceFamily = 
  | "PRICE_STRUCTURE"
  | "MOMENTUM"
  | "MICROSTRUCTURE"
  | "DERIVATIVES"
  | "SENTIMENT"
  | "MACRO"
  | "REGIME";

export interface ConsensusCalibrationRecord {
  allAgreed: boolean;
  predictedDirection: "LONG" | "SHORT" | "HOLD";
  realizedOutcome: "WIN" | "LOSS";
  pnlPercent: number;
  regime: string;
  timestamp: number;
}

export interface LakshmiEnsembleResult {
  direction: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  compositeProbability: number;
  compositeUncertainty: number;
  finalScore: number;
  expertWeights: Record<string, number>;
  familyWeights: Record<EvidenceFamily, number>;
  dlPredictions: ModelExpertPrediction[];
  quantSignals: QuantExpertSignal[];
  regime: AnyRegime;
  macroRiskBlocked: boolean;
  consensusMultiplierApplied: number;
  reasons: string[];
  meta: any;
  ensembleFusion?: EnsembleFusionResult;
}

export class LakshmiMasterRouter {
  private static consensusHistory: ConsensusCalibrationRecord[] = [];
  private static MIN_CONSENSUS_SAMPLES = 30;
  private static MAX_CONSENSUS_MULTIPLIER = 1.30;
  private static MIN_CONSENSUS_MULTIPLIER = 1.00;

  // Maximum allowed weight cap per evidence family (Phase 9)
  private static FAMILY_WEIGHT_CAPS: Record<EvidenceFamily, number> = {
    PRICE_STRUCTURE: 0.35,
    MOMENTUM: 0.30,
    MICROSTRUCTURE: 0.30,
    DERIVATIVES: 0.20,
    SENTIMENT: 0.15,
    MACRO: 0.15,
    REGIME: 0.20
  };

  /**
   * Records an empirical consensus outcome for calibration.
   */
  public static recordConsensusOutcome(record: ConsensusCalibrationRecord): void {
    this.consensusHistory.push(record);
    if (this.consensusHistory.length > 500) {
      this.consensusHistory.shift();
    }
  }

  /**
   * Computes the calibrated consensus multiplier from historical agreement performance.
   */
  public static getCalibratedConsensusMultiplier(): { multiplier: number; sampleCount: number; empiricalLift: number } {
    const agreedTrades = this.consensusHistory.filter(r => r.allAgreed);
    const soloTrades = this.consensusHistory.filter(r => !r.allAgreed);

    if (agreedTrades.length < this.MIN_CONSENSUS_SAMPLES || soloTrades.length < this.MIN_CONSENSUS_SAMPLES) {
      return { multiplier: 1.00, sampleCount: agreedTrades.length, empiricalLift: 0 }; // Safe neutral fallback
    }

    const winRateAgreed = agreedTrades.filter(r => r.realizedOutcome === "WIN").length / agreedTrades.length;
    const winRateSolo = soloTrades.filter(r => r.realizedOutcome === "WIN").length / soloTrades.length;

    const lift = Math.max(0, winRateAgreed - winRateSolo);
    // Multiplier scales linearly with empirical lift (e.g. 10% lift -> 1.15x)
    const rawMultiplier = 1.0 + (lift * 1.5);
    const multiplier = Math.min(this.MAX_CONSENSUS_MULTIPLIER, Math.max(this.MIN_CONSENSUS_MULTIPLIER, Number(rawMultiplier.toFixed(2))));

    return { multiplier, sampleCount: agreedTrades.length, empiricalLift: Number(lift.toFixed(4)) };
  }

  public static async route(
    features: Standardized15Features,
    regimeRes: RegimeResponse,
    behaviorWeights?: IBehaviorWeights
  ): Promise<LakshmiEnsembleResult> {
    const reasons: string[] = [];
    const activeRegime = regimeRes.state;

    const dlPredictions = await ModernModelRegistry.evaluateAll(features, activeRegime);
    const quantSignals = QuantStrategyRegistry.evaluateAll(features, activeRegime);

    let macroRiskBlocked = false;
    if (features.macroNews.hasTier1Event && features.macroNews.impact === "HIGH") {
      macroRiskBlocked = true;
      reasons.push("LAKSHMI_ROUTER: Tier-1 macro news event lock active — entries throttled");
    }

    const rawWeights: Record<string, { weight: number; family: EvidenceFamily }> = {};

    // 1. DL Model Experts Weighting (Phase 8: ONLY REAL_MODEL receives production voting weight)
    dlPredictions.forEach((pred) => {
      let w = 0;
      if (pred.inferenceMode === "REAL_MODEL" && pred.status === "PRODUCTION") {
        w = 0.30 * pred.regimeCompatibility * (1 - pred.uncertainty * 0.4);
      } else {
        // SHADOW, PROXY, BENCHMARK, and UNAVAILABLE get strictly 0 production voting weight
        w = 0.0;
      }
      rawWeights[pred.modelName] = { weight: Number(w.toFixed(4)), family: "MOMENTUM" };
    });

    // 2. Quant Strategy Layer Weighting
    quantSignals.forEach((q) => {
      let w = 0.15 * q.regimeCompatibility;
      let family: EvidenceFamily = "PRICE_STRUCTURE";
      if (q.strategyId === "AARYAN_MOMENTUM") family = "MOMENTUM";
      else if (q.strategyId === "ORDER_FLOW_CVD") family = "MICROSTRUCTURE";
      else if (q.strategyId === "SMC_INSTITUTIONAL") family = "PRICE_STRUCTURE";
      else if (q.strategyId === "GAYATRI_24_SIGNAL" || q.strategyId === "OHMKARA_528HZ") family = "PRICE_STRUCTURE";

      rawWeights[q.strategyId] = { weight: Number(w.toFixed(4)), family };
    });

    // 3. Macro & Sentiment Weighting
    const nlpWeight = features.nlpSentiment.confidence * 0.12;
    rawWeights["FINANCIAL_NLP"] = { weight: Number(nlpWeight.toFixed(4)), family: "SENTIMENT" };

    // 4. Evidence Family Capping (Phase 9)
    const familyTotals: Record<EvidenceFamily, number> = {
      PRICE_STRUCTURE: 0, MOMENTUM: 0, MICROSTRUCTURE: 0, DERIVATIVES: 0, SENTIMENT: 0, MACRO: 0, REGIME: 0
    };

    Object.values(rawWeights).forEach(({ weight, family }) => {
      familyTotals[family] += weight;
    });

    // Scale down any family exceeding its configured cap
    let totalCappedWeight = 0;
    const cappedWeights: Record<string, number> = {};

    Object.entries(rawWeights).forEach(([name, { weight, family }]) => {
      const cap = this.FAMILY_WEIGHT_CAPS[family] || 0.30;
      const famTotal = familyTotals[family];
      const scale = famTotal > cap ? (cap / famTotal) : 1.0;
      const finalW = weight * scale;
      cappedWeights[name] = finalW;
      totalCappedWeight += finalW;
    });

    // Normalize weights to sum to 1.0
    const normWeights: Record<string, number> = {};
    Object.keys(cappedWeights).forEach((k) => {
      normWeights[k] = totalCappedWeight > 0 ? Number((cappedWeights[k] / totalCappedWeight).toFixed(4)) : 0;
    });

    let longScore = 0;
    let shortScore = 0;
    let weightedUncertainty = 0;

    dlPredictions.forEach((pred) => {
      const w = normWeights[pred.modelName] || 0;
      if (pred.direction === "LONG") longScore += pred.confidence * w;
      else if (pred.direction === "SHORT") shortScore += pred.confidence * w;
      weightedUncertainty += pred.uncertainty * w;
    });

    quantSignals.forEach((q) => {
      const w = normWeights[q.strategyId] || 0;
      if (q.direction === "LONG") longScore += q.confidence * w;
      else if (q.direction === "SHORT") shortScore += q.confidence * w;
      weightedUncertainty += q.riskScore * w;
    });

    const nlpW = normWeights["FINANCIAL_NLP"] || 0;
    if (features.nlpSentiment.classification.includes("BULL") || features.nlpSentiment.classification.includes("GREED")) {
      longScore += Math.abs(features.nlpSentiment.score) * nlpW;
    } else if (features.nlpSentiment.classification.includes("BEAR") || features.nlpSentiment.classification.includes("FEAR")) {
      shortScore += Math.abs(features.nlpSentiment.score) * nlpW;
    }

    // 5. Calibrated Consensus Multiplier (Phase 5)
    const aaryan = quantSignals.find(s => s.strategyId === "AARYAN_MOMENTUM");
    const aayush = quantSignals.find(s => s.strategyId === "AAYUSH_MEAN_REVERSION");
    const gayatri = quantSignals.find(s => s.strategyId === "GAYATRI_24_SIGNAL");

    const allQuantAgree = aaryan && aayush && gayatri && 
      (aaryan.direction === aayush.direction && aayush.direction === gayatri.direction && aaryan.direction !== "HOLD");

    const consensusCalibration = this.getCalibratedConsensusMultiplier();
    let appliedMultiplier = 1.00;

    if (allQuantAgree) {
      appliedMultiplier = consensusCalibration.multiplier;
      if (appliedMultiplier > 1.00) {
        if (aaryan.direction === "LONG") longScore = Math.min(1.0, longScore * appliedMultiplier);
        if (aaryan.direction === "SHORT") shortScore = Math.min(1.0, shortScore * appliedMultiplier);
        reasons.push(`LAKSHMI_CONSENSUS: ${appliedMultiplier}x calibrated boost applied (samples: ${consensusCalibration.sampleCount})`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    //  UNIFIED ENSEMBLE FUSION (replaces directional-confidence averaging)
    // ═══════════════════════════════════════════════════════════════
    const evParams: EVGateParams = {
      atrPercent: features.atr.atrPercent,
      tpMultiplier: 2.0,
      slMultiplier: 1.5,
      feePercent: 0.10,
      slippagePercent: 0.05
    };

    const marketDomain = (features.symbol && (features.symbol.endsWith("USDT") || features.symbol.endsWith("BTC") || features.symbol.endsWith("BUSD"))) ? "CRYPTO" : "INDIAN";
    const ensembleFusion = UnifiedEnsembleFusion.fuse(
      dlPredictions,
      quantSignals,
      features.nlpSentiment,
      activeRegime,
      evParams,
      {
        symbol: features.symbol || "MARKET",
        marketDomain,
        accountType: "FUTURES"
      }
    );

    // Use ensemble direction & probabilities as the authoritative output
    let direction: "LONG" | "SHORT" | "HOLD" = ensembleFusion.direction;
    let compositeProbability = direction === "LONG" ? ensembleFusion.buyProbability
      : (direction === "SHORT" ? ensembleFusion.sellProbability : ensembleFusion.holdProbability);
    let finalScore = direction === "LONG"
      ? Math.min(99, 50 + (ensembleFusion.buyProbability * 50))
      : (direction === "SHORT"
        ? Math.max(1, 50 - (ensembleFusion.sellProbability * 50))
        : 50);

    // Macro risk block overrides ensemble
    if (macroRiskBlocked) {
      direction = "HOLD";
      compositeProbability = 0.5;
      finalScore = 50;
    }

    // EV gate rejection
    if (direction !== "HOLD" && !ensembleFusion.evPassesGate) {
      reasons.push("ENSEMBLE_EV_GATE: Negative expected value " + ensembleFusion.expectedValue.toFixed(4) + "% — trade blocked");
    }

    // Ensemble telemetry (non-blocking)
    reasons.push(ensembleFusion.decisionReason);

    const confidence = Math.round(ensembleFusion.confidence * 100);
    weightedUncertainty = ensembleFusion.uncertainty;

    return {
      direction,
      confidence: Math.min(100, Math.max(0, confidence)),
      compositeProbability: Number(compositeProbability.toFixed(4)),
      compositeUncertainty: Number(weightedUncertainty.toFixed(4)),
      finalScore: Math.round(finalScore),
      expertWeights: normWeights,
      familyWeights: familyTotals,
      dlPredictions,
      quantSignals,
      regime: activeRegime,
      macroRiskBlocked,
      consensusMultiplierApplied: appliedMultiplier,
      reasons,
      ensembleFusion,
      meta: {
        longScore: Number(longScore.toFixed(4)),
        shortScore: Number(shortScore.toFixed(4)),
        allQuantAgree,
        consensusCalibration,
        ensembleProbs: {
          LONG: ensembleFusion.buyProbability,
          SHORT: ensembleFusion.sellProbability,
          HOLD: ensembleFusion.holdProbability
        },
        modelAgreement: ensembleFusion.modelAgreement,
        expectedValue: ensembleFusion.expectedValue,
        evPassesGate: ensembleFusion.evPassesGate,
        fusionLatencyMs: ensembleFusion.fusionLatencyMs
      }
    };
  }
}
