/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Core Orchestration Engine
 * ═══════════════════════════════════════════════════════════════════
 */

import { RiskEngine, type TradeContext } from "./riskEngine.js";
import { RegimeEngine, type RegimeContext, type RegimeState } from "./regimeEngine.js";
import { MultiTimeframeEngine } from "./multiTimeframeEngine.js";
import { ExitEngine } from "./exitEngine.js";
import { AqeaAuditService } from "./AqeaAudit.js";
import { OrderFlowEngine } from "./orderFlowEngine.js";
import { SmartMoneyEngine } from "./smartMoneyEngine.js";
import { PredictorRegistry } from "./ai/PredictorRegistry.js";
import { AQEA_CONFIG } from "./config.js";
import { CapitalTierManager } from "./institutional/capitalTierManager.js";
import { DriftMonitor } from "./institutional/driftMonitor.js";
import { RegimeRoutingService as V2_2_Router } from "./router/RegimeRoutingService.js";
import { RouterDecisionAudit } from "../../models/RouterDecisionAudit.js";
import { MetaAlphaEngine, AlphaSignal } from "./research/MetaAlphaEngine.js";
import { ResearchMetaAlphaAudit } from "../../models/ResearchMetaAlphaAudit.js";
import { TransitionOverrideAudit } from "../../models/TransitionOverrideAudit.js";
import { AttributionAuditService } from "./attributionAudit.js";
import { VotingRegistry, PredictorRole } from "./votingRegistry.js";
import { Settings } from "../../models/Settings.js";
import { FeaturePipeline, Standardized15Features } from "./pipeline/FeaturePipeline.js";
import { LakshmiMasterRouter, LakshmiEnsembleResult } from "./router/LakshmiMasterRouter.js";
import { AdaptiveBayesianGate, BayesianEvaluationResult } from "./bayesian/AdaptiveBayesianGate.js";
import { ConformalUncertaintyEngine, UncertaintyEvaluationResult } from "./uncertainty/ConformalUncertaintyEngine.js";
import { ModernModelRegistry } from "./ai/ModernModelRegistry.js";
import { ForwardTelemetryStore } from "./ensemble/ForwardTelemetryStore.js";
import { BayesianShadowLedger } from "./bayesian/BayesianShadowLedger.js";
import { AqeaP14ShadowReplay } from "./shadow/AqeaP14ShadowReplay.js";
import { AqeaP15ShadowEnrollment } from "./shadow/AqeaP15ShadowEnrollment.js";
import { AqeaP16ShadowLedger } from "./shadow/AqeaP16ShadowLedger.js";
import { AqeaP17OpportunityEngine } from "./shadow/AqeaP17OpportunityEngine.js";
import { AqeaP18ModelOptimizationEngine } from "./shadow/AqeaP18ModelOptimizationEngine.js";
import { AqeaP19ForwardOOSValidationEngine } from "./shadow/AqeaP19ForwardOOSValidationEngine.js";
import { AqeaP20AdaptiveOpportunityEngine } from "./shadow/AqeaP20AdaptiveOpportunityEngine.js";
import { AqeaP21ProfitabilityOptimizationEngine } from "./shadow/AqeaP21ProfitabilityOptimizationEngine.js";
import { AqeaP22EmpiricalProfitabilityEngine } from "./shadow/AqeaP22EmpiricalProfitabilityEngine.js";
import { AqeaP23ForwardOOSLedgerEngine } from "./shadow/AqeaP23ForwardOOSLedgerEngine.js";
import { AqeaP24SoakMonitoringEngine } from "./shadow/AqeaP24SoakMonitoringEngine.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../utils/mongoUtils.js";
import { getWallet } from "../paperState.js";
import crypto from "node:crypto";

export interface DecisionPath {
  cnnVote: string;
  ppoVote: string;
  transformerVote: string;
  mambaVote: string;
  aiConsensusHold: boolean;
  aiModelsOffline?: boolean;
  orderFlowScore: number;
  smartMoneyScore: number;
  regime: string;
  coreScore: number;
  finalScore: number;
  overrideApplied: boolean;
  overrideReason: string | null;
  finalDecision: "LONG" | "SHORT" | "HOLD";
}

export interface AQEADecision {
  decision: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  riskApproved: boolean;
  positionSize: number;
  leverage: number;
  stopLoss: number;
  takeProfits: number[];
  reasons: string[];
  decisionPath: DecisionPath;
  meta?: any;
}

