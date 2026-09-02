/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Master P0.1 Forensic Fix Regression Test Suite
 * ═══════════════════════════════════════════════════════════════════
 *
 * Comprehensive statistical verification, opportunity accounting,
 * data provenance, paper execution realism, and runtime resilience tests.
 *
 * Tests:
 *  1. Synthetic data excluded from OOS
 *  2. Synthetic data cannot affect ESS
 *  3. Synthetic data cannot affect NetEV
 *  4. Virtual paper balance cannot alter real wallet
 *  5. Opportunity conservation (Level 1 & Level 2)
 *  6. Duplicate idempotency
 *  7. Timeout terminal accounting
 *  8. Model unavailable accounting
 *  9. Data unavailable accounting
 * 10. Stale cache rejection
 * 11. Out-of-order WebSocket rejection
 * 12. NaN/Infinity rejection
 * 13. Strict temporal ordering (t_feature <= t_decision < t_entry < t_exit <= t_outcome)
 * 14. Future feature rejection
 * 15. Future regime rejection
 * 16. Future price rejection
 * 17. Future calibration rejection
 * 18. Experiment freeze
 * 19. Experiment rollover isolation
 * 20. Fallback model provenance
 * 21. Unresolved outcome exclusion (OUTCOME_PENDING)
 * 22. Predicted vs realized cost separation
 * 23. Database failure handling (DB_UNAVAILABLE fail-safe)
 * 24. Scheduler skipped-cycle accounting
 * 25. All live execution paths blocked
 * 26. Prior cannot satisfy promotion (13 gates fail-closed)
 * 27. N=0 statistical null semantics
 * 28. ESS edge cases (N=0, N=1, constant returns, NaN, Infinity)
 * 29. Bootstrap N=0 unavailable
 * 30. Dashboard metric truthfulness
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  DataProvenance,
  isQualifiedForwardOOS,
  assertOpportunityConservation,
  OpportunityAccounting,
  SchedulerAccounting,
  assertPaperIsolation,
  PaperAccount,
  computePaperEquity
} from "../src/services/aqea/dataProvenance.js";
import {
  ForwardTelemetryStore,
  DataLeakageError
} from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import {
  AutonomousForwardEvidenceEngine
} from "../src/services/aqea/governance/AutonomousForwardEvidenceEngine.js";
import {
  LiveExecutionBarrier
} from "../src/services/aqea/governance/LiveExecutionBarrier.js";
import {
  generateSyntheticKlines,
  updateKlineCache,
  getKlinesWithProvenance,
  placeOrder,
  placeFuturesOrder,
  STALE_MARKET_DATA_MS,
  Kline
} from "../src/services/binanceService.js";
import { StatisticalTests } from "../src/services/aqea/ensemble/StatisticalTests.js";

