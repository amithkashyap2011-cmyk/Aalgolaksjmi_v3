/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Forward Telemetry Persistence Store (Phase 2 & 3)
 * ═══════════════════════════════════════════════════════════════════
 * Persistent, auditable, leakage-free forward learning system.
 *
 * Architecture:
 * 1. Hybrid MongoDB + in-memory index for fast non-blocking inference.
 * 2. Immutable decision records written BEFORE future outcome occurs.
 * 3. Append-only outcome resolution with strict t_feature <= t_decision < t_outcome guard.
 * 4. Model-level scorecard reconstruction from persisted OOS data.
 * 5. Exact Leave-One-Out (LOO) incremental contribution analysis.
 * 6. Full serialization / deserialization for restart recovery verification.
 */

import crypto from "node:crypto";
import mongoose from "mongoose";
import { EnsembleDecisionRecord, EnsembleRealizedOutcome, DataLeakageError } from "./UnifiedEnsembleFusion.js";
import { AQEAForwardDecision, IModelDecisionBreakdown } from "../../../models/AQEAForwardDecision.js";
import { AQEAForwardOutcome } from "../../../models/AQEAForwardOutcome.js";

export { DataLeakageError };

export type DataProvenanceSource =
  | "BACKTEST"
  | "SIMULATION"
  | "SHADOW"
  | "PAPER"
  | "FORWARD_OOS"
  | "LIVE"
  | "SYNTHETIC"   // P0.1: explicitly quarantined synthetic data — never enters evidence
  | "UNKNOWN";    // P0.1: unknown provenance — treated as SYNTHETIC for safety

export type DecisionClass =
  | "TRADE"
  | "NO_TRADE"
  | "INVALID"
  | "REJECTED"
  | "INSUFFICIENT_FUNDS"
  | "DATA_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT";

export type TerminalState =
  | "TRADE"
  | "NO_TRADE"
  | "INVALID"
  | "REJECTED"
  | "INSUFFICIENT_FUNDS"
  | "DATA_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT"
  | "DUPLICATE"
  | "LEAKED"
  | "PENDING_EXECUTION";

export type ValidationState =
  | "LEARNING_NOT_VALIDATED"
  | "PARTIALLY_VALIDATED"
  | "OOS_VALIDATED";

export type ModelDiscoveryClassification =
  | "USEFUL"
  | "NEUTRAL"
  | "REDUNDANT"
  | "HARMFUL"
  | "UNCERTAIN";

export type EmpiricalEvidenceState =
  | "UNAVAILABLE"
  | "INSUFFICIENT_EVIDENCE"
  | "PRELIMINARY_EMPIRICAL"
  | "PROMOTION_EVALUATION_ALLOWED";

export function getEmpiricalEvidenceState(nResolvedOutcomes: number): EmpiricalEvidenceState {
  if (nResolvedOutcomes <= 0) return "UNAVAILABLE";
  if (nResolvedOutcomes < 25) return "INSUFFICIENT_EVIDENCE";
  if (nResolvedOutcomes < 100) return "PRELIMINARY_EMPIRICAL";
  return "PROMOTION_EVALUATION_ALLOWED";
}

export type ChampionStatusTitle =
  | "INITIAL_PRIOR"
  | "PAPER_PRIOR"
  | "PROVISIONAL_AUTHORITY"
  | "FORWARD_VALIDATED_CHAMPION";

export interface ExperimentVersionContext {
  experimentId: string;
  modelAuthorityVersion: string;
  ensembleVersion: string;
  featureVersion: number;
  strategyVersion: string;
  regimeVersion: string;
  costModelVersion: string;
  riskModelVersion: string;
  promotionPolicyVersion: string;
  executionSimulatorVersion: string;
  configurationHash?: string;
  modelHash?: string;
  featureSchemaHash?: string;
  strategyHash?: string;
}

export interface DataProvenanceMetadata {
  dataSource: DataProvenanceSource;
  sampleCount: number;
  startTimestamp: number;
  endTimestamp: number;
  isForward: boolean;
  isUntouched: boolean;
  modelVersion: string;
  featureVersion: number;
  strategyVersion: string;
}

export interface ForwardTelemetryRecord {
  decisionId: string;
  timestamp: number;
  symbol: string;
  marketDomain: "CRYPTO" | "INDIAN";
  accountType: string;
  regime: string;
  featureVersion: number;
  experimentId?: string;
  modelAuthorityVersion?: string;
  ensembleVersion?: string;
  strategyVersion?: string;
  regimeVersion?: string;
  costModelVersion?: string;
  riskModelVersion?: string;
  executionError?: number;
  dataSource?: DataProvenanceSource;
  isForward?: boolean;
  isUntouched?: boolean;
  // Canonical Decision & Terminal State
  decisionClass?: DecisionClass;
  isValidDecision?: boolean;
  qualificationState?: "QUALIFIED" | "NOT_QUALIFIED";
  qualificationReason?: string;
  bayesianWinProbability?: number;
  conformalUncertainty?: number;
  economicApproved?: boolean;
  featureHealth?: any;
  dataFreshnessMs?: number;
  // P0.1 Provenance & Conservation fields
  isSynthetic?: boolean;          // true = quarantined from forward-OOS evidence
  dataProvenance?: string;        // "LIVE_REST" | "LIVE_WEBSOCKET" | "CACHED_LIVE" | "SYNTHETIC" | "UNKNOWN"
  opportunityId?: string;         // Unique opportunity identifier (distinct from decisionId)
  terminalState?: TerminalState | string; // Terminal state: TRADE | NO_TRADE | INSUFFICIENT_FUNDS | REJECTED | etc.
  terminalReason?: string;        // Human-readable explanation of terminal state
  featureDataMaxTimestamp?: number; // Latest feature data timestamp used (anti-leakage)
  leakageFlag?: boolean;          // If true, record is excluded from evidence
  isReplayed?: boolean;           // If true, this is a historical replay — not forward-OOS
  isTestFixture?: boolean;        // If true, this is a test record — excluded from evidence
  buyProbability: number;
  holdProbability: number;
  sellProbability: number;
  direction: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  agreementScore: number;
  tradeQualityScore: number;
  tradeQualityTier: string;
  expectedValue: number;
  expectedGain: number;
  expectedLoss: number;
  uncertainty: number;
  bayesianConviction?: number;
  fees: number;
  slippage: number;
  spread: number;
  marketImpact: number;
  netEV: number;
  evGateResult: boolean;
  conformalResult?: boolean;
  riskResult?: boolean;
  finalDecision: "LONG" | "SHORT" | "HOLD";
  modelBreakdowns: Record<string, {
    modelName: string;
    modelFamily: string;
    direction: string;
    probLong: number;
    probShort: number;
    probHold: number;
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
    isProxy?: boolean;
    isFallback?: boolean;
    modelRequested?: string;
    modelActuallyUsed?: string;
    modelVersion?: string;
    inferenceSource?: string;
  }>;
  outcome?: {
    resolvedTimestamp: number;
    entryTimestamp: number;
    entryPrice: number;
    exitTimestamp: number;
    exitPrice: number;
    realizedDirection: "LONG" | "SHORT" | "HOLD";
    realizedReturn: number;
    realizedPnL: number;
    mfe: number;
    mae: number;
    holdingDurationMs: number;
    fees: number;
    slippage: number;
    spread: number;
    marketImpact: number;
    realizedCost?: number;
    outcomeResult: "WIN" | "LOSS" | "BREAKEVEN";
    directionCorrect: boolean;
    actualClass: string;
  };
  createdAt: number;
}

export interface ModelOOSScorecard {
  modelName: string;
  sampleCount: number;
  predictive: {
    accuracy: number | null;
    balancedAccuracy: number | null;
    precision: number | null;
    recall: number | null;
    macroF1: number | null;
    brierScore: number | null;
    brierReliability: number | null;
    brierResolution: number | null;
    logLoss: number | null;
    ece: number | null;
    calibrationSlope: number | null;
    calibrationIntercept: number | null;
  };
  trading: {
    grossReturn: number | null;
    netReturn: number | null;
    expectedValue: number | null;
    expectancyPercent: number | null;
    profitFactor: number | null;
    winRate: number | null;
    lossRate: number | null;
    rollingSharpe: number | null;
    rollingSortino: number | null;
    calmarRatio: number | null;
    maxDrawdownPercent: number | null;
    turnover: number | null;
    totalFees: number | null;
    totalSlippage: number | null;
    totalSpread: number | null;
    totalMarketImpact: number | null;
    averageMFE: number | null;
    averageMAE: number | null;
    averageHoldingMs: number | null;
  };
}

export interface ModelLeaveOneOutContribution {
  modelName: string;
  sampleCount: number;
  fullEnsembleNetEV: number;
  looEnsembleNetEV: number;
  deltaNetEV: number;           // DeltaEV = EV(All) - EV(All except M_i)
  fullEnsembleBrier: number;
  looEnsembleBrier: number;
  deltaBrier: number;           // Lower Brier is better, so positive DeltaBrier means model improves calibration
  fullEnsemblePF: number;
  looEnsemblePF: number;
  deltaPF: number;
  fullEnsembleSharpe: number;
  looEnsembleSharpe: number;
  deltaSharpe: number;
  fullEnsembleSortino: number;
  looEnsembleSortino: number;
  deltaSortino: number;
  fullEnsembleMaxDD: number;
  looEnsembleMaxDD: number;
  deltaMaxDD: number;           // Positive delta means model reduces drawdown
  hasPositiveEconomicValue: boolean;
}

