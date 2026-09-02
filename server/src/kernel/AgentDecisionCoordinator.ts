/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — DECISION COORDINATOR
 * ═══════════════════════════════════════════════════════════════════
 * Central orchestrator for the canonical decision pipeline:
 * Features → Model Outputs → Ensemble Fusion → Bayesian Evidence → Risk → Decision
 */

import crypto from "node:crypto";
import { IKernelDecision, ICanonicalModelOutput, DecisionAction } from "./types.js";
import { FeaturePipeline, Standardized15Features } from "../services/aqea/pipeline/FeaturePipeline.js";
import { ModernModelRegistry } from "../services/aqea/ai/ModernModelRegistry.js";
import { UnifiedEnsembleFusion } from "../services/aqea/ensemble/UnifiedEnsembleFusion.js";
import { AdaptiveBayesianGate } from "../services/aqea/bayesian/AdaptiveBayesianGate.js";
import { RiskEngine } from "../services/aqea/riskEngine.js";
import { DynamicCostModel } from "../services/aqea/ensemble/DynamicCostModel.js";
import { ForwardTelemetryStore } from "../services/aqea/ensemble/ForwardTelemetryStore.js";
import { AgentPolicyEngine } from "./AgentPolicyEngine.js";
import { AgentStateManager } from "./AgentStateManager.js";

export class AgentDecisionCoordinator {
  private static instance: AgentDecisionCoordinator;

  private constructor() {}

  public static getInstance(): AgentDecisionCoordinator {
    if (!AgentDecisionCoordinator.instance) {
      AgentDecisionCoordinator.instance = new AgentDecisionCoordinator();
    }
    return AgentDecisionCoordinator.instance;
  }