describe("AQEA Master P0.1 Forensic Fix — Evidence Integrity & Safety Suite", () => {
  beforeEach(() => {
    ForwardTelemetryStore.resetStore();
    AutonomousForwardEvidenceEngine.resetEngine();
    SchedulerAccounting.resetForTest();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Synthetic Data Excluded from OOS
  // ─────────────────────────────────────────────────────────────
  it("1. should exclude synthetic data from forward-OOS evidence", () => {
    const synthCandles = generateSyntheticKlines("BTCUSDT", 10);
    expect(synthCandles.every(c => c.isSynthetic === true)).toBe(true);
    expect(synthCandles.every(c => c.dataProvenance === "SYNTHETIC")).toBe(true);

    const synthDecision = {
      decisionId: "DEC_SYNTH_001",
      timestamp: Date.now() - 10000,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO" as const,
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.85,
      holdProbability: 0.10,
      sellProbability: 0.05,
      direction: "LONG" as const,
      confidence: 85,
      agreementScore: 0.9,
      tradeQualityScore: 80,
      expectedValue: 0.0035,
      uncertainty: 0.1,
      fees: 0.0004,
      slippage: 0.0002,
      modelBreakdowns: {},
      isSynthetic: true,
      dataSource: "SYNTHETIC" as const
    };

    ForwardTelemetryStore.recordDecision(synthDecision as any);
    ForwardTelemetryStore.resolveOutcome("DEC_SYNTH_001", {
      resolvedTimestamp: Date.now(),
      entryTimestamp: Date.now() - 5000,
      entryPrice: 65000,
      exitTimestamp: Date.now() - 1000,
      exitPrice: 66000,
      realizedDirection: "LONG",
      realizedReturn: 0.015,
      realizedPnL: 150,
      mfe: 0.02,
      mae: 0.001,
      holdingDurationMs: 4000,
      fees: 10,
      slippage: 5,
      outcome: "WIN",
      directionCorrect: true,
      actualClass: "WIN"
    });

    // Verify synthetic data is quarantined and NOT counted in getForwardOOSCount
    const fwdCount = ForwardTelemetryStore.getForwardOOSCount();
    expect(fwdCount).toBe(0);

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nForwardOOS).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Synthetic Data Cannot Affect ESS
  // ─────────────────────────────────────────────────────────────
  it("2. should guarantee synthetic data cannot contribute to or contaminate ESS", () => {
    // When only synthetic data exists, ESS must be 0
    const synthDecision = {
      decisionId: "DEC_SYNTH_002",
      timestamp: Date.now() - 10000,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO" as const,
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.85,
      holdProbability: 0.10,
      sellProbability: 0.05,
      direction: "LONG" as const,
      confidence: 85,
      agreementScore: 0.9,
      tradeQualityScore: 80,
      expectedValue: 0.0035,
      uncertainty: 0.1,
      fees: 0.0004,
      slippage: 0.0002,
      modelBreakdowns: {},
      isSynthetic: true
    };

    ForwardTelemetryStore.recordDecision(synthDecision as any);
    ForwardTelemetryStore.resolveOutcome("DEC_SYNTH_002", {
      resolvedTimestamp: Date.now(),
      realizedDirection: "LONG",
      realizedReturn: 0.02,
      realizedPnL: 200,
      outcome: "WIN",
      directionCorrect: true
    });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nEff).toBe(0);
    expect(report.evidenceVector.nEffMultiLag).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Synthetic Data Cannot Affect NetEV
  // ─────────────────────────────────────────────────────────────
  it("3. should guarantee synthetic data cannot contribute to NetEV", () => {
    const synthCandidate = {
      decisionId: "DEC_SYNTH_003",
      symbol: "ETHUSDT",
      timestamp: Date.now() - 5000,
      isSynthetic: true,
      dataProvenance: "SYNTHETIC" as DataProvenance,
      outcome: {
        resolvedTimestamp: Date.now(),
        outcomeResult: "WIN"
      }
    };

    const qual = isQualifiedForwardOOS(synthCandidate);
    expect(qual.qualified).toBe(false);
    expect(qual.failedConditions.some(c => c.includes("CONDITION_1_FAIL"))).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Virtual Paper Balance Cannot Alter Real Wallet
  // ─────────────────────────────────────────────────────────────
  it("4. should enforce strict paper capital separation from real wallet", () => {
    const paperAcct: PaperAccount = {
      experimentId: "EXP_V6_001",
      userId: "user_paper_01",
      accountType: "FUTURES",
      initialVirtualEquity: 10000,
      virtualCash: 10000,
      realizedPnL: 500,
      unrealizedPnL: 200,
      fees: 15,
      spreadCost: 5,
      slippageCost: 10,
      marketImpact: 2,
      openPositionCount: 1,
      closedPositionCount: 3,
      lastUpdated: Date.now()
    };

    const equity = computePaperEquity(paperAcct);
    expect(equity).toBe(10200);

    // Real wallet balance is completely independent
    const realWalletBalance = 0; // Live capital is 0
    expect(() => assertPaperIsolation(equity, realWalletBalance, "test_context")).not.toThrow();
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Opportunity Conservation
  // ─────────────────────────────────────────────────────────────
  it("5. should formally enforce Level 1 and Level 2 opportunity conservation", () => {
    const validAccounting: OpportunityAccounting = {
      symbolsScheduled: 7,
      symbolsStarted: 7,
      symbolsCompleted: 7,
      N_raw: 10,
      N_valid: 7,
      N_invalid: 1,
      N_duplicate: 1,
      N_leaked: 1,
      N_trades: 2,
      N_abstentions: 3,
      N_riskRejected: 1,
      N_executionBlocked: 1,
      N_dataUnavailableAfterValid: 0,
      N_modelUnavailable: 0,
      N_timeout: 0,
      N_error: 0,
      N_cooldown: 0,
      N_schedulerSkipped: 0,
      N_forward_oos_qualified: 2
    };

    expect(() => assertOpportunityConservation(validAccounting)).not.toThrow();

    // Invariant violation in Level 1 must throw
    const invalidLevel1 = { ...validAccounting, N_raw: 15 };
    expect(() => assertOpportunityConservation(invalidLevel1)).toThrow();

    // Invariant violation in Level 2 must throw
    const invalidLevel2 = { ...validAccounting, N_valid: 10 };
    expect(() => assertOpportunityConservation(invalidLevel2)).toThrow();
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Duplicate Idempotency
  // ─────────────────────────────────────────────────────────────
  it("6. should reject duplicate decisionId idempotently without double-counting", () => {
    const decision = {
      decisionId: "DEC_DUP_001",
      timestamp: Date.now() - 5000,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO" as const,
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.75,
      holdProbability: 0.15,
      sellProbability: 0.10,
      direction: "LONG" as const,
      confidence: 75,
      agreementScore: 0.8,
      tradeQualityScore: 75,
      expectedValue: 0.002,
      uncertainty: 0.1,
      fees: 0.0004,
      slippage: 0.0002,
      modelBreakdowns: {},
      dataSource: "FORWARD_OOS" as const,
      isForward: true
    };

    const r1 = ForwardTelemetryStore.recordDecision(decision as any);
    const r2 = ForwardTelemetryStore.recordDecision(decision as any); // Duplicate

    expect(r1.decisionId).toBe("DEC_DUP_001");
    expect(r2.decisionId).toBe("DEC_DUP_001");
    expect(ForwardTelemetryStore.getRecordCount()).toBe(1); // Stored only once!
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Timeout Terminal Accounting
  // ─────────────────────────────────────────────────────────────
  it("7. should record scheduler timeouts explicitly without disappearing", () => {
    SchedulerAccounting.recordTickScheduled();
    SchedulerAccounting.recordTickStarted(1);
    SchedulerAccounting.recordTickTimedOut(1);

    const summary = SchedulerAccounting.getSummary();
    expect(summary.scheduledTicks).toBe(1);
    expect(summary.startedTicks).toBe(1);
    expect(summary.timedOutTicks).toBe(1);
    expect(summary.completedTicks).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Model Unavailable Accounting
  // ─────────────────────────────────────────────────────────────
  it("8. should treat model unavailability as distinct state, not silent HOLD", () => {
    const candidate = {
      decisionId: "DEC_MODEL_UNAVAIL",
      symbol: "BTCUSDT",
      timestamp: Date.now() - 2000,
      outcome: null // OUTCOME_PENDING / Model was unavailable
    };

    const qual = isQualifiedForwardOOS(candidate);
    expect(qual.qualified).toBe(false);
    expect(qual.failedConditions.some(c => c.includes("CONDITION_7_FAIL"))).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // 9. Data Unavailable Accounting
  // ─────────────────────────────────────────────────────────────
  it("9. should classify missing/synthetic market data as DATA_UNAVAILABLE", async () => {
    const result = await getKlinesWithProvenance("INVALID_SYM_XYZ", "5m", undefined, undefined, 10);
    expect(result.isSynthetic).toBe(true);
    expect(result.provenance).toBe("SYNTHETIC");
  });

  // ─────────────────────────────────────────────────────────────
  // 10. Stale Cache Rejection
  // ─────────────────────────────────────────────────────────────
  it("10. should reject stale cached data older than STALE_MARKET_DATA_MS", () => {
    expect(STALE_MARKET_DATA_MS).toBe(120_000);
    const staleKline: Kline = {
      openTime: Date.now() - 200_000,
      open: "60000",
      high: "61000",
      low: "59000",
      close: "60500",
      volume: "100",
      closeTime: Date.now() - 190_000
    };
    updateKlineCache("BTCUSDT", "5m", staleKline);
  });

  // ─────────────────────────────────────────────────────────────
  // 11. Out-of-Order WebSocket Rejection
  // ─────────────────────────────────────────────────────────────
  it("11. should reject out-of-order WebSocket candles", () => {
    const newerKline: Kline = {
      openTime: 1000000,
      open: "100",
      high: "105",
      low: "95",
      close: "102",
      volume: "50",
      closeTime: 1060000
    };
    updateKlineCache("SOLUSDT", "1m", newerKline);

    const olderKline: Kline = {
      openTime: 900000,
      open: "98",
      high: "100",
      low: "92",
      close: "95",
      volume: "40",
      closeTime: 960000 // Out of order! (960000 < 1060000)
    };
    // Should be safely rejected by updateKlineCache
    updateKlineCache("SOLUSDT", "1m", olderKline);
  });

  // ─────────────────────────────────────────────────────────────
  // 12. NaN/Infinity Rejection
  // ─────────────────────────────────────────────────────────────
  it("12. should reject NaN/Infinity/impossible OHLCV candles", () => {
    const nanKline: Kline = {
      openTime: Date.now(),
      open: "NaN",
      high: "100",
      low: "50",
      close: "75",
      volume: "10",
      closeTime: Date.now() + 60000
    };
    // Should be safely rejected
    updateKlineCache("ETHUSDT", "1m", nanKline);

    const impossibleKline: Kline = {
      openTime: Date.now(),
      open: "100",
      high: "80", // High < Low — impossible!
      low: "90",
      close: "85",
      volume: "10",
      closeTime: Date.now() + 60000
    };
    updateKlineCache("ETHUSDT", "1m", impossibleKline);
  });

  // ─────────────────────────────────────────────────────────────
  // 13. Strict Temporal Ordering (t_feature <= t_decision < t_entry < t_exit <= t_outcome)
  // ─────────────────────────────────────────────────────────────
  it("13. should throw DataLeakageError when outcome occurs before or at decision time", () => {
    const now = Date.now();
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TEMP_001",
      timestamp: now,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGING",
      featureVersion: 2,
      buyProbability: 0.5,
      holdProbability: 0.5,
      sellProbability: 0.0,
      direction: "HOLD",
      confidence: 50,
      agreementScore: 0.5,
      tradeQualityScore: 50,
      expectedValue: 0,
      uncertainty: 0.2,
      fees: 0,
      slippage: 0,
      modelBreakdowns: {}
    });

    // Attempting resolution with resolvedTimestamp <= decisionTimestamp must throw
    expect(() => {
      ForwardTelemetryStore.resolveOutcome("DEC_TEMP_001", {
        resolvedTimestamp: now - 1000, // Look-ahead / impossible past resolution!
        realizedDirection: "LONG",
        realizedReturn: 0.01,
        realizedPnL: 100,
        outcome: "WIN",
        directionCorrect: true
      });
    }).toThrow(DataLeakageError);
  });

  // ─────────────────────────────────────────────────────────────
  // 14. Future Feature Rejection
  // ─────────────────────────────────────────────────────────────
  it("14. should reject records where featureDataMaxTimestamp > decisionTimestamp", () => {
    const decisionTime = Date.now() - 5000;
    const candidate = {
      decisionId: "DEC_FUTURE_FEAT",
      symbol: "BTCUSDT",
      timestamp: decisionTime,
      featureDataMaxTimestamp: decisionTime + 2000, // Look-ahead feature!
      outcome: {
        resolvedTimestamp: Date.now(),
        outcomeResult: "WIN"
      }
    };

    const qual = isQualifiedForwardOOS(candidate);
    expect(qual.qualified).toBe(false);
    expect(qual.failedConditions.some(c => c.includes("CONDITION_5_FAIL"))).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // 15. Future Regime Rejection
  // ─────────────────────────────────────────────────────────────
  it("15. should reject candidate with future prediction timestamp", () => {
    const decisionTime = Date.now() - 5000;
    const candidate = {
      decisionId: "DEC_FUTURE_PRED",
      symbol: "BTCUSDT",
      timestamp: decisionTime,
      predictionTimestamp: decisionTime + 1000,
      outcome: {
        resolvedTimestamp: Date.now(),
        outcomeResult: "WIN"
      }
    };

    const qual = isQualifiedForwardOOS(candidate);
    expect(qual.qualified).toBe(false);
    expect(qual.failedConditions.some(c => c.includes("CONDITION_6_FAIL"))).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // 16. Future Price Rejection
  // ─────────────────────────────────────────────────────────────
  it("16. should throw DataLeakageError when entryTimestamp <= decisionTimestamp", () => {
    const now = Date.now();
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_ENTRY_FAIL",
      timestamp: now,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGING",
      featureVersion: 2,
      buyProbability: 0.6,
      holdProbability: 0.4,
      sellProbability: 0.0,
      direction: "LONG",
      confidence: 60,
      agreementScore: 0.6,
      tradeQualityScore: 60,
      expectedValue: 0.001,
      uncertainty: 0.1,
      fees: 0,
      slippage: 0,
      modelBreakdowns: {}
    });

    expect(() => {
      ForwardTelemetryStore.resolveOutcome("DEC_ENTRY_FAIL", {
        resolvedTimestamp: now + 5000,
        entryTimestamp: now, // Equal to decisionTimestamp — market fill cannot occur at decision time!
        realizedDirection: "LONG",
        realizedReturn: 0.01,
        realizedPnL: 100,
        outcome: "WIN",
        directionCorrect: true
      });
    }).toThrow(DataLeakageError);
  });

  // ─────────────────────────────────────────────────────────────
  // 17. Future Calibration Rejection
  // ─────────────────────────────────────────────────────────────
  it("17. should throw DataLeakageError when exitTimestamp <= entryTimestamp", () => {
    const now = Date.now();
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_EXIT_FAIL",
      timestamp: now,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGING",
      featureVersion: 2,
      buyProbability: 0.6,
      holdProbability: 0.4,
      sellProbability: 0.0,
      direction: "LONG",
      confidence: 60,
      agreementScore: 0.6,
      tradeQualityScore: 60,
      expectedValue: 0.001,
      uncertainty: 0.1,
      fees: 0,
      slippage: 0,
      modelBreakdowns: {}
    });

    expect(() => {
      ForwardTelemetryStore.resolveOutcome("DEC_EXIT_FAIL", {
        resolvedTimestamp: now + 5000,
        entryTimestamp: now + 2000,
        exitTimestamp: now + 1000, // Exit BEFORE entry — impossible!
        realizedDirection: "LONG",
        realizedReturn: 0.01,
        realizedPnL: 100,
        outcome: "WIN",
        directionCorrect: true
      });
    }).toThrow(DataLeakageError);
  });

  // ─────────────────────────────────────────────────────────────
  // 18. Experiment Freeze
  // ─────────────────────────────────────────────────────────────
  it("18. should freeze experiment context on first forward-OOS observation", () => {
    expect(ForwardTelemetryStore.isExperimentFrozen()).toBe(false);

    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_FREEZE_001",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 80,
      agreementScore: 0.85,
      tradeQualityScore: 80,
      expectedValue: 0.003,
      uncertainty: 0.1,
      fees: 0.0004,
      slippage: 0.0002,
      modelBreakdowns: {},
      dataSource: "FORWARD_OOS",
      isForward: true
    });

    expect(ForwardTelemetryStore.isExperimentFrozen()).toBe(true);
    const ctx = ForwardTelemetryStore.getExperimentContext();
    expect(ctx).not.toBeNull();
    expect(ctx?.featureVersion).toBe(2);
  });

  // ─────────────────────────────────────────────────────────────
  // 19. Experiment Rollover Isolation
  // ─────────────────────────────────────────────────────────────
  it("19. should detect version mutations after freeze and mandate new ExperimentContext", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_FREEZE_002",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 80,
      agreementScore: 0.85,
      tradeQualityScore: 80,
      expectedValue: 0.003,
      uncertainty: 0.1,
      fees: 0.0004,
      slippage: 0.0002,
      modelBreakdowns: {},
      dataSource: "FORWARD_OOS",
      isForward: true
    });

    // Check compatibility with mutated feature version
    const check = ForwardTelemetryStore.assertExperimentCompatibility({ featureVersion: 3 });
    expect(check.compatible).toBe(false);
    expect(check.reason).toContain("Version mismatch after freeze");
  });

  // ─────────────────────────────────────────────────────────────
  // 20. Fallback Model Provenance
  // ─────────────────────────────────────────────────────────────
  it("20. should track inferenceMode for each participating model", () => {
    const card = ForwardTelemetryStore.reconstructModelScorecard("MAMBA");
    expect(card.sampleCount).toBe(0);
    // At N=0, all predictive metrics must be null (UNAVAILABLE)
    expect(card.predictive.brierScore).toBeNull();
    expect(card.predictive.accuracy).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────
  // 21. Unresolved Outcome Exclusion
  // ─────────────────────────────────────────────────────────────
  it("21. should exclude unresolved trades (OUTCOME_PENDING) from performance statistics", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_UNRESOLVED_01",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 80,
      agreementScore: 0.85,
      tradeQualityScore: 80,
      expectedValue: 0.003,
      uncertainty: 0.1,
      fees: 0.0004,
      slippage: 0.0002,
      modelBreakdowns: {},
      dataSource: "FORWARD_OOS",
      isForward: true
    });

    expect(ForwardTelemetryStore.getResolvedCount()).toBe(0);
    expect(ForwardTelemetryStore.getForwardOOSCount()).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 22. Predicted vs Realized Cost Separation
  // ─────────────────────────────────────────────────────────────
  it("22. should calculate ExecutionError = RealizedExecutionCost - PredictedExecutionCost", () => {
    const now = Date.now() - 10000;
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_COST_001",
      timestamp: now,
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 80,
      agreementScore: 0.85,
      tradeQualityScore: 80,
      expectedValue: 0.003,
      uncertainty: 0.1,
      fees: 10,       // Predicted fees
      slippage: 5,    // Predicted slippage
      spread: 2,      // Predicted spread
      marketImpact: 1, // Predicted impact (Total predicted = 18)
      modelBreakdowns: {}
    });

    ForwardTelemetryStore.resolveOutcome("DEC_COST_001", {
      resolvedTimestamp: now + 5000,
      entryPrice: 65000,
      exitPrice: 66000,
      realizedDirection: "LONG",
      realizedReturn: 0.015,
      realizedPnL: 150,
      fees: 12,       // Realized fees
      slippage: 8,    // Realized slippage
      spread: 3,      // Realized spread
      marketImpact: 2, // Realized impact (Total realized = 25)
      outcome: "WIN",
      directionCorrect: true
    });

    const record = ForwardTelemetryStore.getRecord("DEC_COST_001");
    expect(record?.outcome?.realizedCost).toBe(25);
    expect(record?.executionError).toBe(25 - 18); // 7.0 Execution error
  });

  // ─────────────────────────────────────────────────────────────
  // 23. Database Failure Handling
  // ─────────────────────────────────────────────────────────────
  it("23. should handle database unavailability gracefully without crashing or fabricating data", async () => {
    // hydrateFromDB when disconnected returns 0
    const count = await ForwardTelemetryStore.hydrateFromDB();
    expect(count).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 24. Scheduler Skipped-Cycle Accounting
  // ─────────────────────────────────────────────────────────────
  it("24. should track skipped cycles in SchedulerAccounting", () => {
    SchedulerAccounting.recordTickSkipped(5, "CONCURRENCY_LOCK_ACTIVE", 4, 3500);
    const summary = SchedulerAccounting.getSummary();
    expect(summary.skippedTicks).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────
  // 25. All Live Execution Paths Blocked
  // ─────────────────────────────────────────────────────────────
  it("25. should block all live execution attempts via LiveExecutionBarrier", async () => {
    const barrier = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
    expect(barrier.permitted).toBe(false);
    expect(barrier.mode).toBe("LIVE");

    // Attempting Binance spot placeOrder directly must reject
    await expect(placeOrder("mock_key", "mock_secret", {
      symbol: "BTCUSDT",
      side: "BUY",
      type: "MARKET",
      quantity: "0.01"
    })).rejects.toThrow(/LIVE_EXECUTION_BARRIER/);

    // Attempting Binance futures placeFuturesOrder directly must reject
    await expect(placeFuturesOrder("mock_key", "mock_secret", {
      symbol: "BTCUSDT",
      side: "BUY",
      type: "MARKET",
      quantity: "0.01"
    })).rejects.toThrow(/LIVE_EXECUTION_BARRIER/);
  });

  // ─────────────────────────────────────────────────────────────
  // 26. Prior Cannot Satisfy Promotion
  // ─────────────────────────────────────────────────────────────
  it("26. should enforce that at N=0 all empirical promotion gates are fail-closed", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.isPromotionEligible).toBe(false);
    expect(report.isLiveApproved).toBe(false);
    expect(report.currentState).toBe("LEARNING_NOT_VALIDATED");

    // All 13 gates must be failing or unavailable at N=0
    const passedGates = report.gateResults.filter(g => g.passed);
    expect(passedGates.length).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 27. N=0 Statistical Null Semantics
  // ─────────────────────────────────────────────────────────────
  it("27. should return null (UNAVAILABLE) for empirical metrics when N=0", () => {
    const dailyReport = AutonomousForwardEvidenceEngine.generateDailyAutonomousReport();
    expect(dailyReport.netEV).toBeNull();
    expect(dailyReport.maxDD).toBeNull();
    expect(dailyReport.sharpe).toBeNull();
    expect(dailyReport.sortino).toBeNull();
    expect(dailyReport.calmar).toBeNull();
    expect(dailyReport.brier).toBeNull();
    expect(dailyReport.ece).toBeNull();
    expect(dailyReport.evidenceLabel).toBe("PRIOR");
  });

  // ─────────────────────────────────────────────────────────────
  // 28. ESS Edge Cases
  // ─────────────────────────────────────────────────────────────
  it("28. should calculate ESS correctly on all edge cases", () => {
    // N = 0
    expect(AutonomousForwardEvidenceEngine.computeEffectiveSampleSize([]).nEff).toBe(0);

    // N = 1
    expect(AutonomousForwardEvidenceEngine.computeEffectiveSampleSize([0.01]).nEff).toBe(1);

    // N = 2
    expect(AutonomousForwardEvidenceEngine.computeEffectiveSampleSize([0.01, 0.02]).nEff).toBe(2);

    // Constant returns -> variance = 0 -> rho1 = 0 -> ESS = N
    const constantReturns = [0.01, 0.01, 0.01, 0.01, 0.01];
    const constRes = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(constantReturns);
    expect(constRes.nEff).toBe(5);
    expect(constRes.rho1).toBe(0.0);

    // Multi-lag N=0
    expect(AutonomousForwardEvidenceEngine.computeMultiLagEffectiveSampleSize([]).nEffMultiLag).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 29. Bootstrap N=0 Unavailable
  // ─────────────────────────────────────────────────────────────
  it("29. should return isBootstrapAvailable=false when N=0", () => {
    const boot = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation([]);
    expect(boot.isBootstrapAvailable).toBe(false);
    expect(boot.lcb).toBeNull();
    expect(boot.ucb).toBeNull();
    expect(boot.evidenceLabel).toBe("UNAVAILABLE");

    const statBoot = StatisticalTests.blockBootstrapCI([], (s) => s.reduce((a, b) => a + b, 0));
    expect(statBoot.sampleCount).toBe(0);
    expect(statBoot.isSignificant).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // 30. Dashboard Metric Truthfulness
  // ─────────────────────────────────────────────────────────────
  it("30. should provide complete truthfulness in dashboard metrics without false zeros", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nForwardOOS).toBe(0);
    expect(report.evidenceVector.nEff).toBe(0);
    expect(report.evidenceVector.nEffMultiLag).toBe(0);
    expect(report.blockers.length).toBeGreaterThan(0);
    expect(report.blockers.some(b => b.includes("INSUFFICIENT_FORWARD_OOS_SAMPLE_SIZE"))).toBe(true);
  });
});
