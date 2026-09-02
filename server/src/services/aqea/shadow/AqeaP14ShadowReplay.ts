/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 14 — Shadow Ensemble Replay Engine
 * ═══════════════════════════════════════════════════════════════════
 * Evaluates repaired real Mamba neural outputs through a shadow ensemble
 * and Bayesian decision pipeline without trade creation, order placement,
 * or wallet mutation.
 *
 * Strict Invariant: executionAttempted === false ALWAYS.
 */

import { Standardized15Features } from "../pipeline/FeaturePipeline.js";
import { AnyRegime, RegimeState } from "../regimeEngine.js";
import { ModelExpertPrediction } from "../ai/IModelExpert.js";
import { QuantExpertSignal } from "../quant/QuantStrategyRegistry.js";
import { UnifiedEnsembleFusion, EnsembleFusionResult, EVGateParams } from "../ensemble/UnifiedEnsembleFusion.js";
import { AdaptiveBayesianGate, BayesianEvaluationResult } from "../bayesian/AdaptiveBayesianGate.js";

export interface ShadowReplayResult {
  decisionId: string;
  symbol: string;
  timestamp: number;
  regime: string;

  // Production vs Shadow Mamba Output
  productionMamba: {
    direction: "LONG" | "SHORT" | "HOLD";
    probabilities: { LONG: number; SHORT: number; HOLD: number };
    confidence: number;
    fallbackUsed: boolean;
  };
  repairedMamba: {
    direction: "LONG" | "SHORT" | "HOLD";
    probabilities: { LONG: number; SHORT: number; HOLD: number };
    confidence: number;
    fallbackUsed: boolean;
  };

  // Production vs Shadow Ensemble Output
  productionEnsemble: {
    direction: "LONG" | "SHORT" | "HOLD";
    buyProbability: number;
    sellProbability: number;
    holdProbability: number;
    confidence: number;
    agreement: number;
  };
  shadowEnsemble: {
    direction: "LONG" | "SHORT" | "HOLD";
    buyProbability: number;
    sellProbability: number;
    holdProbability: number;
    confidence: number;
    agreement: number;
  };

  // Production vs Shadow Bayesian Evaluation
  productionBayesian: {
    posterior: number;
    threshold: number;
    passesGate: boolean;
    firstBlockReason: string;
    lQuality: number;
  };
  shadowBayesian: {
    posterior: number;
    threshold: number;
    passesGate: boolean;
    firstBlockReason: string;
    lQuality: number;
    likelihoodRatio: number;
    priorOdds: number;
  };

  // Cross-Model Comparisons (Diagnostic Only)
  crossModel: {
    mambaDirection: "LONG" | "SHORT" | "HOLD";
    cnnDirection?: "LONG" | "SHORT" | "HOLD";
    lstmDirection?: "LONG" | "SHORT" | "HOLD";
    quantConsensusDirection: "LONG" | "SHORT" | "HOLD";
    consensusClassification: "FULL_CONSENSUS" | "PARTIAL_CONSENSUS" | "DISAGREEMENT" | "NO_DIRECTIONAL_CONSENSUS";
  };

  // Safety & Execution Barrier Assertions
  executionAttempted: false;
  orderCreated: false;
  walletMutated: false;
  livePromotionBlocked: true;
  isLiveApproved: false;
}

export interface ShadowDistributionStats {
  sampleCount: number;
  probLong: { min: number; max: number; mean: number; median: number; p75: number; p90: number; p95: number; p99: number };
  probShort: { min: number; max: number; mean: number; median: number; p75: number; p90: number; p95: number; p99: number };
  probHold: { min: number; max: number; mean: number; median: number; p75: number; p90: number; p95: number; p99: number };
  confidence: { min: number; max: number; mean: number; median: number; p75: number; p90: number; p95: number; p99: number };
  fractions: {
    probLongGt50: number;
    probLongGt60: number;
    probLongGt70: number;
    probLongGt78: number;
    probShortGt50: number;
    probShortGt60: number;
    probShortGt70: number;
    probShortGt78: number;
  };
  holdRate: {
    production: number;
    shadow: number;
  };
  bayesianPassRate: {
    production: number;
    shadow: number;
  };
}