  public async evaluate(params: {
    symbol: string;
    marketDomain?: "CRYPTO" | "INDIAN";
    mode?: "PAPER" | "LIVE";
    accountType?: string;
    currentPrice: number;
    ohlcBars?: any[];
    correlationId?: string;
  }): Promise<IKernelDecision> {
    const correlationId = params.correlationId || `DEC_CORR_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const decisionId = `DEC_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const symbol = params.symbol;
    const marketDomain = params.marketDomain || (symbol.endsWith("USDT") ? "CRYPTO" : "INDIAN");
    const mode = params.mode || "PAPER";
    const accountType = params.accountType || (marketDomain === "INDIAN" ? "INDIAN_NSE" : "FUTURES");
    const currentPrice = params.currentPrice;

    // 1. Ingest/Extract 15 Standardized Features
    const bars = params.ohlcBars || [];
    const features: Standardized15Features = FeaturePipeline.process({
      symbol,
      currentPrice,
      indicators: {},
      bars,
    });

    // 2. Fetch Active Model Predictions
    const rawPredictions = await ModernModelRegistry.evaluateAll(features, "SIDEWAYS");

    const modelVotes: ICanonicalModelOutput[] = rawPredictions.map((p) => ({
      modelId: p.modelName,
      modelVersion: p.modelVersion || "3.0.0",
      direction: p.direction,
      probabilities: {
        pLong: p.probabilities?.LONG ?? (p.direction === "LONG" ? p.confidence : (1 - p.confidence) / 2),
        pShort: p.probabilities?.SHORT ?? (p.direction === "SHORT" ? p.confidence : (1 - p.confidence) / 2),
        pHold: p.probabilities?.HOLD ?? 0.2,
      },
      confidence: p.confidence || 0.5,
      inferenceMode: p.inferenceMode === "REAL_MODEL" ? "REAL" : "CALIBRATED",
      status: "SUCCESS",
      latencyMs: p.latencyMs || 5,
      featureSchemaVersion: "15_STANDARD",
    }));

    // 3. Dynamic Cost Model Friction
    const atr = features.atr?.atr14 || currentPrice * 0.015;
    const atrPercent = features.atr?.atrPercent || (currentPrice > 0 ? (atr / currentPrice) * 100 : 1.5);
    const friction = DynamicCostModel.calculateFriction({
      symbol,
      marketDomain,
      atrPercent,
    });
    const frictionTotal = (currentPrice * (friction.totalFrictionPercent || 0.15)) / 100;

    // 4. Ensemble Fusion
    const ensembleResult = UnifiedEnsembleFusion.fuse(
      rawPredictions,
      [],
      features.nlpSentiment || { score: 0, confidence: 0, classification: "NEUTRAL" },
      "SIDEWAYS",
      {
        atrPercent: atrPercent || 1.5,
      },
      { symbol, marketDomain, accountType }
    );

    const pWin = ensembleResult.direction === "LONG"
      ? ensembleResult.buyProbability
      : ensembleResult.direction === "SHORT"
      ? ensembleResult.sellProbability
      : 0.5;
    const winReward = atr * 2.0;
    const lossRisk = atr * 1.0;
    const grossEV = (pWin * winReward) - ((1 - pWin) * lossRisk);
    const netEV = grossEV - frictionTotal;
    const lcbNetEV = netEV - (frictionTotal * 0.5); // Conservative Lower Confidence Bound

    // 5. Adaptive Bayesian Evidence Gate
    const bayesResult = AdaptiveBayesianGate.evaluate(
      pWin,
      ensembleResult.uncertainty || 0.1,
      features,
      "SIDEWAYS",
      ensembleResult.direction
    );

    // 6. Hard Risk Gate & Unified Sizing
    const riskApproved = netEV > 0 && lcbNetEV > 0 && bayesResult.passesGate;
    const failedGates: string[] = [];
    if (netEV <= 0) failedGates.push(`NEGATIVE_NET_EV: NetEV $${netEV.toFixed(2)} <= 0`);
    if (lcbNetEV <= 0) failedGates.push(`NEGATIVE_LCB_EV: LCB NetEV $${lcbNetEV.toFixed(2)} <= 0`);
    if (!bayesResult.passesGate && ensembleResult.direction !== "HOLD") {
      failedGates.push(bayesResult.rejectionReason || `LOW_BAYES_POSTERIOR: Posterior ${(bayesResult.posteriorProbability * 100).toFixed(1)}% < ${(bayesResult.requiredThreshold * 100).toFixed(1)}%`);
    }

    let direction: "LONG" | "SHORT" | "HOLD" = "HOLD";
    let action: DecisionAction = "HOLD";

    if (riskApproved && ensembleResult.direction === "LONG") {
      direction = "LONG";
      action = "CALL";
    } else if (riskApproved && ensembleResult.direction === "SHORT") {
      direction = "SHORT";
      action = "CALL";
    } else if (failedGates.length > 0) {
      action = "REJECT";
    }

    const decision: IKernelDecision = {
      decisionId,
      correlationId,
      symbol,
      marketDomain,
      timestamp: Date.now(),
      action,
      direction,
      confidence: Math.round((ensembleResult.confidence ?? 0.5) * 100),
      expectedValue: {
        grossEV: Number(grossEV.toFixed(4)),
        netEV: Number(netEV.toFixed(4)),
        lcbNetEV: Number(lcbNetEV.toFixed(4)),
        frictionCost: Number(frictionTotal.toFixed(4)),
      },
      bayesianEvidence: {
        prior: bayesResult.priorOdds,
        posterior: bayesResult.posteriorProbability,
        evidenceStrength: bayesResult.posteriorProbability >= 0.70 ? "STRONG" : (bayesResult.posteriorProbability >= 0.60 ? "MODERATE" : "NEUTRAL"),
      },
      modelVotes,
      ensembleResult: {
        rawScore: Number((ensembleResult.expectedValue ?? 0).toFixed(4)),
        calibratedScore: Number((ensembleResult.confidence ?? 0).toFixed(4)),
        agreement: Number((ensembleResult.modelAgreement ?? 0).toFixed(4)),
        entropy: Number((ensembleResult.uncertainty ?? 0).toFixed(4)),
      },
      riskEvaluation: {
        approved: riskApproved,
        positionSize: currentPrice > 0 ? Number((100 / currentPrice).toFixed(4)) : 1,
        leverage: marketDomain === "INDIAN" ? 5 : 10,
        stopLoss: direction === "LONG" ? Number((currentPrice - atr).toFixed(2)) : Number((currentPrice + atr).toFixed(2)),
        takeProfit: direction === "LONG" ? Number((currentPrice + atr * 2).toFixed(2)) : Number((currentPrice - atr * 2).toFixed(2)),
        portfolioHeat: 0.12,
        currentDrawdown: 1.4,
        blockingGate: failedGates[0],
      },
      failedGates,
      firstBlockingGate: failedGates[0],
      explanation: action === "CALL"
        ? `Consensus ${direction} with ${Math.round((ensembleResult.confidence ?? 0.5) * 100)}% confidence and NetEV +$${netEV.toFixed(2)}`
        : `Trade held / rejected: ${failedGates.join("; ") || "Neutral market regime"}`,
    };

    // 7. Policy Engine Validation
    const policyResult = AgentPolicyEngine.getInstance().validateDecision(decision);
    if (!policyResult.allowed) {
      decision.action = "REJECT";
      decision.direction = "HOLD";
      decision.riskEvaluation.approved = false;
      decision.failedGates.push(...policyResult.violations);
      decision.firstBlockingGate = policyResult.violations[0];
      decision.explanation = `Policy blocked: ${policyResult.violations.join("; ")}`;
    }

    // 8. Record to State & Forward Store
    AgentStateManager.getInstance().recordDecision(decision);
    ForwardTelemetryStore.recordDecision(decision as any);

    return decision;
  }
}