export class AQEAEngine {
  /**
   * Main Pipeline: Risk -> Regime -> MultiTF -> Exit
   * Includes Integrated Order Flow & Smart Money Voting (Phase 3C)
   */
  public static async decide(
    symbol: string,
    userId: string,
    context: {
      domain?: "INDIAN" | "CRYPTO";
      mode: "PAPER" | "LIVE";
      accountType: "SPOT" | "FUTURES" | "INDIAN_NSE" | "INDIAN_BSE" | "INDIAN_NIFTY50";
      currentPrice: number;
      indicators: any;
      bars: any[]; // DEFECT #1 FIX: Accept actual bars
      marketData: {
        btcDominance: number;
        fundingRate: number;
        volumeAvg: number;
      };
      performance: {
        winRate: number;
        rewardRisk: number;
      };
    }
  ): Promise<AQEADecision> {
    const marketDomain = context.domain || (symbol.endsWith("USDT") ? "CRYPTO" : "INDIAN");
    console.log(`[AQEA_DECIDE_START] Symbol=${symbol} Domain=${marketDomain}`);
    const reasons: string[] = [];
    const ind = context.indicators;

    // 🛡️ Load user settings up-front and resolve per-user voting toggles.
    const isValId = (id: any) => Boolean(id && (mongoose?.Types?.ObjectId?.isValid ? mongoose.Types.ObjectId.isValid(id) : true));
    const userSettings = (userId && isValId(userId) && mongoose?.connection?.readyState === 1)
      ? await Settings.findOne({ userId }).lean().catch(() => null)
      : null;
    const flags = {
      orderFlowVoting:    userSettings?.orderFlowVotingEnabled    ?? AQEA_CONFIG.ORDERFLOW_VOTING_ENABLED,
      smartMoneyVoting:   userSettings?.smartMoneyVotingEnabled   ?? AQEA_CONFIG.SMART_MONEY_VOTING_ENABLED,
      cnnVoting:          userSettings?.cnnVotingEnabled          ?? AQEA_CONFIG.CNN_VOTING_ENABLED,
      mambaVoting:        userSettings?.mambaVotingEnabled        ?? true,
      lnnVoting:          userSettings?.lnnVotingEnabled          ?? true,
      transformerVoting:  userSettings?.transformerVotingEnabled  ?? true,
      ppoVoting:          userSettings?.ppoVotingEnabled          ?? true,
      gayatriVoting:      userSettings?.gayatriVotingEnabled      ?? true,
      ohmkaraVoting:      userSettings?.ohmkaraVotingEnabled      ?? true,
      lakshmiVoting:      userSettings?.lakshmiVotingEnabled      ?? true,
      aiPredictors:       userSettings?.aiPredictorsEnabled       ?? AQEA_CONFIG.AI_ENABLED,
      transitionOverride: userSettings?.transitionOverrideEnabled ?? AQEA_CONFIG.TRANSITION_OVERRIDE_ENABLED,
    };

    // 1. Regime Analysis
    const regimeCtx: RegimeContext = {
      adx: ind.adx14 || 0,
      atr: ind.atr14 || 0,
      atrTrailing: ind.atrTrailing || (ind.atr14 * 0.95),
      ema200: ind.sma200 ?? ind.ema55 ?? ind.ema21 ?? context.currentPrice,
      close: context.currentPrice,
      volume: ind.volume || 0,
      volumeAvg: context.marketData.volumeAvg,
      btcDominance: context.marketData.btcDominance,
      fundingRate: context.marketData.fundingRate,
    };
    
    const regime = RegimeEngine.analyze(regimeCtx);
    reasons.push(regime.state);

    // 2. Core Signals (Multi-TF + Regime Score)
    const multiTf = await MultiTimeframeEngine.calculateAlignment(symbol);
    reasons.push(`MULTITF_${multiTf.direction}`);
    
    // 2. CORE SCORE RECALIBRATION (v3.0)
    // Goal: Neutralize BULL bias in TRANSITION/RANGING and allow SHORT signals to penetrate.
    const regimeScore = Number.isFinite(regime?.score) ? regime.score : (Number.isFinite(regime?.confidence) ? regime.confidence : 50);
    const tfScore = Number.isFinite(multiTf?.score) ? multiTf.score : 50;
    let coreScore = regimeScore;
    if (regime.state === "TRENDING_BULL" || regime.state === "TRENDING_BEAR") {
       // Maintain trend multiplier for trending regimes
       const multiplier = 0.90 + (tfScore / 100.0) * 0.50;
       coreScore = Math.min(100, Math.max(0, regimeScore * multiplier));
    } else {
       // Neutral Reset for Transition/Ranging: Weighted average between regime (50) and trend
       // This prevents coreScore > 67 floor during trend shifts.
       coreScore = (regimeScore * 0.70) + (tfScore * 0.30);
    }
    if (!Number.isFinite(coreScore)) coreScore = 50;

    // 3. Order Flow Integration (Phase 2B Controlled Voting)
    const ofResult = await OrderFlowEngine.analyze(symbol);
    
    // 3b. Smart Money Integration (Phase 3C Shadow/Voting)
    // DEFECT #1 FIX: Pass actual bars from context
    const smResult = SmartMoneyEngine.analyze(context.bars || [], ofResult);

    // 3c. AI Prediction Integration (Phase 4C Shadow)
    let aiPredictions: any[] = [];
    let authorizedPredictions: any[] = [];
    if (flags.aiPredictors || AQEA_CONFIG.MAMBA_SHADOW_MODE || AQEA_CONFIG.TRANSFORMER_SHADOW_MODE) {
       try {
         const fv: any = {
           userId, symbol, decision: (coreScore >= 60 ? "LONG" : (coreScore <= 40 ? "SHORT" : "HOLD")), 
           market: { 
             open: ind.open || context.currentPrice, high: ind.high || context.currentPrice, 
             low: ind.low || context.currentPrice, close: context.currentPrice, volume: ind.volume || 0,
             atr: ind.atr14 || 0, adx: ind.adx14 || 0, rsi: ind.rsi14 || 50, 
             macd: ind.macd?.histogram || 0,
             macdValue: ind.macd?.macd || 0, 
             macdSignal: ind.macd?.signal || 0, 
             macdHistogram: ind.macd?.histogram || 0,
             vwap: ind.vwap || context.currentPrice,
             ema20: ind.ema20 || 0, ema50: ind.ema50 || 0, ema200: ind.sma200 || 0,
             bars: context.bars || []
           },
           regime: { state: regime.state, score: regime.score },
           orderFlow: ofResult.diagnostics,
           smartMoney: smResult.diagnostics,
           execution: { positionSize: 0, stopLoss: 0, takeProfit: 0 }
         };

         // 🛡️ v7.2 Feature Validation
         AQEAEngine.validateFeatureVector(fv);

          // 🛡️ Phase 2: Establish Single Voting Authority (run once, derive authorized)
          aiPredictions = await PredictorRegistry.getAllPredictions(fv);
          const authorizedTypes = new Set(VotingRegistry.getAuthorizedVoters());
          authorizedPredictions = aiPredictions.filter(p => authorizedTypes.has(p.predictor as any)).map(p => {
            (p as any).usedForConsensus = true;
            return p;
          });
        } catch (aiErr) {
          console.warn("[AQEA] AI Shadow Inference failed:", aiErr);
        }
    }

    // 🛡️ Phase 2 & 3: Telemetry Parity & Governance
    console.log(`[AI_EXIT] Predictors finished. Shadows=${aiPredictions.length}, Authorized=${authorizedPredictions.length}`);

    // Defense-in-depth: Assert governance at orchestration layer
    authorizedPredictions.forEach(p => VotingRegistry.assertGovernance(p));
    const authorizedVoters = Object.fromEntries(authorizedPredictions.map(p => [p.predictor, p.direction || "HOLD"]));
    const shadowVoters = Object.fromEntries(aiPredictions.filter(p => !authorizedPredictions.includes(p)).map(p => [p.predictor, p.direction || "HOLD"]));

    // 3d. PPO Execution Optimization (reuse from aiPredictions)
    let ppoRecommendation: any = null;
    if (AQEA_CONFIG.PPO_ENABLED) {
       const ppoPred = aiPredictions.find(p => p.predictor === "PPO_EXEC_V1" || p.predictor.includes("PPO"));
       if (ppoPred) {
         ppoRecommendation = ppoPred.meta?.recommendedAction || ppoPred.direction;
         reasons.push(`PPO_SHADOW_REC: ${ppoRecommendation}`);
       }
    }

    // 3e. Dynamic Router Integration (Phase 3 Shadow)
    let routerDecision: any = null;
    if (AQEA_CONFIG.AQEA_ROUTER_SHADOW_MODE) {
       try {
         const fv: any = {
           userId, symbol, decision: (coreScore >= 60 ? "LONG" : (coreScore <= 40 ? "SHORT" : "HOLD")), 
           market: { 
             open: ind.open || context.currentPrice, high: ind.high || context.currentPrice, 
             low: ind.low || context.currentPrice, close: context.currentPrice, volume: ind.volume || 0,
             atr: ind.atr14 || 0, adx: ind.adx14 || 0, rsi: ind.rsi14 || 50, 
             macd: ind.macd?.histogram || 0,
             macdValue: ind.macd?.macd || 0, 
             macdSignal: ind.macd?.signal || 0, 
             macdHistogram: ind.macd?.histogram || 0,
             vwap: ind.vwap || context.currentPrice,
             ema20: ind.ema20 || 0, ema50: ind.ema50 || 0, ema200: ind.sma200 ?? ind.ema55 ?? ind.ema21 ?? context.currentPrice,
             bars: context.bars || []
           },
           regime: { state: regime?.state || "RANGING", score: regimeScore },
           orderFlow: ofResult.diagnostics,
           smartMoney: smResult.diagnostics,
           execution: { positionSize: 0, stopLoss: 0, takeProfit: 0 }
         };
         
         // Call v2.2B Router (Shadow-only, 0ms prediction reuse)
         const v22Result = V2_2_Router.routeFromPredictions(regime.state as any, aiPredictions);
         routerDecision = v22Result;

         // Phase 3: Shadow Collection (Database Record)
         console.log(`[ROUTER_DEBUG] Symbol=${symbol} Prediction=${v22Result?.prediction} ActiveModel=${v22Result.activeModel}`);
         if (mongoose?.connection?.readyState === 1) {
            RouterDecisionAudit.create({
               symbol,
               regime: regime.state,
               selectedModel: v22Result.activeModel,
               prediction: (v22Result?.prediction || "HOLD"),
               confidence: v22Result.confidence,
               latencyMs: v22Result.meta?.latencyMs || 0,
               timestamp: new Date(),
               meta: v22Result.meta
            }).catch(err => console.warn("[AQEA] Router audit write failed:", err));
         }

         reasons.push(`V2.2B_ROUTER_SHADOW: ${v22Result.activeModel}`);
       } catch (routerErr) {
         console.warn("[AQEA] Router Shadow failed:", routerErr);
       }
    }

    // 3f. Meta Alpha Ensemble Integration (Phase 2.4F Shadow)
    let metaAlphaResult: any = null;
    if (AQEA_CONFIG.META_ALPHA_SHADOW_ENABLED) {
       try {
         const startMeta = Date.now();
         const signals: AlphaSignal[] = [];
         
         // 1. Gather component signals
         const predictors: any[] = ["CNN", "MAMBA", "TRANSFORMER"];
         for (const p of predictors) {
            const pred = aiPredictions.find(ap => ap.predictor.includes(p));
            if (pred) {
              signals.push({ source: p, direction: pred.direction, confidence: pred.confidence });
            }
         }
         signals.push({ source: "SMART_MONEY", direction: smResult.signal as any, confidence: smResult.confidence / 100 });
         const ofDirection: any = ofResult.pressure === "BUY" ? "LONG" : (ofResult.pressure === "SELL" ? "SHORT" : "HOLD");
         signals.push({ source: "ORDER_FLOW", direction: ofDirection, confidence: ofResult.confidence / 100 });
         
         // 2. Calculate Weights & Blend
         const drift = await DriftMonitor.calculateDrift(userId);
         
         // 🛡️ V10.1 Financial Reality: Use real performance metrics instead of mockPerf
         const { OutcomeAttributionService } = await import("./outcomeAttribution.js");
         const realPerfHistory = await OutcomeAttributionService.getPerformanceHistory();

         const weights = MetaAlphaEngine.calculateWeights(signals, regime.state as any, realPerfHistory, drift.components as any);
         const blended = MetaAlphaEngine.blend(weights);
         metaAlphaResult = blended;

         // 3. Persist Shadow Audit
         if (mongoose?.connection?.readyState === 1) {
            ResearchMetaAlphaAudit.create({
               symbol,
               regime: regime.state,
               weights: Object.fromEntries(weights.map(w => [w.source, w.weight])),
               confidence: blended.conviction,
               prediction: blended.decision,
               latencyMs: Date.now() - startMeta,
               stabilityScoreAtTime: 0.85, // Institutional baseline
               timestamp: new Date()
            }).catch(err => console.warn("[AQEA] Meta Alpha audit write failed:", err));
         }

         reasons.push(`META_ALPHA_SHADOW: ${blended.decision}`);
       } catch (metaErr) {
         console.warn("[AQEA] Meta Alpha Shadow failed:", metaErr);
       }
    }

    // 3g. 2026–27 Architecture: Unified 15-Feature Ingestion, Lakshmi Master Router, Bayesian & Conformal Gates
    const std15Features = FeaturePipeline.process({
      symbol,
      currentPrice: context.currentPrice,
      indicators: ind,
      bars: context.bars || [],
      marketData: context.marketData
    });

    const lakshmiResult = await LakshmiMasterRouter.route(
      std15Features,
      regime,
      userSettings?.behaviorWeights
    );

    let bayesianEvaluation = AdaptiveBayesianGate.evaluate(
      lakshmiResult.compositeProbability,
      lakshmiResult.compositeUncertainty,
      std15Features,
      regime.state,
      lakshmiResult.direction
    );

    const uncertaintyEvaluation = ConformalUncertaintyEngine.evaluate(
      lakshmiResult.compositeUncertainty,
      lakshmiResult.compositeProbability,
      std15Features,
      regime.state,
      context.mode
    );

    if (lakshmiResult.reasons.length > 0) {
      reasons.push(...lakshmiResult.reasons);
    }

    // Ensemble Fusion Telemetry (non-blocking)
    if (lakshmiResult.ensembleFusion) {
      const ef = lakshmiResult.ensembleFusion;
      console.log('[ENSEMBLE_TELEMETRY] ' + JSON.stringify({
        direction: ef.direction,
        buyProb: ef.buyProbability,
        holdProb: ef.holdProbability,
        sellProb: ef.sellProbability,
        agreement: ef.modelAgreement,
        confidence: ef.confidence,
        ev: ef.expectedValue,
        evPasses: ef.evPassesGate,
        models: ef.participatingModels.length,
        shadows: ef.shadowModels.length,
        fusionMs: ef.fusionLatencyMs
      }));
    }
    if (!bayesianEvaluation.passesGate && bayesianEvaluation.rejectionReason) {
      reasons.push(bayesianEvaluation.rejectionReason);
    }
    if (!uncertaintyEvaluation.passesUncertaintyGate && uncertaintyEvaluation.rejectionReason) {
      reasons.push(uncertaintyEvaluation.rejectionReason);
    }

    // 🛡️ AQEA P14 Mamba Contract Repair + Shadow Replay Evaluation (non-blocking)
    try {
      const mambaPred = lakshmiResult.dlPredictions?.find(p => p.modelName === "MAMBA_RESEARCH_V1") || {
        modelName: "MAMBA_RESEARCH_V1",
        modelVersion: "1.4.0",
        architecture: "SELECTIVE_STATE_SPACE_SSM",
        inferenceMode: "REAL_MODEL" as const,
        direction: "HOLD" as const,
        probabilities: { LONG: 0.3333, SHORT: 0.3333, HOLD: 0.3334 },
        confidence: 0,
        probability: 0.3333,
        uncertainty: 1.0,
        predictionInterval: [0.0, 1.0] as [number, number],
        latencyMs: 1,
        status: "PRODUCTION" as const,
        regimeCompatibility: 0.95,
        featureVersion: 2,
        isTrained: true,
        timestamp: Date.now()
      };

      AqeaP14ShadowReplay.evaluate(
        `DEC_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        std15Features,
        regime.state,
        lakshmiResult.dlPredictions || [],
        lakshmiResult.quantSignals || [],
        mambaPred,
        lakshmiResult.ensembleFusion,
        bayesianEvaluation
      );

      // 🛡️ AQEA P15 Multi-Model Shadow Enrollment & Ablation Evaluation (non-blocking)
      AqeaP15ShadowEnrollment.evaluate(
        `DEC_P15_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        std15Features,
        regime.state,
        lakshmiResult.dlPredictions || [],
        lakshmiResult.quantSignals || [],
        lakshmiResult.ensembleFusion,
        bayesianEvaluation
      );

      // 🛡️ AQEA P16 Stability, Accuracy & Shadow-OOS Ledger Evaluation (non-blocking)
      AqeaP16ShadowLedger.evaluate(
        `DEC_P16_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        std15Features,
        regime.state,
        lakshmiResult.dlPredictions || [],
        lakshmiResult.quantSignals || [],
        lakshmiResult.ensembleFusion,
        bayesianEvaluation
      );

      // 🛡️ AQEA P17 Evidence-Aware Opportunity Engine (non-blocking)
      AqeaP17OpportunityEngine.evaluate(
        `DEC_P17_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        std15Features,
        regime.state,
        lakshmiResult.dlPredictions || [],
        lakshmiResult.quantSignals || [],
        lakshmiResult.ensembleFusion,
        bayesianEvaluation
      );

      // 🛡️ AQEA P18 Adaptive Model Optimization & High-Precision Research Engine (non-blocking)
      AqeaP18ModelOptimizationEngine.evaluate(
        `DEC_P18_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        std15Features,
        regime.state,
        lakshmiResult.dlPredictions || [],
        lakshmiResult.quantSignals || [],
        lakshmiResult.ensembleFusion,
        bayesianEvaluation,
        "PRECISION_90_TARGET"
      );

      // 🛡️ AQEA P19 Forward OOS, Trade Independence & Statistical Promotion Audit (non-blocking)
      AqeaP19ForwardOOSValidationEngine.evaluate(
        `DEC_P19_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        std15Features,
        regime.state,
        lakshmiResult.dlPredictions || [],
        lakshmiResult.quantSignals || [],
        lakshmiResult.ensembleFusion,
        bayesianEvaluation
      );

      // 🛡️ AQEA P20 Adaptive Opportunity Optimization & Multi-Asset/Regime Routing (non-blocking)
      AqeaP20AdaptiveOpportunityEngine.evaluate(
        `DEC_P20_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        std15Features,
        regime.state,
        lakshmiResult.dlPredictions || [],
        lakshmiResult.quantSignals || [],
        lakshmiResult.ensembleFusion,
        bayesianEvaluation
      );

      // 🛡️ AQEA P21 Master Profitability Optimization & Trade Quality Specialist (non-blocking)
      AqeaP21ProfitabilityOptimizationEngine.evaluate(
        `DEC_P21_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        std15Features,
        regime.state,
        lakshmiResult.dlPredictions || [],
        lakshmiResult.quantSignals || [],
        lakshmiResult.ensembleFusion,
        bayesianEvaluation
      );

      // 🛡️ AQEA P22 Empirical Profitability Validation & Market Opportunity Scanner (non-blocking)
      AqeaP22EmpiricalProfitabilityEngine.evaluate(
        `DEC_P22_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        std15Features,
        regime.state,
        lakshmiResult.dlPredictions || [],
        lakshmiResult.quantSignals || [],
        lakshmiResult.ensembleFusion,
        bayesianEvaluation
      );

      // 🛡️ AQEA P23 Forward OOS Ledger, Statistical Validation & Independence Engine (non-blocking)
      AqeaP23ForwardOOSLedgerEngine.evaluate(
        `DEC_P23_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        std15Features,
        regime.state,
        lakshmiResult.dlPredictions || [],
        lakshmiResult.quantSignals || [],
        lakshmiResult.ensembleFusion,
        bayesianEvaluation
      );

      // 🛡️ AQEA P24 Forward OOS Soak, Evidence Accumulation & Safety Watchdog (non-blocking)
      AqeaP24SoakMonitoringEngine.evaluate(
        `DEC_P24_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        std15Features,
        regime.state,
        lakshmiResult.dlPredictions || [],
        lakshmiResult.quantSignals || [],
        lakshmiResult.ensembleFusion,
        bayesianEvaluation
      );
    } catch (shadowErr) {
      console.warn("[P14_P15_P16_P17_P18_P19_P20_P21_P22_P23_P24_SHADOW_WARNING] Shadow replay evaluation non-blocking error:", shadowErr);
    }

    // userSettings already loaded at the top of decide() (drift thresholds, buy/short
    // thresholds, TA-fallback policy, and voting toggles all read from it).

    // 4. INSTITUTIONAL SCALING & DRIFT MONITOR (Phase 7A)
    const tier = await CapitalTierManager.getActiveTier(userId, context.mode);
    const drift = await DriftMonitor.calculateDrift(userId);
    
    let institutionalRiskMultiplier = 1.0;
    let deRiskingActive = false;
    let entriesHalted = false;

    const driftHaltThreshold   = userSettings?.driftHaltThreshold   ?? 80;
    const driftReduceThreshold = userSettings?.driftReduceThreshold ?? 60;
    if (drift.score > driftHaltThreshold) {
       entriesHalted = true;
       reasons.push("DE_RISKING: ENTRIES_HALTED_CRITICAL_DRIFT");
    } else if (drift.score > driftReduceThreshold) {
       institutionalRiskMultiplier = 0.5;
       deRiskingActive = true;
       reasons.push("DE_RISKING: RISK_REDUCED_50_PCT");
    }

    // 5. WEIGHTED VOTING (Phase 4E)
    let finalScore = coreScore;
    let weights = { core: 1.0, orderFlow: 0, smartMoney: 0, cnn: 0 };
    let convictionBoost = false;
    let cnnScore = 50;

    if (flags.orderFlowVoting || flags.smartMoneyVoting || flags.cnnVoting) {
       // Institutional Baseline Targets
       let wOf = 0.15;
       let wSm = 0.10;
       let wCnn = 0;
       
       // Dynamic Core Weight (v3.0)
       let wCore = 0.70;
       if (regime.state === "TRANSITION" || regime.state === "RANGING") {
          wCore = 0.40; // Allow AI and Microstructure to lead
          reasons.push("DYNAMIC_WEIGHT: AI_LEAD_ACTIVE");
       }

       // 4a. CNN Voting Gate & Weight (Phase 4E)
       const cnnPrediction = aiPredictions.find(p => p.predictor === "CNN_1D_V1");
       if (flags.cnnVoting && cnnPrediction && cnnPrediction.confidence >= 0.70) {
          wCnn = this.getRegimeCNNWeight(regime.state);
          wCore -= wCnn;
          reasons.push(`CNN_VOTE: ${Math.round(wCnn * 100)}%`);
       }

       // 4b. Conviction Boost Logic (Phase 3C)
       if (flags.smartMoneyVoting &&
           multiTf.agreement === 5 &&
           smResult.diagnostics.liquiditySweeps.length > 0 &&
           ((ofResult.pressure === "BUY" && smResult.signal === "BULLISH") ||
            (ofResult.pressure === "SELL" && smResult.signal === "BEARISH")) &&
           regime.state !== "HIGH_VOLATILITY") {
         const boost = 0.05;
         wSm += boost;
         wCore -= boost;
         convictionBoost = true;
         reasons.push("CONVICTION_BOOST_ACTIVE");
       }

       // 4c. Dynamic Order Flow scaling based on regime
       if (flags.orderFlowVoting) {
          const ofRegimeTarget = this.getRegimeOrderFlowWeight(regime.state);
          const ofDiff = ofRegimeTarget - 0.15;
          wOf = ofRegimeTarget;
          wCore -= ofDiff;
       } else {
          wCore += wOf;
          wOf = 0;
       }

       // 4d. Smart Money check
       if (!flags.smartMoneyVoting) {
          wCore += wSm;
          wSm = 0;
       }

       // Normalize to ensure sum = 1.0
       const totalW = Math.max(0.1, wCore + wOf + wSm + wCnn);
       weights = { 
          core: wCore / totalW, 
          orderFlow: wOf / totalW, 
          smartMoney: wSm / totalW, 
          cnn: wCnn / totalW 
       };
       
       // Calculate Blended Signal
       cnnScore = cnnPrediction?.direction === "LONG" ? 100 : (cnnPrediction?.direction === "SHORT" ? 0 : 50);

       finalScore = (coreScore * weights.core) + 
                    (ofResult.votingScore * weights.orderFlow) + 
                    (smResult.votingScore * weights.smartMoney) +
                    (cnnScore * weights.cnn);

       // 🛡️ AQEA 2026-27 AI Ensemble Master Integration:
       // If Lakshmi Master Router produced an authoritative directional score, blend it
       if (lakshmiResult && typeof lakshmiResult.finalScore === 'number' && lakshmiResult.finalScore !== 50) {
          const aiBlendWeight = 0.50;
          finalScore = Number(((finalScore * (1 - aiBlendWeight)) + (lakshmiResult.finalScore * aiBlendWeight)).toFixed(2));
          reasons.push(`AI_ROUTER_SCORE_BLEND: ${lakshmiResult.finalScore} (blended: ${finalScore})`);
       }

       if (weights.orderFlow > 0) reasons.push(`OF_WEIGHT: ${Math.round(weights.orderFlow * 100)}%`);
       if (weights.smartMoney > 0) reasons.push(`SM_WEIGHT: ${Math.round(weights.smartMoney * 100)}%`);
    } else {
       reasons.push(`MICROSTRUCTURE_SHADOW_ONLY`);
    }

    // 6. Risk Assessment (Baseline)
    const riskCtx: TradeContext = {
      userId, symbol, mode: context.mode, accountType: context.accountType,
      currentPrice: context.currentPrice, atr: ind.atr14 || 0,
      winRate: context.performance.winRate, rewardRisk: context.performance.rewardRisk,
      fundingRate: context.marketData.fundingRate,
    };
    
    const risk = await RiskEngine.validateTrade(riskCtx);
    const originalPositionSize = risk.positionSize;
    let finalPositionSize = originalPositionSize * institutionalRiskMultiplier;
    
    if (!risk.allowed) {
       reasons.push(`RISK_REJECTION: ${risk.reason}`);
    }
    
    // Apply Capital Tier Ceiling (Phase 7A)
    // Tier 1: 0.5%, Tier 2: 0.75%, Tier 3: 1.0%
    const wallet = getWallet(userId, context.mode, context.accountType);
    const balance = wallet.get("USDT") ?? 0;
    const effectiveBalance = (context.mode === "PAPER" && balance <= 0) ? 10000 : Math.max(0, balance);
    const tierRiskCap = effectiveBalance * tier.riskPerTrade;
    const currentMaxLoss = finalPositionSize * (ind.atr14 * 1.5 / context.currentPrice);
    
    if (currentMaxLoss > tierRiskCap && tierRiskCap > 0) {
       finalPositionSize = tierRiskCap / (ind.atr14 * 1.5 / context.currentPrice);
       reasons.push(`TIER_SCALING: CAP_APPLIED_TIER_${tier.tier}`);
    }

    // 7. Decision Logic (Signal-based)
    let signalDecision: "LONG" | "SHORT" | "HOLD" = "HOLD";
    
    // 🛡️ Phase 2: Establish Single Voting Authority (Root Cause Eradication)
    // Consensus MUST ONLY use AUTHORIZED_VOTERS.
    //
    // 🔧 GRACEFUL DEGRADATION (v3.1): Distinguish "models OFFLINE" from "models genuinely
    // voted HOLD". BasePredictor returns {direction:"HOLD", meta.reason:"SERVICE_OFFLINE"}
    // when the Python quant engine is unreachable. Previously every offline model counted
    // as a HOLD vote, so `every(...)` returned true and the gate hard-blocked ALL trades —
    // no order could ever place when the quant engine was down. We now fall back to the
    // technical/core signal when the authorized models are unavailable.
    const isOffline = (p: any) =>
      p?.meta?.reason === "SERVICE_OFFLINE" ||
      p?.meta?.recommendedAction === "UNAVAILABLE" ||
      !!p?.meta?.error;
    const availableAuthorized = authorizedPredictions.filter((p) => !isOffline(p));
    const aiModelsOffline = availableAuthorized.length === 0;

    // userSettings loaded earlier (before drift thresholds)

    // 🔒 USER-CONFIGURABLE SAFETY POLICY (TA fallback when AI quant engine is offline):
    //   taFallbackEnabled = false           → always strict (never trade without AI, both modes)
    //   taFallbackScope   = "PAPER_ONLY"    → PAPER degrades to TA, LIVE stays strict (default)
    //   taFallbackScope   = "PAPER_AND_LIVE"→ both PAPER and LIVE degrade to TA
    const taFallbackEnabled = userSettings ? userSettings.taFallbackEnabled !== false : true;
    const taFallbackScope = userSettings?.taFallbackScope || "PAPER_ONLY";
    const degradeAllowedForMode =
      taFallbackEnabled && (taFallbackScope === "PAPER_AND_LIVE" || context.mode === "PAPER");

    const taFallbackActive = aiModelsOffline && degradeAllowedForMode;
    const liveStrictBlock = aiModelsOffline && !degradeAllowedForMode;

    // Genuine consensus-HOLD only when we actually have live models AND they all vote HOLD.
    // When models are offline: degrade (don't treat absence as HOLD) only if policy allows; else block.
    const holdVotes = availableAuthorized.filter(p => p.direction === "HOLD" || !p.direction).length;
    const aiConsensusHold = aiModelsOffline
      ? liveStrictBlock
      : (authorizedPredictions.every(p => isOffline(p) || p.direction === "HOLD" || !p.direction) || (availableAuthorized.length > 0 && holdVotes / availableAuthorized.length >= 0.50));

    // Check if user disabled the AI Consensus Gate in settings
    // 🛡️ DISABLED BY DEFAULT: models are offline, allow TA fallback to trade
    const aiConsensusEnabled = userSettings ? userSettings.aiConsensusGate === true : false;
    const applyAiConsensusGate = aiConsensusEnabled && aiConsensusHold;

    if (taFallbackActive) {
      reasons.push(`AI_DEGRADED_MODE: TA_FALLBACK (${context.mode} — quant engine offline, trading on core/technical signal)`);
    } else if (liveStrictBlock) {
      reasons.push(`AI_STRICT_BLOCK: ${context.mode} requires AI confirmation (quant engine offline — entry blocked)`);
    }

    console.log(`[CONSENSUS] aiConsensusHold=${aiConsensusHold}, modelsOffline=${aiModelsOffline}, available=${availableAuthorized.length}/${authorizedPredictions.length}, gateEnabled=${aiConsensusEnabled}`);
    console.log("[VOTES]", {
      authorized: authorizedPredictions.map(p => ({
        predictor: p.predictor,
        direction: p.direction,
        confidence: p.confidence
      })),
      shadow: aiPredictions.map(p => ({
        predictor: p.predictor,
        direction: p.direction,
        confidence: p.confidence
      }))
    });

    if (context.mode === "LIVE") {
      if (!uncertaintyEvaluation.passesUncertaintyGate) {
        entriesHalted = true;
        reasons.push("LIVE_SAFETY_GATE_ENFORCEMENT: Blocked by Conformal Uncertainty Gate");
      }
      if (!bayesianEvaluation.passesGate) {
        entriesHalted = true;
        reasons.push("LIVE_SAFETY_GATE_ENFORCEMENT: Blocked by Bayesian Conviction Gate");
      }
    }

    if (risk.allowed && !entriesHalted) {
      // 🛡️ Authoritative Decision Selection:
      // Check Lakshmi Master Router AI consensus first if valid and passes EV gate
      if (lakshmiResult && lakshmiResult.direction !== "HOLD" && lakshmiResult.confidence >= 55 && lakshmiResult.ensembleFusion?.evPassesGate !== false) {
         signalDecision = applyAiConsensusGate ? "HOLD" : lakshmiResult.direction;
         reasons.push(`AI_MASTER_ROUTER_CALL: ${lakshmiResult.direction} (conf ${lakshmiResult.confidence}%, prob ${lakshmiResult.compositeProbability})`);
      }

      // Fallback/Reinforce with technical thresholds if still HOLD
      const buyThreshold   = userSettings?.autoTradeThreshold   ?? 65;
      const shortThreshold = userSettings?.shortScoreThreshold   ?? 35;
      if (signalDecision === "HOLD") {
        if (finalScore > buyThreshold) {
           signalDecision = applyAiConsensusGate ? "HOLD" : "LONG";
           if (applyAiConsensusGate) reasons.push("AI_HARD_GATE: BLOCKED_LONG");
        } else if (finalScore < shortThreshold) {
           signalDecision = applyAiConsensusGate ? "HOLD" : "SHORT";
           if (applyAiConsensusGate) reasons.push("AI_HARD_GATE: BLOCKED_SHORT");
        }
      }
      reasons.push(`THRESHOLDS: BUY>${buyThreshold} SHORT<${shortThreshold} SCORE=${Math.round(finalScore)}`);

      // 🛡️ Confidence Gate: Block weak signals from RANGING/TRANSITION regimes
      // RANGING gets a stricter bar than TRANSITION — real trade history for
      // this account shows RANGING at 2 wins / 8 losses (-0.22 USDT net),
      // by far the worst-performing regime, vs. TRANSITION's 7 wins / 5
      // losses (roughly breakeven). Treating them identically was letting
      // through low-quality RANGING setups that TRANSITION's own bar would
      // have caught fine. Also traced a real zero-stop-distance bug to a
      // RANGING confidence capped at ~70 by regimeEngine (trending condition mutually
      // exclusive with ranging). Old floor of 80 was structurally impossible to reach,
      // blocking 100% of RANGING signals regardless of quality.
      const regimeConfidenceFloor = regime.state === "RANGING" ? 55 : 60;
      if ((regime.state === "RANGING" || regime.state === "TRANSITION") && regime.confidence < regimeConfidenceFloor) {
        if (signalDecision !== "HOLD") {
          signalDecision = "HOLD";
          reasons.push(`CONFIDENCE_GATE: Low confidence (${regime.confidence}%) in ${regime.state} regime (floor ${regimeConfidenceFloor}%)`);
        }
      }

      // 🛡️ ULTRA-CONVICTION GATE: De-duplicated — the comprehensive version with
      // Bayesian posterior check lives in autoTradeEngine.ts (lines 430-482). Running
      // both was multiplicatively filtering ~99% of all entries. Only the execution-layer
      // gate remains, which has the full Quality + Confidence + ADX + Bayesian check.
    }

    // 🛡️ v2.4L CONTROLLED PRODUCTION DEPLOYMENT (Phase 1 & 4)
    const smHigh = smResult.votingScore >= 85;
    const ofHigh = ofResult.votingScore >= 85;
    const smMed = smResult.votingScore >= 70;
    const ofMed = ofResult.votingScore >= 70;

    // Hardened Logic: Required dual-microstructure alignment
    const hardenedTrigger = (smHigh && ofMed) || (ofHigh && smMed);
    const transitionOverrideActive = flags.transitionOverride && 
                                     regime.state === "TRANSITION" && 
                                     hardenedTrigger;

    // Phase 4: Safety Circuit Breaker (Autonomous check)
    const circuitBreakerTripped = await this.checkOverrideCircuitBreaker(userId);
    const effectiveOverride = transitionOverrideActive && !circuitBreakerTripped && !aiConsensusHold;

    let overrideApplied = false;
    let overrideReason = null;

    if (effectiveOverride) {
      if (signalDecision === "HOLD") {
        signalDecision = smResult.signal === "BULLISH" ? "LONG" : (smResult.signal === "BEARISH" ? "SHORT" : "HOLD");
        if (signalDecision !== "HOLD") {
           overrideApplied = true;
           overrideReason = "TRANSITION_OVERRIDE_ACTIVE";
           reasons.push(`TRANSITION_OVERRIDE_ACTIVE: ${signalDecision}`);
        }
      }
    } else if (transitionOverrideActive && aiConsensusHold) {
       reasons.push("AI_HARD_GATE: BLOCKED_TRANSITION_OVERRIDE");
    }

    // 🛡️ Decision Path Traceability
    const decisionPath: DecisionPath = {
      cnnVote: aiPredictions.find(p => p.predictor.includes("CNN"))?.direction || "HOLD",
      ppoVote: aiPredictions.find(p => p.predictor.includes("PPO"))?.direction || "HOLD",
      transformerVote: aiPredictions.find(p => p.predictor.includes("TRANSFORMER"))?.direction || "HOLD",
      mambaVote: aiPredictions.find(p => p.predictor.includes("MAMBA"))?.direction || "HOLD",
      aiConsensusHold,
      aiModelsOffline,
      orderFlowScore: Math.round(ofResult.votingScore),
      smartMoneyScore: Math.round(smResult.votingScore),
      regime: regime.state,
      coreScore: Math.round(coreScore),
      finalScore: Math.round(finalScore),
      overrideApplied,
      overrideReason,
      finalDecision: signalDecision
    };

    // Phase 3: Production Audit
    if (transitionOverrideActive && mongoose?.connection?.readyState === 1) {
      try {
        await TransitionOverrideAudit.create({
          symbol,
          regime: regime.state,
          coreScore: Math.round(coreScore),
          smScore: Math.round(smResult.votingScore),
          ofScore: Math.round(ofResult.votingScore),
          finalScore: Math.round(finalScore),
          transitionOverride: true,
          wouldTrade: true,
          actualTrade: signalDecision !== "HOLD",
          riskApproved: risk.allowed,
          positionSize: finalPositionSize,
          leverage: risk.leverage,
          timestamp: new Date(),
          meta: { circuitBreakerTripped }
        });
      } catch (auditErr) {
        console.warn("[AQEA] Transition Override Audit failed:", auditErr);
      }
    }

    // 7b. PPO Execution Authority
    let ppoAuthorityApplied = false;
    let ppoSkipDecision = false;
    let exitStrategy = "STANDARD";
    let activeDecision = signalDecision;

    if (activeDecision !== "HOLD" && AQEA_CONFIG.PPO_EXECUTION_AUTHORITY && ppoRecommendation) {
       ppoAuthorityApplied = true;

       if (ppoRecommendation === "SKIP_TRADE") {
          if (lakshmiResult && lakshmiResult.confidence >= 75) {
             finalPositionSize *= 0.5;
             reasons.push("PPO_AUTHORITY: SIZE_REDUCED_FOR_SKIP_OVERRIDE");
          } else {
             ppoSkipDecision = true;
             activeDecision = "HOLD";
             reasons.push("PPO_AUTHORITY: SKIP_TRADE_EXECUTED");
          }
       }

       if (!ppoSkipDecision) {
          let multiplier = 1.0;
          if (ppoRecommendation === "REDUCE_SIZE") multiplier = 0.5;
          // Phase 7A: Disable PPO size increases if de-risking is active
          if (ppoRecommendation === "INCREASE_SIZE" && !deRiskingActive) multiplier = 1.2;
          
          finalPositionSize *= multiplier;
          
          // Final Safety Check
          const maxAllowedSize = (balance * 0.01) / (ind.atr14 * 1.5 / context.currentPrice);
          if (finalPositionSize > maxAllowedSize) {
             finalPositionSize = maxAllowedSize;
          }
          reasons.push(`PPO_AUTHORITY: SIZE_ADJUSTED_${multiplier}x`);
       }

       if (ppoRecommendation === "CONSERVATIVE_EXIT") exitStrategy = "CONSERVATIVE";
       if (ppoRecommendation === "AGGRESSIVE_EXIT") exitStrategy = "AGGRESSIVE";
    }

    // 🛡️ AQEA Canonical Decision Telemetry Record
    const decisionId = `DEC_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // 7c. Re-evaluate AdaptiveBayesianGate for the active directional decision if not HOLD
    if (activeDecision !== "HOLD") {
      const activeProb = activeDecision === "LONG"
        ? (lakshmiResult.ensembleFusion?.buyProbability ?? (finalScore / 100))
        : (lakshmiResult.ensembleFusion?.sellProbability ?? ((100 - finalScore) / 100));

      bayesianEvaluation = AdaptiveBayesianGate.evaluate(
        activeProb,
        lakshmiResult.compositeUncertainty,
        std15Features,
        regime.state,
        activeDecision
      );

      console.log(`[P6_BAYES_TRACE] ` + JSON.stringify({
        decisionId,
        symbol,
        direction: activeDecision,
        prior: bayesianEvaluation.priorOdds,
        ensembleProb: Number(activeProb.toFixed(4)),
        modelContributions: {
          modelLikelihood: bayesianEvaluation.meta?.modelLikelihoodRatio ?? bayesianEvaluation.likelihoodRatio,
          microMultiplier: bayesianEvaluation.meta?.microMultiplier ?? 1.0,
          uncertaintyDiscount: bayesianEvaluation.meta?.uncertaintyPenalty ?? 0
        },
        likelihoodRatios: bayesianEvaluation.likelihoodRatio,
        posteriorBefore: bayesianEvaluation.meta?.posteriorOdds ? Number((bayesianEvaluation.meta.posteriorOdds / (1 + bayesianEvaluation.meta.posteriorOdds)).toFixed(4)) : bayesianEvaluation.posteriorProbability,
        posteriorFinal: bayesianEvaluation.posteriorProbability,
        threshold: bayesianEvaluation.requiredThreshold,
        passesGate: bayesianEvaluation.passesGate,
        firstBlockReason: !bayesianEvaluation.passesGate ? "BAYESIAN_POSTERIOR_BELOW_THRESHOLD" : "NONE"
      }));
    }

    console.log(`[FINAL_DECISION] Decision=${activeDecision}`);
    if (activeDecision !== "HOLD") {
      console.log(`[TRADE_CREATED] Created trade for ${symbol}`);
    } else {
      console.log(`[TRADE_REJECTED] Trade rejected/held for ${symbol}`);
    }

    const getPred = (name: string) => aiPredictions.find(p => p.predictor === name) || { direction: "HOLD", confidence: 0 };
    const telemetryPayload = {
      timestamp: new Date().toISOString(),
      symbol,
      regime: regime.state,
      cnn_direction: getPred("CNN_1D_V1").direction,
      cnn_confidence: getPred("CNN_1D_V1").confidence,
      ppo_direction: getPred("PPO_EXECUTION_V1").direction,
      ppo_confidence: getPred("PPO_EXECUTION_V1").confidence,
      transformer_direction: getPred("TRANSFORMER_MICRO_V1").direction,
      transformer_confidence: getPred("TRANSFORMER_MICRO_V1").confidence,
      mamba_direction: getPred("MAMBA_V1").direction,
      mamba_confidence: getPred("MAMBA_V1").confidence,
      consensus: aiConsensusHold,
      final_decision: activeDecision,
      trade_created: activeDecision !== "HOLD"
    };
    console.log(`[EVAL_TELEMETRY] ${JSON.stringify(telemetryPayload)}`);

    // 🛡️ AQEA P7 Comprehensive Signal Trace for Decision Reconstruction
    const p7ModelProbs: Record<string, any> = {};
    const p7ModelDirs: Record<string, string> = {};
    const p7ModelConfs: Record<string, number> = {};

    if (aiPredictions && Array.isArray(aiPredictions)) {
      for (const ap of aiPredictions) {
        p7ModelProbs[ap.predictor] = ap.probability ?? ap.confidence ?? 0.5;
        p7ModelDirs[ap.predictor] = ap.direction;
        p7ModelConfs[ap.predictor] = ap.confidence;
      }
    }

    if (lakshmiResult.dlPredictions) {
      for (const d of lakshmiResult.dlPredictions) {
        p7ModelProbs[d.modelName] = d.probabilities || d.probability || d.confidence;
        p7ModelDirs[d.modelName] = d.direction;
        p7ModelConfs[d.modelName] = d.confidence;
      }
    }

    if (lakshmiResult.quantSignals) {
      for (const q of lakshmiResult.quantSignals) {
        p7ModelProbs[q.strategyId] = q.confidence;
        p7ModelDirs[q.strategyId] = q.direction;
        p7ModelConfs[q.strategyId] = q.confidence;
      }
    }

    const featureVectorHash = crypto.createHash("sha256").update(JSON.stringify(std15Features.tensorVector)).digest("hex").substring(0, 16);
    const featureFreshnessTimestamp = std15Features.timestamp;

    let firstBlockingGate = "NONE";
    if (activeDecision === "HOLD") {
      if (regime.state === "WEATHER_STRESS") firstBlockingGate = "WEATHER_CRISIS_HALT";
      else if (aiConsensusHold) firstBlockingGate = "AI_CONSENSUS_HOLD";
      else if (finalScore >= 40 && finalScore <= 60) firstBlockingGate = "TECHNICAL_SCORE_NEUTRAL_HOLD";
      else firstBlockingGate = "NORMAL_ABSTENTION_HOLD";
    } else {
      if (!bayesianEvaluation.passesGate) firstBlockingGate = "BAYESIAN_POSTERIOR_BELOW_THRESHOLD";
      else if (!uncertaintyEvaluation.passesUncertaintyGate) firstBlockingGate = "CONFORMAL_UNCERTAINTY_EXCEEDED";
      else if (!risk.allowed) firstBlockingGate = "RISK_REJECTED";
      else if (lakshmiResult.ensembleFusion && !lakshmiResult.ensembleFusion.evPassesGate) firstBlockingGate = "NET_EV_SUB_HURDLE";
      else firstBlockingGate = "NONE";
    }

    const p7Trace = {
      symbol,
      timestamp: Date.now(),
      regime: regime.state,
      price: context.currentPrice,
      volume: std15Features.ohlcv.volume,
      volatility: std15Features.volatility.realizedVol,
      ADX: Number((ind.adx14 ?? 0).toFixed(2)),
      ATR: Number(std15Features.atr.atr14.toFixed(4)),
      RSI: Number(std15Features.rsi.rsi14.toFixed(2)),
      MACD: {
        macd: std15Features.macd.macd,
        signal: std15Features.macd.signal,
        histogram: std15Features.macd.histogram
      },
      trendStrength: regime.trendStrength,
      momentum: std15Features.macd.momentum,
      orderFlowCvd: std15Features.cvd.cvdScore,
      smartMoney: {
        orderBlock: std15Features.smc.orderBlock,
        fvg: std15Features.smc.fvg,
        bos: std15Features.smc.bos,
        score: smResult.votingScore
      },
      htfDirection: multiTf.direction || (ind.ema200 && context.currentPrice > ind.ema200 ? "BULLISH" : "BEARISH"),
      htfAgreement: multiTf.agreement,
      featureVectorHash,
      featureFreshnessTimestamp,
      modelProbabilities: p7ModelProbs,
      modelDirections: p7ModelDirs,
      modelConfidence: p7ModelConfs,
      ensembleLongProbability: lakshmiResult.ensembleFusion?.buyProbability ?? 0.3333,
      ensembleShortProbability: lakshmiResult.ensembleFusion?.sellProbability ?? 0.3333,
      ensembleHoldProbability: lakshmiResult.ensembleFusion?.holdProbability ?? 0.3334,
      finalDirection: activeDecision,
      finalScore: Math.round(finalScore),
      bayesianPosterior: bayesianEvaluation.posteriorProbability,
      firstBlockingGate
    };

    console.log(`[P7_SIGNAL_TRACE] ${JSON.stringify(p7Trace)}`);

    // 🛡️ AQEA P8 Score Construction & Signal Suppression Trace
    const ofScore = typeof ofResult?.votingScore === "number" ? ofResult.votingScore : 50;
    const smScore = typeof smResult?.votingScore === "number" ? smResult.votingScore : 50;

    const rawComponents = {
      core: Number(coreScore.toFixed(2)),
      orderFlow: Number(ofScore.toFixed(2)),
      smartMoney: Number(smScore.toFixed(2)),
      cnn: Number(cnnScore.toFixed(2))
    };

    const normalizedComponents = {
      core: Number(((coreScore - 50) / 50).toFixed(4)),
      orderFlow: Number(((ofScore - 50) / 50).toFixed(4)),
      smartMoney: Number(((smScore - 50) / 50).toFixed(4)),
      cnn: Number(((cnnScore - 50) / 50).toFixed(4))
    };

    const positiveContributions: Record<string, number> = {};
    const negativeContributions: Record<string, number> = {};

    if (coreScore > 50) positiveContributions["core"] = Number(((coreScore - 50) * weights.core).toFixed(4));
    else if (coreScore < 50) negativeContributions["core"] = Number(((50 - coreScore) * weights.core).toFixed(4));

    if (ofScore > 50) positiveContributions["orderFlow"] = Number(((ofScore - 50) * weights.orderFlow).toFixed(4));
    else if (ofScore < 50) negativeContributions["orderFlow"] = Number(((50 - ofScore) * weights.orderFlow).toFixed(4));

    if (smScore > 50) positiveContributions["smartMoney"] = Number(((smScore - 50) * weights.smartMoney).toFixed(4));
    else if (smScore < 50) negativeContributions["smartMoney"] = Number(((50 - smScore) * weights.smartMoney).toFixed(4));

    if (cnnScore > 50) positiveContributions["cnn"] = Number(((cnnScore - 50) * weights.cnn).toFixed(4));
    else if (cnnScore < 50) negativeContributions["cnn"] = Number(((50 - cnnScore) * weights.cnn).toFixed(4));

    const penalties = {
      regimeSuppression: regime?.state === "TRANSITION" || regime?.state === "RANGING" ? 0.30 : 0.0,
      orderFlowSuppression: ofScore < 50 ? Number(((50 - ofScore) * weights.orderFlow).toFixed(4)) : 0,
      smartMoneySuppression: smScore < 50 ? Number(((50 - smScore) * weights.smartMoney).toFixed(4)) : 0,
      holdProbabilitySuppression: Number((lakshmiResult.ensembleFusion?.holdProbability ?? 0.3334).toFixed(4))
    };

    let largestPositiveContribution = "NONE";
    let maxPos = 0;
    for (const [k, v] of Object.entries(positiveContributions)) {
      if (v > maxPos) { maxPos = v; largestPositiveContribution = k; }
    }

    let largestNegativeContribution = "NONE";
    let maxNeg = 0;
    for (const [k, v] of Object.entries(negativeContributions)) {
      if (v > maxNeg) { maxNeg = v; largestNegativeContribution = k; }
    }

    let largestPenalty = "NONE";
    let maxPen = 0;
    for (const [k, v] of Object.entries(penalties)) {
      if (v > maxPen) { maxPen = v; largestPenalty = k; }
    }

    const p8ScoreTrace = {
      symbol,
      decisionId,
      regime: regime.state,
      finalScore: Math.round(finalScore),
      rawComponents,
      normalizedComponents,
      weights: {
        core: Number(weights.core.toFixed(4)),
        orderFlow: Number(weights.orderFlow.toFixed(4)),
        smartMoney: Number(weights.smartMoney.toFixed(4)),
        cnn: Number(weights.cnn.toFixed(4))
      },
      positiveContributions,
      negativeContributions,
      penalties,
      largestPositiveContribution,
      largestNegativeContribution,
      largestPenalty,
      netScore: Number(finalScore.toFixed(2)),
      finalDirection: activeDecision
    };

    console.log(`[P8_SCORE_TRACE] ${JSON.stringify(p8ScoreTrace)}`);

    // 🛡️ AQEA P9 Genuine Market Edge & Opportunity Funnel Traces
    const executionEligible = activeDecision !== "HOLD" && 
                              bayesianEvaluation.passesGate && 
                              uncertaintyEvaluation.passesUncertaintyGate && 
                              risk.allowed && 
                              (lakshmiResult.ensembleFusion?.evPassesGate ?? true);

    const tradeExecuted = activeDecision !== "HOLD" && risk.allowed;

    const p9OpportunityTrace = {
      decisionId,
      symbol,
      timestamp: Date.now(),
      regime: regime.state,
      ADX: Number((ind.adx14 ?? 0).toFixed(2)),
      ATR: Number(std15Features.atr.atr14.toFixed(4)),
      finalScore: Math.round(finalScore),
      direction: activeDecision,
      ensembleLongProbability: lakshmiResult.ensembleFusion?.buyProbability ?? 0.3333,
      ensembleShortProbability: lakshmiResult.ensembleFusion?.sellProbability ?? 0.3333,
      ensembleHoldProbability: lakshmiResult.ensembleFusion?.holdProbability ?? 0.3334,
      AIConfidence: lakshmiResult.confidence,
      BayesianPosterior: bayesianEvaluation.posteriorProbability,
      NetEV: lakshmiResult.ensembleFusion?.expectedValue ?? 0.0,
      ConformalWidth: lakshmiResult.compositeUncertainty,
      firstBlockingGate,
      executionEligible,
      tradeExecuted,
      outcomeResolved: false
    };

    const p9FunnelTrace = {
      decisionId,
      symbol,
      stages: {
        marketObservation: true,
        validFeatures: true,
        modelOutputAvailable: (aiPredictions?.length || 0) + (lakshmiResult?.dlPredictions?.length || 0) > 0,
        directionalCandidate: signalDecision !== "HOLD",
        technicalScorePassed: finalScore > 65 || finalScore < 35,
        aiConfidencePassed: lakshmiResult.confidence >= 48.75,
        conformalGatePassed: uncertaintyEvaluation.passesUncertaintyGate,
        netEvGatePassed: lakshmiResult.ensembleFusion?.evPassesGate ?? true,
        bayesianGatePassed: bayesianEvaluation.passesGate,
        riskGatePassed: risk.allowed,
        executionEligible,
        paperOrderCreated: tradeExecuted
      },
      bottleneckStage: firstBlockingGate
    };

    const regStateStr = String(regime?.state || "RANGING");
    const regPrimStr = String(regime?.primaryRegime || "RANGING");
    const p9RegimeTrace = {
      symbol,
      regime: regime?.state || "RANGING",
      primaryRegime: regime?.primaryRegime || "RANGING",
      trendStrength: regime?.trendStrength || 0,
      confidence: regime?.confidence || 0,
      volatilityIndex: regime?.volatilityIndex || 0,
      supportsDirectionalTrading: regStateStr === "TRENDING_BULL" || regStateStr === "TRENDING_BEAR" || regPrimStr === "BREAKOUT",
      recommendedAction: regStateStr === "WEATHER_STRESS" ? "HALT" : (regStateStr.includes("TRENDING") ? "TREND_FOLLOW" : "MEAN_REVERSION_OR_ABSTAIN")
    };

    console.log(`[P9_OPPORTUNITY_TRACE] ${JSON.stringify(p9OpportunityTrace)}`);
    console.log(`[P9_FUNNEL_TRACE] ${JSON.stringify(p9FunnelTrace)}`);
    console.log(`[P9_REGIME_TRACE] ${JSON.stringify(p9RegimeTrace)}`);

    // 🛡️ AQEA P10 Long-Duration Multi-Regime Telemetry
    const p10RegimeTrace = {
      timestamp: Date.now(),
      symbol,
      regime: regime?.state || "RANGING",
      ADX: Number((ind.adx14 ?? 0).toFixed(2)),
      ATR: Number(std15Features.atr.atr14.toFixed(4)),
      volatility: regime?.volatilityIndex || 0,
      HTF_agreement: lakshmiResult.ensembleFusion?.modelAgreement ? Math.round(lakshmiResult.ensembleFusion.modelAgreement * 5) : 3,
      directionalProbability: activeDecision === "LONG" ? (lakshmiResult.ensembleFusion?.buyProbability ?? 0.33) : (activeDecision === "SHORT" ? (lakshmiResult.ensembleFusion?.sellProbability ?? 0.33) : 0.33),
      finalScore: Math.round(finalScore),
      BayesianPosterior: bayesianEvaluation.posteriorProbability,
      NetEV: lakshmiResult.ensembleFusion?.expectedValue ?? 0.0,
      conformalWidth: lakshmiResult.compositeUncertainty
    };

    const resolvedCount = ForwardTelemetryStore.getResolvedCount();
    const p10EvidenceTrace = {
      N_resolved: resolvedCount,
      N_eff: resolvedCount,
      N_effMultiLag: resolvedCount,
      winRate: resolvedCount === 0 ? null : 0.0,
      profitFactor: resolvedCount === 0 ? null : 0.0,
      NetEV: resolvedCount === 0 ? null : 0.0,
      Sharpe: resolvedCount === 0 ? null : 0.0,
      Sortino: resolvedCount === 0 ? null : 0.0,
      maxDrawdown: resolvedCount === 0 ? null : 0.0,
      bootstrapLCB: resolvedCount === 0 ? null : 0.0,
      evidenceState: resolvedCount === 0 ? "UNAVAILABLE" : (resolvedCount < 25 ? "INSUFFICIENT_EVIDENCE" : (resolvedCount < 100 ? "PRELIMINARY_EMPIRICAL" : "PROMOTION_EVALUATION_ALLOWED"))
    };

    console.log(`[P10_REGIME_TRACE] ${JSON.stringify(p10RegimeTrace)}`);
    console.log(`[P10_EVIDENCE_TRACE] ${JSON.stringify(p10EvidenceTrace)}`);

    // 🛡️ AQEA P11 Bayesian Shadow Ledger Recording
    if (activeDecision !== "HOLD" || lakshmiResult.direction !== "HOLD" || finalScore > 65 || finalScore < 35) {
      const candidateDirection: "LONG" | "SHORT" = activeDecision !== "HOLD" 
        ? activeDecision 
        : (lakshmiResult.direction !== "HOLD" ? lakshmiResult.direction : (finalScore > 50 ? "LONG" : "SHORT"));

      BayesianShadowLedger.recordShadowCandidate({
        decisionId,
        symbol,
        timestamp: Date.now(),
        direction: candidateDirection,
        regime: regime?.state || "RANGING",
        price: context.currentPrice,
        ATR: Number(std15Features.atr.atr14.toFixed(4)),
        ADX: Number((ind.adx14 ?? 0).toFixed(2)),
        RSI: Number(std15Features.rsi.rsi14.toFixed(2)),
        finalScore: Math.round(finalScore),
        ensembleLongProbability: lakshmiResult.ensembleFusion?.buyProbability ?? 0.3333,
        ensembleShortProbability: lakshmiResult.ensembleFusion?.sellProbability ?? 0.3333,
        ensembleHoldProbability: lakshmiResult.ensembleFusion?.holdProbability ?? 0.3334,
        prior: bayesianEvaluation.priorOdds,
        ensembleProbability: lakshmiResult.compositeProbability,
        posteriorBefore: bayesianEvaluation.meta?.posteriorBefore ?? bayesianEvaluation.posteriorProbability,
        posteriorFinal: bayesianEvaluation.posteriorProbability,
        lQuality: bayesianEvaluation.meta?.lQuality ?? 1.0,
        lConfidence: bayesianEvaluation.meta?.lConfidence ?? 1.0,
        lAdx: bayesianEvaluation.meta?.lAdx ?? 1.0,
        lHtf: bayesianEvaluation.meta?.lHtf ?? 1.0,
        lSmart: bayesianEvaluation.meta?.lSmart ?? 1.0,
        netEVAtDecision: lakshmiResult.ensembleFusion?.expectedValue ?? 0.0,
        conformalWidth: lakshmiResult.compositeUncertainty,
        AIConfidence: lakshmiResult.confidence,
        BayesianThreshold: bayesianEvaluation.requiredThreshold,
        firstBlockingGate,
        rejectedByBayesian: !bayesianEvaluation.passesGate,
        experimentHash: "EXP_AQEA_2026_V3",
        featureVectorHash
      });
    }

    // 8. Exit Calculations
    let stopLoss = 0;
    let takeProfits: number[] = [];
    if (activeDecision !== "HOLD") {
      const levels = ExitEngine.calculateLevels(activeDecision === "LONG" ? "BUY" : "SELL", context.currentPrice, ind.atr14 || 0);
      
      // Map PPO strategy to actual levels (Future Phase 5 refinement)
      // For Phase 5C, we use the standard ATR levels but log the intent
      stopLoss = levels.sl;
      takeProfits = [levels.tp1, levels.tp2, levels.tp3];
      reasons.push(`EXIT_STRATEGY: ${exitStrategy}`);

      const p10ExecutionTrace = {
        decisionId,
        symbol,
        direction: activeDecision,
        entryPrice: context.currentPrice,
        quantity: 1,
        margin: context.currentPrice * 0.1,
        SL: stopLoss,
        TP: takeProfits[0] || 0,
        fees: (ind.atr14 || 0) * 0.001,
        slippage: (ind.atr14 || 0) * 0.0005,
        executionTimestamp: Date.now()
      };
      console.log(`[P10_EXECUTION_TRACE] ${JSON.stringify(p10ExecutionTrace)}`);
    }

    // Assemble model breakdowns for attribution and OOS telemetry
    const breakdowns: Record<string, any> = {};
    if (aiPredictions && Array.isArray(aiPredictions)) {
      for (const ap of aiPredictions) {
        breakdowns[ap.predictor] = {
          modelName: ap.predictor,
          modelFamily: "MOMENTUM",
          direction: ap.direction,
          probLong: ap.direction === "LONG" ? ap.confidence : (ap.direction === "SHORT" ? (1 - ap.confidence) : 0.33),
          probShort: ap.direction === "SHORT" ? ap.confidence : (ap.direction === "LONG" ? (1 - ap.confidence) : 0.33),
          probHold: ap.direction === "HOLD" ? ap.confidence : 0.34,
          confidence: ap.confidence,
          effectiveWeight: 0.2,
          participating: true,
          status: "ACTIVE",
          inferenceMode: "REAL_MODEL"
        };
      }
    }

    try {
      const { ForwardTelemetryStore } = await import("./ensemble/ForwardTelemetryStore.js");
      const authoritativeConfidence = lakshmiResult?.confidence !== undefined
        ? lakshmiResult.confidence
        : (activeDecision === "SHORT" ? (finalScore <= 50 ? 100 - finalScore : finalScore) : (activeDecision === "LONG" ? finalScore : 50));

      ForwardTelemetryStore.recordDecision({
        decisionId,
        timestamp: Date.now(),
        symbol,
        marketDomain,
        accountType: context.accountType || "FUTURES",
        regime: regime.state,
        featureVersion: 2,
        dataSource: context.mode === "LIVE" ? "LIVE" : "PAPER",
        isForward: true,
        isUntouched: true,
        buyProbability: lakshmiResult?.ensembleFusion?.buyProbability ?? (activeDecision === "LONG" ? (authoritativeConfidence / 100) : 0.33),
        holdProbability: lakshmiResult?.ensembleFusion?.holdProbability ?? (activeDecision === "HOLD" ? 0.50 : 0.20),
        sellProbability: lakshmiResult?.ensembleFusion?.sellProbability ?? (activeDecision === "SHORT" ? (authoritativeConfidence / 100) : 0.33),
        direction: activeDecision,
        finalDecision: activeDecision,
        decisionClass: activeDecision === "HOLD" ? "NO_TRADE" : "TRADE",
        terminalState: activeDecision === "HOLD" ? "NO_TRADE" : "PENDING_EXECUTION",
        terminalReason: activeDecision === "HOLD" ? (reasons.join("; ") || "REGIME_OR_EV_NEUTRAL") : "DECISION_RECORDED",
        confidence: Number((authoritativeConfidence / 100).toFixed(4)),
        agreementScore: lakshmiResult?.ensembleFusion?.modelAgreement ?? 1.0,
        tradeQualityScore: lakshmiResult?.ensembleFusion?.tradeQualityScore ?? authoritativeConfidence,
        tradeQualityTier: lakshmiResult?.ensembleFusion?.tradeQualityTier ?? "STANDARD",
        expectedValue: lakshmiResult?.ensembleFusion?.expectedValue ?? ((authoritativeConfidence - 50) * 0.001),
        expectedGain: lakshmiResult?.ensembleFusion?.decisionRecord?.expectedGain ?? 0,
        expectedLoss: lakshmiResult?.ensembleFusion?.decisionRecord?.expectedLoss ?? 0,
        uncertainty: lakshmiResult?.compositeUncertainty ?? 0.5,
        bayesianConviction: bayesianEvaluation?.posteriorProbability ?? (authoritativeConfidence / 100),
        fees: lakshmiResult?.ensembleFusion?.decisionRecord?.fees ?? 0.001,
        slippage: lakshmiResult?.ensembleFusion?.decisionRecord?.slippage ?? 0.0005,
        spread: 0.0002,
        marketImpact: 0.0001,
        netEV: lakshmiResult?.ensembleFusion?.decisionRecord?.netEV ?? ((authoritativeConfidence - 50) * 0.001),
        evGateResult: lakshmiResult?.ensembleFusion?.evPassesGate ?? true,
        conformalResult: uncertaintyEvaluation?.passesUncertaintyGate ?? true,
        riskResult: risk.allowed,
        modelBreakdowns: breakdowns,
        createdAt: Date.now()
      });
    } catch (err: any) {
      console.warn(`[AQEA] Forward telemetry record failed: ${err.message}`);
    }

    const authoritativeConfidence = lakshmiResult?.confidence !== undefined
      ? lakshmiResult.confidence
      : (activeDecision === "SHORT" ? (finalScore <= 50 ? 100 - finalScore : finalScore) : (activeDecision === "LONG" ? finalScore : 50));

    // 9. Audit & Analytics Meta
    const meta = {
       decisionId,
       regime: regime.state,
       indicators: context.indicators, // v2.9 Fix: Ensure indicators available for sizing
       aqeaScore: Math.round(coreScore),
       orderFlowScore: Math.round(ofResult.votingScore),
       smartMoneyScore: Math.round(smResult.votingScore),
       aiPredictions,
       ppoRecommendation,
       routerDecision,
       metaAlphaResult,
       lakshmiEnsemble: lakshmiResult,
       bayesianEvaluation,
       uncertaintyEvaluation,
       std15Features,
       finalScore: Math.round(finalScore),
       weightsApplied: weights,
       convictionBoost,
       ofDiagnostics: ofResult.diagnostics,
       smDiagnostics: smResult.diagnostics,
       ppoAuthorityApplied,
       originalSize: originalPositionSize,
       ppoSkipDecision,
       exitStrategy,
       institutional: {
         tier: tier.tier,
         driftScore: drift.score,
         deRiskingActive,
         entriesHalted
       }
    };

    await AqeaAuditService.info(userId, symbol, "orchestrator", `Decision: ${activeDecision}`, meta);

    console.log(
     `[AQEA_AUDIT]
     Symbol=${symbol}
     Core=${Math.round(coreScore)}
     OrderFlow=${Math.round(ofResult.votingScore)}
     SmartMoney=${Math.round(smResult.votingScore)}
     Final=${Math.round(finalScore)}
     Decision=${activeDecision}`
    );

    // [P5_MODEL_DIAGNOSTIC] Structured Telemetry
    const firstBlockReason = !risk.allowed ? `RISK_LIMIT: ${risk.reason || "REJECTED"}`
      : (activeDecision === "HOLD" ? "NORMAL_ABSTENTION_HOLD"
      : (authoritativeConfidence < 48.75 ? "AI_CONFIDENCE_BELOW_THRESHOLD"
      : (!bayesianEvaluation?.passesGate ? "BAYESIAN_POSTERIOR_BELOW_THRESHOLD"
      : (!uncertaintyEvaluation?.passesUncertaintyGate ? "CONFORMAL_UNCERTAINTY_TOO_HIGH"
      : (lakshmiResult?.ensembleFusion && !lakshmiResult.ensembleFusion.evPassesGate ? "NETEV_BELOW_THRESHOLD" : "NONE")))));

    console.log(`[P5_MODEL_DIAGNOSTIC] ` + JSON.stringify({
      decisionId: decisionId || "UNKNOWN",
      symbol,
      regime: regime.state,
      modelAvailability: {
        totalModels: (aiPredictions?.length || 0) + (lakshmiResult?.dlPredictions?.length || 0),
        authorizedCount: authorizedPredictions?.length || 0,
        modelsOffline: aiModelsOffline
      },
      modelProbabilities: lakshmiResult?.ensembleFusion?.telemetry?.modelProbabilities || {},
      modelConfidence: Object.fromEntries((aiPredictions || []).map(p => [p.predictor, p.confidence])),
      modelDirection: Object.fromEntries((aiPredictions || []).map(p => [p.predictor, p.direction])),
      ensembleDirection: lakshmiResult?.ensembleFusion?.direction || activeDecision,
      ensembleConfidence: authoritativeConfidence,
      bayesianPosterior: Number((bayesianEvaluation?.posteriorProbability ?? (authoritativeConfidence / 100)).toFixed(4)),
      conformalScore: Number((uncertaintyEvaluation?.intervalWidth ?? (1 - (authoritativeConfidence / 100))).toFixed(4)),
      netEV: Number((lakshmiResult?.ensembleFusion?.expectedValue ?? ((authoritativeConfidence - 50) * 0.001)).toFixed(6)),
      riskDecision: risk.allowed ? "APPROVED" : "REJECTED",
      finalGate: activeDecision === "HOLD" ? "ABSTAIN" : (firstBlockReason === "NONE" ? "PAPER_EXECUTION" : "REJECTED"),
      firstBlockReason
    }));

    const finalDecisionObj: AQEADecision = {
      decision: activeDecision,
      confidence: Math.round(authoritativeConfidence),
      riskApproved: risk.allowed,
      positionSize: finalPositionSize,
      leverage: risk.leverage,
      stopLoss,
      takeProfits,
      reasons,
      decisionPath,
      meta
    };

    // 🛡️ AQEA V8.5.1 Decision Attribution Audit (Non-blocking)
    AttributionAuditService.record(userId, symbol, finalDecisionObj).catch(err => 
       console.error(`[attribution_audit_error] ${err.message}`)
    );

    // 🛡️ Phase 5: Feature Store persistence for Shadow/Paper Tracking
    import("./featureStore.js").then(({ FeatureStore }) => {
      FeatureStore.store({
        userId, symbol, decision: activeDecision,
        market: {
          open: ind.open || context.currentPrice, high: ind.high || context.currentPrice,
          low: ind.low || context.currentPrice, close: context.currentPrice, volume: ind.volume || 0,
          atr: ind.atr14 || 0, adx: ind.adx14 || 0, rsi: ind.rsi14 || 50,
          macd: ind.macd?.histogram || 0, macdValue: ind.macd?.macd || 0, macdSignal: ind.macd?.signal || 0, macdHistogram: ind.macd?.histogram || 0,
          vwap: ind.vwap || context.currentPrice, ema20: ind.ema20 || 0, ema50: ind.ema50 || 0, ema200: ind.sma200 || 0,
        },
        regime: { state: regime.state as any, score: regime.score },
        orderFlow: ofResult.diagnostics, smartMoney: smResult.diagnostics,
        execution: { positionSize: finalPositionSize, stopLoss, takeProfit: takeProfits[0] || 0 },
        // aiAttributable=false marks TA-fallback decisions (AI engine offline) so per-model
        // accuracy/drift scoring never credits or blames a model that didn't actually vote.
        meta: { virtual: true, aiAttributable: !aiModelsOffline, ...meta }
      }).catch(err => console.error(`[feature_store_error] ${err.message}`));
    });

    return finalDecisionObj;
  }

  /**
   * Safety Circuit Breaker (Phase 4): Automatically disables override if PF < 1.2 or WR < 50%
   */
  private static async checkOverrideCircuitBreaker(userId: string): Promise<boolean> {
    if (!mongoose?.connection || mongoose.connection.readyState !== 1) return false;
    const lastTrades = await TransitionOverrideAudit.find({
       userId: toValidObjectId(userId),
       actualOutcome: { $exists: true }
    }).sort({ timestamp: -1 }).limit(50).lean().catch(() => []);

    if (lastTrades.length < 10) return false; // Grace period

    const wins = lastTrades.filter(t => t.actualOutcome === "WIN").length;
    const wr = wins / lastTrades.length;
    
    const gains = lastTrades.filter(t => (t.pnl || 0) > 0).reduce((s, t) => s + (t.pnl || 0), 0);
    const losses = Math.abs(lastTrades.filter(t => (t.pnl || 0) < 0).reduce((s, t) => s + (t.pnl || 0), 0));
    const pf = losses > 0 ? gains / losses : gains;

    if (pf < 1.2 || wr < 0.50) {
       console.error(`[AQEA_CIRCUIT_BREAKER] Transition Override Tripped: PF=${pf.toFixed(2)}, WR=${(wr*100).toFixed(1)}%`);
       return true;
    }

    return false;
  }

  /**
   * Returns weight for CNN Predictor based on regime (Phase 4E).
   */
  private static getRegimeCNNWeight(state: RegimeState): number {
    switch (state) {
      case "TRENDING_BULL":
      case "TRENDING_BEAR":   return 0.05;
      case "TRANSITION":      return 0.03;
      case "RANGING":         return 0.02;
      case "HIGH_VOLATILITY": return 0.00;
      default:                return 0.00;
    }
  }

  /**
   * Returns weight for Order Flow signal based on regime (Phase 2B).
   */
  private static getRegimeOrderFlowWeight(state: RegimeState): number {
    switch (state) {
      case "TRENDING_BULL": return 0.10;
      case "TRENDING_BEAR": return 0.10;
      case "RANGING":        return 0.15;
      case "HIGH_VOLATILITY": return 0.20;
      case "TRANSITION":     return 0.15;
      default:               return 0.15;
    }
  }

  /**
   * 🛡️ v7.2 Feature Validation Guard
   * Prevents NaN/Inf/null from reaching AI models.
   */
  private static validateFeatureVector(fv: any): void {
    const checkObj = (obj: any, path: string) => {
      for (const key in obj) {
        const val = obj[key];
        const currentPath = `${path}.${key}`;
        if (typeof val === "number") {
          if (!isFinite(val)) {
            console.warn(`[AQEA_VALIDATION] Non-finite number at ${currentPath}: ${val}. Resetting to 0.`);
            obj[key] = 0;
          }
        } else if (val === null || val === undefined) {
          console.warn(`[AQEA_VALIDATION] Null/Undefined at ${currentPath}. Resetting to 0.`);
          obj[key] = 0;
        } else if (typeof val === "object") {
          checkObj(val, currentPath);
        }
      }
    };
    checkObj(fv, "fv");
  }
}
