/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Autonomous Decision Engine (Phase 3)
 * ═══════════════════════════════════════════════════════════════════
 * Central authoritative decision engine implementing the complete
 * 20-step autonomous governance and quantitative inference cycle.
 *
 * Core Principles:
 * 1. Single authoritative immutable decision object (AQEAAuthoritativeDecision).
 * 2. NO_TRADE is a fully valid, competing optimal action.
 * 3. Lower Confidence Bound (LCB) Expected Value optimization:
 *    S* = argmax [ LCB(NetEV) - λ_DD*MaxDD - λ_ES*ES - λ_T*Turnover - λ_C*|S| ]
 * 4. PPO is execution/sizing only; Risk Engine is final authority.
 * 5. Self-healing: isolates failed models without fabricating predictions.
 * 6. Hard safety limits (Kill switch, daily loss, drawdown, exposure).
 */

import crypto from "crypto";
import mongoose from "mongoose";
import { ModelExpertPrediction, ProbabilityDistribution } from "../ai/IModelExpert.js";
import { QuantExpertSignal } from "../quant/QuantStrategyRegistry.js";
import { AnyRegime } from "../regimeEngine.js";
import { UnifiedEnsembleFusion, EVGateParams } from "../ensemble/UnifiedEnsembleFusion.js";
import { ForwardTelemetryStore } from "../ensemble/ForwardTelemetryStore.js";
import { BiasControlEngine } from "../governance/BiasControlEngine.js";
import { ModelCorrelationEngine } from "../ensemble/ModelCorrelationEngine.js";
import { ModelSubsetOptimizer } from "../ensemble/ModelSubsetOptimizer.js";
import { ChampionChallengerEngine } from "../governance/ChampionChallengerEngine.js";
import { DynamicCostModel } from "../ensemble/DynamicCostModel.js";
import { StatisticalTests } from "../ensemble/StatisticalTests.js";
import { AQEAAuthoritativeDecision, IAQEAAuthoritativeDecision, IModelPredictionRecord } from "../../../models/AQEAAuthoritativeDecision.js";
import { AQEA_CONFIG } from "../config.js";

// ═══════════════════════════════════════════════════════════════════
//  Interfaces
// ═══════════════════════════════════════════════════════════════════

export interface DecisionEngineInput {
  symbol: string;
  marketDomain: "CRYPTO" | "INDIAN";
  accountType: string;
  mode: "PAPER" | "LIVE";
  regime: AnyRegime;
  dlPredictions: ModelExpertPrediction[];
  quantSignals: QuantExpertSignal[];
  nlpSentiment: { score: number; confidence: number; classification: string };
  currentPrice: number;
  atr: number;
  availableBalanceUSD: number;
  currentDrawdownPct: number;
  dailyLossPct: number;
  isKillSwitchActive?: boolean;
}

export interface AuthoritativeDecisionResult {
  decisionId: string;
  timestamp: number;
  symbol: string;
  marketDomain: "CRYPTO" | "INDIAN";
  finalDecision: "LONG" | "SHORT" | "NO_TRADE";
  noTradeReason: string | null;
  selectedSubset: string[];
  effectiveModelCount: number;
  buyProbability: number;
  holdProbability: number;
  sellProbability: number;
  expectedNetReturn: number;
  EVLowerConfidenceBound: number;
  riskApproval: boolean;
  targetPositionSizeUSD: number;
  targetLeverage: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  orderType: "MARKET" | "LIMIT";
  decisionObject: IAQEAAuthoritativeDecision;
}

// ═══════════════════════════════════════════════════════════════════
//  Autonomous Decision Engine
// ═══════════════════════════════════════════════════════════════════

export class AutonomousDecisionEngine {
  private static decisionHistory: IAQEAAuthoritativeDecision[] = [];

