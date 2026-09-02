/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Unified Calibrated Ensemble Fusion Engine (Adaptive)
 * ═══════════════════════════════════════════════════════════════════
 * Combines multiple model predictions into ONE normalized probability
 * vector using data-driven adaptive weighting, smooth Bayesian shrinkage,
 * correlation control, incremental contribution metrics, adaptive
 * trade thresholds, and trade quality scoring.
 *
 * Core Invariants:
 * - Only REAL_MODEL + PRODUCTION models receive live voting weight.
 * - SHADOW/PROXY/BENCHMARK/UNAVAILABLE → 0.00 weight (shadow telemetry only).
 * - Smooth Bayesian shrinkage: reliability(N) = N / (N + k) towards neutral prior (1.0).
 * - No data leakage: featureTimestamp <= decisionTimestamp < outcomeTimestamp.
 * - Non-blocking I/O, fusion calculation target < 5ms.
 * - Preserves Conformal Uncertainty, Bayesian Gate, and Risk Engine authority.
 */

import { ModelExpertPrediction, InferenceMode, ModelExpertStatus, ModelContractValidator, ProbabilityDistribution } from "../ai/IModelExpert.js";
import { QuantExpertSignal } from "../quant/QuantStrategyRegistry.js";
import { AnyRegime } from "../regimeEngine.js";
import { ModelDriftMonitor } from "../governance/ModelDriftMonitor.js";
import { DynamicCostModel } from "./DynamicCostModel.js";
import { ModelScorecardRegistry } from "./ModelScorecard.js";
import { ForwardTelemetryStore } from "./ForwardTelemetryStore.js";
import { ModelCorrelationEngine } from "./ModelCorrelationEngine.js";

// ═══════════════════════════════════════════════════════════════════
//  Types & Interfaces
// ═══════════════════════════════════════════════════════════════════

export type EvidenceFamilyId =
  | "PRICE_MOMENTUM"
  | "MICROSTRUCTURE"
  | "MEAN_REVERSION"
  | "STRUCTURAL"
  | "HARMONIC"
  | "SENTIMENT";

export type TradeQualityTier =
  | "NO_TRADE"
  | "WEAK_HOLD"
  | "VALID_CANDIDATE"
  | "HIGH_CONVICTION"
  | "EXTREME_CONVICTION";

export interface ModelWeightBreakdown {
  modelName: string;
  baseWeight: number;
  regimeFit: number;
  calibrationQuality: number;
  recentPerformance: number;
  dataQuality: number;
  availability: number;
  incrementalValue: number;
  correlationPenalty: number;
  rawWeight: number;
  effectiveWeight: number;
  normalizedWeight: number;
  evidenceFamily: EvidenceFamilyId;
  inferenceMode: InferenceMode;
  status: ModelExpertStatus | string;
  eligible: boolean;
}

export interface EnsembleFusionResult {
  sellProbability: number;
  holdProbability: number;
  buyProbability: number;
  direction: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  effectiveWeight: number;
  participatingModels: string[];
  shadowModels: string[];
  modelAgreement: number;
  uncertainty: number;
  regime: AnyRegime;
  expectedValue: number;
  evPassesGate: boolean;
  tradeQualityScore: number;
  tradeQualityTier: TradeQualityTier;
  adaptiveThreshold: number;
  decisionReason: string;
  modelWeights: ModelWeightBreakdown[];
  fusionLatencyMs: number;
  telemetry: EnsembleTelemetry;
  decisionRecord?: EnsembleDecisionRecord;
}

export interface EnsembleTelemetry {
  modelProbabilities: Record<string, ProbabilityDistribution>;
  modelDirections: Record<string, string>;
  modelRawWeights: Record<string, number>;
  modelEffectiveWeights: Record<string, number>;
  ensembleProbabilities: { LONG: number; SHORT: number; HOLD: number };
  regime: string;
  modelAgreement: number;
  confidence: number;
  tradeQualityScore: number;
  tradeQualityTier: TradeQualityTier;
  expectedValue: number;
  direction: string;
  decisionReason: string;
  inferenceLatencyMs: Record<string, number>;
  fusionLatencyMs: number;
  timestamp: number;
}

export interface EVGateParams {
  atrPercent: number;
  tpMultiplier?: number;        // TP distance as ATR multiplier (default 2.0)
  slMultiplier?: number;        // SL distance as ATR multiplier (default 1.5)
  feePercent?: number;          // Round-trip fee estimate (default 0.10%)
  slippagePercent?: number;     // Estimated slippage (default 0.05%)
  marketImpactPercent?: number; // Estimated market impact (default 0.02%)
  spreadPercent?: number;       // Bid-ask spread estimate (default 0.03%)
}

// ═══════════════════════════════════════════════════════════════════
//  Persistent Forward-Outcome Record Types
// ═══════════════════════════════════════════════════════════════════

export interface ModelDecisionSnapshot {
  modelName: string;
  modelFamily?: string;
  rawProbability: ProbabilityDistribution;
  direction: string;
  confidence: number;
  effectiveWeight: number;
  regimeFit?: number;
  dataQuality?: number;
  availability?: number;
  correlationPenalty?: number;
  incrementalContribution?: number;
  participating: boolean;
  status: string;
  inferenceMode: string;
}

export interface EnsembleDecisionRecord {
  decisionId: string;
  timestamp: number;
  symbol: string;
  marketDomain: "CRYPTO" | "INDIAN";
  accountType: string;
  regime: string;
  featureVersion: number;
  dataSource?: string;
  isForward?: boolean;
  isUntouched?: boolean;
  isSynthetic?: boolean;
  dataProvenance?: string;
  opportunityId?: string;
  buyProbability: number;
  holdProbability: number;
  sellProbability: number;
  direction: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  agreementScore: number;
  tradeQualityScore: number;
  tradeQualityTier: TradeQualityTier;
  expectedValue: number;
  expectedGain: number;
  expectedLoss: number;
  fees: number;
  slippage: number;
  spread?: number;
  marketImpact?: number;
  netEV?: number;
  evGateResult?: boolean;
  conformalResult?: boolean;
  uncertainty: number;
  bayesianPosterior?: number;
  bayesianConviction?: number;
  riskResult?: boolean;
  finalDecision?: "LONG" | "SHORT" | "HOLD";
  ppoSizing?: number;
  modelBreakdowns: Record<string, ModelDecisionSnapshot>;
  realizedOutcome?: EnsembleRealizedOutcome;
}

