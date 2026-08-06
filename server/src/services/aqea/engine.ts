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
import mongoose from "mongoose";
import { toValidObjectId } from "../../utils/mongoUtils.js";

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
    const userSettings = (userId && isValId(userId))
      ? await Settings.findOne({ userId })
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
    let coreScore = regime.score;
    if (regime.state === "TRENDING_BULL" || regime.state === "TRENDING_BEAR") {
       // Maintain trend multiplier for trending regimes
       const multiplier = 0.90 + (multiTf.score / 100.0) * 0.50;
       coreScore = Math.min(100, Math.max(0, regime.score * multiplier));
    } else {
       // Neutral Reset for Transition/Ranging: Weighted average between regime (50) and trend
       // This prevents coreScore > 67 floor during trend shifts.
       coreScore = (regime.score * 0.70) + (multiTf.score * 0.30);
    }

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

          // 🛡️ Phase 2: Establish Single Voting Authority
          aiPredictions = await PredictorRegistry.getAllPredictions(fv);
          authorizedPredictions = await PredictorRegistry.getAuthorizedPredictions(fv);
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

    // 3d. PPO Execution Optimization
    let ppoRecommendation: any = null;
    if (AQEA_CONFIG.PPO_ENABLED) {
       try {
         const ppoPredictor = PredictorRegistry.getPredictor("PPO");
         if (ppoPredictor && typeof (ppoPredictor as any).predict === "function") {
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
             regime: { state: regime.state, score: regime.score },
             orderFlow: ofResult.diagnostics,
             smartMoney: smResult.diagnostics,
             execution: { positionSize: 0, stopLoss: 0, takeProfit: 0 }
           };
           const ppoResult = await ppoPredictor.predict(fv);
           ppoRecommendation = ppoResult.meta?.recommendedAction;
           reasons.push(`PPO_SHADOW_REC: ${ppoRecommendation}`);
         }
       } catch (ppoErr) {
         console.warn("[AQEA] PPO Inference failed in shadow mode:", ppoErr);
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
           regime: { state: regime.state, score: regime.score },
           orderFlow: ofResult.diagnostics,
           smartMoney: smResult.diagnostics,
           execution: { positionSize: 0, stopLoss: 0, takeProfit: 0 }
         };
         
         // Call v2.2B Router (Shadow-only)
         const v22Result = await V2_2_Router.route(regime.state as any, fv);
         routerDecision = v22Result;

         // Phase 3: Shadow Collection (Database Record)
         console.log(`[ROUTER_DEBUG] Symbol=${symbol} Prediction=${v22Result?.prediction} ActiveModel=${v22Result.activeModel}`);
         await RouterDecisionAudit.create({
            symbol,
            regime: regime.state,
            selectedModel: v22Result.activeModel,
            prediction: (v22Result?.prediction || "HOLD"),
            confidence: v22Result.confidence,
            latencyMs: v22Result.meta?.latencyMs || 0,
            timestamp: new Date(),
            meta: v22Result.meta
         });

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
         await ResearchMetaAlphaAudit.create({
            symbol,
            regime: regime.state,
            weights: Object.fromEntries(weights.map(w => [w.source, w.weight])),
            confidence: blended.conviction,
            prediction: blended.decision,
            latencyMs: Date.now() - startMeta,
            stabilityScoreAtTime: 0.85, // Institutional baseline
            timestamp: new Date()
         });

         reasons.push(`META_ALPHA_SHADOW: ${blended.decision}`);
       } catch (metaErr) {
         console.warn("[AQEA] Meta Alpha Shadow failed:", metaErr);
       }
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
       const cnnScore = cnnPrediction?.direction === "LONG" ? 100 : (cnnPrediction?.direction === "SHORT" ? 0 : 50);

       finalScore = (coreScore * weights.core) + 
                    (ofResult.votingScore * weights.orderFlow) + 
                    (smResult.votingScore * weights.smartMoney) +
                    (cnnScore * weights.cnn);

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
    const wallet = await import("../paperState.js").then(m => m.getWallet(userId, context.mode, context.accountType));
    const balance = wallet.get("USDT") ?? 0;
    const tierRiskCap = balance * tier.riskPerTrade;
    const currentMaxLoss = finalPositionSize * (ind.atr14 * 1.5 / context.currentPrice);
    
    if (currentMaxLoss > tierRiskCap) {
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

    if (risk.allowed && !entriesHalted) {
      // Thresholds come from user Settings so the operator can tune aggressiveness.
      // Defaults: LONG > 65, SHORT < 35 — calibrated so strong signal strength triggers trades.
      const buyThreshold   = userSettings?.autoTradeThreshold   ?? 65;
      const shortThreshold = userSettings?.shortScoreThreshold   ?? 35;
      if (finalScore > buyThreshold) {
         signalDecision = applyAiConsensusGate ? "HOLD" : "LONG";
         if (applyAiConsensusGate) reasons.push("AI_HARD_GATE: BLOCKED_LONG");
      } else if (finalScore < shortThreshold) {
         signalDecision = applyAiConsensusGate ? "HOLD" : "SHORT";
         if (applyAiConsensusGate) reasons.push("AI_HARD_GATE: BLOCKED_SHORT");
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
    if (transitionOverrideActive) {
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
          ppoSkipDecision = true;
          activeDecision = "HOLD";
          reasons.push("PPO_AUTHORITY: SKIP_TRADE_EXECUTED");
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
    }

    // 9. Audit & Analytics Meta
    const meta = {
       regime: regime.state,
       indicators: context.indicators, // v2.9 Fix: Ensure indicators available for sizing
       aqeaScore: Math.round(coreScore),
       orderFlowScore: Math.round(ofResult.votingScore),
       smartMoneyScore: Math.round(smResult.votingScore),
       aiPredictions,
       ppoRecommendation,
       routerDecision,
       metaAlphaResult,
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

    const finalDecisionObj: AQEADecision = {
      decision: activeDecision,
      confidence: Math.round(finalScore),
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
    const lastTrades = await TransitionOverrideAudit.find({
       userId: toValidObjectId(userId),
       actualOutcome: { $exists: true }
    }).sort({ timestamp: -1 }).limit(50).lean();

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