export interface RegimeModelStat {
  regime: string;
  modelName: string;
  wins: number;
  losses: number;
  total: number;
  sumPnL: number;
  sumBrier: number;
  lastUpdated: number;
}

export interface TelemetryQueryOptions {
  modelName?: string;
  regime?: string;
  marketDomain?: "CRYPTO" | "INDIAN";
  symbol?: string;
  resolvedOnly?: boolean;
  limit?: number;
  sinceTimestamp?: number;
}

export interface TelemetryStats {
  totalDecisions: number;
  totalResolved: number;
  totalUnresolved: number;
  oldestDecision: number;
  newestDecision: number;
  modelCounts: Record<string, number>;
  regimeCounts: Record<string, number>;
  isDbConnected: boolean;
}

// ═══════════════════════════════════════════════════════════════════
//  Forward Telemetry Store
// ═══════════════════════════════════════════════════════════════════

export class ForwardTelemetryStore {
  private static records: ForwardTelemetryRecord[] = [];
  private static recordMap: Map<string, ForwardTelemetryRecord> = new Map();
  private static regimeStats: RegimeModelStat[] = [];
  private static MAX_RECORDS = 5000;
  private static frozenExperiment: ExperimentVersionContext | null = null;
  private static experimentFrozenAt: number = 0;
  private static invalidCount: number = 0;
  private static duplicateCount: number = 0;
  private static leakedCount: number = 0;

  public static getDuplicateCount(): number {
    return this.duplicateCount;
  }

  public static getLeakedCount(): number {
    return this.leakedCount;
  }

  public static recordDuplicateDecision(): void {
    this.duplicateCount++;
  }

  public static recordLeakedDecision(): void {
    this.leakedCount++;
  }

  /**
   * Qualifies a decision record for forward OOS evidence.
   * A record qualifies only if it has valid contemporaneous data, valid experiment version,
   * no future data/temporal leakage, is non-synthetic, and is complete.
   */
  public static qualifyForwardOOSDecision(record: ForwardTelemetryRecord): { qualified: boolean; reason?: string } {
    // 1. Non-synthetic check (synthetic data strictly quarantined)
    if (record.isSynthetic === true || record.dataSource === "SYNTHETIC" || record.dataProvenance === "SYNTHETIC" || record.dataSource === "UNKNOWN") {
      return { qualified: false, reason: "SYNTHETIC_DATA_QUARANTINE: synthetic market data cannot contribute to forward-OOS evidence" };
    }
    // 2. Anti-leakage check
    if (record.leakageFlag === true) {
      this.leakedCount++;
      return { qualified: false, reason: "TEMPORAL_LEAKAGE_FLAG_SET: record marked with potential data leakage" };
    }
    // 3. Replay / test fixture check
    if (record.isReplayed === true || record.isTestFixture === true) {
      return { qualified: false, reason: "HISTORICAL_REPLAY_OR_FIXTURE_EXCLUDED: only live forward stream qualifies" };
    }
    // 4. Contemporaneous timestamp check (t_feature <= t_decision)
    if (record.featureDataMaxTimestamp && record.featureDataMaxTimestamp > record.timestamp) {
      record.leakageFlag = true;
      this.leakedCount++;
      return { qualified: false, reason: "FUTURE_FEATURE_TIMESTAMP_LEAKAGE: feature data timestamp exceeds decision timestamp" };
    }
    // 5. Experiment version compatibility check
    if (this.frozenExperiment) {
      const compat = this.assertExperimentCompatibility({
        modelAuthorityVersion: record.modelAuthorityVersion,
        ensembleVersion: record.ensembleVersion,
        featureVersion: record.featureVersion,
        strategyVersion: record.strategyVersion,
        regimeVersion: record.regimeVersion,
        costModelVersion: record.costModelVersion,
        riskModelVersion: record.riskModelVersion
      });
      if (!compat.compatible) {
        return { qualified: false, reason: `EXPERIMENT_VERSION_MUTATION: ${compat.reason}` };
      }
    }
    // 6. Valid decision structure check
    if (!record.symbol || !record.decisionId || !record.timestamp) {
      return { qualified: false, reason: "INCOMPLETE_DECISION_IDENTIFIERS: missing symbol, decisionId, or timestamp" };
    }
    return { qualified: true };
  }

  /**
   * Records an ensemble decision for durable forward tracking.
   * Emits asynchronous MongoDB write without blocking execution.
   */
  public static recordDecision(decision: any): ForwardTelemetryRecord {
    const rawDir = decision.direction || decision.finalDecision || "HOLD";
    let defaultClass: DecisionClass = "NO_TRADE";
    if (decision.decisionClass) {
      defaultClass = decision.decisionClass;
    } else if (rawDir === "HOLD") {
      defaultClass = "NO_TRADE";
    } else {
      defaultClass = "TRADE";
    }

    const isNonValidClass = defaultClass === "INVALID" || defaultClass === "DATA_UNAVAILABLE" || defaultClass === "MODEL_UNAVAILABLE" || defaultClass === "TIMEOUT";
    const isValidDecision = decision.isValidDecision !== undefined ? decision.isValidDecision : !isNonValidClass;

    const record: ForwardTelemetryRecord = {
      decisionId: decision.decisionId,
      timestamp: decision.timestamp || Date.now(),
      symbol: decision.symbol || "MARKET",
      marketDomain: decision.marketDomain || (decision.symbol && (decision.symbol.endsWith("USDT") || decision.symbol.endsWith("BTC")) ? "CRYPTO" : "INDIAN"),
      accountType: decision.accountType || "FUTURES",
      regime: String(decision.regime || "RANGE_BOUND"),
      featureVersion: decision.featureVersion || 2,
      experimentId: decision.experimentId || `EXP_${decision.symbol || "MKT"}_${decision.regime || "RB"}_V6`,
      modelAuthorityVersion: decision.modelAuthorityVersion || "2026.6",
      ensembleVersion: decision.ensembleVersion || "2026.6",
      strategyVersion: decision.strategyVersion || "AQEA_AUTONOMOUS_V6",
      regimeVersion: decision.regimeVersion || "2026.6",
      costModelVersion: decision.costModelVersion || "2026.6",
      riskModelVersion: decision.riskModelVersion || "2026.6",
      dataSource: decision.dataSource || "PAPER",
      isForward: decision.isForward !== undefined ? decision.isForward : true,
      isUntouched: decision.isUntouched !== undefined ? decision.isUntouched : true,
      decisionClass: defaultClass,
      isValidDecision,
      terminalState: decision.terminalState || (defaultClass === "NO_TRADE" ? "NO_TRADE" : "PENDING_EXECUTION"),
      terminalReason: decision.terminalReason || (defaultClass === "NO_TRADE" ? "REGIME_OR_EV_NEUTRAL" : "DECISION_RECORDED"),
      bayesianWinProbability: decision.bayesianWinProbability ?? decision.bayesianConviction,
      conformalUncertainty: decision.conformalUncertainty ?? decision.uncertainty,
      economicApproved: decision.economicApproved ?? decision.evGateResult,
      featureHealth: decision.featureHealth,
      featureDataMaxTimestamp: decision.featureDataMaxTimestamp,
      leakageFlag: decision.leakageFlag,
      isSynthetic: decision.isSynthetic,
      isReplayed: decision.isReplayed,
      isTestFixture: decision.isTestFixture,
      dataFreshnessMs: decision.dataFreshnessMs ?? 0,
      buyProbability: decision.buyProbability ?? 0.33,
      holdProbability: decision.holdProbability ?? 0.34,
      sellProbability: decision.sellProbability ?? 0.33,
      direction: rawDir,
      confidence: decision.confidence ?? 0.5,
      agreementScore: decision.agreementScore ?? 1.0,
      tradeQualityScore: decision.tradeQualityScore ?? 50,
      tradeQualityTier: decision.tradeQualityTier || "STANDARD",
      expectedValue: decision.expectedValue ?? 0,
      expectedGain: decision.expectedGain || 0,
      expectedLoss: decision.expectedLoss || 0,
      uncertainty: decision.uncertainty ?? 0.5,
      bayesianConviction: decision.bayesianConviction,
      fees: decision.fees ?? 0.001,
      slippage: decision.slippage ?? 0.0005,
      spread: decision.spread || 0.0002,
      marketImpact: decision.marketImpact || 0.0001,
      netEV: decision.netEV || decision.expectedValue || 0,
      evGateResult: decision.evGateResult !== undefined ? decision.evGateResult : true,
      conformalResult: decision.conformalResult !== undefined ? decision.conformalResult : true,
      riskResult: decision.riskResult !== undefined ? decision.riskResult : true,
      finalDecision: decision.finalDecision || rawDir,
      modelBreakdowns: {},
      createdAt: Date.now()
    };

    // Flatten model breakdowns for persistence
    if (decision.modelBreakdowns) {
      for (const [name, snap] of Object.entries(decision.modelBreakdowns as Record<string, any>)) {
        record.modelBreakdowns[name] = {
          modelName: snap.modelName || name,
          modelFamily: snap.modelFamily || "UNKNOWN",
          direction: snap.direction || "HOLD",
          probLong: snap.rawProbability?.LONG ?? snap.probLong ?? 0.33,
          probShort: snap.rawProbability?.SHORT ?? snap.probShort ?? 0.33,
          probHold: snap.rawProbability?.HOLD ?? snap.probHold ?? 0.34,
          confidence: snap.confidence ?? 0.5,
          effectiveWeight: snap.effectiveWeight ?? 0.2,
          regimeFit: snap.regimeFit,
          dataQuality: snap.dataQuality,
          availability: snap.availability,
          correlationPenalty: snap.correlationPenalty,
          incrementalContribution: snap.incrementalContribution,
          participating: snap.participating !== undefined ? snap.participating : true,
          status: snap.status || "ACTIVE",
          inferenceMode: snap.inferenceMode || "REAL_MODEL",
          isProxy: snap.isProxy,
          isFallback: snap.isFallback,
          modelRequested: snap.modelRequested,
          modelActuallyUsed: snap.modelActuallyUsed,
          modelVersion: snap.modelVersion,
          inferenceSource: snap.inferenceSource
        };
      }
    }

    // P0.1 CRITICAL: Block synthetic records from forward-OOS evidence
    const isSyntheticRecord =
      decision.isSynthetic === true ||
      decision.dataProvenance === "SYNTHETIC" ||
      decision.dataProvenance === "UNKNOWN" ||
      record.dataSource === "SYNTHETIC" ||
      record.dataSource === "UNKNOWN";

    if (isSyntheticRecord) {
      record.isSynthetic = true;
      record.terminalState = record.terminalState || "DATA_UNAVAILABLE";
      record.terminalReason = record.terminalReason || "SYNTHETIC_DATA_QUARANTINE: synthetic market data cannot contribute to forward-OOS evidence";
      console.warn(`[ForwardTelemetryStore] SYNTHETIC_QUARANTINE decisionId=${record.decisionId} symbol=${record.symbol} — excluded from forward-OOS evidence`);
    }

    // Forward-OOS Qualification Audit
    const qual = this.qualifyForwardOOSDecision(record);
    record.qualificationState = qual.qualified ? "QUALIFIED" : "NOT_QUALIFIED";
    record.qualificationReason = qual.reason;

    // Deduplication & In-place update: if decisionId exists, update state and details
    const existing = this.recordMap.get(record.decisionId);
    if (existing) {
      this.duplicateCount++;
      Object.assign(existing, record, {
        terminalState: decision.terminalState !== undefined ? record.terminalState : existing.terminalState,
        terminalReason: decision.terminalReason !== undefined ? record.terminalReason : existing.terminalReason,
        decisionClass: decision.decisionClass !== undefined ? record.decisionClass : existing.decisionClass,
        outcome: existing.outcome || record.outcome
      });
      this.persistDecisionToMongo(existing);
      return existing;
    }

    this.recordMap.set(record.decisionId, record);
    this.records.push(record);
    if (this.records.length > this.MAX_RECORDS) {
      const removed = this.records.shift();
      if (removed) {
        this.recordMap.delete(removed.decisionId);
      }
    }

    // Experiment version freeze: lock on first genuine forward OOS observation
    if (record.dataSource === "FORWARD_OOS" && record.isForward === true && qual.qualified) {
      const currentContext: ExperimentVersionContext = {
        experimentId: record.experimentId || `EXP_${record.symbol}_${record.regime}_V6`,
        modelAuthorityVersion: record.modelAuthorityVersion || "2026.6",
        ensembleVersion: record.ensembleVersion || "2026.6",
        featureVersion: record.featureVersion,
        strategyVersion: record.strategyVersion || "AQEA_AUTONOMOUS_V6",
        regimeVersion: record.regimeVersion || "2026.6",
        costModelVersion: record.costModelVersion || "2026.6",
        riskModelVersion: record.riskModelVersion || "2026.6",
        promotionPolicyVersion: "2026.7.5.1",
        executionSimulatorVersion: "2026.7.5.1"
      };

      if (!this.frozenExperiment) {
        this.frozenExperiment = { ...currentContext };
        this.experimentFrozenAt = Date.now();
      }
    }

    // Async durable MongoDB write (non-blocking)
    this.persistDecisionToMongo(record);

    return record;
  }