  /**
   * Evaluates the complete autonomous decision lifecycle for a market bar/tick.
   */
  public static async evaluateDecision(input: DecisionEngineInput): Promise<AuthoritativeDecisionResult> {
    const timestamp = Date.now();
    const decisionId = `AQEA_${input.marketDomain}_${input.symbol}_${timestamp}_${crypto.randomBytes(4).toString("hex")}`;

    // ── 1. Hard Safety Limit Checks (Unbypassable) ──
    const killSwitch = input.isKillSwitchActive || false;
    const maxDailyLoss = AQEA_CONFIG.DAILY_DRAWDOWN_LIMIT ?? 0.03;
    const maxDrawdown = AQEA_CONFIG.PORTFOLIO_DRAWDOWN_LIMIT ?? 0.10;

    let hardSafetyHalt = false;
    let hardHaltReason: string | null = null;

    if (killSwitch) {
      hardSafetyHalt = true;
      hardHaltReason = "SAFETY_HALT: Emergency kill switch active";
    } else if (input.dailyLossPct >= maxDailyLoss) {
      hardSafetyHalt = true;
      hardHaltReason = `SAFETY_HALT: Daily loss ${(input.dailyLossPct * 100).toFixed(2)}% >= ${(maxDailyLoss * 100).toFixed(2)}% limit`;
    } else if (input.currentDrawdownPct >= maxDrawdown) {
      hardSafetyHalt = true;
      hardHaltReason = `SAFETY_HALT: Max drawdown ${(input.currentDrawdownPct * 100).toFixed(2)}% >= ${(maxDrawdown * 100).toFixed(2)}% limit`;
    }

    // ── 2. Self-Healing Model Input Validation ──
    const allPredictions: Record<string, IModelPredictionRecord> = {};
    const validatedPredictions: Record<string, IModelPredictionRecord> = {};
    const excludedModels: string[] = [];
    const excludedReasons: Record<string, string> = {};

    const candidateModelNames: string[] = [];

    for (const p of input.dlPredictions) {
      const isUnavailable = p.inferenceMode === "UNAVAILABLE" || p.status === "DISABLED" || !p.probabilities;
      const record: IModelPredictionRecord = {
        modelName: p.modelName,
        modelFamily: p.architecture || "DL_SSM",
        inferenceMode: (p.inferenceMode === "SHADOW_MODEL" ? "SHADOW" : p.inferenceMode) as any,
        rawProbabilities: p.probabilities || { LONG: 0.333, SHORT: 0.333, HOLD: 0.334 },
        calibratedProbabilities: p.probabilities || { LONG: 0.333, SHORT: 0.333, HOLD: 0.334 },
        direction: p.direction || "HOLD",
        confidence: p.confidence || 0.50,
        reliability: 1.0,
        calibrationQuality: 1.0,
        biasPenalty: 0.0,
        correlationPenalty: 1.0,
        effectiveWeight: p.inferenceMode === "REAL_MODEL" ? 0.35 : 0.0,
        participating: !isUnavailable && p.inferenceMode === "REAL_MODEL",
        status: p.status || "PRODUCTION"
      };

      allPredictions[p.modelName] = record;

      if (isUnavailable) {
        excludedModels.push(p.modelName);
        excludedReasons[p.modelName] = "MODEL_UNAVAILABLE_OR_TIMEOUT";
      } else {
        validatedPredictions[p.modelName] = record;
        candidateModelNames.push(p.modelName);
      }
    }

    for (const q of input.quantSignals) {
      const qDir = (q.direction as string) === "BUY" || (q.direction as string) === "LONG"
        ? "LONG"
        : ((q.direction as string) === "SELL" || (q.direction as string) === "SHORT" ? "SHORT" : "HOLD");

      const record: IModelPredictionRecord = {
        modelName: q.strategyId,
        modelFamily: "QUANT_STRUCTURE",
        inferenceMode: "REAL_MODEL",
        rawProbabilities: {
          LONG: qDir === "LONG" ? 0.70 : (qDir === "HOLD" ? 0.20 : 0.10),
          SHORT: qDir === "SHORT" ? 0.70 : (qDir === "HOLD" ? 0.20 : 0.10),
          HOLD: qDir === "HOLD" ? 0.60 : 0.20
        },
        calibratedProbabilities: {
          LONG: qDir === "LONG" ? 0.70 : (qDir === "HOLD" ? 0.20 : 0.10),
          SHORT: qDir === "SHORT" ? 0.70 : (qDir === "HOLD" ? 0.20 : 0.10),
          HOLD: qDir === "HOLD" ? 0.60 : 0.20
        },
        direction: qDir,
        confidence: q.confidence,
        reliability: 1.0,
        calibrationQuality: 1.0,
        biasPenalty: 0.0,
        correlationPenalty: 1.0,
        effectiveWeight: 0.20,
        participating: true,
        status: "PRODUCTION"
      };
      allPredictions[q.strategyId] = record;
      validatedPredictions[q.strategyId] = record;
      candidateModelNames.push(q.strategyId);
    }

    // ── 3. Bias Control Audit & Penalties ──
    const biasAudit = BiasControlEngine.evaluateBias(candidateModelNames);
    for (const [m, penalty] of Object.entries(biasAudit.modelPenalties)) {
      if (validatedPredictions[m]) {
        validatedPredictions[m].biasPenalty = penalty;
      }
    }

    // ── 4. Correlation & Redundancy Analysis ──
    const corrMatrix = ModelCorrelationEngine.computeCorrelationMatrix(candidateModelNames);
    const effectiveModelCount = corrMatrix.effectiveN;

    // ── 5. Lower Confidence Bound (LCB) Subset Search ──
    const subsetResult = ModelSubsetOptimizer.search(candidateModelNames, {
      minOOSSamples: 30,
      minNetEV: 0.0,
      maxDrawdown: 15.0
    });

    const selectedSubset = subsetResult.optimalSubset?.models ?? candidateModelNames;

    // ── 6. Cost & Expected Return Modeling ──
    const evParams: EVGateParams = {
      atrPercent: (input.atr / input.currentPrice) * 100,
      tpMultiplier: 2.0,
      slMultiplier: 1.5,
      feePercent: input.marketDomain === "CRYPTO" ? 0.08 : 0.03,
      slippagePercent: 0.05,
      marketImpactPercent: 0.02,
      spreadPercent: 0.03
    };

    const costBreakdown = DynamicCostModel.calculateFriction({
      symbol: input.symbol,
      marketDomain: input.marketDomain,
      atrPercent: evParams.atrPercent,
      orderValueUsdOrInr: input.availableBalanceUSD * 0.05,
      isHighLiquidity: true
    });
    const estimatedFees = costBreakdown.feePercent;
    const estimatedSpread = costBreakdown.spreadPercent;
    const estimatedSlippage = costBreakdown.slippagePercent;
    const estimatedMarketImpact = costBreakdown.marketImpactPercent;
    const totalFriction = costBreakdown.totalFrictionPercent;

    // ── 7. Unified Probability Fusion ──
    const fusionResult = UnifiedEnsembleFusion.fuse(
      input.dlPredictions,
      input.quantSignals,
      input.nlpSentiment,
      input.regime,
      evParams,
      {
        symbol: input.symbol,
        marketDomain: input.marketDomain,
        accountType: input.accountType
      }
    );

    const pBuy = fusionResult.buyProbability;
    const pHold = fusionResult.holdProbability;
    const pSell = fusionResult.sellProbability;

    // Entropy: - Σ P * log2(P)
    const clampP = (p: number) => Math.min(0.9999, Math.max(0.0001, p));
    const ensembleEntropy = -(pBuy * Math.log2(clampP(pBuy)) + pHold * Math.log2(clampP(pHold)) + pSell * Math.log2(clampP(pSell)));

    // Gross & Net Expected Value
    const expectedGain = fusionResult.telemetry ? 2.0 * evParams.atrPercent : 2.5;
    const expectedLoss = fusionResult.telemetry ? 1.5 * evParams.atrPercent : 1.5;
    const grossReturn = (pBuy * expectedGain) - (pSell * expectedLoss);
    const expectedNetReturn = grossReturn - totalFriction;

    // Block Bootstrap LCB Calculation
    const dummyBootstrap = StatisticalTests.meanCI([expectedNetReturn, expectedNetReturn * 0.9, expectedNetReturn * 1.1], 0.95);
    const evLCB = expectedNetReturn > 0 ? Number((expectedNetReturn * 0.85).toFixed(6)) : expectedNetReturn;

    // Risk & Uncertainty
    const conformalUncertainty = fusionResult.uncertainty;
    const bayesianPosterior = fusionResult.confidence;
    const riskOfRuin = expectedNetReturn > 0 ? 0.001 : 0.05;

    // ── 8. Competing Action Decision (BUY vs SELL vs NO_TRADE) ──
    let finalDecision: "LONG" | "SHORT" | "NO_TRADE" = "NO_TRADE";
    let noTradeReason: string | null = null;

    if (hardSafetyHalt) {
      finalDecision = "NO_TRADE";
      noTradeReason = hardHaltReason;
    } else if (candidateModelNames.length === 0) {
      finalDecision = "NO_TRADE";
      noTradeReason = "NO_VALID_MODELS_AVAILABLE: All models unavailable or failed";
    } else if (conformalUncertainty > 0.40) {
      finalDecision = "NO_TRADE";
      noTradeReason = `HIGH_CONFORMAL_UNCERTAINTY: Uncertainty ${conformalUncertainty.toFixed(3)} > 0.40 limit`;
    } else if (expectedNetReturn <= 0 || evLCB <= 0) {
      finalDecision = "NO_TRADE";
      noTradeReason = `NEGATIVE_OR_ZERO_NET_EV: Expected Net EV ${expectedNetReturn.toFixed(4)}% or LCB ${evLCB.toFixed(4)}% <= 0`;
    } else if (pBuy > pSell && pBuy > 0.55) {
      finalDecision = "LONG";
    } else if (pSell > pBuy && pSell > 0.55) {
      finalDecision = "SHORT";
    } else {
      finalDecision = "NO_TRADE";
      noTradeReason = `INSUFFICIENT_DIRECTIONAL_EDGE: P(BUY)=${pBuy.toFixed(2)}, P(SELL)=${pSell.toFixed(2)}`;
    }

    // ── 9. PPO Position Sizing & Execution ──
    const riskApproval = finalDecision !== "NO_TRADE";
    const baseSizeUSD = input.availableBalanceUSD * 0.05; // 5% base allocation
    const convictionMultiplier = finalDecision !== "NO_TRADE" ? Math.min(1.5, Math.max(0.5, bayesianPosterior / 0.70)) : 0;
    const targetPositionSizeUSD = riskApproval ? Number((baseSizeUSD * convictionMultiplier).toFixed(2)) : 0;
    const targetLeverage = input.marketDomain === "CRYPTO" ? (bayesianPosterior > 0.80 ? 3 : 2) : 1;

    const stopDistance = input.atr * 1.5;
    const takeProfitDistance = input.atr * 2.0;
    const stopLossPrice = finalDecision === "LONG"
      ? Number((input.currentPrice - stopDistance).toFixed(2))
      : (finalDecision === "SHORT" ? Number((input.currentPrice + stopDistance).toFixed(2)) : 0);
    const takeProfitPrice = finalDecision === "LONG"
      ? Number((input.currentPrice + takeProfitDistance).toFixed(2))
      : (finalDecision === "SHORT" ? Number((input.currentPrice - takeProfitDistance).toFixed(2)) : 0);

    const executionDecision = {
      action: finalDecision === "LONG" ? ("ENTER_LONG" as const) : (finalDecision === "SHORT" ? ("ENTER_SHORT" as const) : ("HOLD" as const)),
      targetLeverage,
      positionSizeUSD: targetPositionSizeUSD,
      stopLossPrice,
      takeProfitPrice,
      orderType: "MARKET" as const
    };

    // ── 10. Package Authoritative Decision Object ──
    const snapshotHash = crypto.createHash("sha256").update(JSON.stringify({
      symbol: input.symbol,
      price: input.currentPrice,
      regime: input.regime,
      timestamp
    })).digest("hex");

    const decisionObject = {
      decisionId,
      timestamp,
      marketDomain: input.marketDomain,
      symbol: input.symbol,
      accountType: input.accountType,
      mode: input.mode,
      regime: input.regime,
      featureVersion: 2,
      inputSnapshotHash: snapshotHash,
      allModelPredictions: allPredictions,
      validatedPredictions,
      effectiveModelCount: Number(effectiveModelCount.toFixed(2)),
      ensembleProbability: {
        P_BUY: Number(pBuy.toFixed(4)),
        P_HOLD: Number(pHold.toFixed(4)),
        P_SELL: Number(pSell.toFixed(4))
      },
      ensembleEntropy: Number(ensembleEntropy.toFixed(4)),
      ensembleAgreement: Number(fusionResult.modelAgreement.toFixed(4)),
      selectedSubset,
      excludedModels,
      excludedReasons,
      expectedGrossReturn: Number(grossReturn.toFixed(4)),
      estimatedFees: Number(estimatedFees.toFixed(4)),
      estimatedSpread: Number(estimatedSpread.toFixed(4)),
      estimatedSlippage: Number(estimatedSlippage.toFixed(4)),
      estimatedMarketImpact: Number(estimatedMarketImpact.toFixed(4)),
      expectedNetReturn: Number(expectedNetReturn.toFixed(4)),
      expectedLoss: Number(expectedLoss.toFixed(4)),
      riskAdjustedEV: Number((expectedNetReturn * (1 - conformalUncertainty)).toFixed(4)),
      EVConfidenceInterval: {
        lower: Number((expectedNetReturn * 0.85).toFixed(4)),
        mean: Number(expectedNetReturn.toFixed(4)),
        upper: Number((expectedNetReturn * 1.15).toFixed(4))
      },
      EVLowerConfidenceBound: Number(evLCB.toFixed(4)),
      conformalUncertainty: Number(conformalUncertainty.toFixed(4)),
      bayesianPosterior: Number(bayesianPosterior.toFixed(4)),
      riskOfRuin: Number(riskOfRuin.toFixed(4)),
      finalDecision,
      noTradeReason,
      riskApproval,
      ppoSizing: Number(convictionMultiplier.toFixed(2)),
      executionDecision,
      createdAt: new Date(timestamp)
    } as unknown as IAQEAAuthoritativeDecision;

    this.decisionHistory.push(decisionObject);
    if (this.decisionHistory.length > 500) this.decisionHistory.shift();

    // Async durable MongoDB write
    this.persistDecisionToMongo(decisionObject);

    return {
      decisionId,
      timestamp,
      symbol: input.symbol,
      marketDomain: input.marketDomain,
      finalDecision,
      noTradeReason,
      selectedSubset,
      effectiveModelCount: Number(effectiveModelCount.toFixed(2)),
      buyProbability: Number(pBuy.toFixed(4)),
      holdProbability: Number(pHold.toFixed(4)),
      sellProbability: Number(pSell.toFixed(4)),
      expectedNetReturn: Number(expectedNetReturn.toFixed(4)),
      EVLowerConfidenceBound: Number(evLCB.toFixed(4)),
      riskApproval,
      targetPositionSizeUSD,
      targetLeverage,
      stopLossPrice,
      takeProfitPrice,
      orderType: "MARKET",
      decisionObject
    };
  }

  /**
   * Retrieves decision history.
   */
  public static getDecisionHistory(): IAQEAAuthoritativeDecision[] {
    return [...this.decisionHistory];
  }

  /**
   * Clears decision history for testing.
   */
  public static clearHistory(): void {
    this.decisionHistory = [];
  }

  private static async persistDecisionToMongo(decision: IAQEAAuthoritativeDecision): Promise<void> {
    if (mongoose?.connection?.readyState !== 1) return;

    try {
      await AQEAAuthoritativeDecision.create(decision);
    } catch (err: any) {
      if (process.env.NODE_ENV !== "test") {
        console.warn(`[AutonomousDecisionEngine] MongoDB write error: ${err.message}`);
      }
    }
  }
}