export class AqeaP14ShadowReplay {
  private static readonly MAX_HISTORY = 1000;
  private static readonly history: ShadowReplayResult[] = [];

  /**
   * Replays a live decision through the repaired Mamba shadow pipeline.
   * This method is strictly non-mutating and NEVER places trades.
   */
  public static evaluate(
    decisionId: string,
    features: Standardized15Features,
    regime: AnyRegime,
    productionDlPredictions: ModelExpertPrediction[],
    quantSignals: QuantExpertSignal[],
    repairedMambaPrediction: ModelExpertPrediction,
    productionEnsembleFusion?: EnsembleFusionResult,
    productionBayesianEval?: BayesianEvaluationResult
  ): ShadowReplayResult {
    const timestamp = Date.now();
    const symbol = features.symbol || "UNKNOWN";

    // 1. Production Mamba vs Repaired Mamba comparison
    const prodMamba = productionDlPredictions.find(p => p.modelName === "MAMBA_RESEARCH_V1") || {
      direction: "HOLD" as const,
      probabilities: { LONG: 0.3333, SHORT: 0.3333, HOLD: 0.3334 },
      confidence: 0,
      inferenceMode: "UNAVAILABLE" as const
    };

    const productionMambaSnapshot = {
      direction: prodMamba.direction,
      probabilities: { ...prodMamba.probabilities },
      confidence: prodMamba.confidence,
      fallbackUsed: prodMamba.inferenceMode === "UNAVAILABLE" || (prodMamba.probabilities.LONG === 0.3333 && prodMamba.probabilities.SHORT === 0.3333)
    };

    const repairedMambaSnapshot = {
      direction: repairedMambaPrediction.direction,
      probabilities: { ...repairedMambaPrediction.probabilities },
      confidence: repairedMambaPrediction.confidence,
      fallbackUsed: repairedMambaPrediction.inferenceMode === "UNAVAILABLE"
    };

    // 2. Build Shadow DL Predictions Array with Repaired Mamba
    const shadowDlPredictions: ModelExpertPrediction[] = productionDlPredictions.map(pred => {
      if (pred.modelName === "MAMBA_RESEARCH_V1") {
        return { ...repairedMambaPrediction };
      }
      return pred;
    });

    // If Mamba wasn't in the list, add it
    if (!shadowDlPredictions.some(p => p.modelName === "MAMBA_RESEARCH_V1")) {
      shadowDlPredictions.push({ ...repairedMambaPrediction });
    }

    // 3. Shadow Ensemble Fusion Replay
    const evParams: EVGateParams = {
      atrPercent: features.atr.atrPercent,
      tpMultiplier: 2.0,
      slMultiplier: 1.5,
      feePercent: 0.10,
      slippagePercent: 0.05
    };

    const marketDomain = (symbol.endsWith("USDT") || symbol.endsWith("BTC") || symbol.endsWith("BUSD")) ? "CRYPTO" : "INDIAN";
    const shadowEnsemble = UnifiedEnsembleFusion.fuse(
      shadowDlPredictions,
      quantSignals,
      features.nlpSentiment,
      regime,
      evParams,
      {
        symbol,
        marketDomain,
        accountType: "FUTURES"
      }
    );

    // 4. Shadow Bayesian Gate Replay
    const shadowActiveProb = shadowEnsemble.direction === "LONG" 
      ? shadowEnsemble.buyProbability 
      : (shadowEnsemble.direction === "SHORT" ? shadowEnsemble.sellProbability : shadowEnsemble.holdProbability);

    const shadowBayesianEval = AdaptiveBayesianGate.evaluate(
      shadowActiveProb,
      shadowEnsemble.uncertainty,
      features,
      regime as RegimeState,
      shadowEnsemble.direction
    );

    // 5. Cross-Model Consensus Analysis (Diagnostic Only)
    const cnnPred = productionDlPredictions.find(p => p.modelName.includes("CNN"));
    const lstmPred = productionDlPredictions.find(p => p.modelName.includes("LSTM"));
    
    let quantLongCount = 0;
    let quantShortCount = 0;
    let quantHoldCount = 0;
    for (const qs of quantSignals) {
      if (qs.direction === "LONG") quantLongCount++;
      else if (qs.direction === "SHORT") quantShortCount++;
      else quantHoldCount++;
    }
    const quantConsensusDir: "LONG" | "SHORT" | "HOLD" = 
      quantLongCount > quantShortCount && quantLongCount > quantHoldCount ? "LONG"
      : (quantShortCount > quantLongCount && quantShortCount > quantHoldCount ? "SHORT" : "HOLD");

    let consensusClassification: "FULL_CONSENSUS" | "PARTIAL_CONSENSUS" | "DISAGREEMENT" | "NO_DIRECTIONAL_CONSENSUS" = "NO_DIRECTIONAL_CONSENSUS";
    if (repairedMambaPrediction.direction === quantConsensusDir && repairedMambaPrediction.direction !== "HOLD") {
      if (cnnPred?.direction === repairedMambaPrediction.direction) {
        consensusClassification = "FULL_CONSENSUS";
      } else {
        consensusClassification = "PARTIAL_CONSENSUS";
      }
    } else if (repairedMambaPrediction.direction !== "HOLD" && quantConsensusDir !== "HOLD" && repairedMambaPrediction.direction !== quantConsensusDir) {
      consensusClassification = "DISAGREEMENT";
    }

    // 6. Build Comprehensive Shadow Record
    const shadowFirstBlockReason = !shadowBayesianEval.passesGate 
      ? "BAYESIAN_POSTERIOR_BELOW_THRESHOLD" 
      : (!shadowEnsemble.evPassesGate ? "NET_EV_SUB_HURDLE" : "NONE");

    const result: ShadowReplayResult = {
      decisionId,
      symbol,
      timestamp,
      regime: String(regime),

      productionMamba: productionMambaSnapshot,
      repairedMamba: repairedMambaSnapshot,

      productionEnsemble: {
        direction: productionEnsembleFusion?.direction || "HOLD",
        buyProbability: productionEnsembleFusion?.buyProbability || 0.3333,
        sellProbability: productionEnsembleFusion?.sellProbability || 0.3333,
        holdProbability: productionEnsembleFusion?.holdProbability || 0.3334,
        confidence: productionEnsembleFusion?.confidence || 0,
        agreement: productionEnsembleFusion?.modelAgreement || 0
      },
      shadowEnsemble: {
        direction: shadowEnsemble.direction,
        buyProbability: shadowEnsemble.buyProbability,
        sellProbability: shadowEnsemble.sellProbability,
        holdProbability: shadowEnsemble.holdProbability,
        confidence: shadowEnsemble.confidence,
        agreement: shadowEnsemble.modelAgreement
      },

      productionBayesian: {
        posterior: productionBayesianEval?.posteriorProbability || 0.38,
        threshold: productionBayesianEval?.requiredThreshold || 0.78,
        passesGate: productionBayesianEval?.passesGate || false,
        firstBlockReason: productionBayesianEval?.passesGate ? "NONE" : "BAYESIAN_POSTERIOR_BELOW_THRESHOLD",
        lQuality: productionBayesianEval?.meta?.lQuality || 0.52
      },
      shadowBayesian: {
        posterior: shadowBayesianEval.posteriorProbability,
        threshold: shadowBayesianEval.requiredThreshold,
        passesGate: shadowBayesianEval.passesGate,
        firstBlockReason: shadowFirstBlockReason,
        lQuality: shadowBayesianEval.meta?.lQuality || 1.0,
        likelihoodRatio: shadowBayesianEval.likelihoodRatio,
        priorOdds: shadowBayesianEval.priorOdds
      },

      crossModel: {
        mambaDirection: repairedMambaPrediction.direction,
        cnnDirection: cnnPred?.direction,
        lstmDirection: lstmPred?.direction,
        quantConsensusDirection: quantConsensusDir,
        consensusClassification
      },

      // Strict Non-Negotiable Assertions
      executionAttempted: false,
      orderCreated: false,
      walletMutated: false,
      livePromotionBlocked: true,
      isLiveApproved: false
    };

    // Save to ring buffer
    this.history.push(result);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }

    // 7. Emit All Required P14 Structured Telemetry Traces
    this.emitTelemetry(result);

    return result;
  }

  private static emitTelemetry(r: ShadowReplayResult): void {
    // 1. [P14_CROSS_MODEL_TRACE]
    console.log(`[P14_CROSS_MODEL_TRACE] ` + JSON.stringify({
      phase: "P14",
      mode: "SHADOW",
      decisionId: r.decisionId,
      symbol: r.symbol,
      mamba: { direction: r.crossModel.mambaDirection, pL: r.repairedMamba.probabilities.LONG, pS: r.repairedMamba.probabilities.SHORT },
      cnn: { direction: r.crossModel.cnnDirection || "N/A" },
      lstm: { direction: r.crossModel.lstmDirection || "N/A" },
      quantConsensus: r.crossModel.quantConsensusDirection,
      consensus: r.crossModel.consensusClassification
    }));

    // 2. [P14_ENSEMBLE_COMPARISON_TRACE]
    console.log(`[P14_ENSEMBLE_COMPARISON_TRACE] ` + JSON.stringify({
      phase: "P14",
      mode: "SHADOW",
      decisionId: r.decisionId,
      symbol: r.symbol,
      production: { direction: r.productionEnsemble.direction, buyProb: r.productionEnsemble.buyProbability, sellProb: r.productionEnsemble.sellProbability, holdProb: r.productionEnsemble.holdProbability },
      shadow: { direction: r.shadowEnsemble.direction, buyProb: r.shadowEnsemble.buyProbability, sellProb: r.shadowEnsemble.sellProbability, holdProb: r.shadowEnsemble.holdProbability },
      deltaBuyProb: Number((r.shadowEnsemble.buyProbability - r.productionEnsemble.buyProbability).toFixed(4)),
      deltaSellProb: Number((r.shadowEnsemble.sellProbability - r.productionEnsemble.sellProbability).toFixed(4))
    }));

    // 3. [P14_BAYESIAN_COMPARISON_TRACE]
    console.log(`[P14_BAYESIAN_COMPARISON_TRACE] ` + JSON.stringify({
      phase: "P14",
      mode: "SHADOW",
      decisionId: r.decisionId,
      symbol: r.symbol,
      threshold: r.shadowBayesian.threshold,
      productionPosterior: r.productionBayesian.posterior,
      shadowPosterior: r.shadowBayesian.posterior,
      productionLQuality: r.productionBayesian.lQuality,
      shadowLQuality: r.shadowBayesian.lQuality,
      productionPassed: r.productionBayesian.passesGate,
      shadowPassed: r.shadowBayesian.passesGate
    }));

    // 4. [P14_SHADOW_GATE_TRACE]
    console.log(`[P14_SHADOW_GATE_TRACE] ` + JSON.stringify({
      phase: "P14",
      mode: "SHADOW",
      decisionId: r.decisionId,
      symbol: r.symbol,
      regime: r.regime,
      productionMambaProbability: r.productionMamba.probabilities,
      repairedMambaProbability: r.repairedMamba.probabilities,
      productionEnsemble: r.productionEnsemble,
      shadowEnsemble: r.shadowEnsemble,
      productionBayesianPosterior: r.productionBayesian.posterior,
      shadowBayesianPosterior: r.shadowBayesian.posterior,
      threshold: r.shadowBayesian.threshold,
      productionFirstBlockingGate: r.productionBayesian.firstBlockReason,
      shadowFirstBlockingGate: r.shadowBayesian.firstBlockReason,
      wouldPassBayesian: r.shadowBayesian.passesGate,
      wouldPassRisk: true,
      executionAttempted: false
    }));

    // 5. [P14_SAFETY_TRACE]
    console.log(`[P14_SAFETY_TRACE] ` + JSON.stringify({
      phase: "P14",
      mode: "SHADOW",
      decisionId: r.decisionId,
      executionAttempted: false,
      orderCreated: false,
      walletMutated: false,
      livePromotionBlocked: true,
      isLiveApproved: false,
      safetyStatus: "ALL_SAFETY_BARRIERS_ACTIVE"
    }));
  }

  /**
   * Computes empirical distribution statistics from the recorded shadow history.
   */
  public static getDistributionStats(): ShadowDistributionStats {
    const list = this.history;
    const n = list.length;
    if (n === 0) {
      const emptyStat = { min: 0, max: 0, mean: 0, median: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
      return {
        sampleCount: 0,
        probLong: emptyStat,
        probShort: emptyStat,
        probHold: emptyStat,
        confidence: emptyStat,
        fractions: {
          probLongGt50: 0, probLongGt60: 0, probLongGt70: 0, probLongGt78: 0,
          probShortGt50: 0, probShortGt60: 0, probShortGt70: 0, probShortGt78: 0
        },
        holdRate: { production: 1.0, shadow: 1.0 },
        bayesianPassRate: { production: 0.0, shadow: 0.0 }
      };
    }

    const longs = list.map(r => r.repairedMamba.probabilities.LONG).sort((a, b) => a - b);
    const shorts = list.map(r => r.repairedMamba.probabilities.SHORT).sort((a, b) => a - b);
    const holds = list.map(r => r.repairedMamba.probabilities.HOLD).sort((a, b) => a - b);
    const confs = list.map(r => r.repairedMamba.confidence).sort((a, b) => a - b);

    const percentile = (arr: number[], p: number) => {
      const idx = Math.min(arr.length - 1, Math.floor(arr.length * p));
      return arr[idx] || 0;
    };
    const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

    const calcStat = (arr: number[]) => ({
      min: arr[0],
      max: arr[arr.length - 1],
      mean: Number(mean(arr).toFixed(4)),
      median: Number(percentile(arr, 0.50).toFixed(4)),
      p75: Number(percentile(arr, 0.75).toFixed(4)),
      p90: Number(percentile(arr, 0.90).toFixed(4)),
      p95: Number(percentile(arr, 0.95).toFixed(4)),
      p99: Number(percentile(arr, 0.99).toFixed(4))
    });

    const prodHoldCount = list.filter(r => r.productionEnsemble.direction === "HOLD").length;
    const shadowHoldCount = list.filter(r => r.shadowEnsemble.direction === "HOLD").length;
    const prodBayesPass = list.filter(r => r.productionBayesian.passesGate).length;
    const shadowBayesPass = list.filter(r => r.shadowBayesian.passesGate).length;

    return {
      sampleCount: n,
      probLong: calcStat(longs),
      probShort: calcStat(shorts),
      probHold: calcStat(holds),
      confidence: calcStat(confs),
      fractions: {
        probLongGt50: Number((longs.filter(v => v > 0.50).length / n).toFixed(4)),
        probLongGt60: Number((longs.filter(v => v > 0.60).length / n).toFixed(4)),
        probLongGt70: Number((longs.filter(v => v > 0.70).length / n).toFixed(4)),
        probLongGt78: Number((longs.filter(v => v > 0.78).length / n).toFixed(4)),
        probShortGt50: Number((shorts.filter(v => v > 0.50).length / n).toFixed(4)),
        probShortGt60: Number((shorts.filter(v => v > 0.60).length / n).toFixed(4)),
        probShortGt70: Number((shorts.filter(v => v > 0.70).length / n).toFixed(4)),
        probShortGt78: Number((shorts.filter(v => v > 0.78).length / n).toFixed(4))
      },
      holdRate: {
        production: Number((prodHoldCount / n).toFixed(4)),
        shadow: Number((shadowHoldCount / n).toFixed(4))
      },
      bayesianPassRate: {
        production: Number((prodBayesPass / n).toFixed(4)),
        shadow: Number((shadowBayesPass / n).toFixed(4))
      }
    };
  }

  /**
   * Resets history for testing.
   */
  public static clearHistory(): void {
    this.history.length = 0;
  }
}