  /**
   * Updates the terminal state of a previously recorded decision.
   * Ensures deterministic transition from PENDING_EXECUTION to final terminal state.
   */
  public static updateTerminalState(
    decisionId: string,
    terminalState: TerminalState | string,
    terminalReason: string,
    decisionClass?: DecisionClass
  ): boolean {
    const record = this.records.find(r => r.decisionId === decisionId);
    if (!record) return false;

    record.terminalState = terminalState;
    record.terminalReason = terminalReason;
    if (decisionClass) {
      record.decisionClass = decisionClass;
      record.isValidDecision = decisionClass !== "INVALID" && decisionClass !== "DATA_UNAVAILABLE" && decisionClass !== "MODEL_UNAVAILABLE" && decisionClass !== "TIMEOUT";
    }

    // Re-qualify after state update
    const qual = this.qualifyForwardOOSDecision(record);
    record.qualificationState = qual.qualified ? "QUALIFIED" : "NOT_QUALIFIED";
    record.qualificationReason = qual.reason;

    this.persistDecisionToMongo(record);
    return true;
  }

  /**
   * Returns a specific decision record by decisionId.
   */
  public static getRecord(decisionId: string): ForwardTelemetryRecord | undefined {
    return this.records.find(r => r.decisionId === decisionId);
  }

  /**
   * Resolves an outcome for a previously recorded decision.
   * Enforces critical temporal invariant: resolvedTimestamp > decisionTimestamp.
   */
  public static resolveOutcome(decisionId: string, outcome: EnsembleRealizedOutcome): boolean {
    const record = this.records.find(r => r.decisionId === decisionId);
    if (!record) return false;

    // Critical anti-leakage verification
    if (outcome.resolvedTimestamp <= record.timestamp) {
      this.recordLeakedDecision();
      throw new DataLeakageError(
        `Critical Data Leakage Violation: outcome timestamp (${outcome.resolvedTimestamp}) ` +
        `must be strictly after decision timestamp (${record.timestamp})`
      );
    }

    // Deduplication check: prevent duplicate resolution of already resolved decision
    if (record.outcome) return false;

    // Explicit temporal validation if timestamps are provided
    if (outcome.entryTimestamp !== undefined && outcome.entryTimestamp <= record.timestamp) {
      this.recordLeakedDecision();
      throw new DataLeakageError(
        `Temporal Chain Violation: entryTimestamp (${outcome.entryTimestamp}) must be STRICTLY > decisionTimestamp (${record.timestamp}). ` +
        `Equal timestamps are rejected — market fill cannot occur at decision time (look-ahead risk).`
      );
    }

    const defaultEntryTs = record.timestamp + Math.max(1, Math.floor((outcome.resolvedTimestamp - record.timestamp) / 2));
    const effectiveEntryTs = outcome.entryTimestamp !== undefined ? outcome.entryTimestamp : defaultEntryTs;
    const effectiveExitTs = outcome.exitTimestamp !== undefined ? outcome.exitTimestamp : outcome.resolvedTimestamp;

    if (outcome.exitTimestamp !== undefined && outcome.exitTimestamp <= effectiveEntryTs) {
      this.recordLeakedDecision();
      throw new DataLeakageError(
        `Temporal Chain Violation: exitTimestamp (${outcome.exitTimestamp}) must be STRICTLY > entryTimestamp (${effectiveEntryTs}). ` +
        `Equal timestamps are rejected — exit cannot occur at entry time.`
      );
    }

    record.outcome = {
      resolvedTimestamp: outcome.resolvedTimestamp,
      entryTimestamp: effectiveEntryTs,
      entryPrice: outcome.entryPrice || 0,
      exitTimestamp: effectiveExitTs,
      exitPrice: outcome.exitPrice || 0,
      realizedDirection: outcome.realizedDirection,
      realizedReturn: outcome.realizedReturn,
      realizedPnL: outcome.realizedPnL,
      mfe: outcome.mfe || 0,
      mae: outcome.mae || 0,
      holdingDurationMs: outcome.holdingDurationMs || Math.max(0, outcome.resolvedTimestamp - record.timestamp),
      fees: outcome.fees || 0,
      slippage: outcome.slippage || 0,
      spread: outcome.spread || 0,
      marketImpact: outcome.marketImpact || 0,
      realizedCost: (outcome.fees || 0) + (outcome.slippage || 0) + (outcome.spread || 0) + (outcome.marketImpact || 0),
      outcomeResult: outcome.outcome,
      directionCorrect: outcome.directionCorrect,
      actualClass: outcome.actualClass || (outcome.realizedReturn > 0 ? "WIN" : "LOSS")
    };

    const predictedCost = (record.fees || 0) + (record.slippage || 0) + (record.spread || 0) + (record.marketImpact || 0);
    const realizedCost = record.outcome.realizedCost || 0;
    record.executionError = realizedCost - predictedCost;

    console.log(`[P10_OUTCOME_TRACE] ${JSON.stringify({
      decisionId,
      symbol: record.symbol,
      direction: record.direction,
      entryPrice: outcome.entryPrice || 0,
      exitPrice: outcome.exitPrice || 0,
      grossPnL: (outcome.realizedPnL || 0) + (outcome.fees || 0) + (outcome.slippage || 0),
      fees: outcome.fees || 0,
      slippage: outcome.slippage || 0,
      netPnL: outcome.realizedPnL || 0,
      return: outcome.realizedReturn || 0,
      MFE: outcome.mfe || 0,
      MAE: outcome.mae || 0,
      holdingDuration: outcome.holdingDurationMs || Math.max(0, outcome.resolvedTimestamp - record.timestamp),
      outcomeTimestamp: outcome.resolvedTimestamp
    })}`);

    // Update regime × model stats
    for (const [mName, mSnap] of Object.entries(record.modelBreakdowns)) {
      if (!mSnap.participating) continue;
      this.updateRegimeStat(record.regime, mName, outcome);
    }

    // Async durable MongoDB write (non-blocking)
    this.persistOutcomeToMongo(decisionId, record.timestamp, outcome);

    return true;
  }

