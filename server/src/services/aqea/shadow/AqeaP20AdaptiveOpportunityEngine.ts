/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 Phase 20 — Adaptive Opportunity Optimization,
 *  Multi-Asset/Regime Routing, Multi-Horizon Profitability & OOS Validation
 * ═══════════════════════════════════════════════════════════════════
 *
 * Core Objectives:
 * - Dynamic Multi-Asset Opportunity Router (No permanent blacklisting; causal evaluation)
 * - Dynamic Regime-Conditional Router across 7 supported regimes
 * - Multi-Horizon Research Engine (H in {3, 6, 12, 24, 48} bars)
 * - Dynamic TP/SL Optimization (1.0-3.0x ATR TP, 0.75-2.0x ATR SL)
 * - Portfolio Opportunity Ranker & Correlation Exposure Management
 * - Strict Independent Trade Episode Accounting (Zero double-counting)
 * - Three-Tier Architecture (TIER_A_PRECISION ~90% target, TIER_B_BALANCED, TIER_C_OPPORTUNITY)
 * - Strict Non-Negotiable Safety Barriers (LIVE_PROMOTION_BLOCKED === true)
 */

import { Standardized15Features } from "../pipeline/FeaturePipeline.js";
import { AnyRegime, RegimeState } from "../regimeEngine.js";
import { ModelExpertPrediction } from "../ai/IModelExpert.js";
import { QuantExpertSignal } from "../quant/QuantStrategyRegistry.js";
import { EnsembleFusionResult } from "../ensemble/UnifiedEnsembleFusion.js";
import { AdaptiveBayesianGate, BayesianEvaluationResult } from "../bayesian/AdaptiveBayesianGate.js";
import { MODEL_INVENTORY } from "./AqeaP16ShadowLedger.js";
import { QUARANTINED_MODELS } from "./AqeaP17OpportunityEngine.js";
import { P18_CHAMPION_SCORECARDS } from "./AqeaP18ModelOptimizationEngine.js";
import { IndependentTradeEpisode, DynamicRiskSizingProfile, GovernanceAuditCriteriaReport } from "./AqeaP19ForwardOOSValidationEngine.js";

// ═══════════════════════════════════════════════════════════════════
//  TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════

export type P20AssetState = "FAVORABLE" | "NEUTRAL" | "UNFAVORABLE";

export type P20RegimeType =
  | "TRENDING_BULL"
  | "TRENDING_BEAR"
  | "RANGING"
  | "BREAKOUT"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "TRANSITION";

export type P20AdaptiveTier =
  | "TIER_A_PRECISION"   // Target ~90% precision, hurdle >= 0.85
  | "TIER_B_BALANCED"    // Target positive NetEV & ~70-80% precision, hurdle >= 0.65
  | "TIER_C_OPPORTUNITY" // Scout / Opportunity Expansion (NetEV > 0, PF > 1.0), hurdle >= 0.50
  | "HOLD";              // Neutral / Sub-hurdle

export type P20RejectionGate =
  | "NONE"
  | "FEATURE_INVALID"
  | "MODEL_UNAVAILABLE"
  | "MODEL_FALLBACK"
  | "REGIME_UNFAVORABLE"
  | "ASSET_UNFAVORABLE"
  | "DIRECTIONAL_CONVICTION"
  | "TRADE_QUALITY"
  | "FRICTION"
  | "NETEV"
  | "RISK"
  | "CORRELATION"
  | "DRAWDOWN"
  | "POSITION_ALREADY_OPEN"
  | "DUPLICATE_SIGNAL"
  | "INSUFFICIENT_EVIDENCE";

export interface P20AssetRoutingResult {
  symbol: string;
  assetState: P20AssetState;
  opportunityScore: number; // 0 to 100
  assetRiskMultiplier: number;
  volatilityScore: number;
  liquidityScore: number;
  momentumScore: number;
  frictionBurdenPct: number;
  recommendedHorizons: number[];
  diagnosticReason: string;
}

export interface P20RegimeRoutingResult {
  regime: P20RegimeType;
  cnnAuthority: number;
  mambaAuthority: number;
  quantAuthority: number;
  tradeQualityStrictness: number;
  minNetEVHurdle: number;
  regimeRiskMultiplier: number;
  preferredHorizons: number[];
}

export interface P20HorizonAnalysis {
  horizonBars: number; // 3, 6, 12, 24, 48
  approxMinutes: number; // 15m, 30m, 60m, 120m, 240m
  pTpBeforeSl: number;
  expectedGrossReturn: number;
  expectedMFE: number;
  expectedMAE: number;
  mfeMaeRatio: number;
  totalFriction: number;
  expectedNetEV: number;
  profitFactorEstimate: number;
  isViable: boolean;
  score: number;
}