export interface EnsembleRealizedOutcome {
  decisionId?: string;
  timestamp?: number;
  symbol?: string;
  regime?: string;
  accountType?: string;
  entryTimestamp?: number;
  entryPrice?: number;
  exitTimestamp?: number;
  exitPrice?: number;
  resolvedTimestamp: number;
  realizedDirection: "LONG" | "SHORT" | "HOLD";
  realizedReturn: number;
  realizedPnL: number;
  mfe?: number; // Maximum Favorable Excursion (%)
  mae?: number; // Maximum Adverse Excursion (%)
  holdingDurationMs?: number;
  fees?: number;
  slippage?: number;
  spread?: number;
  marketImpact?: number;
  outcome: "WIN" | "LOSS" | "BREAKEVEN";
  directionCorrect: boolean;
  actualClass?: string;
  evEstimateCorrect?: boolean;
  confidenceCalibrated?: boolean;
}

export interface ModelContributionMetrics {
  modelName: string;
  totalEvaluated: number;
  directionalAccuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  brierScore: number;
  ece: number;
  logLoss: number;
  winRate: number;
  averageReturn: number;
  medianReturn: number;
  profitFactor: number;
  expectancy: number;
  rollingSharpe: number;
  rollingSortino: number;
  maxDrawdown: number;
  mfe: number;
  mae: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  incrementalValue: number;
}