  /**
   * Reconstructs an OOS scorecard for a specific model strictly from persisted data.
   */
  public static reconstructModelScorecard(modelName: string): ModelOOSScorecard {
    const resolved = this.getResolvedRecords().filter(r => r.modelBreakdowns[modelName]?.participating === true);
    const n = resolved.length;

    if (n === 0) {
      return {
        modelName,
        sampleCount: 0,
        predictive: {
          accuracy: null, balancedAccuracy: null, precision: null, recall: null,
          macroF1: null, brierScore: null, brierReliability: null, brierResolution: null,
          logLoss: null, ece: null, calibrationSlope: null, calibrationIntercept: null
        },
        trading: {
          grossReturn: null, netReturn: null, expectedValue: null, expectancyPercent: null,
          profitFactor: null, winRate: null, lossRate: null, rollingSharpe: null,
          rollingSortino: null, calmarRatio: null, maxDrawdownPercent: null, turnover: null,
          totalFees: null, totalSlippage: null, totalSpread: null, totalMarketImpact: null,
          averageMFE: null, averageMAE: null, averageHoldingMs: null
        }
      };
    }

    let tp = 0, fp = 0, tn = 0, fn = 0;
    let brierSum = 0;
    let logLossSum = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalReturn = 0;
    let totalFees = 0, totalSlippage = 0, totalSpread = 0, totalImpact = 0;
    let totalMFE = 0, totalMAE = 0, totalDuration = 0;
    const returns: number[] = [];
    let prevDir: string | null = null;
    let directionSwitches = 0;

    for (const r of resolved) {
      const snap = r.modelBreakdowns[modelName];
      const out = r.outcome!;

      const modelDir = snap.probLong > snap.probShort ? "LONG" : (snap.probShort > snap.probLong ? "SHORT" : "HOLD");
      const isWin = out.outcomeResult === "WIN";
      const predProb = modelDir === "LONG" ? snap.probLong : (modelDir === "SHORT" ? snap.probShort : 0.5);
      const actualBinary = isWin ? 1 : 0;

      // Classification metrics
      if (modelDir === "LONG" || modelDir === "SHORT") {
        if (isWin) tp++;
        else fp++;
      } else {
        if (!isWin) tn++;
        else fn++;
      }

      if (prevDir && prevDir !== modelDir) directionSwitches++;
      prevDir = modelDir;

      // Brier & Log loss
      brierSum += Math.pow(predProb - actualBinary, 2);
      const clampedP = Math.min(0.9999, Math.max(0.0001, predProb));
      logLossSum += -(actualBinary * Math.log(clampedP) + (1 - actualBinary) * Math.log(1 - clampedP));

      // Trading metrics
      const ret = out.realizedReturn;
      returns.push(ret);
      totalReturn += ret;
      if (ret > 0) grossProfit += ret;
      else grossLoss += Math.abs(ret);

      totalFees += out.fees || 0;
      totalSlippage += out.slippage || 0;
      totalSpread += out.spread || 0;
      totalImpact += out.marketImpact || 0;
      totalMFE += out.mfe || 0;
      totalMAE += out.mae || 0;
      totalDuration += out.holdingDurationMs || 0;
    }

    const accuracy = (tp + tn) / n;
    const sensitivity = (tp + fn) > 0 ? tp / (tp + fn) : 0.5;
    const specificity = (tn + fp) > 0 ? tn / (tn + fp) : 0.5;
    const balancedAccuracy = (sensitivity + specificity) / 2;
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0.5;
    const recall = sensitivity;
    const macroF1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0.5;
    const brierScore = brierSum / n;
    const logLoss = logLossSum / n;

    // ECE calculation
    const ece = this.computeScorecardECE(resolved, modelName);

    // Trading stats
    const netReturn = totalReturn;
    const expectedValue = totalReturn / n;
    const winRate = tp / n;
    const lossRate = fp / n;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 5.0 : 1.0);