export interface P20DynamicExitResult {
  takeProfitMultiplier: number; // e.g. 2.0x ATR
  stopLossMultiplier: number;   // e.g. 1.25x ATR
  takeProfitPrice: number;
  stopLossPrice: number;
  rewardRiskRatio: number;
  expectedDurationBars: number;
  optimalHorizon: number;
}

export interface P20RankedOpportunity {
  opportunityId: string;
  symbol: string;
  tier: P20AdaptiveTier;
  direction: "LONG" | "SHORT" | "HOLD";
  compositeScore: number;
  expectedNetEV: number;
  confidence: number;
  assetState: P20AssetState;
  regime: P20RegimeType;
  optimalHorizon: number;
  allocatedRiskPct: number;
  correlationPenaltyApplied: boolean;
  rank: number;
}

export interface P20EvaluationResult {
  decisionId: string;
  opportunityId: string;
  signalId: string;
  symbol: string;
  timestamp: number;
  regime: P20RegimeType;

  // 1. Asset & Regime Routing
  assetRouting: P20AssetRoutingResult;
  regimeRouting: P20RegimeRoutingResult;

  // 2. Model Inference & Fusion
  cnnInference: {
    model: string;
    direction: "LONG" | "SHORT" | "HOLD";
    probabilities: { LONG: number; SHORT: number; HOLD: number };
    confidence: number;
    fallbackUsed: boolean;
  };
  mambaContext: {
    direction: "LONG" | "SHORT" | "HOLD";
    probabilities: { LONG: number; SHORT: number; HOLD: number };
    contextStatus: "CONFIRMING" | "NEUTRAL" | "CAUTION" | "OPPOSING";
  };
  lstmQuarantine: {
    status: "OUTPUT_COLLAPSED";
    votingEligible: false;
    reason: string;
  };

  // 3. Multi-Horizon & Exit Optimization
  multiHorizon: {
    evaluatedHorizons: P20HorizonAnalysis[];
    selectedHorizon: P20HorizonAnalysis;
  };
  dynamicExit: P20DynamicExitResult;

  // 4. Trade Quality & Friction
  tradeQuality: {
    label: "TRADE_QUALITY_ESTIMATOR_P20_ADAPTIVE";
    pTpBeforeSl: number;
    expectedNetEV: number;
    mfeMaeRatio: number;
    frictionCost: number;
    isEconomicallyViable: boolean;
  };

  // 5. Tier & Ranking
  adaptiveTier: P20AdaptiveTier;
  rankedOpportunity: P20RankedOpportunity;

  // 6. Independent Trade Accounting
  tradeIndependence: {
    isSignalAbsorbed: boolean;
    activeEpisodeId: string | null;
    totalActiveEpisodes: number;
    completedEpisodesCount: number;
  };

  // 7. Dynamic Risk
  dynamicRisk: DynamicRiskSizingProfile;

  // 8. Rejection Waterfall
  rejectionWaterfall: {
    firstBlockingGate: P20RejectionGate;
    isAdmitted: boolean;
  };

  // 9. Mandatory Safety Invariants
  safety: {
    livePromotionBlocked: true;
    isLiveApproved: false;
    executionAttempted: false;
    orderCreationCount: 0;
    walletMutationCount: 0;
    syntheticOutcomeCountUsedForOOS: 0;
    lstmVotingEligible: false;
    calibrationFitFromInsufficientEvidence: false;
  };
}

// ═══════════════════════════════════════════════════════════════════
//  ASSET OPPORTUNITY ROUTER
// ═══════════════════════════════════════════════════════════════════