export class DataLeakageError extends Error {
  constructor(message: string) {
    super(`[DATA_LEAKAGE_VIOLATION] ${message}`);
    this.name = "DataLeakageError";
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Constants & Shrinkage Hyperparameters
// ═══════════════════════════════════════════════════════════════════

export const SHRINKAGE_PRIOR_STRENGTH_K = 30; // Prior weight constant (k) for global metrics
export const REGIME_PRIOR_STRENGTH_K = 15;    // Prior weight constant (k) for regime-specific metrics

const MODEL_EVIDENCE_FAMILIES: Record<string, EvidenceFamilyId> = {
  "MAMBA_RESEARCH_V1": "PRICE_MOMENTUM",
  "CNN_1D_V1_BENCHMARK": "PRICE_MOMENTUM",
  "BILSTM_V1_BENCHMARK": "PRICE_MOMENTUM",
  "MODERN_TCN_V1_PROXY": "PRICE_MOMENTUM",
  "PATCHTST_V1_PROXY": "PRICE_MOMENTUM",
  "TIMESNET_V1_PROXY": "PRICE_MOMENTUM",
  "ITRANSFORMER_V1_PROXY": "PRICE_MOMENTUM",
  "TSFM_V1_PROXY": "PRICE_MOMENTUM",
  "AARYAN_MOMENTUM": "PRICE_MOMENTUM",
  "AAYUSH_MEAN_REVERSION": "MEAN_REVERSION",
  "SMC_INSTITUTIONAL": "STRUCTURAL",
  "ORDER_FLOW_CVD": "MICROSTRUCTURE",
  "GAYATRI_24_SIGNAL": "HARMONIC",
  "OHMKARA_528HZ": "HARMONIC",
  "FINANCIAL_NLP": "SENTIMENT"
};

const FAMILY_WEIGHT_CAPS: Record<EvidenceFamilyId, number> = {
  PRICE_MOMENTUM: 0.45,
  MICROSTRUCTURE: 0.25,
  MEAN_REVERSION: 0.20,
  STRUCTURAL: 0.20,
  HARMONIC: 0.20,
  SENTIMENT: 0.15
};

/**
 * Computes correlation penalty for a model family.
 * Uses empirical correlation data from ModelCorrelationEngine when available (≥30 OOS),
 * falls back to prior-based 1/√N when insufficient data.
 */
function computeCorrelationPenalty(familyCount: number, familyModelNames?: string[]): number {
  if (familyCount <= 1) return 1.0;

  // Try empirical correlation adjustment
  if (familyModelNames && familyModelNames.length > 1) {
    const independence = ModelCorrelationEngine.getEffectiveIndependence(
      familyModelNames, familyCount
    );
    if (independence.isCalibrated) {
      return Number(Math.max(0.15, Math.min(1.0, independence.effectiveFraction)).toFixed(4));
    }
  }

  // Fallback: prior-based penalty
  return Math.max(0.30, 1.0 / Math.sqrt(familyCount));
}

const DL_BASE_WEIGHT = 0.30;
const QUANT_BASE_WEIGHT = 0.15;
const SENTIMENT_BASE_WEIGHT = 0.12;

// ═══════════════════════════════════════════════════════════════════
//  Model Contribution & Forward Tracking Engine
// ═══════════════════════════════════════════════════════════════════

export class ModelContributionEngine {
  private static decisionHistory: EnsembleDecisionRecord[] = [];
  private static MAX_HISTORY = 5000;
  private static regimePerformanceMatrix: Map<string, Map<string, { wins: number; total: number; sumPnL: number }>> = new Map();

  /**
   * Computes smooth Bayesian reliability factor: reliability(N) = N / (N + k)
   */
  public static computeReliability(sampleCount: number, priorStrength: number = SHRINKAGE_PRIOR_STRENGTH_K): number {
    if (sampleCount <= 0) return 0.0;
    return Number((sampleCount / (sampleCount + priorStrength)).toFixed(6));
  }

  public static recordDecision(record: EnsembleDecisionRecord): void {
    this.decisionHistory.push(record);
    if (this.decisionHistory.length > this.MAX_HISTORY) {
      this.decisionHistory.shift();
    }
  }

  public static resolveOutcome(decisionId: string, outcome: EnsembleRealizedOutcome): boolean {
    const record = this.decisionHistory.find(d => d.decisionId === decisionId);
    if (!record) return false;

    // Anti-leakage verification: Outcome timestamp must strictly follow decision timestamp
    if (outcome.resolvedTimestamp <= record.timestamp) {
      throw new DataLeakageError(`Outcome timestamp (${outcome.resolvedTimestamp}) must be strictly after decision timestamp (${record.timestamp})`);
    }

    record.realizedOutcome = outcome;

    // Update regime x model matrix
    const reg = record.regime || "RANGING";
    if (!this.regimePerformanceMatrix.has(reg)) {
      this.regimePerformanceMatrix.set(reg, new Map());
    }
    const regMap = this.regimePerformanceMatrix.get(reg)!;

    for (const [mName, mSnap] of Object.entries(record.modelBreakdowns)) {
      if (!mSnap.participating) continue;
      const cur = regMap.get(mName) || { wins: 0, total: 0, sumPnL: 0 };
      cur.total++;
      if (outcome.outcome === "WIN") cur.wins++;
      cur.sumPnL += outcome.realizedReturn;
      regMap.set(mName, cur);

      // Update dedicated scorecard
      ModelScorecardRegistry.updateScorecard(mName, {
        currentLiveWeight: mSnap.effectiveWeight
      });
    }

    // Persist to ForwardTelemetryStore (non-blocking)
    ForwardTelemetryStore.resolveOutcome(decisionId, outcome);

    return true;
  }

  public static getDecisionHistory(): EnsembleDecisionRecord[] {
    return [...this.decisionHistory];
  }

  public static getResolvedHistory(): EnsembleDecisionRecord[] {
    return this.decisionHistory.filter(d => d.realizedOutcome !== undefined);
  }

  public static clearHistory(): void {
    this.decisionHistory = [];
    this.regimePerformanceMatrix.clear();
    ModelScorecardRegistry.clearAll();
  }

  /**
   * Calculates rolling model contribution metrics and Bayesian-shrunk incremental value factor.
   */
  public static getModelMetrics(modelName: string): ModelContributionMetrics {
    const resolved = this.getResolvedHistory();
    const modelTrades = resolved.filter(r => r.modelBreakdowns[modelName]?.participating);

    if (modelTrades.length === 0) {
      return {
        modelName,
        totalEvaluated: 0,
        directionalAccuracy: 0.50,
        precision: 0.50,
        recall: 0.50,
        f1Score: 0.50,
        brierScore: 0.20,
        ece: 0.05,
        logLoss: 0.693,
        winRate: 0.50,
        averageReturn: 0.0,
        medianReturn: 0.0,
        profitFactor: 1.50,
        expectancy: 0.50,
        rollingSharpe: 1.20,
        rollingSortino: 1.50,
        maxDrawdown: 0.0,
        mfe: 1.5,
        mae: 0.8,
        falsePositiveRate: 0.25,
        falseNegativeRate: 0.25,
        incrementalValue: 1.0
      };
    }

    let wins = 0;
    let brierSum = 0;
    let logLossSum = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalReturn = 0;
    let mfeSum = 0;
    let maeSum = 0;
    const returns: number[] = [];

    for (const tr of modelTrades) {
      const outcome = tr.realizedOutcome!;
      const actual = outcome.outcome === "WIN" ? 1 : 0;
      const prob = tr.modelBreakdowns[modelName].rawProbability;
      const predProb = tr.direction === "LONG" ? prob.LONG : (tr.direction === "SHORT" ? prob.SHORT : prob.HOLD);

      brierSum += Math.pow(predProb - actual, 2);
      const clampedP = Math.min(0.999, Math.max(0.001, predProb));
      logLossSum += -(actual * Math.log(clampedP) + (1 - actual) * Math.log(1 - clampedP));

      returns.push(outcome.realizedReturn);
      totalReturn += outcome.realizedReturn;
      mfeSum += outcome.mfe || 0;
      maeSum += outcome.mae || 0;

      if (outcome.outcome === "WIN") {
        wins++;
        grossProfit += Math.max(0, outcome.realizedReturn);
      } else if (outcome.outcome === "LOSS") {
        grossLoss += Math.abs(outcome.realizedReturn);
      }
    }

    const total = modelTrades.length;
    const winRate = wins / total;
    const accuracy = winRate;
    const precision = wins / Math.max(1, wins + (total - wins));
    const recall = accuracy;
    const f1Score = (2 * precision * recall) / Math.max(0.001, precision + recall);
    const brierScore = brierSum / total;
    const logLoss = logLossSum / total;
    const avgReturn = totalReturn / total;
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const medianReturn = sortedReturns[Math.floor(sortedReturns.length / 2)] || 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 5.0 : 1.0);
    const expectancy = avgReturn;

    // Rolling Sharpe & Sortino
    const mean = avgReturn;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / Math.max(1, total - 1);
    const std = Math.sqrt(variance);
    const rollingSharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 1.20;

    const downReturns = returns.filter(r => r < 0);
    const downVariance = downReturns.reduce((s, r) => s + Math.pow(r, 2), 0) / Math.max(1, downReturns.length);
    const rollingSortino = downVariance > 0 ? (mean / Math.sqrt(downVariance)) * Math.sqrt(252) : rollingSharpe;

    // Smooth Bayesian Incremental Value Calculation: Shrunk to 1.0 prior
    const reliability = this.computeReliability(total, SHRINKAGE_PRIOR_STRENGTH_K);
    const empiricalIncremental = Math.min(1.30, Math.max(0.70, 0.70 + (profitFactor / 3.0) * 0.60));
    const incrementalValue = (reliability * empiricalIncremental) + ((1 - reliability) * 1.0);

    return {
      modelName,
      totalEvaluated: total,
      directionalAccuracy: Number(accuracy.toFixed(4)),
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1Score: Number(f1Score.toFixed(4)),
      brierScore: Number(brierScore.toFixed(4)),
      ece: Number(this.computeECE(modelTrades, modelName).toFixed(4)),
      logLoss: Number(logLoss.toFixed(4)),
      winRate: Number(winRate.toFixed(4)),
      averageReturn: Number(avgReturn.toFixed(4)),
      medianReturn: Number(medianReturn.toFixed(4)),
      profitFactor: Number(profitFactor.toFixed(2)),
      expectancy: Number(expectancy.toFixed(2)),
      rollingSharpe: Number(Math.min(5.0, Math.max(-2.0, rollingSharpe)).toFixed(2)),
      rollingSortino: Number(Math.min(6.0, Math.max(-2.0, rollingSortino)).toFixed(2)),
      maxDrawdown: Number(this.computeMaxDrawdown(returns).toFixed(2)),
      mfe: Number((mfeSum / total).toFixed(2)),
      mae: Number((maeSum / total).toFixed(2)),
      falsePositiveRate: Number(((total - wins) / total).toFixed(4)),
      falseNegativeRate: Number(((total - wins) / total).toFixed(4)),
      incrementalValue: Number(incrementalValue.toFixed(4))
    };
  }

  /**
   * Gets regime-specific performance score for a model with smooth Bayesian shrinkage.
   */
  public static getRegimeModelScore(regime: string, modelName: string): { regimeScore: number; sampleCount: number } {
    const regMap = this.regimePerformanceMatrix.get(regime);
    if (!regMap || !regMap.has(modelName)) {
      return { regimeScore: 1.0, sampleCount: 0 };
    }
    const stat = regMap.get(modelName)!;
    /* istanbul ignore next */
    const reliability = this.computeReliability(stat.total, REGIME_PRIOR_STRENGTH_K);
    if (stat.total === 0) {
      return { regimeScore: 1.0, sampleCount: 0 };
    }
    const wr = stat.wins / stat.total;
    const empiricalScore = Math.min(1.25, Math.max(0.75, 0.75 + wr * 0.50));
    const regimeScore = (reliability * empiricalScore) + ((1 - reliability) * 1.0);
    return { regimeScore: Number(regimeScore.toFixed(4)), sampleCount: stat.total };
  }

  /**
   * Computes proper Expected Calibration Error (ECE) using 10 bins.
   * ECE = Σ (|bin_count|/N) * |avg_confidence_in_bin - avg_accuracy_in_bin|
   */
  private static computeECE(trades: EnsembleDecisionRecord[], modelName: string): number {
    if (trades.length === 0) return 0.05;

    const NUM_BINS = 10;
    const bins: { confidenceSum: number; correctSum: number; count: number }[] =
      Array.from({ length: NUM_BINS }, () => ({ confidenceSum: 0, correctSum: 0, count: 0 }));

    for (const tr of trades) {
      const outcome = tr.realizedOutcome;
      if (!outcome) continue;
      const snap = tr.modelBreakdowns[modelName];
      if (!snap || !snap.participating) continue;

      const predProb = tr.direction === "LONG" ? snap.rawProbability.LONG
        : (tr.direction === "SHORT" ? snap.rawProbability.SHORT : snap.rawProbability.HOLD);
      const actual = outcome.directionCorrect ? 1 : 0;
      const binIdx = Math.min(NUM_BINS - 1, Math.floor(predProb * NUM_BINS));

      bins[binIdx].confidenceSum += predProb;
      bins[binIdx].correctSum += actual;
      bins[binIdx].count++;
    }

    const total = trades.filter(t => t.realizedOutcome).length;
    if (total === 0) return 0.05;

    let ece = 0;
    for (const bin of bins) {
      if (bin.count === 0) continue;
      const avgConf = bin.confidenceSum / bin.count;
      const avgAcc = bin.correctSum / bin.count;
      ece += (bin.count / total) * Math.abs(avgConf - avgAcc);
    }

    return ece;
  }

  /**
   * Computes rolling maximum drawdown from a sequence of returns.
   */
  private static computeMaxDrawdown(returns: number[]): number {
    if (returns.length === 0) return 0;
    let peak = 0;
    let running = 0;
    let maxDD = 0;
    for (const r of returns) {
      running += r;
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Unified Ensemble Fusion Engine
// ═══════════════════════════════════════════════════════════════════

export class UnifiedEnsembleFusion {
  public static fuse(
    dlPredictions: ModelExpertPrediction[],
    quantSignals: QuantExpertSignal[],
    nlpSentiment: { score: number; confidence: number; classification: string },
    regime: AnyRegime,
    evParams: EVGateParams,
    contextMeta?: { symbol?: string; marketDomain?: "CRYPTO" | "INDIAN"; accountType?: string }
  ): EnsembleFusionResult {
    const fusionStart = Date.now();
    const modelWeights: ModelWeightBreakdown[] = [];
    const telemetryProbs: Record<string, ProbabilityDistribution> = {};
    const telemetryDirs: Record<string, string> = {};
    const telemetryLatency: Record<string, number> = {};
    const participatingModels: string[] = [];
    const shadowModels: string[] = [];
    const modelSnapshots: Record<string, ModelDecisionSnapshot> = {};

    // Step 1: Validate & classify DL model predictions
    const validDL: ModelExpertPrediction[] = [];
    for (const pred of dlPredictions) {
      const validation = ModelContractValidator.validate(pred);
      if (!validation.valid) continue;
      telemetryProbs[pred.modelName] = pred.probabilities;
      telemetryDirs[pred.modelName] = pred.direction;
      telemetryLatency[pred.modelName] = pred.latencyMs;

      const isEligible = this.isEligibleForLiveVoting(pred);
      if (isEligible) {
        validDL.push(pred);
        participatingModels.push(pred.modelName);
      } else {
        shadowModels.push(pred.modelName);
      }

      modelSnapshots[pred.modelName] = {
        modelName: pred.modelName,
        rawProbability: pred.probabilities,
        direction: pred.direction,
        confidence: pred.confidence,
        effectiveWeight: 0,
        participating: isEligible,
        status: pred.status,
        inferenceMode: pred.inferenceMode
      };
    }

    // Step 2: Count evidence family members for correlation penalty
    const familyMemberCounts = this.countFamilyMembers(validDL, quantSignals, nlpSentiment);

    // Step 3: Compute weights for each eligible DL model (with smooth Bayesian shrinkage)
    for (const pred of validDL) {
      const family = MODEL_EVIDENCE_FAMILIES[pred.modelName] || "PRICE_MOMENTUM";
      const familyCount = familyMemberCounts[family] || 1;
      const breakdown = this.computeModelWeight(pred, regime, family, familyCount);
      modelWeights.push(breakdown);
      if (modelSnapshots[pred.modelName]) {
        modelSnapshots[pred.modelName].effectiveWeight = breakdown.effectiveWeight;
      }
    }

    // Step 4: Compute weights for quant signals
    for (const qs of quantSignals) {
      const family = MODEL_EVIDENCE_FAMILIES[qs.strategyId] || "PRICE_MOMENTUM";
      const familyCount = familyMemberCounts[family] || 1;
      const breakdown = this.computeQuantWeight(qs, regime, family, familyCount);
      modelWeights.push(breakdown);
      participatingModels.push(qs.strategyId);
      telemetryDirs[qs.strategyId] = qs.direction;

      modelSnapshots[qs.strategyId] = {
        modelName: qs.strategyId,
        rawProbability: this.quantSignalToProbabilities(qs),
        direction: qs.direction,
        confidence: qs.confidence,
        effectiveWeight: breakdown.effectiveWeight,
        participating: true,
        status: "PRODUCTION",
        inferenceMode: "REAL_MODEL"
      };
    }

    // Step 5: NLP Sentiment weight
    if (nlpSentiment.confidence > 0) {
      const family: EvidenceFamilyId = "SENTIMENT";
      const familyCount = familyMemberCounts[family] || 1;
      const corrPenalty = computeCorrelationPenalty(familyCount);
      const rawW = SENTIMENT_BASE_WEIGHT * nlpSentiment.confidence * corrPenalty;

      const nlpBreakdown: ModelWeightBreakdown = {
        modelName: "FINANCIAL_NLP",
        baseWeight: SENTIMENT_BASE_WEIGHT,
        regimeFit: 1.0,
        calibrationQuality: 1.0,
        recentPerformance: 1.0,
        dataQuality: nlpSentiment.confidence,
        availability: 1.0,
        incrementalValue: 1.0,
        correlationPenalty: corrPenalty,
        rawWeight: rawW,
        effectiveWeight: rawW,
        normalizedWeight: 0,
        evidenceFamily: family,
        inferenceMode: "REAL_MODEL",
        status: "PRODUCTION",
        eligible: true
      };
      modelWeights.push(nlpBreakdown);
      participatingModels.push("FINANCIAL_NLP");

      modelSnapshots["FINANCIAL_NLP"] = {
        modelName: "FINANCIAL_NLP",
        rawProbability: this.nlpToProbabilities(nlpSentiment),
        direction: nlpSentiment.score > 0.1 ? "LONG" : (nlpSentiment.score < -0.1 ? "SHORT" : "HOLD"),
        confidence: nlpSentiment.confidence,
        effectiveWeight: rawW,
        participating: true,
        status: "PRODUCTION",
        inferenceMode: "REAL_MODEL"
      };
    }

    // Step 6: Apply family weight caps
    this.applyFamilyCaps(modelWeights);

    // Step 7: Normalize weights to sum to 1.0
    const totalWeight = modelWeights.reduce((s, m) => s + m.effectiveWeight, 0);
    if (totalWeight > 0) {
      for (const mw of modelWeights) {
        mw.normalizedWeight = Number((mw.effectiveWeight / totalWeight).toFixed(6));
        if (modelSnapshots[mw.modelName]) {
          modelSnapshots[mw.modelName].effectiveWeight = mw.normalizedWeight;
        }
      }
    }

    // Step 8: Weighted probability aggregation with Dynamic Temperature Scaling Calibration
    let wLong = 0, wShort = 0, wHold = 0;

    for (const mw of modelWeights) {
      if (mw.normalizedWeight <= 0) continue;
      const rawProbs = this.getProbabilities(mw.modelName, validDL, quantSignals, nlpSentiment);
      if (!rawProbs) continue;
      
      // Apply Dynamic Platt/Temperature Scaling per regime to eliminate overconfident noise
      const probs = this.calibrateProbabilities(rawProbs, regime);
      
      wLong += mw.normalizedWeight * probs.LONG;
      wShort += mw.normalizedWeight * probs.SHORT;
      wHold += mw.normalizedWeight * probs.HOLD;
    }

    // Final normalization to guarantee sum = 1.0
    const rawSum = wLong + wShort + wHold;
    let buyProbability: number, sellProbability: number, holdProbability: number;

    if (rawSum > 0 && isFinite(rawSum)) {
      buyProbability = Number((wLong / rawSum).toFixed(6));
      sellProbability = Number((wShort / rawSum).toFixed(6));
      holdProbability = Number(Math.max(0, 1 - buyProbability - sellProbability).toFixed(6));
    } else {
      buyProbability = 0.3333;
      sellProbability = 0.3333;
      holdProbability = 0.3334;
    }

    // Step 9: Direction determination & Shannon Information Entropy Denoising
    const eps = 1e-6;
    const entropy = -(
      (buyProbability > 0 ? buyProbability * Math.log2(buyProbability) : 0) +
      (sellProbability > 0 ? sellProbability * Math.log2(sellProbability) : 0) +
      (holdProbability > 0 ? holdProbability * Math.log2(holdProbability) : 0)
    );
    // If entropy > 1.575 (max uniform 3-class distribution is log2(3)=1.585), market is chaotic ranging noise
    const isNoisyMarketEntropy = entropy > 1.575;
    const isTrendingRegime = String(regime || "").includes("TRENDING") || String(regime || "").includes("EXPANSION") || String(regime || "").includes("BREAKOUT");

    let direction: "LONG" | "SHORT" | "HOLD" = "HOLD";
    if (!isNoisyMarketEntropy) {
      const directionalEdge = buyProbability - sellProbability;
      if (buyProbability > sellProbability) {
        if (buyProbability > holdProbability || (isTrendingRegime && directionalEdge >= 0.08 && buyProbability >= 0.35)) {
          direction = "LONG";
        }
      } else if (sellProbability > buyProbability) {
        if (sellProbability > holdProbability || (isTrendingRegime && -directionalEdge >= 0.08 && sellProbability >= 0.35)) {
          direction = "SHORT";
        }
      }
    }

    // Step 10: Model agreement score
    const modelAgreement = this.computeModelAgreement(modelWeights, validDL, quantSignals, nlpSentiment, direction);

    // Step 11: Calibrated confidence
    const maxProb = Math.max(buyProbability, sellProbability, holdProbability);
    const eligibleCount = modelWeights.filter(m => m.eligible && m.normalizedWeight > 0).length;
    const availabilityFactor = Math.min(1.0, eligibleCount / Math.max(1, participatingModels.length));

    const confidence = Number(Math.min(1.0, Math.max(0.0,
      maxProb * 0.40 +
      modelAgreement * 0.25 +
      (1 - this.getRegimeUncertaintyPenalty(regime)) * 0.15 +
      availabilityFactor * 0.10 +
      Math.min(1.0, totalWeight / 0.50) * 0.10
    )).toFixed(4));

    // Step 12: Uncertainty
    const uncertainty = Number(Math.min(1.0, Math.max(0.0, 1.0 - confidence)).toFixed(4));

    // Step 13: Expected Value gate (Economically Real with Dynamic Cost Model)
    const marketDomain = contextMeta?.marketDomain || "CRYPTO";
    const friction = DynamicCostModel.calculateFriction({
      symbol: contextMeta?.symbol || "MARKET",
      marketDomain,
      atrPercent: evParams.atrPercent,
      isHighLiquidity: true
    });

    const adjustedEVParams: EVGateParams = {
      ...evParams,
      feePercent: evParams.feePercent ?? friction.feePercent,
      slippagePercent: evParams.slippagePercent ?? friction.slippagePercent,
      marketImpactPercent: evParams.marketImpactPercent ?? friction.marketImpactPercent,
      spreadPercent: evParams.spreadPercent ?? friction.spreadPercent
    };

    const { expectedValue, expectedGain, expectedLoss, fees, slippage, evPassesGate } = this.computeExpectedValue(
      direction, buyProbability, sellProbability, holdProbability, adjustedEVParams
    );

    // Step 14: Adaptive Trade Threshold
    const adaptiveThreshold = this.computeAdaptiveThreshold(regime, uncertainty, adjustedEVParams, totalWeight);

    // Step 15: Trade Quality Score & Tier Classification
    const { tradeQualityScore, tradeQualityTier } = this.computeTradeQuality(
      direction === "LONG" ? buyProbability : (direction === "SHORT" ? sellProbability : holdProbability),
      modelAgreement,
      confidence,
      expectedValue,
      regime,
      uncertainty,
      fees + slippage
    );

    // Step 16: Decision reason
    const decisionReason = this.buildDecisionReason(
      direction, buyProbability, sellProbability, holdProbability,
      modelAgreement, confidence, expectedValue, evPassesGate,
      tradeQualityScore, tradeQualityTier,
      participatingModels.length, eligibleCount
    );

    const fusionLatencyMs = Math.max(0, Date.now() - fusionStart);

    // Step 17: Telemetry (non-blocking)
    const telemetry: EnsembleTelemetry = {
      modelProbabilities: telemetryProbs,
      modelDirections: telemetryDirs,
      modelRawWeights: Object.fromEntries(modelWeights.map(m => [m.modelName, m.rawWeight])),
      modelEffectiveWeights: Object.fromEntries(modelWeights.map(m => [m.modelName, m.normalizedWeight])),
      ensembleProbabilities: { LONG: buyProbability, SHORT: sellProbability, HOLD: holdProbability },
      regime: String(regime),
      modelAgreement,
      confidence,
      tradeQualityScore,
      tradeQualityTier,
      expectedValue,
      direction,
      decisionReason,
      inferenceLatencyMs: telemetryLatency,
      fusionLatencyMs,
      timestamp: Date.now()
    };

    // Step 18: Build persistent decision record (for Forward Tracking & Attribution)
    const decisionRecord: EnsembleDecisionRecord = {
      decisionId: `ENS_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: Date.now(),
      symbol: contextMeta?.symbol || "MARKET",
      marketDomain,
      accountType: contextMeta?.accountType || "SPOT",
      regime: String(regime),
      featureVersion: 2,
      buyProbability,
      holdProbability,
      sellProbability,
      direction,
      confidence,
      agreementScore: modelAgreement,
      tradeQualityScore,
      tradeQualityTier,
      expectedValue,
      expectedGain,
      expectedLoss,
      fees,
      slippage,
      uncertainty,
      modelBreakdowns: modelSnapshots
    };

    // Record decision in ModelContributionEngine (non-blocking)
    ModelContributionEngine.recordDecision(decisionRecord);

    // Persist to ForwardTelemetryStore (non-blocking)
    ForwardTelemetryStore.recordDecision(decisionRecord);

    return {
      sellProbability,
      holdProbability,
      buyProbability,
      direction,
      confidence,
      effectiveWeight: totalWeight,
      participatingModels,
      shadowModels,
      modelAgreement,
      uncertainty,
      regime,
      expectedValue,
      evPassesGate,
      tradeQualityScore,
      tradeQualityTier,
      adaptiveThreshold,
      decisionReason,
      modelWeights,
      fusionLatencyMs,
      telemetry,
      decisionRecord
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Private Helpers
  // ═══════════════════════════════════════════════════════════════════

  private static isEligibleForLiveVoting(pred: ModelExpertPrediction): boolean {
    return pred.inferenceMode === "REAL_MODEL" && pred.status === "PRODUCTION";
  }

  private static countFamilyMembers(
    dlPreds: ModelExpertPrediction[],
    quantSignals: QuantExpertSignal[],
    nlpSentiment: { score: number; confidence: number; classification: string }
  ): Record<EvidenceFamilyId, number> {
    const counts: Record<EvidenceFamilyId, number> = {
      PRICE_MOMENTUM: 0, MICROSTRUCTURE: 0, MEAN_REVERSION: 0,
      STRUCTURAL: 0, HARMONIC: 0, SENTIMENT: 0
    };
    for (const pred of dlPreds) {
      const fam = MODEL_EVIDENCE_FAMILIES[pred.modelName] || "PRICE_MOMENTUM";
      counts[fam]++;
    }
    for (const qs of quantSignals) {
      const fam = MODEL_EVIDENCE_FAMILIES[qs.strategyId] || "PRICE_MOMENTUM";
      counts[fam]++;
    }
    if (nlpSentiment && typeof nlpSentiment.confidence === "number" && nlpSentiment.confidence > 0) {
      counts.SENTIMENT++;
    }
    return counts;
  }

  private static computeModelWeight(
    pred: ModelExpertPrediction, regime: AnyRegime,
    family: EvidenceFamilyId, familyCount: number
  ): ModelWeightBreakdown {
    const baseWeight = DL_BASE_WEIGHT;
    const staticRegimeFit = Math.min(1.0, Math.max(0.0, pred.regimeCompatibility));

    // Dynamic regime & incremental value lookup with smooth Bayesian shrinkage
    const regStat = ModelContributionEngine.getRegimeModelScore(String(regime), pred.modelName);
    const contribution = ModelContributionEngine.getModelMetrics(pred.modelName);

    // Bayesian shrinkage towards neutral prior (1.0) based on observation count
    const reliability = ModelContributionEngine.computeReliability(contribution.totalEvaluated, SHRINKAGE_PRIOR_STRENGTH_K);
    const empiricalPerf = contribution.profitFactor > 0 ? Math.min(1.30, Math.max(0.50, contribution.profitFactor / 1.5)) : 1.0;
    const recentPerformance = (reliability * empiricalPerf) + ((1 - reliability) * 1.0);

    const regimeFit = staticRegimeFit * regStat.regimeScore;

    const driftReport = ModelDriftMonitor.getReport(pred.modelName);
    const calibrationQuality = driftReport.totalEvaluated > 0
      ? Math.min(1.0, Math.max(0.1, 1.0 - driftReport.brierScore)) : 1.0;

    const dataQuality = Math.min(1.0, Math.max(0.1, 1.0 - pred.uncertainty * 0.5));
    const availability = pred.latencyMs < 2000 ? 1.0 : (pred.latencyMs < 5000 ? 0.80 : 0.50);
    const incrementalValue = contribution.incrementalValue;
    const correlationPenalty = computeCorrelationPenalty(familyCount);

    const rawWeight = baseWeight * regimeFit * calibrationQuality *
      recentPerformance * dataQuality * availability * incrementalValue * correlationPenalty;

    return {
      modelName: pred.modelName, baseWeight, regimeFit: Number(regimeFit.toFixed(4)),
      calibrationQuality: Number(calibrationQuality.toFixed(4)),
      recentPerformance: Number(recentPerformance.toFixed(4)),
      dataQuality: Number(dataQuality.toFixed(4)),
      availability, incrementalValue: Number(incrementalValue.toFixed(4)),
      correlationPenalty: Number(correlationPenalty.toFixed(4)),
      rawWeight: Number(rawWeight.toFixed(6)), effectiveWeight: Number(rawWeight.toFixed(6)),
      normalizedWeight: 0, evidenceFamily: family,
      inferenceMode: pred.inferenceMode, status: pred.status, eligible: true
    };
  }

  private static computeQuantWeight(
    qs: QuantExpertSignal, regime: AnyRegime,
    family: EvidenceFamilyId, familyCount: number
  ): ModelWeightBreakdown {
    const baseWeight = QUANT_BASE_WEIGHT;
    const staticRegimeFit = Math.min(1.0, Math.max(0.0, qs.regimeCompatibility));
    const regStat = ModelContributionEngine.getRegimeModelScore(String(regime), qs.strategyId);
    const contribution = ModelContributionEngine.getModelMetrics(qs.strategyId);

    const reliability = ModelContributionEngine.computeReliability(contribution.totalEvaluated, SHRINKAGE_PRIOR_STRENGTH_K);
    const empiricalPerf = contribution.profitFactor > 0 ? Math.min(1.30, Math.max(0.50, contribution.profitFactor / 1.5)) : 1.0;
    const recentPerformance = (reliability * empiricalPerf) + ((1 - reliability) * 1.0);

    const regimeFit = staticRegimeFit * regStat.regimeScore;
    const correlationPenalty = computeCorrelationPenalty(familyCount);
    const incrementalValue = contribution.incrementalValue;
    const rawWeight = baseWeight * regimeFit * recentPerformance * incrementalValue * correlationPenalty;

    return {
      modelName: qs.strategyId, baseWeight, regimeFit: Number(regimeFit.toFixed(4)),
      calibrationQuality: 1.0, recentPerformance: Number(recentPerformance.toFixed(4)),
      dataQuality: 1.0, availability: 1.0, incrementalValue: Number(incrementalValue.toFixed(4)),
      correlationPenalty: Number(correlationPenalty.toFixed(4)),
      rawWeight: Number(rawWeight.toFixed(6)), effectiveWeight: Number(rawWeight.toFixed(6)),
      normalizedWeight: 0, evidenceFamily: family,
      inferenceMode: "REAL_MODEL", status: qs.strategyId, eligible: true
    };
  }

  private static applyFamilyCaps(weights: ModelWeightBreakdown[]): void {
    const familyTotals = new Map<EvidenceFamilyId, number>();
    for (const w of weights) {
      const current = familyTotals.get(w.evidenceFamily) || 0;
      familyTotals.set(w.evidenceFamily, current + w.effectiveWeight);
    }
    for (const w of weights) {
      const total = familyTotals.get(w.evidenceFamily) || 0;
      const cap = FAMILY_WEIGHT_CAPS[w.evidenceFamily] || 0.30;
      if (total > cap && total > 0) {
        w.effectiveWeight = Number((w.effectiveWeight * (cap / total)).toFixed(6));
      }
    }
  }

  private static getProbabilities(
    name: string, dlPreds: ModelExpertPrediction[],
    quantSignals: QuantExpertSignal[],
    nlpSentiment: { score: number; confidence: number; classification: string }
  ): ProbabilityDistribution | null {
    const dlPred = dlPreds.find(p => p.modelName === name);
    if (dlPred) return dlPred.probabilities;
    const qs = quantSignals.find(q => q.strategyId === name);
    if (qs) return this.quantSignalToProbabilities(qs);
    if (name === "FINANCIAL_NLP") return this.nlpToProbabilities(nlpSentiment);
    return null;
  }

  private static quantSignalToProbabilities(qs: QuantExpertSignal): ProbabilityDistribution {
    const conf = Math.min(1.0, Math.max(0.0, qs.confidence));
    const remainder = 1.0 - conf;
    if (qs.direction === "LONG") return { LONG: conf, SHORT: remainder * 0.3, HOLD: remainder * 0.7 };
    if (qs.direction === "SHORT") return { LONG: remainder * 0.3, SHORT: conf, HOLD: remainder * 0.7 };
    return { LONG: remainder * 0.5, SHORT: remainder * 0.5, HOLD: conf };
  }

  private static nlpToProbabilities(nlp: { score: number; confidence: number; classification: string }): ProbabilityDistribution {
    const s = Math.min(1.0, Math.max(-1.0, nlp.score));
    if (s > 0.1) {
      const bullProb = Math.min(0.85, 0.5 + s * 0.3);
      return { LONG: bullProb, SHORT: (1 - bullProb) * 0.4, HOLD: (1 - bullProb) * 0.6 };
    } else if (s < -0.1) {
      const bearProb = Math.min(0.85, 0.5 + Math.abs(s) * 0.3);
      return { LONG: (1 - bearProb) * 0.4, SHORT: bearProb, HOLD: (1 - bearProb) * 0.6 };
    }
    return { LONG: 0.3, SHORT: 0.3, HOLD: 0.4 };
  }

  private static computeModelAgreement(
    weights: ModelWeightBreakdown[], dlPreds: ModelExpertPrediction[],
    quantSignals: QuantExpertSignal[],
    nlpSentiment: { score: number; confidence: number; classification: string },
    ensembleDirection: "LONG" | "SHORT" | "HOLD"
  ): number {
    let agreementSum = 0;
    let totalWeight = 0;
    for (const mw of weights) {
      if (mw.normalizedWeight <= 0) continue;
      const probs = this.getProbabilities(mw.modelName, dlPreds, quantSignals, nlpSentiment);
      if (!probs) continue;
      let dirProb = 0;
      if (ensembleDirection === "LONG") dirProb = probs.LONG;
      else if (ensembleDirection === "SHORT") dirProb = probs.SHORT;
      else dirProb = probs.HOLD;
      agreementSum += mw.normalizedWeight * dirProb;
      totalWeight += mw.normalizedWeight;
    }
    if (totalWeight <= 0) return 0;
    return Number(Math.min(1.0, Math.max(0.0, agreementSum / totalWeight)).toFixed(4));
  }

  private static getRegimeUncertaintyPenalty(regime: AnyRegime): number {
    const r = String(regime || "");
    if (r === "CRISIS" || r === "WEATHER_STRESS") return 0.40;
    if (r === "HIGH_VOLATILITY") return 0.30;
    if (r === "TRANSITION" || r === "BREAKOUT") return 0.20;
    if (r.includes("TRENDING")) return 0.10;
    if (r === "RANGING" || r === "SIDEWAYS") return 0.25;
    return 0.20;
  }

  private static computeExpectedValue(
    direction: "LONG" | "SHORT" | "HOLD",
    buyProb: number, sellProb: number, holdProb: number,
    params: EVGateParams
  ): { expectedValue: number; expectedGain: number; expectedLoss: number; fees: number; slippage: number; evPassesGate: boolean } {
    if (direction === "HOLD") {
      return { expectedValue: 0, expectedGain: 0, expectedLoss: 0, fees: 0, slippage: 0, evPassesGate: false };
    }
    const tpMult = params.tpMultiplier ?? 2.0;
    const slMult = params.slMultiplier ?? 1.5;
    const fees = params.feePercent ?? 0.10;
    const slippage = params.slippagePercent ?? 0.05;
    const marketImpact = params.marketImpactPercent ?? 0.02;
    const spread = params.spreadPercent ?? 0.03;

    const expectedGain = params.atrPercent * tpMult;
    const expectedLoss = params.atrPercent * slMult;

    let pWin: number, pLoss: number;
    if (direction === "LONG") { pWin = buyProb; pLoss = sellProb; }
    else { pWin = sellProb; pLoss = buyProb; }

    const totalFriction = fees + slippage + marketImpact + spread;
    const ev = (pWin * expectedGain) - (pLoss * expectedLoss) - totalFriction;

    return {
      expectedValue: Number(ev.toFixed(4)),
      expectedGain: Number(expectedGain.toFixed(4)),
      expectedLoss: Number(expectedLoss.toFixed(4)),
      fees: Number(fees.toFixed(4)),
      slippage: Number((slippage + marketImpact + spread).toFixed(4)),
      evPassesGate: ev > 0
    };
  }

  private static computeAdaptiveThreshold(
    regime: AnyRegime,
    uncertainty: number,
    params: EVGateParams,
    totalWeight: number
  ): number {
    const baseThreshold = 0.54;
    const uncertaintyPenalty = uncertainty * 0.12;
    const costPenalty = Math.min(0.08, ((params.feePercent || 0.1) + (params.slippagePercent || 0.05)) * 0.2);
    const rStr = String(regime || "");
    const regimeRiskPenalty = (rStr === "CRISIS" || rStr === "HIGH_VOLATILITY") ? 0.08 : 0.0;
    const reliabilityDiscount = Math.min(0.04, totalWeight * 0.05);

    const threshold = baseThreshold + uncertaintyPenalty + costPenalty + regimeRiskPenalty - reliabilityDiscount;
    return Number(Math.min(0.85, Math.max(0.52, threshold)).toFixed(4));
  }

  private static computeTradeQuality(
    calibratedProbability: number,
    agreement: number,
    confidence: number,
    ev: number,
    regime: AnyRegime,
    uncertainty: number,
    friction: number
  ): { tradeQualityScore: number; tradeQualityTier: TradeQualityTier } {
    const pScore = Math.min(1.0, Math.max(0.0, calibratedProbability));
    const agrScore = Math.min(1.0, Math.max(0.0, agreement));
    const confScore = Math.min(1.0, Math.max(0.0, confidence));
    const evScore = ev > 0 ? Math.min(1.0, ev / 2.0) : 0.0;
    const regScore = (1 - this.getRegimeUncertaintyPenalty(regime));
    const costPenalty = Math.min(0.20, friction * 0.5);

    const rawQuality =
      (0.30 * pScore) +
      (0.20 * agrScore) +
      (0.15 * confScore) +
      (0.15 * evScore) +
      (0.10 * regScore) -
      (0.10 * uncertainty) -
      costPenalty;

    const tradeQualityScore = Number(Math.min(1.0, Math.max(0.0, rawQuality)).toFixed(4));

    let tradeQualityTier: TradeQualityTier = "NO_TRADE";
    if (tradeQualityScore >= 0.90) tradeQualityTier = "EXTREME_CONVICTION";
    else if (tradeQualityScore >= 0.75) tradeQualityTier = "HIGH_CONVICTION";
    else if (tradeQualityScore >= 0.60) tradeQualityTier = "VALID_CANDIDATE";
    else if (tradeQualityScore >= 0.40) tradeQualityTier = "WEAK_HOLD";
    else tradeQualityTier = "NO_TRADE";

    return { tradeQualityScore, tradeQualityTier };
  }

  /**
   * Calibrates raw model probability distribution with Dynamic Regime Temperature Scaling.
   * T > 1.0 smooths probabilities (reduces overconfidence in high-volatility/noisy markets).
   * T < 1.0 sharpens probabilities (enhances conviction in low-noise strong trends).
   */
  public static calibrateProbabilities(
    probs: ProbabilityDistribution,
    regime: AnyRegime
  ): ProbabilityDistribution {
    let temp = 1.0;
    const rStr = String(regime || "RANGING");
    switch (rStr) {
      case "TRENDING_BULL":
      case "TRENDING_BEAR":
      case "BREAKOUT_VOLATILE":
        temp = 0.90; // Sharp conviction in clear trends
        break;
      case "HIGH_VOLATILITY":
      case "CRISIS":
        temp = 1.35; // Expand temperature to prevent overconfidence in noise
        break;
      case "RANGING":
      case "ACCUMULATION":
      case "DISTRIBUTION":
        temp = 1.15; // Moderate smoothing
        break;
      default:
        temp = 1.0;
    }

    const eps = 1e-6;
    const zLong = Math.log(Math.max(eps, probs.LONG)) / temp;
    const zShort = Math.log(Math.max(eps, probs.SHORT)) / temp;
    const zHold = Math.log(Math.max(eps, probs.HOLD)) / temp;

    const maxZ = Math.max(zLong, zShort, zHold);
    const expLong = Math.exp(zLong - maxZ);
    const expShort = Math.exp(zShort - maxZ);
    const expHold = Math.exp(zHold - maxZ);
    const sumExp = expLong + expShort + expHold;

    return {
      LONG: Number((expLong / sumExp).toFixed(6)),
      SHORT: Number((expShort / sumExp).toFixed(6)),
      HOLD: Number((expHold / sumExp).toFixed(6)),
    };
  }

  private static buildDecisionReason(
    direction: string, buyProb: number, sellProb: number, holdProb: number,
    agreement: number, confidence: number, ev: number, evPasses: boolean,
    qualityScore: number, qualityTier: TradeQualityTier,
    totalModels: number, eligibleModels: number
  ): string {
    const parts: string[] = [];
    parts.push("ENSEMBLE_FUSION: " + direction);
    parts.push("P(BUY)=" + buyProb.toFixed(3) + " P(HOLD)=" + holdProb.toFixed(3) + " P(SELL)=" + sellProb.toFixed(3));
    parts.push("Agreement=" + (agreement * 100).toFixed(1) + "%");
    parts.push("Confidence=" + (confidence * 100).toFixed(1) + "%");
    parts.push("Quality=" + qualityScore.toFixed(3) + " (" + qualityTier + ")");
    parts.push("EV=" + ev.toFixed(4) + "% (" + (evPasses ? "PASS" : "BLOCKED") + ")");
    parts.push("Models=" + eligibleModels + "/" + totalModels);
    return parts.join(" | ");
  }
}