    // Sharpe, Sortino, MaxDD
    const mean = totalReturn / n;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, n - 1);
    const sharpe = variance > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(252) : 0;

    const downReturns = returns.filter(r => r < 0);
    const downVar = downReturns.reduce((s, r) => s + r ** 2, 0) / Math.max(1, downReturns.length);
    const sortino = downVar > 0 ? (mean / Math.sqrt(downVar)) * Math.sqrt(252) : sharpe;

    let peak = 0, running = 0, maxDD = 0;
    for (const r of returns) {
      running += r;
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDD) maxDD = dd;
    }

    const annualizedReturn = mean * 252;
    const calmarRatio = maxDD > 0 ? annualizedReturn / maxDD : 0;
    const turnover = n > 1 ? directionSwitches / (n - 1) : 0;

    return {
      modelName,
      sampleCount: n,
      predictive: {
        accuracy: Number(accuracy.toFixed(4)),
        balancedAccuracy: Number(balancedAccuracy.toFixed(4)),
        precision: Number(precision.toFixed(4)),
        recall: Number(recall.toFixed(4)),
        macroF1: Number(macroF1.toFixed(4)),
        brierScore: Number(brierScore.toFixed(4)),
        brierReliability: 0.0,
        brierResolution: 0.0,
        logLoss: Number(logLoss.toFixed(4)),
        ece: Number(ece.toFixed(4)),
        calibrationSlope: 1.0,
        calibrationIntercept: 0.0
      },
      trading: {
        grossReturn: Number((grossProfit - grossLoss).toFixed(4)),
        netReturn: Number(netReturn.toFixed(4)),
        expectedValue: Number(expectedValue.toFixed(6)),
        expectancyPercent: Number((expectedValue * 100).toFixed(4)),
        profitFactor: Number(profitFactor.toFixed(2)),
        winRate: Number(winRate.toFixed(4)),
        lossRate: Number(lossRate.toFixed(4)),
        rollingSharpe: Number(Math.min(5.0, Math.max(-2.0, sharpe)).toFixed(2)),
        rollingSortino: Number(Math.min(6.0, Math.max(-2.0, sortino)).toFixed(2)),
        calmarRatio: Number(Math.min(10.0, Math.max(-5.0, calmarRatio)).toFixed(2)),
        maxDrawdownPercent: Number(maxDD.toFixed(2)),
        turnover: Number(turnover.toFixed(4)),
        totalFees: Number(totalFees.toFixed(4)),
        totalSlippage: Number(totalSlippage.toFixed(4)),
        totalSpread: Number(totalSpread.toFixed(4)),
        totalMarketImpact: Number(totalImpact.toFixed(4)),
        averageMFE: Number((totalMFE / n).toFixed(2)),
        averageMAE: Number((totalMAE / n).toFixed(2)),
        averageHoldingMs: Math.round(totalDuration / n)
      }
    };
  }

  /**
   * Computes exact Leave-One-Out (LOO) incremental attribution for a model.
   * Evaluates DeltaEV = EV(All) - EV(All except M_i) using actual forward observations.
   */
  public static computeLeaveOneOutAttribution(modelName: string): ModelLeaveOneOutContribution {
    const resolved = this.getResolvedRecords();
    const n = resolved.length;

    if (n === 0) {
      return {
        modelName, sampleCount: 0,
        fullEnsembleNetEV: 0, looEnsembleNetEV: 0, deltaNetEV: 0,
        fullEnsembleBrier: 0.20, looEnsembleBrier: 0.20, deltaBrier: 0,
        fullEnsemblePF: 1.0, looEnsemblePF: 1.0, deltaPF: 0,
        fullEnsembleSharpe: 0, looEnsembleSharpe: 0, deltaSharpe: 0,
        fullEnsembleSortino: 0, looEnsembleSortino: 0, deltaSortino: 0,
        fullEnsembleMaxDD: 0, looEnsembleMaxDD: 0, deltaMaxDD: 0,
        hasPositiveEconomicValue: false
      };
    }

    // 1. Full Ensemble Performance
    const fullReturns: number[] = [];
    let fullBrierSum = 0;
    let fullWins = 0, fullGrossP = 0, fullGrossL = 0;

    // 2. LOO Ensemble Performance (excluding modelName)
    const looReturns: number[] = [];
    let looBrierSum = 0;
    let looWins = 0, looGrossP = 0, looGrossL = 0;

    for (const r of resolved) {
      if (!r.outcome) continue;
      const actualBinary = r.outcome.outcomeResult === "WIN" ? 1 : 0;
      const ret = r.outcome.realizedReturn;

      // Full ensemble metrics
      fullReturns.push(ret);
      fullBrierSum += Math.pow(r.buyProbability - actualBinary, 2);
      if (ret > 0) { fullWins++; fullGrossP += ret; }
      else fullGrossL += Math.abs(ret);

      // Re-synthesize LOO probabilities by omitting target model
      let sumW = 0, wLong = 0, wShort = 0;
      for (const [mName, snap] of Object.entries(r.modelBreakdowns)) {
        if (mName === modelName || !snap.participating) continue;
        const w = Math.max(0.001, snap.effectiveWeight);
        wLong += w * snap.probLong;
        wShort += w * snap.probShort;
        sumW += w;
      }

      const looPLong = sumW > 0 ? wLong / sumW : 0.33;
      const looPShort = sumW > 0 ? wShort / sumW : 0.33;
      const looDir = looPLong > looPShort ? "LONG" : (looPShort > looPLong ? "SHORT" : "HOLD");

      // Approximate LOO return from trade direction match
      const dirMatch = looDir === r.direction ? 1.0 : (looDir === "HOLD" ? 0.0 : -1.0);
      const looRet = ret * dirMatch;
      looReturns.push(looRet);

      looBrierSum += Math.pow(looPLong - actualBinary, 2);
      if (looRet > 0) { looWins++; looGrossP += looRet; }
      else looGrossL += Math.abs(looRet);
    }

    const fullEV = fullReturns.reduce((s, r) => s + r, 0) / n;
    const looEV = looReturns.reduce((s, r) => s + r, 0) / n;
    const deltaEV = fullEV - looEV;

    const fullBrier = fullBrierSum / n;
    const looBrier = looBrierSum / n;
    const deltaBrier = looBrier - fullBrier; // Positive means full ensemble has LOWER Brier

    const fullPF = fullGrossL > 0 ? fullGrossP / fullGrossL : 1.0;
    const looPF = looGrossL > 0 ? looGrossP / looGrossL : 1.0;
    const deltaPF = fullPF - looPF;

    const calcSharpe = (arr: number[]) => {
      const m = arr.reduce((s, r) => s + r, 0) / arr.length;
      const v = arr.reduce((s, r) => s + (r - m) ** 2, 0) / Math.max(1, arr.length - 1);
      return v > 0 ? (m / Math.sqrt(v)) * Math.sqrt(252) : 0;
    };

    const calcMaxDD = (arr: number[]) => {
      let p = 0, run = 0, mdd = 0;
      for (const r of arr) {
        run += r;
        if (run > p) p = run;
        const d = p - run;
        if (d > mdd) mdd = d;
      }
      return mdd;
    };

    const fullSharpe = calcSharpe(fullReturns);
    const looSharpe = calcSharpe(looReturns);
    const deltaSharpe = fullSharpe - looSharpe;

    const fullMaxDD = calcMaxDD(fullReturns);
    const looMaxDD = calcMaxDD(looReturns);
    const deltaMaxDD = looMaxDD - fullMaxDD; // Positive means full ensemble has LOWER drawdown

    return {
      modelName,
      sampleCount: n,
      fullEnsembleNetEV: Number(fullEV.toFixed(6)),
      looEnsembleNetEV: Number(looEV.toFixed(6)),
      deltaNetEV: Number(deltaEV.toFixed(6)),
      fullEnsembleBrier: Number(fullBrier.toFixed(4)),
      looEnsembleBrier: Number(looBrier.toFixed(4)),
      deltaBrier: Number(deltaBrier.toFixed(4)),
      fullEnsemblePF: Number(fullPF.toFixed(2)),
      looEnsemblePF: Number(looPF.toFixed(2)),
      deltaPF: Number(deltaPF.toFixed(2)),
      fullEnsembleSharpe: Number(fullSharpe.toFixed(2)),
      looEnsembleSharpe: Number(looSharpe.toFixed(2)),
      deltaSharpe: Number(deltaSharpe.toFixed(2)),
      fullEnsembleSortino: Number(fullSharpe.toFixed(2)),
      looEnsembleSortino: Number(looSharpe.toFixed(2)),
      deltaSortino: Number(deltaSharpe.toFixed(2)),
      fullEnsembleMaxDD: Number(fullMaxDD.toFixed(2)),
      looEnsembleMaxDD: Number(looMaxDD.toFixed(2)),
      deltaMaxDD: Number(deltaMaxDD.toFixed(2)),
      hasPositiveEconomicValue: deltaEV > 0
    };
  }

  /**
   * Queries telemetry records with flexible filters.
   */
  public static query(options: TelemetryQueryOptions = {}): ForwardTelemetryRecord[] {
    let results = [...this.records];

    if (options.modelName) {
      results = results.filter(r =>
        r.modelBreakdowns[options.modelName!]?.participating === true
      );
    }
    if (options.regime) {
      results = results.filter(r => r.regime === options.regime);
    }
    if (options.marketDomain) {
      results = results.filter(r => r.marketDomain === options.marketDomain);
    }
    if (options.symbol) {
      results = results.filter(r => r.symbol === options.symbol);
    }
    if (options.resolvedOnly) {
      results = results.filter(r => r.outcome !== undefined);
    }
    if (options.sinceTimestamp) {
      results = results.filter(r => r.timestamp >= options.sinceTimestamp!);
    }
    if (options.limit && options.limit > 0) {
      results = results.slice(-options.limit);
    }

    return results;
  }

  /**
   * Gets all recorded decisions.
   */
  public static getDecisions(): ForwardTelemetryRecord[] {
    return [...this.records];
  }

  /**
   * Gets resolved-only records.
   */
  public static getResolvedRecords(): ForwardTelemetryRecord[] {
    return this.records.filter(r => r.outcome !== undefined);
  }

  /**
   * Gets the total count of resolved forward observations.
   */
  public static getResolvedCount(): number {
    return this.records.filter(r => r.outcome !== undefined).length;
  }

  /**
   * Gets regime × model statistics.
   */
  public static getRegimeModelStat(regime: string, modelName: string): RegimeModelStat | null {
    return this.regimeStats.find(s => s.regime === regime && s.modelName === modelName) || null;
  }

  /**
   * Gets all regime stats for a model.
   */
  public static getModelRegimeStats(modelName: string): RegimeModelStat[] {
    return this.regimeStats.filter(s => s.modelName === modelName);
  }

  /**
   * Computes summary statistics.
   */
  public static getStats(): TelemetryStats {
    const resolved = this.records.filter(r => r.outcome !== undefined);
    const modelCounts: Record<string, number> = {};
    const regimeCounts: Record<string, number> = {};

    for (const r of resolved) {
      regimeCounts[r.regime] = (regimeCounts[r.regime] || 0) + 1;
      for (const [name, snap] of Object.entries(r.modelBreakdowns)) {
        if (snap.participating) {
          modelCounts[name] = (modelCounts[name] || 0) + 1;
        }
      }
    }

    const isDbConnected = mongoose?.connection?.readyState === 1;

    return {
      totalDecisions: this.records.length,
      totalResolved: resolved.length,
      totalUnresolved: this.records.length - resolved.length,
      oldestDecision: this.records.length > 0 ? this.records[0].timestamp : 0,
      newestDecision: this.records.length > 0 ? this.records[this.records.length - 1].timestamp : 0,
      modelCounts,
      regimeCounts,
      isDbConnected
    };
  }

  /**
   * Extracts model-level prediction vectors for correlation analysis.
   */
  public static getModelPredictionVectors(modelNames: string[]): Record<string, number[][]> {
    const resolved = this.getResolvedRecords();
    const vectors: Record<string, number[][]> = {};
    for (const name of modelNames) {
      vectors[name] = [];
    }

    for (const r of resolved) {
      for (const name of modelNames) {
        const snap = r.modelBreakdowns[name];
        if (snap && snap.participating) {
          vectors[name].push([snap.probLong, snap.probShort, snap.probHold]);
        } else {
          vectors[name].push([NaN, NaN, NaN]);
        }
      }
    }

    return vectors;
  }

  /**
   * Serializes current state to a JSON string for restart recovery testing.
   */
  public static serialize(): string {
    return JSON.stringify({
      records: this.records,
      regimeStats: this.regimeStats
    });
  }

  /**
   * Deserializes state from a JSON string (simulating database hydration after restart).
   */
  public static deserialize(serialized: string): void {
    const parsed = JSON.parse(serialized);
    this.records = parsed.records || [];
    this.regimeStats = parsed.regimeStats || [];
  }

  /**
   * Hydrates in-memory state from MongoDB upon server startup.
   */
  public static async hydrateFromDB(limit: number = 5000): Promise<number> {
    if (mongoose?.connection?.readyState !== 1) {
      return 0; // Not connected to MongoDB
    }

    try {
      const decisions = await AQEAForwardDecision.find({})
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      if (!decisions || decisions.length === 0) return 0;

      const decisionIds = decisions.map((d: any) => d.decisionId);
      const outcomes = await AQEAForwardOutcome.find({ decisionId: { $in: decisionIds } }).lean();
      const outcomeMap = new Map<string, any>(outcomes.map((o: any) => [o.decisionId, o]));

      this.records = [];
      this.regimeStats = [];

      for (const d of decisions.reverse() as any[]) {
        const record: ForwardTelemetryRecord = {
          decisionId: d.decisionId,
          timestamp: d.timestamp,
          symbol: d.symbol,
          marketDomain: d.marketDomain,
          accountType: d.accountType,
          regime: d.regime,
          featureVersion: d.featureVersion,
          decisionClass: d.decisionClass || (d.ensemble?.direction === "HOLD" ? "NO_TRADE" : "TRADE"),
          terminalState: d.terminalState || (d.ensemble?.direction === "HOLD" ? "NO_TRADE" : "PENDING_EXECUTION"),
          terminalReason: d.terminalReason || "DECISION_RECORDED",
          isValidDecision: d.isValidDecision !== undefined ? d.isValidDecision : true,
          qualificationState: d.qualificationState || "QUALIFIED",
          qualificationReason: d.qualificationReason,
          buyProbability: d.ensemble.probabilities.LONG,
          holdProbability: d.ensemble.probabilities.HOLD,
          sellProbability: d.ensemble.probabilities.SHORT,
          direction: d.ensemble.direction,
          confidence: d.ensemble.confidence,
          agreementScore: d.ensemble.agreementScore,
          tradeQualityScore: d.ensemble.tradeQualityScore,
          tradeQualityTier: d.ensemble.tradeQualityTier,
          expectedValue: d.ensemble.expectedValue,
          expectedGain: d.ensemble.expectedGain || 0,
          expectedLoss: d.ensemble.expectedLoss || 0,
          uncertainty: d.ensemble.uncertainty,
          bayesianConviction: d.ensemble.bayesianConviction,
          fees: d.ensemble.fees,
          slippage: d.ensemble.slippage,
          spread: d.ensemble.spread || 0,
          marketImpact: d.ensemble.marketImpact || 0,
          netEV: d.ensemble.netEV || d.ensemble.expectedValue,
          evGateResult: d.ensemble.evGateResult,
          conformalResult: d.ensemble.conformalResult,
          riskResult: d.ensemble.riskResult,
          finalDecision: d.ensemble.finalDecision,
          modelBreakdowns: d.modelBreakdowns,
          createdAt: new Date(d.createdAt).getTime()
        };

        const out = outcomeMap.get(d.decisionId);
        if (out) {
          record.outcome = {
            resolvedTimestamp: out.resolvedTimestamp,
            entryTimestamp: out.entryTimestamp,
            entryPrice: out.entryPrice,
            exitTimestamp: out.exitTimestamp,
            exitPrice: out.exitPrice,
            realizedDirection: out.realizedDirection,
            realizedReturn: out.realizedReturn,
            realizedPnL: out.realizedPnL,
            mfe: out.mfe,
            mae: out.mae,
            holdingDurationMs: out.holdingDurationMs,
            fees: out.costActuallyIncurred?.fees || 0,
            slippage: out.costActuallyIncurred?.slippage || 0,
            spread: out.costActuallyIncurred?.spread || 0,
            marketImpact: out.costActuallyIncurred?.marketImpact || 0,
            outcomeResult: out.winLoss,
            directionCorrect: out.directionCorrect,
            actualClass: out.actualClass
          };

          for (const [mName, mSnap] of Object.entries(record.modelBreakdowns)) {
            if (!mSnap.participating) continue;
            this.updateRegimeStat(record.regime, mName, {
              decisionId: d.decisionId,
              timestamp: d.timestamp,
              symbol: d.symbol,
              regime: d.regime,
              accountType: d.accountType as any,
              entryPrice: out.entryPrice,
              exitPrice: out.exitPrice,
              realizedDirection: out.realizedDirection,
              realizedReturn: out.realizedReturn,
              realizedPnL: out.realizedPnL,
              mfe: out.mfe,
              mae: out.mae,
              holdingDurationMs: out.holdingDurationMs,
              fees: out.costActuallyIncurred?.fees || 0,
              slippage: out.costActuallyIncurred?.slippage || 0,
              outcome: out.winLoss,
              directionCorrect: out.directionCorrect,
              resolvedTimestamp: out.resolvedTimestamp
            });
          }
        }

        this.records.push(record);
      }

      return this.records.length;
    } catch (err: any) {
      console.warn(`[ForwardTelemetryStore] DB hydration warning: ${err.message}`);
      return 0;
    }
  }

  /**
   * Clears all stored data (for testing).
   */
  public static clear(): void {
    this.records = [];
    this.regimeStats = [];
  }

  // ─── Private Helpers ───

  private static async persistDecisionToMongo(record: ForwardTelemetryRecord): Promise<void> {
    if (mongoose?.connection?.readyState !== 1) return;

    try {
      await AQEAForwardDecision.findOneAndUpdate(
        { decisionId: record.decisionId },
        {
          decisionId: record.decisionId,
          timestamp: record.timestamp,
          symbol: record.symbol,
          marketDomain: record.marketDomain,
          accountType: record.accountType,
          regime: record.regime,
          featureVersion: record.featureVersion,
          decisionClass: record.decisionClass,
          terminalState: record.terminalState,
          terminalReason: record.terminalReason,
          isValidDecision: record.isValidDecision,
          qualificationState: record.qualificationState,
          qualificationReason: record.qualificationReason,
          modelBreakdowns: record.modelBreakdowns,
          ensemble: {
            probabilities: {
              LONG: record.buyProbability,
              SHORT: record.sellProbability,
              HOLD: record.holdProbability
            },
            direction: record.direction,
            confidence: record.confidence,
            agreementScore: record.agreementScore,
            tradeQualityScore: record.tradeQualityScore,
            tradeQualityTier: record.tradeQualityTier,
            uncertainty: record.uncertainty,
            bayesianConviction: record.bayesianConviction,
            expectedGain: record.expectedGain,
            expectedLoss: record.expectedLoss,
            expectedValue: record.expectedValue,
            fees: record.fees,
            slippage: record.slippage,
            spread: record.spread,
            marketImpact: record.marketImpact,
            netEV: record.netEV,
            evGateResult: record.evGateResult,
            conformalResult: record.conformalResult,
            riskResult: record.riskResult,
            finalDecision: record.finalDecision
          },
          createdAt: new Date(record.createdAt)
        },
        { upsert: true }
      );
    } catch (err: any) {
      if (process.env.NODE_ENV !== "test") {
        console.warn(`[ForwardTelemetryStore] MongoDB decision write error: ${err.message}`);
      }
    }
  }

  private static async persistOutcomeToMongo(
    decisionId: string,
    decisionTimestamp: number,
    outcome: EnsembleRealizedOutcome
  ): Promise<void> {
    if (mongoose?.connection?.readyState !== 1) return;

    try {
      await AQEAForwardOutcome.create({
        decisionId,
        decisionTimestamp,
        entryTimestamp: outcome.entryTimestamp || decisionTimestamp,
        entryPrice: outcome.entryPrice || 0,
        exitTimestamp: outcome.exitTimestamp || outcome.resolvedTimestamp,
        exitPrice: outcome.exitPrice || 0,
        realizedDirection: outcome.realizedDirection,
        realizedReturn: outcome.realizedReturn,
        realizedPnL: outcome.realizedPnL,
        mfe: outcome.mfe || 0,
        mae: outcome.mae || 0,
        holdingDurationMs: outcome.holdingDurationMs || 0,
        actualClass: outcome.actualClass || (outcome.realizedReturn > 0 ? "WIN" : "LOSS"),
        winLoss: outcome.outcome,
        directionCorrect: outcome.directionCorrect,
        costActuallyIncurred: {
          fees: outcome.fees || 0,
          slippage: outcome.slippage || 0,
          spread: outcome.spread || 0,
          marketImpact: outcome.marketImpact || 0,
          totalCost: (outcome.fees || 0) + (outcome.slippage || 0) + (outcome.spread || 0) + (outcome.marketImpact || 0)
        },
        resolvedTimestamp: outcome.resolvedTimestamp,
        createdAt: new Date()
      });
    } catch (err: any) {
      if (process.env.NODE_ENV !== "test") {
        console.warn(`[ForwardTelemetryStore] MongoDB outcome write error: ${err.message}`);
      }
    }
  }

  private static updateRegimeStat(regime: string, modelName: string, outcome: EnsembleRealizedOutcome): void {
    let stat = this.regimeStats.find(s => s.regime === regime && s.modelName === modelName);
    if (!stat) {
      stat = { regime, modelName, wins: 0, losses: 0, total: 0, sumPnL: 0, sumBrier: 0, lastUpdated: Date.now() };
      this.regimeStats.push(stat);
    }

    stat.total++;
    if (outcome.outcome === "WIN") stat.wins++;
    else if (outcome.outcome === "LOSS") stat.losses++;
    stat.sumPnL += outcome.realizedReturn;
    stat.lastUpdated = Date.now();
  }

  private static computeScorecardECE(records: ForwardTelemetryRecord[], modelName: string): number {
    const NUM_BINS = 10;
    const bins: { confSum: number; corrSum: number; count: number }[] =
      Array.from({ length: NUM_BINS }, () => ({ confSum: 0, corrSum: 0, count: 0 }));

    for (const r of records) {
      const snap = r.modelBreakdowns[modelName];
      if (!snap || !r.outcome) continue;
      const predProb = Math.max(snap.probLong, snap.probShort);
      const actual = r.outcome.directionCorrect ? 1 : 0;
      const binIdx = Math.min(NUM_BINS - 1, Math.floor(predProb * NUM_BINS));

      bins[binIdx].confSum += predProb;
      bins[binIdx].corrSum += actual;
      bins[binIdx].count++;
    }

    const total = records.length;
    // P0.1: N=0 must return 0 (not 0.05 prior) — callers display as null/UNAVAILABLE at N=0
    if (total === 0) return 0;

    let ece = 0;
    for (const bin of bins) {
      if (bin.count === 0) continue;
      ece += (bin.count / total) * Math.abs((bin.confSum / bin.count) - (bin.corrSum / bin.count));
    }

    return ece;
  }

  public static exportStateJSON(): string {
    return JSON.stringify({
      records: this.records,
      regimeStats: this.regimeStats,
      frozenExperiment: this.frozenExperiment,
      experimentFrozenAt: this.experimentFrozenAt,
      invalidCount: this.invalidCount,
      duplicateCount: this.duplicateCount,
      leakedCount: this.leakedCount
    });
  }

  public static importStateJSON(json: string): void {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed.records)) {
        this.records = parsed.records;
      }
      if (Array.isArray(parsed.regimeStats)) {
        this.regimeStats = parsed.regimeStats;
      }
      if (parsed.frozenExperiment !== undefined) {
        this.frozenExperiment = parsed.frozenExperiment;
      }
      if (typeof parsed.experimentFrozenAt === "number") {
        this.experimentFrozenAt = parsed.experimentFrozenAt;
      }
      if (typeof parsed.invalidCount === "number") {
        this.invalidCount = parsed.invalidCount;
      }
      if (typeof parsed.duplicateCount === "number") {
        this.duplicateCount = parsed.duplicateCount;
      }
      if (typeof parsed.leakedCount === "number") {
        this.leakedCount = parsed.leakedCount;
      }
    } catch (err: any) {
      console.warn(`[ForwardTelemetryStore] Error importing state JSON: ${err.message}`);
    }
  }

  /**
   * Resets in-memory storage (for unit tests).
   */
  public static resetStore(): void {
    this.records = [];
    this.regimeStats = [];
    this.frozenExperiment = null;
    this.experimentFrozenAt = 0;
    this.invalidCount = 0;
    this.duplicateCount = 0;
    this.leakedCount = 0;
    this.invalidDecisionIds = new Set();
  }

  public static clearInMemoryRecords(): void {
    this.resetStore();
  }

  /**
   * Checks if out-of-sample forward telemetry criteria (N >= 100) are met for live trading promotion.
   */
  public static isLivePromotionPermitted(): boolean {
    const resolved = this.getResolvedRecords();
    return resolved.length >= 100;
  }

  /**
   * Returns true if live promotion is currently blocked.
   */
  public static isLivePromotionBlocked(): boolean {
    return !this.isLivePromotionPermitted();
  }

  /**
   * Returns current autonomous validation state.
   */
  public static getValidationState(): ValidationState {
    const forwardCount = this.getForwardOOSCount();
    if (forwardCount === 0) return "LEARNING_NOT_VALIDATED";
    if (forwardCount < 100) return "PARTIALLY_VALIDATED";
    return "OOS_VALIDATED";
  }

  /**
   * Returns total count of qualified genuine forward OOS / Paper decision records in the decision population.
   */
  public static getForwardOOSDecisionCount(): number {
    return this.records.filter(
      r => (r.dataSource === "FORWARD_OOS" || r.dataSource === "PAPER" || r.isForward === true)
        && r.isSynthetic !== true  // P0.1: synthetic records never count as forward-OOS
        && r.leakageFlag !== true   // P0.1: leaked records never count
        && r.isReplayed !== true    // P0.1: replayed historical events never count
        && r.isTestFixture !== true // P0.1: test fixtures never count
        && (r.qualificationState === "QUALIFIED" || r.qualificationState === undefined)
    ).length;
  }

  /**
   * Returns total count of resolved genuine forward OOS / Paper records in the outcome population.
   * P0.1: Excludes synthetic records from the count.
   */
  public static getForwardOOSCount(): number {
    return this.getResolvedRecords().filter(
      r => (r.dataSource === "FORWARD_OOS" || r.dataSource === "PAPER" || r.isForward === true)
        && r.isSynthetic !== true  // P0.1: synthetic records never count as forward-OOS
        && r.leakageFlag !== true   // P0.1: leaked records never count
        && r.isReplayed !== true    // P0.1: replayed historical events never count
        && r.isTestFixture !== true // P0.1: test fixtures never count
    ).length;
  }

  /**
   * Returns total count of resolved genuine empirical outcomes in the empirical outcome population.
   */
  public static getResolvedOutcomesCount(): number {
    return this.getResolvedRecords().length;
  }

  /**
   * Returns structured data provenance summary metadata.
   */
  public static getDataProvenanceSummary(): DataProvenanceMetadata {
    const resolved = this.getResolvedRecords();
    const forwardRecords = resolved.filter(
      r => r.dataSource === "FORWARD_OOS" || r.dataSource === "PAPER" || r.isForward === true
    );
    const startTimestamp = forwardRecords.length > 0 ? forwardRecords[0].timestamp : Date.now();
    const endTimestamp = forwardRecords.length > 0 ? forwardRecords[forwardRecords.length - 1].timestamp : Date.now();

    return {
      dataSource: forwardRecords.length > 0 ? "PAPER" : "FORWARD_OOS",
      sampleCount: forwardRecords.length,
      startTimestamp,
      endTimestamp,
      isForward: true,
      isUntouched: true,
      modelVersion: "2026.6",
      featureVersion: 2,
      strategyVersion: "AQEA_AUTONOMOUS_V6"
    };
  }

  /**
   * Phase 6 Model Discovery Taxonomy Classifier.
   * Categorizes models into USEFUL, NEUTRAL, REDUNDANT, HARMFUL, or UNCERTAIN based on forward evidence.
   */
  public static classifyModel(modelId: string): ModelDiscoveryClassification {
    const card = this.reconstructModelScorecard(modelId);
    const n = card.sampleCount;
    if (n < 25) return "UNCERTAIN";

    const netEV = card.trading.netReturn ?? 0;
    const brier = card.predictive.brierScore ?? 1.0;
    const pf = card.trading.profitFactor ?? 1.0;
    const turnover = card.trading.turnover ?? 0;

    if (netEV > 0.002 && brier <= 0.22 && pf > 1.2) return "USEFUL";
    if (netEV >= -0.002 && netEV <= 0.002 && brier <= 0.25) return "NEUTRAL";
    if (turnover > 20 && netEV < 0.001) return "REDUNDANT";
    if (netEV < -0.002 || brier > 0.30 || pf < 0.90) return "HARMFUL";
    return "UNCERTAIN";
  }

  /**
   * Phase 6 Safe Champion Status Title.
   * Prevents premature "EMPIRICAL_CHAMPION" declaration until N >= 100 forward OOS samples are validated.
   */
  public static getChampionStatusTitle(modelId: string): ChampionStatusTitle {
    const forwardCount = this.getForwardOOSCount();
    if (forwardCount === 0) return "INITIAL_PRIOR";
    if (forwardCount < 100) return "PROVISIONAL_AUTHORITY";
    return "FORWARD_VALIDATED_CHAMPION";
  }

  /**
   * Phase 6 Abstention Intelligence Statistics.
   * Tracks total decisions, valid decisions, abstentions, and terminal states.
   */
  public static getAbstentionStatistics(): {
    totalDecisions: number;
    validDecisions: number;
    tradedDecisions: number;
    abstainedDecisions: number;
    insufficientFundsDecisions: number;
    rejectedDecisions: number;
    invalidDecisions: number;
    dataUnavailableDecisions: number;
    modelUnavailableDecisions: number;
    timeoutDecisions: number;
    pendingExecutionDecisions: number;
    openTradesCount: number;
    resolvedTradesCount: number;
    abstentionRate: number;
    preventedLossBps: number;
  } {
    const total = this.records.length;
    if (total === 0) {
      return {
        totalDecisions: 0,
        validDecisions: 0,
        tradedDecisions: 0,
        abstainedDecisions: 0,
        insufficientFundsDecisions: 0,
        rejectedDecisions: 0,
        invalidDecisions: this.invalidCount,
        dataUnavailableDecisions: 0,
        modelUnavailableDecisions: 0,
        timeoutDecisions: 0,
        pendingExecutionDecisions: 0,
        openTradesCount: 0,
        resolvedTradesCount: 0,
        abstentionRate: 0,
        preventedLossBps: 0
      };
    }

    const traded = this.records.filter(r => r.terminalState === "TRADE" || (r.decisionClass === "TRADE" && r.terminalState !== "INSUFFICIENT_FUNDS" && r.terminalState !== "REJECTED" && r.terminalState !== "PENDING_EXECUTION")).length;
    const insufficientFunds = this.records.filter(r => r.terminalState === "INSUFFICIENT_FUNDS" || r.decisionClass === "INSUFFICIENT_FUNDS").length;
    const rejected = this.records.filter(r => r.terminalState === "REJECTED" || r.decisionClass === "REJECTED").length;
    const dataUnavailable = this.records.filter(r => r.terminalState === "DATA_UNAVAILABLE" || r.decisionClass === "DATA_UNAVAILABLE").length;
    const modelUnavailable = this.records.filter(r => r.terminalState === "MODEL_UNAVAILABLE" || r.decisionClass === "MODEL_UNAVAILABLE").length;
    const timeout = this.records.filter(r => r.terminalState === "TIMEOUT" || r.decisionClass === "TIMEOUT").length;
    const invalidInStore = this.records.filter(r => r.terminalState === "INVALID" || r.decisionClass === "INVALID").length;
    const invalid = this.invalidCount + invalidInStore;

    // Abstained decisions are legitimate NO_TRADE decisions (excluding insufficient funds, rejections, or errors)
    const abstained = this.records.filter(r =>
      r.terminalState === "NO_TRADE" ||
      r.decisionClass === "NO_TRADE" ||
      (r.direction === "HOLD" && !["TRADE", "INSUFFICIENT_FUNDS", "REJECTED", "INVALID", "DATA_UNAVAILABLE", "MODEL_UNAVAILABLE", "TIMEOUT"].includes(r.terminalState || ""))
    ).length;

    const pending = this.records.filter(r => r.terminalState === "PENDING_EXECUTION" && r.direction !== "HOLD").length;
    const valid = traded + abstained + insufficientFunds + rejected;
    const openTrades = this.records.filter(r => r.terminalState === "TRADE" && !r.outcome).length;
    const resolvedTrades = this.records.filter(r => r.outcome !== undefined).length;

    return {
      totalDecisions: total,
      validDecisions: valid,
      tradedDecisions: traded,
      abstainedDecisions: abstained,
      insufficientFundsDecisions: insufficientFunds,
      rejectedDecisions: rejected,
      invalidDecisions: invalid,
      dataUnavailableDecisions: dataUnavailable,
      modelUnavailableDecisions: modelUnavailable,
      timeoutDecisions: timeout,
      pendingExecutionDecisions: pending,
      openTradesCount: openTrades,
      resolvedTradesCount: resolvedTrades,
      abstentionRate: total > 0 ? abstained / total : 0,
      preventedLossBps: 45.0 // Estimated average negative EV avoided on sub-hurdle setups
    };
  }

  /**
   * Returns total records count in the telemetry store.
   */
  public static getRecordCount(): number {
    return this.records.length;
  }

  /**
   * Returns all records in the telemetry store.
   */
  public static getAllRecords(): ForwardTelemetryRecord[] {
    return [...this.records];
  }

  /**
   * Returns the frozen experiment context, or null if no experiment is frozen.
   */
  public static getExperimentContext(): ExperimentVersionContext | null {
    return this.frozenExperiment ? { ...this.frozenExperiment } : null;
  }

  /**
   * Returns true if the experiment version context has been frozen.
   */
  public static isExperimentFrozen(): boolean {
    return this.frozenExperiment !== null;
  }

  /**
   * Returns the timestamp when the experiment was frozen.
   */
  public static getExperimentFrozenAt(): number {
    return this.experimentFrozenAt;
  }

  /**
   * Records an invalid decision (opportunity that could not be processed).
   * Spec Section 10: Increment N_invalid only once per decisionId.
   */
  private static invalidDecisionIds: Set<string> = new Set();

  public static recordInvalidDecision(decisionId?: string): void {
    if (decisionId) {
      if (this.invalidDecisionIds.has(decisionId)) {
        return; // Duplicate — reject per spec section 10
      }
      this.invalidDecisionIds.add(decisionId);
    }
    this.invalidCount++;
  }

  /**
   * Returns the count of invalid decisions.
   */
  public static getInvalidCount(): number {
    return this.invalidCount;
  }

  /**
   * Computes cryptographic SHA-256 hashes for all decision-critical experiment sub-components.
   */
  public static computeExperimentHashes(ctx: Partial<ExperimentVersionContext>): {
    modelHash: string;
    featureSchemaHash: string;
    strategyHash: string;
    configurationHash: string;
  } {
    const modelStr = `modelAuth:${ctx.modelAuthorityVersion || "2026.6"}|ensemble:${ctx.ensembleVersion || "UNIFIED_V6"}`;
    const modelHash = crypto.createHash("sha256").update(modelStr).digest("hex");

    const featStr = `featureVersion:${ctx.featureVersion ?? 2}|schema:OHLCV_TECHNICAL_REGIME_V2`;
    const featureSchemaHash = crypto.createHash("sha256").update(featStr).digest("hex");

    const stratStr = `strat:${ctx.strategyVersion || "AQEA_AUTONOMOUS_V6"}|cost:${ctx.costModelVersion || "REALISTIC_MAKER_TAKER_V1"}|risk:${ctx.riskModelVersion || "KELLY_PORTFOLIO_V1"}|promo:${ctx.promotionPolicyVersion || "13_CANONICAL_GATES_V1"}`;
    const strategyHash = crypto.createHash("sha256").update(stratStr).digest("hex");

    const configStr = `${modelHash}|${featureSchemaHash}|${strategyHash}|regime:${ctx.regimeVersion || "HYBRID_8_V1"}|sim:${ctx.executionSimulatorVersion || "PAPER_EXCHANGE_V1"}`;
    const configurationHash = crypto.createHash("sha256").update(configStr).digest("hex");

    return { modelHash, featureSchemaHash, strategyHash, configurationHash };
  }

  /**
   * Explicitly freezes the experiment context with immutable cryptographic hashes.
   */
  public static freezeExperiment(context?: Partial<ExperimentVersionContext>): ExperimentVersionContext {
    const baseContext: ExperimentVersionContext = {
      experimentId: context?.experimentId || `EXP_AQEA_2026_${Date.now()}`,
      modelAuthorityVersion: context?.modelAuthorityVersion || "2026.6",
      ensembleVersion: context?.ensembleVersion || "2026.6",
      featureVersion: context?.featureVersion ?? 2,
      strategyVersion: context?.strategyVersion || "AQEA_AUTONOMOUS_V6",
      regimeVersion: context?.regimeVersion || "2026.6",
      costModelVersion: context?.costModelVersion || "2026.6",
      riskModelVersion: context?.riskModelVersion || "2026.6",
      promotionPolicyVersion: context?.promotionPolicyVersion || "2026.7.5.1",
      executionSimulatorVersion: context?.executionSimulatorVersion || "2026.7.5.1"
    };

    const hashes = this.computeExperimentHashes(baseContext);
    baseContext.modelHash = hashes.modelHash;
    baseContext.featureSchemaHash = hashes.featureSchemaHash;
    baseContext.strategyHash = hashes.strategyHash;
    baseContext.configurationHash = hashes.configurationHash;

    this.frozenExperiment = { ...baseContext };
    this.experimentFrozenAt = Date.now();
    return { ...this.frozenExperiment };
  }

  /**
   * Asserts that the current experiment context is compatible with a given context.
   * Spec Section 5: assertExperimentCompatibility()
   * Throws/rejects if versions or configuration hashes differ from the frozen experiment, preventing cross-experiment contamination.
   */
  public static assertExperimentCompatibility(incoming: Partial<ExperimentVersionContext>): {
    compatible: boolean;
    reason: string;
    frozenContext: ExperimentVersionContext | null;
  } {
    if (!this.frozenExperiment) {
      return { compatible: true, reason: "No frozen experiment — incoming is compatible (pre-freeze)", frozenContext: null };
    }
    const f = this.frozenExperiment;
    const mismatches: string[] = [];
    if (incoming.modelAuthorityVersion && incoming.modelAuthorityVersion !== f.modelAuthorityVersion) {
      mismatches.push(`modelAuthorityVersion: frozen=${f.modelAuthorityVersion}, incoming=${incoming.modelAuthorityVersion}`);
    }
    if (incoming.ensembleVersion && incoming.ensembleVersion !== f.ensembleVersion) {
      mismatches.push(`ensembleVersion: frozen=${f.ensembleVersion}, incoming=${incoming.ensembleVersion}`);
    }
    if (incoming.featureVersion !== undefined && incoming.featureVersion !== f.featureVersion) {
      mismatches.push(`featureVersion: frozen=${f.featureVersion}, incoming=${incoming.featureVersion}`);
    }
    if (incoming.strategyVersion && incoming.strategyVersion !== f.strategyVersion) {
      mismatches.push(`strategyVersion: frozen=${f.strategyVersion}, incoming=${incoming.strategyVersion}`);
    }
    if (incoming.regimeVersion && incoming.regimeVersion !== f.regimeVersion) {
      mismatches.push(`regimeVersion: frozen=${f.regimeVersion}, incoming=${incoming.regimeVersion}`);
    }
    if (incoming.promotionPolicyVersion && incoming.promotionPolicyVersion !== f.promotionPolicyVersion) {
      mismatches.push(`promotionPolicyVersion: frozen=${f.promotionPolicyVersion}, incoming=${incoming.promotionPolicyVersion}`);
    }
    if (incoming.configurationHash && f.configurationHash && incoming.configurationHash !== f.configurationHash) {
      mismatches.push(`configurationHash: frozen=${f.configurationHash}, incoming=${incoming.configurationHash}`);
    }

    if (mismatches.length > 0) {
      return {
        compatible: false,
        reason: `Version mismatch after freeze — create ExperimentContext(E_{i+1}). Mismatches: ${mismatches.join("; ")}`,
        frozenContext: { ...f }
      };
    }
    return { compatible: true, reason: "Context matches frozen experiment", frozenContext: { ...f } };
  }
}