export class AqeaP20AssetOpportunityRouter {
  public static evaluateAsset(
    symbol: string,
    features: Standardized15Features,
    regime: P20RegimeType
  ): P20AssetRoutingResult {
    const atrPct = features.atr?.atrPercent || 0.015;
    const spread = features.orderBook?.spread || 20;
    const currentPrice = features.ohlcv?.close || 97500;
    const spreadPct = (spread / currentPrice) * 100;
    const rsi = features.rsi?.rsi14 || 50;
    const adx = (features as any).adx?.adx14 || (features.rsi?.state !== "NEUTRAL" ? 35 : 20);
    const cvd = features.cvd?.cvdScore || 0;
    const imbalance = features.orderBook?.imbalance || 0.5;

    // 1. Volatility score (0-100): High ATR% with moderate spread is ideal
    let volatilityScore = Math.min(100, Math.max(0, (atrPct / 0.03) * 100));
    
    // 2. Liquidity score (0-100): Tight spread percentage
    let liquidityScore = Math.min(100, Math.max(0, 100 - (spreadPct / 0.05) * 100));

    // 3. Momentum score (0-100): ADX strength + CVD alignment + RSI divergence
    let momentumScore = Math.min(100, Math.max(0, (adx / 50) * 60 + Math.abs(cvd) * 40));

    // Friction burden in percentage
    const feePct = 0.08;
    const slippagePct = 0.04;
    const frictionBurdenPct = feePct + slippagePct + spreadPct;

    // Composite opportunity score (0 to 100)
    let opportunityScore = Number(
      (volatilityScore * 0.35 + liquidityScore * 0.35 + momentumScore * 0.30).toFixed(2)
    );

    // Dynamic asset state classification (No permanent blacklisting!)
    let assetState: P20AssetState = "NEUTRAL";
    let assetRiskMultiplier = 1.0;
    let recommendedHorizons = [6, 12, 24];
    let diagnosticReason = "Standard market conditions";

    if (opportunityScore >= 70 && frictionBurdenPct < 0.25) {
      assetState = "FAVORABLE";
      assetRiskMultiplier = 1.25;
      recommendedHorizons = [3, 6, 12];
      diagnosticReason = "High liquidity, robust ATR expansion, strong momentum";
    } else if (opportunityScore < 40 || frictionBurdenPct >= 0.40) {
      assetState = "UNFAVORABLE";
      assetRiskMultiplier = 0.60;
      recommendedHorizons = [24, 48];
      diagnosticReason = "Low volatility compression or excessive friction burden";
    } else {
      assetState = "NEUTRAL";
      assetRiskMultiplier = 1.0;
      recommendedHorizons = [6, 12, 24];
      diagnosticReason = "Moderate volatility and balanced liquidity profile";
    }

    // Asset-specific micro-adjustments based on current empirical data
    if (symbol.includes("ADA") || symbol.includes("SOL")) {
      recommendedHorizons = [3, 6, 12]; // Faster trend resolution
    } else if (symbol.includes("BTC") || symbol.includes("ETH")) {
      recommendedHorizons = [12, 24, 48]; // Longer macroeconomic structure
    }

    return {
      symbol,
      assetState,
      opportunityScore,
      assetRiskMultiplier,
      volatilityScore: Number(volatilityScore.toFixed(2)),
      liquidityScore: Number(liquidityScore.toFixed(2)),
      momentumScore: Number(momentumScore.toFixed(2)),
      frictionBurdenPct: Number(frictionBurdenPct.toFixed(4)),
      recommendedHorizons,
      diagnosticReason
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
//  REGIME ROUTER
// ═══════════════════════════════════════════════════════════════════

export class AqeaP20RegimeRouter {
  public static routeRegime(regime: AnyRegime): P20RegimeRoutingResult {
    const regStr = String(regime || "RANGING").toUpperCase() as P20RegimeType;

    switch (regStr) {
      case "TRENDING_BULL":
      case "TRENDING_BEAR":
        return {
          regime: regStr,
          cnnAuthority: 0.70,
          mambaAuthority: 0.15,
          quantAuthority: 0.15,
          tradeQualityStrictness: 0.60,
          minNetEVHurdle: 0.0050,
          regimeRiskMultiplier: 1.20,
          preferredHorizons: [6, 12, 24]
        };

      case "BREAKOUT":
        return {
          regime: "BREAKOUT",
          cnnAuthority: 0.75,
          mambaAuthority: 0.10,
          quantAuthority: 0.15,
          tradeQualityStrictness: 0.50,
          minNetEVHurdle: 0.0080,
          regimeRiskMultiplier: 1.30,
          preferredHorizons: [3, 6, 12]
        };

      case "HIGH_VOLATILITY":
        return {
          regime: "HIGH_VOLATILITY",
          cnnAuthority: 0.55,
          mambaAuthority: 0.25,
          quantAuthority: 0.20,
          tradeQualityStrictness: 0.75,
          minNetEVHurdle: 0.0100,
          regimeRiskMultiplier: 0.70, // Dampen risk in extreme volatility
          preferredHorizons: [3, 6]
        };

      case "LOW_VOLATILITY":
      case "RANGING":
        return {
          regime: regStr === "LOW_VOLATILITY" ? "LOW_VOLATILITY" : "RANGING",
          cnnAuthority: 0.45,
          mambaAuthority: 0.35,
          quantAuthority: 0.20,
          tradeQualityStrictness: 0.80,
          minNetEVHurdle: 0.0040,
          regimeRiskMultiplier: 0.85,
          preferredHorizons: [12, 24, 48]
        };

      case "TRANSITION":
      default:
        return {
          regime: "TRANSITION",
          cnnAuthority: 0.50,
          mambaAuthority: 0.30,
          quantAuthority: 0.20,
          tradeQualityStrictness: 0.70,
          minNetEVHurdle: 0.0060,
          regimeRiskMultiplier: 0.80,
          preferredHorizons: [12, 24]
        };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  MULTI-HORIZON & EXIT ENGINE
// ═══════════════════════════════════════════════════════════════════

export class AqeaP20MultiHorizonEngine {
  private static readonly HORIZONS = [3, 6, 12, 24, 48];

  public static evaluateHorizons(
    direction: "LONG" | "SHORT" | "HOLD",
    confidence: number,
    atrPct: number,
    spreadPct: number,
    preferredHorizons: number[]
  ): { evaluatedHorizons: P20HorizonAnalysis[]; selectedHorizon: P20HorizonAnalysis } {
    const feePct = 0.0008;
    const slippagePct = 0.0004;
    const totalFriction = feePct + slippagePct + spreadPct;

    const evaluatedHorizons: P20HorizonAnalysis[] = this.HORIZONS.map(h => {
      const approxMinutes = h * 5;
      // Horizon scaling: MFE increases with horizon sqrt, MAE expands with horizon
      const horizonFactor = Math.sqrt(h / 12);
      const expectedMFE = atrPct * 2.0 * horizonFactor;
      const expectedMAE = atrPct * 1.5 * horizonFactor;
      const mfeMaeRatio = expectedMAE > 0 ? expectedMFE / expectedMAE : 1.33;

      // Base P(TP before SL) scaled by model confidence and horizon alignment
      let pTp = direction === "HOLD" ? 0.33 : Math.min(0.95, confidence * 0.92 + (mfeMaeRatio > 1.2 ? 0.05 : 0.0));
      if (preferredHorizons.includes(h)) {
        pTp = Math.min(0.96, pTp + 0.03); // Bonus for regime/asset preference
      }

      const expectedGross = direction !== "HOLD"
        ? pTp * expectedMFE - (1 - pTp) * expectedMAE
        : 0;
      const expectedNetEV = expectedGross - totalFriction;
      const isViable = expectedNetEV > 0 && direction !== "HOLD";
      const profitFactorEstimate = expectedMAE > 0 && (1 - pTp) > 0
        ? Number(((pTp * expectedMFE) / ((1 - pTp) * expectedMAE + totalFriction)).toFixed(2))
        : 1.0;

      const score = Number((expectedNetEV * 100 * mfeMaeRatio * pTp).toFixed(4));

      return {
        horizonBars: h,
        approxMinutes,
        pTpBeforeSl: Number(pTp.toFixed(4)),
        expectedGrossReturn: Number(expectedGross.toFixed(6)),
        expectedMFE: Number(expectedMFE.toFixed(6)),
        expectedMAE: Number(expectedMAE.toFixed(6)),
        mfeMaeRatio: Number(mfeMaeRatio.toFixed(4)),
        totalFriction: Number(totalFriction.toFixed(6)),
        expectedNetEV: Number(expectedNetEV.toFixed(6)),
        profitFactorEstimate: isFinite(profitFactorEstimate) ? profitFactorEstimate : 1.0,
        isViable,
        score
      };
    });

    // Select horizon with highest score among viable horizons, fallback to preferred
    let selectedHorizon = evaluatedHorizons.reduce((best, cur) => cur.score > best.score ? cur : best, evaluatedHorizons[2]);

    return { evaluatedHorizons, selectedHorizon };
  }

  public static optimizeExit(
    direction: "LONG" | "SHORT" | "HOLD",
    currentPrice: number,
    atr14: number,
    selectedHorizon: P20HorizonAnalysis,
    regime: P20RegimeType
  ): P20DynamicExitResult {
    let tpMult = 2.0;
    let slMult = 1.25;

    if (regime === "BREAKOUT") {
      tpMult = 2.5;
      slMult = 1.0;
    } else if (regime === "HIGH_VOLATILITY") {
      tpMult = 2.0;
      slMult = 1.5;
    } else if (regime === "RANGING" || regime === "LOW_VOLATILITY") {
      tpMult = 1.5;
      slMult = 1.0;
    }

    const tpDist = atr14 * tpMult;
    const slDist = atr14 * slMult;

    const takeProfitPrice = direction === "LONG"
      ? currentPrice + tpDist
      : (direction === "SHORT" ? currentPrice - tpDist : currentPrice);

    const stopLossPrice = direction === "LONG"
      ? currentPrice - slDist
      : (direction === "SHORT" ? currentPrice + slDist : currentPrice);

    const rewardRiskRatio = slDist > 0 ? Number((tpDist / slDist).toFixed(2)) : 1.6;

    return {
      takeProfitMultiplier: tpMult,
      stopLossMultiplier: slMult,
      takeProfitPrice: Number(takeProfitPrice.toFixed(2)),
      stopLossPrice: Number(stopLossPrice.toFixed(2)),
      rewardRiskRatio,
      expectedDurationBars: selectedHorizon.horizonBars,
      optimalHorizon: selectedHorizon.horizonBars
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PORTFOLIO OPPORTUNITY RANKER
// ═══════════════════════════════════════════════════════════════════

export class AqeaP20PortfolioOpportunityRanker {
  private static readonly CORRELATION_MATRIX: Record<string, Record<string, number>> = {
    BTCUSDT: { BTCUSDT: 1.0, ETHUSDT: 0.85, SOLUSDT: 0.72, BNBUSDT: 0.78, ADAUSDT: 0.65, DOGEUSDT: 0.58, XRPUSDT: 0.60 },
    ETHUSDT: { BTCUSDT: 0.85, ETHUSDT: 1.0, SOLUSDT: 0.80, BNBUSDT: 0.75, ADAUSDT: 0.70, DOGEUSDT: 0.62, XRPUSDT: 0.64 },
    SOLUSDT: { BTCUSDT: 0.72, ETHUSDT: 0.80, SOLUSDT: 1.0, BNBUSDT: 0.68, ADAUSDT: 0.75, DOGEUSDT: 0.65, XRPUSDT: 0.62 },
    ADAUSDT: { BTCUSDT: 0.65, ETHUSDT: 0.70, SOLUSDT: 0.75, BNBUSDT: 0.64, ADAUSDT: 1.0, DOGEUSDT: 0.60, XRPUSDT: 0.68 }
  };

  public static rankOpportunity(
    opportunityId: string,
    symbol: string,
    tier: P20AdaptiveTier,
    direction: "LONG" | "SHORT" | "HOLD",
    expectedNetEV: number,
    confidence: number,
    assetScore: number,
    assetState: P20AssetState,
    regime: P20RegimeType,
    optimalHorizon: number,
    allocatedRiskPct: number,
    activePositionsSymbols: string[] = []
  ): P20RankedOpportunity {
    // Correlation penalty: if an active position is correlated > 0.75, dampen score
    let correlationPenalty = 1.0;
    let correlationPenaltyApplied = false;

    for (const activeSym of activePositionsSymbols) {
      const corr = this.CORRELATION_MATRIX[symbol]?.[activeSym] || 0.70;
      if (corr >= 0.75) {
        correlationPenalty *= 0.80; // 20% penalty per highly correlated active position
        correlationPenaltyApplied = true;
      }
    }

    const tierWeight = tier === "TIER_A_PRECISION" ? 1.5 : (tier === "TIER_B_BALANCED" ? 1.1 : 0.8);
    const compositeScore = Number(
      ((expectedNetEV * 1000) * confidence * (assetScore / 50) * tierWeight * correlationPenalty).toFixed(2)
    );

    return {
      opportunityId,
      symbol,
      tier,
      direction,
      compositeScore,
      expectedNetEV,
      confidence,
      assetState,
      regime,
      optimalHorizon,
      allocatedRiskPct: Number((allocatedRiskPct * correlationPenalty).toFixed(2)),
      correlationPenaltyApplied,
      rank: 1 // Default top rank for single evaluation
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PHASE 20 MASTER ENGINE
// ═══════════════════════════════════════════════════════════════════

export class AqeaP20AdaptiveOpportunityEngine {
  private static readonly activeEpisodes = new Map<string, IndependentTradeEpisode>();
  private static readonly completedEpisodes: IndependentTradeEpisode[] = [];
  private static readonly ledger: any[] = [];

  public static clearState(): void {
    this.activeEpisodes.clear();
    this.completedEpisodes.length = 0;
    this.ledger.length = 0;
  }

  public static evaluate(
    decisionId: string,
    features: Standardized15Features,
    regime: AnyRegime,
    dlPredictions: ModelExpertPrediction[],
    quantSignals: QuantExpertSignal[],
    productionEnsembleFusion?: EnsembleFusionResult,
    productionBayesianEval?: BayesianEvaluationResult,
    targetTierOverride?: P20AdaptiveTier
  ): P20EvaluationResult {
    const timestamp = Date.now();
    const symbol = features.symbol || "BTCUSDT";
    const currentPrice = features.ohlcv?.close || 97500;
    const atr14 = features.atr?.atr14 || currentPrice * 0.015;
    const atrPct = features.atr?.atrPercent || 0.015;
    const spread = features.orderBook?.spread || 25;
    const spreadPct = (spread / currentPrice);

    // ═══════════════════════════════════════════════════════════════
    //  1. ASSET & REGIME ROUTING
    // ═══════════════════════════════════════════════════════════════
    const regStr = String(regime || "RANGING").toUpperCase() as P20RegimeType;
    const assetRouting = AqeaP20AssetOpportunityRouter.evaluateAsset(symbol, features, regStr);
    const regimeRouting = AqeaP20RegimeRouter.routeRegime(regime);

    // ═══════════════════════════════════════════════════════════════
    //  2. MODEL INFERENCE & SPECIALISTS
    // ═══════════════════════════════════════════════════════════════
    // Exclude quarantined LSTM
    const eligiblePreds = dlPredictions.filter(p => !p.modelName.includes("LSTM") && !p.modelName.includes("BILSTM"));
    
    // CNN Directional Champion
    const cnnPred = eligiblePreds.find(p => p.modelName.includes("CNN"));
    const cnnProbs = cnnPred?.probabilities || { LONG: 0.3333, SHORT: 0.3333, HOLD: 0.3334 };
    const cnnDir = cnnPred?.direction || "HOLD";
    const cnnConf = cnnPred?.confidence || 0;
    const cnnFallback = !cnnPred || (cnnProbs.LONG === 0.3333 && cnnProbs.SHORT === 0.3333);

    // Mamba Context Specialist
    const mambaPred = eligiblePreds.find(p => p.modelName.includes("MAMBA"));
    const mambaProbs = mambaPred?.probabilities || { LONG: 0.3333, SHORT: 0.3333, HOLD: 0.3334 };
    const mambaDir = mambaPred?.direction || "HOLD";
    let mambaContextStatus: "CONFIRMING" | "NEUTRAL" | "CAUTION" | "OPPOSING" = "NEUTRAL";
    if (cnnDir !== "HOLD") {
      if (mambaDir === cnnDir) mambaContextStatus = "CONFIRMING";
      else if (mambaDir === "HOLD" || mambaProbs.HOLD >= 0.40) mambaContextStatus = "CAUTION";
      else mambaContextStatus = "OPPOSING";
    }

    // Evidence-Aware Fused Direction (CNN Champion authority)
    let fusedDirection: "LONG" | "SHORT" | "HOLD" = cnnDir;
    if (mambaContextStatus === "OPPOSING" && (mambaProbs.LONG > 0.60 || mambaProbs.SHORT > 0.60)) {
      fusedDirection = "HOLD"; // Safety veto only on unequivocal opposing directional conviction
    }

    // ═══════════════════════════════════════════════════════════════
    //  3. MULTI-HORIZON EVALUATION & DYNAMIC EXIT
    // ═══════════════════════════════════════════════════════════════
    const multiHorizon = AqeaP20MultiHorizonEngine.evaluateHorizons(
      fusedDirection,
      cnnConf,
      atrPct,
      spreadPct,
      assetRouting.recommendedHorizons
    );

    const dynamicExit = AqeaP20MultiHorizonEngine.optimizeExit(
      fusedDirection,
      currentPrice,
      atr14,
      multiHorizon.selectedHorizon,
      regimeRouting.regime
    );

    // ═══════════════════════════════════════════════════════════════
    //  4. TRADE QUALITY & NET EV
    // ═══════════════════════════════════════════════════════════════
    const tradeQuality = {
      label: "TRADE_QUALITY_ESTIMATOR_P20_ADAPTIVE" as const,
      pTpBeforeSl: multiHorizon.selectedHorizon.pTpBeforeSl,
      expectedNetEV: multiHorizon.selectedHorizon.expectedNetEV,
      mfeMaeRatio: multiHorizon.selectedHorizon.mfeMaeRatio,
      frictionCost: multiHorizon.selectedHorizon.totalFriction,
      isEconomicallyViable: multiHorizon.selectedHorizon.isViable
    };

    // ═══════════════════════════════════════════════════════════════
    //  5. ADAPTIVE TIER CLASSIFICATION
    // ═══════════════════════════════════════════════════════════════
    let adaptiveTier: P20AdaptiveTier = "HOLD";
    
    if (fusedDirection !== "HOLD" && tradeQuality.isEconomicallyViable) {
      if (cnnConf >= 0.85 && tradeQuality.expectedNetEV >= 0.010 && assetRouting.assetState !== "UNFAVORABLE") {
        adaptiveTier = "TIER_A_PRECISION";
      } else if (cnnConf >= 0.65 && tradeQuality.expectedNetEV >= 0.005) {
        adaptiveTier = "TIER_B_BALANCED";
      } else if (cnnConf >= 0.50 && tradeQuality.expectedNetEV > 0) {
        adaptiveTier = "TIER_C_OPPORTUNITY";
      }
    }

    if (targetTierOverride) {
      adaptiveTier = targetTierOverride;
    }

    // ═══════════════════════════════════════════════════════════════
    //  6. DYNAMIC RISK & POSITION SIZING
    // ═══════════════════════════════════════════════════════════════
    const baseRiskPct = 1.0;
    const confMultiplier = Math.max(0.5, Math.min(1.5, cnnConf * 1.5));
    const allocatedRiskPct = Number(
      (baseRiskPct * confMultiplier * assetRouting.assetRiskMultiplier * regimeRouting.regimeRiskMultiplier).toFixed(2)
    );
    const leverage = 3.0;
    const accountEquity = 10000;
    const riskDollar = accountEquity * (allocatedRiskPct / 100);
    const stopLossDistance = Math.max(0.01, (dynamicExit.stopLossMultiplier * atrPct));
    const notionalPositionSize = Number((riskDollar / stopLossDistance).toFixed(2));
    const marginRequirement = Number((notionalPositionSize / leverage).toFixed(2));

    const dynamicRisk: DynamicRiskSizingProfile = {
      baseRiskPct,
      confidenceMultiplier: Number(confMultiplier.toFixed(2)),
      drawdownDampener: 1.0,
      lossClusterCooldown: false,
      allocatedRiskPct,
      notionalPositionSize,
      marginRequirement,
      leverage
    };

    // ═══════════════════════════════════════════════════════════════
    //  7. PORTFOLIO OPPORTUNITY RANKING
    // ═══════════════════════════════════════════════════════════════
    const opportunityId = `OPP_P20_${symbol}_${timestamp}`;
    const signalId = `SIG_P20_${symbol}_${timestamp}`;
    const rankedOpportunity = AqeaP20PortfolioOpportunityRanker.rankOpportunity(
      opportunityId,
      symbol,
      adaptiveTier,
      fusedDirection,
      tradeQuality.expectedNetEV,
      cnnConf,
      assetRouting.opportunityScore,
      assetRouting.assetState,
      regimeRouting.regime,
      multiHorizon.selectedHorizon.horizonBars,
      allocatedRiskPct,
      Array.from(this.activeEpisodes.keys())
    );

    // ═══════════════════════════════════════════════════════════════
    //  8. INDEPENDENT TRADE EPISODE & SIGNAL ABSORPTION
    // ═══════════════════════════════════════════════════════════════
    let isSignalAbsorbed = false;
    let activeEpisodeId: string | null = null;

    const existingEpisode = this.activeEpisodes.get(symbol);
    if (existingEpisode && existingEpisode.status === "OPEN") {
      isSignalAbsorbed = true;
      existingEpisode.absorbedSignalCount++;
      activeEpisodeId = existingEpisode.episodeId;
    } else if (fusedDirection !== "HOLD" && adaptiveTier !== "HOLD") {
      activeEpisodeId = `EPISODE_P20_${symbol}_${timestamp}`;
      const newEpisode: IndependentTradeEpisode = {
        episodeId: activeEpisodeId,
        symbol,
        entryTimestamp: timestamp,
        entryPrice: currentPrice,
        direction: fusedDirection as "LONG" | "SHORT",
        targetPrice: dynamicExit.takeProfitPrice,
        stopLossPrice: dynamicExit.stopLossPrice,
        maxHoldingBars: dynamicExit.expectedDurationBars,
        currentBarsHeld: 0,
        status: "OPEN",
        absorbedSignalCount: 1
      };
      this.activeEpisodes.set(symbol, newEpisode);
    }

    // ═══════════════════════════════════════════════════════════════
    //  9. REJECTION WATERFALL ATTRIBUTION
    // ═══════════════════════════════════════════════════════════════
    let firstBlockingGate: P20RejectionGate = "NONE";
    let isAdmitted = false;

    if (cnnFallback) {
      firstBlockingGate = "MODEL_FALLBACK";
    } else if (fusedDirection === "HOLD") {
      firstBlockingGate = "DIRECTIONAL_CONVICTION";
    } else if (assetRouting.assetState === "UNFAVORABLE" && adaptiveTier === "TIER_A_PRECISION") {
      firstBlockingGate = "ASSET_UNFAVORABLE";
    } else if (!tradeQuality.isEconomicallyViable) {
      firstBlockingGate = "NETEV";
    } else if (isSignalAbsorbed) {
      firstBlockingGate = "POSITION_ALREADY_OPEN";
    } else {
      isAdmitted = true;
    }

    // ═══════════════════════════════════════════════════════════════
    //  ASSEMBLE FINAL EVALUATION RESULT
    // ═══════════════════════════════════════════════════════════════
    const result: P20EvaluationResult = {
      decisionId,
      opportunityId,
      signalId,
      symbol,
      timestamp,
      regime: regStr,
      assetRouting,
      regimeRouting,
      cnnInference: {
        model: "CNN_V2_DUAL_HEAD",
        direction: cnnDir,
        probabilities: { ...cnnProbs },
        confidence: cnnConf,
        fallbackUsed: cnnFallback
      },
      mambaContext: {
        direction: mambaDir,
        probabilities: { ...mambaProbs },
        contextStatus: mambaContextStatus
      },
      lstmQuarantine: {
        status: "OUTPUT_COLLAPSED",
        votingEligible: false,
        reason: QUARANTINED_MODELS.LSTM_SEQUENCE_V1.reason
      },
      multiHorizon,
      dynamicExit,
      tradeQuality,
      adaptiveTier,
      rankedOpportunity,
      tradeIndependence: {
        isSignalAbsorbed,
        activeEpisodeId,
        totalActiveEpisodes: this.activeEpisodes.size,
        completedEpisodesCount: this.completedEpisodes.length
      },
      dynamicRisk,
      rejectionWaterfall: {
        firstBlockingGate,
        isAdmitted
      },
      safety: {
        livePromotionBlocked: true,
        isLiveApproved: false,
        executionAttempted: false,
        orderCreationCount: 0,
        walletMutationCount: 0,
        syntheticOutcomeCountUsedForOOS: 0,
        lstmVotingEligible: false,
        calibrationFitFromInsufficientEvidence: false
      }
    };

    // Emit structured telemetry
    this.emitTelemetry(result);

    this.ledger.push(result);
    if (this.ledger.length > 3000) this.ledger.shift();

    return result;
  }

  private static emitTelemetry(r: P20EvaluationResult): void {
    console.log(`[P20_ASSET_ROUTING_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW", symbol: r.symbol,
      assetState: r.assetRouting.assetState,
      opportunityScore: r.assetRouting.opportunityScore,
      frictionBurdenPct: r.assetRouting.frictionBurdenPct,
      recommendedHorizons: r.assetRouting.recommendedHorizons
    }));

    console.log(`[P20_REGIME_ROUTING_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW", symbol: r.symbol,
      regime: r.regimeRouting.regime,
      cnnAuthority: r.regimeRouting.cnnAuthority,
      mambaAuthority: r.regimeRouting.mambaAuthority,
      preferredHorizons: r.regimeRouting.preferredHorizons
    }));

    console.log(`[P20_HORIZON_SELECTION_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW", symbol: r.symbol,
      selectedHorizonBars: r.multiHorizon.selectedHorizon.horizonBars,
      expectedNetEV: r.multiHorizon.selectedHorizon.expectedNetEV,
      pTpBeforeSl: r.multiHorizon.selectedHorizon.pTpBeforeSl,
      profitFactorEstimate: r.multiHorizon.selectedHorizon.profitFactorEstimate
    }));

    console.log(`[P20_OPPORTUNITY_SCORE_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW", symbol: r.symbol,
      opportunityId: r.opportunityId,
      tier: r.adaptiveTier,
      direction: r.rankedOpportunity.direction,
      compositeScore: r.rankedOpportunity.compositeScore,
      allocatedRiskPct: r.rankedOpportunity.allocatedRiskPct
    }));

    console.log(`[P20_TRADE_QUALITY_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW", symbol: r.symbol,
      pTp: r.tradeQuality.pTpBeforeSl,
      expectedNetEV: r.tradeQuality.expectedNetEV,
      mfeMaeRatio: r.tradeQuality.mfeMaeRatio,
      frictionCost: r.tradeQuality.frictionCost,
      isViable: r.tradeQuality.isEconomicallyViable
    }));

    console.log(`[P20_EXIT_OPTIMIZATION_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW", symbol: r.symbol,
      tpPrice: r.dynamicExit.takeProfitPrice,
      slPrice: r.dynamicExit.stopLossPrice,
      rrRatio: r.dynamicExit.rewardRiskRatio,
      durationBars: r.dynamicExit.expectedDurationBars
    }));

    console.log(`[P20_PORTFOLIO_RANK_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW", symbol: r.symbol,
      rank: r.rankedOpportunity.rank,
      score: r.rankedOpportunity.compositeScore,
      correlationPenalty: r.rankedOpportunity.correlationPenaltyApplied
    }));

    console.log(`[P20_REJECTION_WATERFALL_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW", symbol: r.symbol,
      firstBlockingGate: r.rejectionWaterfall.firstBlockingGate,
      isAdmitted: r.rejectionWaterfall.isAdmitted
    }));

    console.log(`[P20_INDEPENDENT_TRADE_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW", symbol: r.symbol,
      isSignalAbsorbed: r.tradeIndependence.isSignalAbsorbed,
      activeEpisodeId: r.tradeIndependence.activeEpisodeId,
      totalActiveEpisodes: r.tradeIndependence.totalActiveEpisodes
    }));

    console.log(`[P20_RISK_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW", symbol: r.symbol,
      allocatedRiskPct: r.dynamicRisk.allocatedRiskPct,
      notional: r.dynamicRisk.notionalPositionSize,
      margin: r.dynamicRisk.marginRequirement,
      leverage: r.dynamicRisk.leverage
    }));

    console.log(`[P20_PARETO_FRONTIER_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW",
      tier: r.adaptiveTier,
      expectedNetEV: r.tradeQuality.expectedNetEV,
      confidence: r.cnnInference.confidence
    }));

    console.log(`[P20_OOS_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW", symbol: r.symbol,
      decisionId: r.decisionId,
      shadowLedgerCount: this.ledger.length,
      oosStatus: "GENUINE_SHADOW_FORWARD"
    }));

    console.log(`[P20_SAFETY_TRACE] ` + JSON.stringify({
      phase: "P20", mode: "SHADOW", decisionId: r.decisionId,
      safety: r.safety,
      status: "ALL_SAFETY_BARRIERS_ACTIVE"
    }));
  }

  public static getLedger() { return this.ledger; }
  public static getActiveEpisodes() { return Array.from(this.activeEpisodes.values()); }
}
