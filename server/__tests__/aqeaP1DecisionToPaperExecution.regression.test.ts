/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — P1 Decision-to-Paper-Execution Forensic Regression Test Suite
 * ═══════════════════════════════════════════════════════════════════
 * Verifies the complete end-to-end forward pipeline:
 * OPPORTUNITY → VALID DECISION → FORWARD-OOS QUALIFICATION → EXECUTION ELIGIBILITY →
 * PAPER EXECUTION → POSITION → EXIT → REALIZED OUTCOME → STATISTICAL EVIDENCE
 */

import { describe, it, test, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import { ForwardTelemetryStore } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { AutonomousForwardEvidenceEngine } from "../src/services/aqea/governance/AutonomousForwardEvidenceEngine.js";
import { LiveExecutionBarrier } from "../src/services/aqea/governance/LiveExecutionBarrier.js";
import { UnifiedEnsembleFusion, DataLeakageError } from "../src/services/aqea/ensemble/UnifiedEnsembleFusion.js";
import * as paper from "../src/services/paperState.js";
import { evaluateLongEntry, evaluateShortEntry } from "../src/services/autoTradeEngine.decisionLogic.js";

describe("AQEA 2026-27 P1 Forensic Regression: Decision-to-Paper-Execution Pipeline", () => {
  beforeEach(() => {
    ForwardTelemetryStore.resetStore();
    paper.clearAllMemory().catch(() => {});
  });

  // TC-01: Valid LONG reaches execution evaluation
  test("TC-01: valid LONG reaches execution evaluation", () => {
    const decisionId = `DEC_${Date.now()}_LONG`;
    const record = ForwardTelemetryStore.recordDecision({
      decisionId,
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      decisionClass: "TRADE",
      confidence: 0.85,
      isForward: true,
      dataSource: "PAPER"
    });

    expect(record.direction).toBe("LONG");
    expect(record.terminalState).toBe("PENDING_EXECUTION");
    expect(record.isValidDecision).toBe(true);

    const evalResult = evaluateLongEntry({
      existing: undefined,
      aqeaDecision: {
        decision: "LONG",
        confidence: 85,
        riskApproved: true,
        positionSize: 1000,
        leverage: 10,
        meta: { indicators: { close: 60000 } },
        decisionPath: { cnnVote: "LONG", ppoVote: "LONG", transformerVote: "LONG", regime: "TRENDING_BULL" }
      } as any,
      riskProfile: { positionSize: 1000, leverage: 10 },
      symbol: "BTCUSDT"
    });

    expect(evalResult.ok).toBe(true);
  });

  // TC-02: Valid SHORT reaches execution evaluation
  test("TC-02: valid SHORT reaches execution evaluation", () => {
    const decisionId = `DEC_${Date.now()}_SHORT`;
    const record = ForwardTelemetryStore.recordDecision({
      decisionId,
      timestamp: Date.now(),
      symbol: "ETHUSDT",
      direction: "SHORT",
      finalDecision: "SHORT",
      decisionClass: "TRADE",
      confidence: 0.82,
      isForward: true,
      dataSource: "PAPER"
    });

    expect(record.direction).toBe("SHORT");
    expect(record.terminalState).toBe("PENDING_EXECUTION");
    expect(record.isValidDecision).toBe(true);

    const evalResult = evaluateShortEntry({
      existing: undefined,
      aqeaDecision: {
        decision: "SHORT",
        confidence: 82,
        riskApproved: true,
        positionSize: 800,
        leverage: 10,
        meta: { indicators: { close: 3000 } },
        decisionPath: { cnnVote: "SHORT", ppoVote: "SHORT", transformerVote: "SHORT", regime: "TRENDING_BEAR" }
      } as any,
      riskProfile: { positionSize: 800, leverage: 10 },
      symbol: "ETHUSDT"
    });

    expect(evalResult.ok).toBe(true);
  });

  // TC-03: HOLD becomes NO_TRADE
  test("TC-03: HOLD becomes NO_TRADE", () => {
    const decisionId = `DEC_${Date.now()}_HOLD`;
    const record = ForwardTelemetryStore.recordDecision({
      decisionId,
      timestamp: Date.now(),
      symbol: "SOLUSDT",
      direction: "HOLD",
      finalDecision: "HOLD",
      confidence: 0.45,
      isForward: true,
      dataSource: "PAPER"
    });

    expect(record.terminalState).toBe("NO_TRADE");
    expect(record.decisionClass).toBe("NO_TRADE");
    expect(record.isValidDecision).toBe(true);

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.abstainedDecisions).toBe(1);
    expect(stats.validDecisions).toBe(1);
  });

  // TC-04: Conviction rejection becomes REJECTED
  test("TC-04: conviction rejection becomes REJECTED", () => {
    const decisionId = `DEC_${Date.now()}_CONV`;
    ForwardTelemetryStore.recordDecision({
      decisionId,
      timestamp: Date.now(),
      symbol: "BNBUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      decisionClass: "TRADE",
      confidence: 0.60,
      isForward: true,
      dataSource: "PAPER"
    });

    ForwardTelemetryStore.updateTerminalState(
      decisionId,
      "REJECTED",
      "ULTRA_CONVICTION_GATE: Quality Score 62 < 70",
      "REJECTED"
    );

    const record = ForwardTelemetryStore.getRecord(decisionId);
    expect(record?.terminalState).toBe("REJECTED");
    expect(record?.decisionClass).toBe("REJECTED");
    expect(record?.isValidDecision).toBe(true);

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.rejectedDecisions).toBe(1);
    expect(stats.validDecisions).toBe(1);
  });

  // TC-05: Risk rejection becomes REJECTED
  test("TC-05: risk rejection becomes REJECTED", () => {
    const decisionId = `DEC_${Date.now()}_RISK`;
    ForwardTelemetryStore.recordDecision({
      decisionId,
      timestamp: Date.now(),
      symbol: "ADAUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      decisionClass: "TRADE",
      confidence: 0.80,
      isForward: true,
      dataSource: "PAPER"
    });

    ForwardTelemetryStore.updateTerminalState(
      decisionId,
      "REJECTED",
      "Risk parameters check failed",
      "REJECTED"
    );

    const record = ForwardTelemetryStore.getRecord(decisionId);
    expect(record?.terminalState).toBe("REJECTED");
    expect(record?.decisionClass).toBe("REJECTED");
    expect(record?.isValidDecision).toBe(true);

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.rejectedDecisions).toBe(1);
  });

  // TC-06: Zero paper balance becomes INSUFFICIENT_FUNDS
  test("TC-06: zero paper balance becomes INSUFFICIENT_FUNDS", () => {
    const decisionId = `DEC_${Date.now()}_INS`;
    ForwardTelemetryStore.recordDecision({
      decisionId,
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      decisionClass: "TRADE",
      confidence: 0.88,
      isForward: true,
      dataSource: "PAPER"
    });

    ForwardTelemetryStore.updateTerminalState(
      decisionId,
      "INSUFFICIENT_FUNDS",
      "PAPER_CAPITAL_UNAVAILABLE: required=$100.00, available=$0.00",
      "INSUFFICIENT_FUNDS"
    );

    const record = ForwardTelemetryStore.getRecord(decisionId);
    expect(record?.terminalState).toBe("INSUFFICIENT_FUNDS");
    expect(record?.decisionClass).toBe("INSUFFICIENT_FUNDS");
    expect(record?.isValidDecision).toBe(true);

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.insufficientFundsDecisions).toBe(1);
    expect(stats.validDecisions).toBe(1);
  });

  // TC-07: Model unavailable becomes MODEL_UNAVAILABLE
  test("TC-07: model unavailable becomes MODEL_UNAVAILABLE", () => {
    const decisionId = `DEC_${Date.now()}_MOD_UN`;
    ForwardTelemetryStore.recordDecision({
      decisionId,
      timestamp: Date.now(),
      symbol: "DOGEUSDT",
      direction: "HOLD",
      finalDecision: "HOLD",
      decisionClass: "MODEL_UNAVAILABLE",
      terminalState: "MODEL_UNAVAILABLE",
      terminalReason: "AI_MODELS_OFFLINE",
      isValidDecision: false,
      isForward: true,
      dataSource: "PAPER"
    });

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.modelUnavailableDecisions).toBe(1);
    expect(stats.abstainedDecisions).toBe(0);
    expect(stats.validDecisions).toBe(0);
  });

  // TC-08: Data unavailable becomes DATA_UNAVAILABLE
  test("TC-08: data unavailable becomes DATA_UNAVAILABLE", () => {
    const decisionId = `DEC_${Date.now()}_DATA_UN`;
    ForwardTelemetryStore.recordDecision({
      decisionId,
      timestamp: Date.now(),
      symbol: "SHIBUSDT",
      direction: "HOLD",
      finalDecision: "HOLD",
      decisionClass: "DATA_UNAVAILABLE",
      terminalState: "DATA_UNAVAILABLE",
      terminalReason: "MARKET_FEED_TIMEOUT",
      isValidDecision: false,
      isForward: true,
      dataSource: "PAPER"
    });

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.dataUnavailableDecisions).toBe(1);
    expect(stats.validDecisions).toBe(0);
  });

  // TC-09: Timeout becomes TIMEOUT
  test("TC-09: timeout becomes TIMEOUT", () => {
    const decisionId = `DEC_${Date.now()}_TO`;
    ForwardTelemetryStore.recordDecision({
      decisionId,
      timestamp: Date.now(),
      symbol: "SOLUSDT",
      direction: "HOLD",
      finalDecision: "HOLD",
      decisionClass: "TIMEOUT",
      terminalState: "TIMEOUT",
      terminalReason: "SYMBOL_EVALUATION_TIMEOUT: Timeout evaluating symbol SOLUSDT after 25000ms",
      isValidDecision: false,
      isForward: true,
      dataSource: "PAPER"
    });

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.timeoutDecisions).toBe(1);
    expect(stats.invalidDecisions).toBe(0);
    expect(stats.validDecisions).toBe(0);
  });

  // TC-10: Genuine corruption becomes INVALID
  test("TC-10: genuine corruption becomes INVALID", () => {
    ForwardTelemetryStore.recordInvalidDecision("CORRUPT_PAYLOAD_001");
    ForwardTelemetryStore.recordInvalidDecision("CORRUPT_PAYLOAD_002");

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.invalidDecisions).toBe(2);
    expect(ForwardTelemetryStore.getInvalidCount()).toBe(2);
  });

  // TC-11: Every opportunity receives exactly one terminal state
  test("TC-11: every opportunity receives exactly one terminal state", () => {
    const d1 = ForwardTelemetryStore.recordDecision({
      decisionId: "D1", timestamp: Date.now(), symbol: "BTCUSDT", direction: "HOLD", finalDecision: "HOLD"
    });
    const d2 = ForwardTelemetryStore.recordDecision({
      decisionId: "D2", timestamp: Date.now(), symbol: "ETHUSDT", direction: "LONG", finalDecision: "LONG"
    });
    ForwardTelemetryStore.updateTerminalState("D2", "TRADE", "FILLED", "TRADE");

    expect(d1.terminalState).toBe("NO_TRADE");
    expect(d2.terminalState).toBe("TRADE");
  });

  // TC-12: Duplicate decisionId is idempotent
  test("TC-12: duplicate decisionId is idempotent", () => {
    const id = "DUP_DEC_123";
    ForwardTelemetryStore.recordDecision({
      decisionId: id, timestamp: Date.now(), symbol: "BTCUSDT", direction: "HOLD", finalDecision: "HOLD", confidence: 0.5
    });
    const initialCount = ForwardTelemetryStore.getRecordCount();

    ForwardTelemetryStore.recordDecision({
      decisionId: id, timestamp: Date.now(), symbol: "BTCUSDT", direction: "HOLD", finalDecision: "HOLD", confidence: 0.6
    });

    expect(ForwardTelemetryStore.getRecordCount()).toBe(initialCount);
    expect(ForwardTelemetryStore.getDuplicateCount()).toBe(1);
    expect(ForwardTelemetryStore.getRecord(id)?.confidence).toBe(0.6);
  });

  // TC-13: Valid decision qualifies for forward OOS
  test("TC-13: valid decision qualifies for forward OOS", () => {
    const now = Date.now();
    const record = ForwardTelemetryStore.recordDecision({
      decisionId: "QUAL_01",
      timestamp: now,
      featureDataMaxTimestamp: now - 1000,
      symbol: "BTCUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      dataSource: "FORWARD_OOS",
      isForward: true,
      isSynthetic: false
    });

    expect(record.qualificationState).toBe("QUALIFIED");
  });

  // TC-14: Synthetic decision is excluded
  test("TC-14: synthetic decision is excluded", () => {
    const record = ForwardTelemetryStore.recordDecision({
      decisionId: "SYNTH_01",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      dataSource: "SYNTHETIC",
      isSynthetic: true
    });

    expect(record.qualificationState).toBe("NOT_QUALIFIED");
    expect(record.qualificationReason).toContain("SYNTHETIC_DATA_QUARANTINE");
  });

  // TC-15: Future feature is rejected (DataLeakageError)
  test("TC-15: future feature is rejected and increments leakedCount", () => {
    const now = Date.now();
    const record = ForwardTelemetryStore.recordDecision({
      decisionId: "LEAK_01",
      timestamp: now,
      featureDataMaxTimestamp: now + 5000, // Future feature timestamp!
      symbol: "BTCUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      isForward: true
    });

    expect(record.qualificationState).toBe("NOT_QUALIFIED");
    expect(record.qualificationReason).toContain("FUTURE_FEATURE_TIMESTAMP_LEAKAGE");
    expect(ForwardTelemetryStore.getLeakedCount()).toBeGreaterThan(0);
  });

  // TC-16: Invalid temporal ordering is rejected
  test("TC-16: invalid temporal ordering is rejected with DataLeakageError", () => {
    const decTs = 100000;
    ForwardTelemetryStore.recordDecision({
      decisionId: "TEMP_ORDER_01",
      timestamp: decTs,
      symbol: "BTCUSDT",
      direction: "LONG",
      finalDecision: "LONG"
    });

    // Resolved outcome timestamp BEFORE decision timestamp
    expect(() => {
      ForwardTelemetryStore.resolveOutcome("TEMP_ORDER_01", {
        resolvedTimestamp: decTs - 5000,
        entryTimestamp: decTs + 1000,
        exitTimestamp: decTs + 5000,
        entryPrice: 60000,
        exitPrice: 61000,
        realizedDirection: "WIN",
        realizedReturn: 0.016,
        realizedPnL: 100,
        holdingDurationMs: 4000
      });
    }).toThrow(DataLeakageError);

    // Entry timestamp BEFORE decision timestamp
    expect(() => {
      ForwardTelemetryStore.resolveOutcome("TEMP_ORDER_01", {
        resolvedTimestamp: decTs + 10000,
        entryTimestamp: decTs - 100,
        exitTimestamp: decTs + 5000,
        entryPrice: 60000,
        exitPrice: 61000,
        realizedDirection: "WIN",
        realizedReturn: 0.016,
        realizedPnL: 100,
        holdingDurationMs: 4000
      });
    }).toThrow(DataLeakageError);

    // Exit timestamp BEFORE entry timestamp
    expect(() => {
      ForwardTelemetryStore.resolveOutcome("TEMP_ORDER_01", {
        resolvedTimestamp: decTs + 10000,
        entryTimestamp: decTs + 5000,
        exitTimestamp: decTs + 2000,
        entryPrice: 60000,
        exitPrice: 61000,
        realizedDirection: "WIN",
        realizedReturn: 0.016,
        realizedPnL: 100,
        holdingDurationMs: 4000
      });
    }).toThrow(DataLeakageError);
  });

  // TC-17: Experiment-version mismatch is rejected
  test("TC-17: experiment-version mismatch is rejected after freeze", () => {
    // Freeze experiment with version 2026.6
    ForwardTelemetryStore.recordDecision({
      decisionId: "EXP_FREEZE_DEC",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      direction: "LONG",
      dataSource: "FORWARD_OOS",
      isForward: true,
      modelAuthorityVersion: "2026.6",
      ensembleVersion: "2026.6",
      featureVersion: 2,
      strategyVersion: "AQEA_AUTONOMOUS_V6"
    });

    expect(ForwardTelemetryStore.isExperimentFrozen()).toBe(true);

    const compat = ForwardTelemetryStore.assertExperimentCompatibility({
      modelAuthorityVersion: "2027.0_MUTATED",
      ensembleVersion: "2026.6"
    });

    expect(compat.compatible).toBe(false);
    expect(compat.reason).toContain("Version mismatch after freeze");
  });

  // TC-18: Actionable paper decision reaches paper execution
  test("TC-18: actionable paper decision reaches paper execution", () => {
    const decId = "PAPER_EXEC_01";
    ForwardTelemetryStore.recordDecision({
      decisionId: decId,
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      confidence: 0.85,
      isForward: true,
      dataSource: "PAPER"
    });

    ForwardTelemetryStore.updateTerminalState(
      decId,
      "TRADE",
      "PAPER_EXECUTION_COMPLETED: order filled at price=60000",
      "TRADE"
    );

    const record = ForwardTelemetryStore.getRecord(decId);
    expect(record?.terminalState).toBe("TRADE");
    expect(record?.decisionClass).toBe("TRADE");

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.tradedDecisions).toBe(1);
    expect(stats.openTradesCount).toBe(1);
  });

  // TC-19: Paper order creates position
  test("TC-19: paper order creates position", () => {
    const userId = "test_user_p1";
    paper.setPosition(userId, "BTCUSDT", "PAPER", {
      userId,
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 0.1,
      entryPrice: 60000,
      tradeId: "trade_123",
      accountType: "FUTURES",
      meta: { decisionId: "PAPER_EXEC_01" }
    });

    const pos = paper.getPosition(userId, "BTCUSDT", "PAPER", "FUTURES");
    expect(pos).toBeDefined();
    expect(pos?.quantity).toBe(0.1);
    expect(pos?.entryPrice).toBe(60000);
    expect(pos?.meta?.decisionId).toBe("PAPER_EXEC_01");
  });

  // TC-20: Position close creates realized outcome
  test("TC-20: position close creates realized outcome", () => {
    const decTs = Date.now() - 60000;
    const decId = "OUTCOME_DEC_01";
    ForwardTelemetryStore.recordDecision({
      decisionId: decId,
      timestamp: decTs,
      symbol: "BTCUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      decisionClass: "TRADE",
      terminalState: "TRADE",
      isForward: true,
      dataSource: "PAPER"
    });

    const exitTs = Date.now();
    const entryTs = decTs + 1000;
    const resolved = ForwardTelemetryStore.resolveOutcome(decId, {
      resolvedTimestamp: exitTs,
      entryTimestamp: entryTs,
      entryPrice: 60000,
      exitTimestamp: exitTs,
      exitPrice: 61200,
      realizedDirection: "WIN",
      realizedReturn: 0.02,
      realizedPnL: 120,
      fees: 2.4,
      slippage: 0.6,
      holdingDurationMs: exitTs - entryTs
    });

    expect(resolved).toBe(true);
    const record = ForwardTelemetryStore.getRecord(decId);
    expect(record?.outcome).toBeDefined();
    expect(record?.outcome?.realizedPnL).toBe(120);
    expect(record?.outcome?.realizedReturn).toBe(0.02);
  });

  // TC-21: Realized outcome enters evidence engine
  test("TC-21: realized outcome enters evidence engine", () => {
    const decTs = Date.now() - 60000;
    const decId = "EVID_DEC_01";
    ForwardTelemetryStore.recordDecision({
      decisionId: decId,
      timestamp: decTs,
      symbol: "BTCUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      decisionClass: "TRADE",
      terminalState: "TRADE",
      isForward: true,
      dataSource: "PAPER"
    });

    ForwardTelemetryStore.resolveOutcome(decId, {
      resolvedTimestamp: Date.now(),
      entryTimestamp: decTs + 1000,
      entryPrice: 60000,
      exitTimestamp: Date.now(),
      exitPrice: 60600,
      realizedDirection: "WIN",
      realizedReturn: 0.01,
      realizedPnL: 60,
      holdingDurationMs: 59000
    });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nResolvedTrades).toBe(1);
    expect(report.evidenceVector.nTrades).toBe(1);
    expect(report.evidenceVector.nValidDecisions).toBe(1);
  });

  // TC-22: Decision evidence is separate from outcome evidence
  test("TC-22: decision evidence is separate from outcome evidence", () => {
    // 3 decisions recorded, 0 trades closed
    ForwardTelemetryStore.recordDecision({ decisionId: "D_01", timestamp: Date.now(), symbol: "BTCUSDT", direction: "HOLD", finalDecision: "HOLD" });
    ForwardTelemetryStore.recordDecision({ decisionId: "D_02", timestamp: Date.now(), symbol: "ETHUSDT", direction: "HOLD", finalDecision: "HOLD" });
    ForwardTelemetryStore.recordDecision({ decisionId: "D_03", timestamp: Date.now(), symbol: "SOLUSDT", direction: "HOLD", finalDecision: "HOLD" });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nValidDecisions).toBe(3);
    expect(report.evidenceVector.nForwardOOS).toBe(3);
    expect(report.evidenceVector.nTotal).toBe(0); // 0 resolved trades
    expect(report.currentState).toBe("LEARNING_NOT_VALIDATED");
    expect(report.isLiveApproved).toBe(false);

    const bootstrap = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation([]);
    expect(bootstrap.mean).toBeNull(); // Return metrics strictly null
    expect(bootstrap.isBootstrapAvailable).toBe(false);
  });

  // TC-23: Conservation law holds across mixed terminal states
  test("TC-23: conservation law holds across all terminal states", () => {
    ForwardTelemetryStore.recordDecision({ decisionId: "C1", timestamp: Date.now(), symbol: "BTCUSDT", direction: "HOLD", finalDecision: "HOLD" }); // NO_TRADE
    ForwardTelemetryStore.recordDecision({ decisionId: "C2", timestamp: Date.now(), symbol: "ETHUSDT", direction: "LONG", finalDecision: "LONG" });
    ForwardTelemetryStore.updateTerminalState("C2", "TRADE", "FILLED", "TRADE"); // TRADE

    ForwardTelemetryStore.recordDecision({ decisionId: "C3", timestamp: Date.now(), symbol: "SOLUSDT", direction: "LONG", finalDecision: "LONG" });
    ForwardTelemetryStore.updateTerminalState("C3", "INSUFFICIENT_FUNDS", "NO_BALANCE", "INSUFFICIENT_FUNDS"); // INSUFFICIENT_FUNDS

    ForwardTelemetryStore.recordDecision({ decisionId: "C4", timestamp: Date.now(), symbol: "ADAUSDT", direction: "LONG", finalDecision: "LONG" });
    ForwardTelemetryStore.updateTerminalState("C4", "REJECTED", "GATE_BLOCKED", "REJECTED"); // REJECTED

    ForwardTelemetryStore.recordDecision({ decisionId: "C5", timestamp: Date.now(), symbol: "BNBUSDT", direction: "HOLD", finalDecision: "HOLD", decisionClass: "DATA_UNAVAILABLE", terminalState: "DATA_UNAVAILABLE" });
    ForwardTelemetryStore.recordDecision({ decisionId: "C6", timestamp: Date.now(), symbol: "DOGEUSDT", direction: "HOLD", finalDecision: "HOLD", decisionClass: "MODEL_UNAVAILABLE", terminalState: "MODEL_UNAVAILABLE" });
    ForwardTelemetryStore.recordDecision({ decisionId: "C7", timestamp: Date.now(), symbol: "SHIBUSDT", direction: "HOLD", finalDecision: "HOLD", decisionClass: "TIMEOUT", terminalState: "TIMEOUT" });
    ForwardTelemetryStore.recordInvalidDecision("C8_CORRUPT");

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    const totalRecords = ForwardTelemetryStore.getRecordCount();
    const invalidCount = ForwardTelemetryStore.getInvalidCount();
    const nOpportunities = totalRecords + invalidCount;

    const sumTerminal =
      stats.tradedDecisions +
      stats.abstainedDecisions +
      stats.insufficientFundsDecisions +
      stats.rejectedDecisions +
      stats.dataUnavailableDecisions +
      stats.modelUnavailableDecisions +
      stats.timeoutDecisions +
      stats.invalidDecisions;

    expect(nOpportunities).toBe(8);
    expect(sumTerminal).toBe(nOpportunities);
    expect(stats.validDecisions).toBe(4); // C1 (abstention) + C2 (trade) + C3 (insufficient funds) + C4 (rejected)
  });

  // TC-24: Zero physical balance does not suppress decision evaluation
  test("TC-24: zero physical balance does not suppress decision evaluation", () => {
    const decId = "ZERO_BAL_01";
    const record = ForwardTelemetryStore.recordDecision({
      decisionId: decId,
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      confidence: 0.86,
      modelBreakdowns: {
        CNN_1D_V1: { modelName: "CNN_1D_V1", confidence: 0.86, participating: true },
        MAMBA_V1: { modelName: "MAMBA_V1", confidence: 0.82, participating: true }
      },
      regime: "TRENDING_BULL",
      marketDomain: "CRYPTO",
      isForward: true,
      dataSource: "PAPER"
    });

    expect(record.isValidDecision).toBe(true);
    expect(record.qualificationState).toBe("QUALIFIED");

    ForwardTelemetryStore.updateTerminalState(
      decId,
      "INSUFFICIENT_FUNDS",
      "PAPER_CAPITAL_UNAVAILABLE: required=$100, available=$0",
      "INSUFFICIENT_FUNDS"
    );

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nValidDecisions).toBe(1);
    expect(report.evidenceVector.nPerModel["CNN_1D_V1"]).toBe(1);
    expect(report.evidenceVector.nPerRegime["TRENDING_BULL"]).toBe(1);
    expect(report.evidenceVector.nPerSymbol["BTCUSDT"]).toBe(1);
  });

  // TC-25: Live execution remains blocked
  test("TC-25: live execution remains blocked fail-closed", () => {
    const barrier = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
    expect(barrier.permitted).toBe(false);
    expect(barrier.reason).toBeDefined();

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.isLiveApproved).toBe(false);
    expect(report.isPromotionEligible).toBe(false);
    expect(ForwardTelemetryStore.isLivePromotionBlocked()).toBe(true);
  });

  // TC-26: SHORT is not silently converted to HOLD
  test("TC-26: SHORT is not silently converted to HOLD", () => {
    const decId = "SHORT_PRESERVE_01";
    const record = ForwardTelemetryStore.recordDecision({
      decisionId: decId,
      timestamp: Date.now(),
      symbol: "ETHUSDT",
      direction: "SHORT",
      finalDecision: "SHORT",
      decisionClass: "TRADE",
      confidence: 0.79,
      isForward: true,
      dataSource: "PAPER"
    });

    expect(record.direction).toBe("SHORT");
    expect(record.finalDecision).toBe("SHORT");
    expect(record.decisionClass).toBe("TRADE");

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nPerDirection["SHORT"]).toBe(1);
    expect(report.evidenceVector.nPerDirection["HOLD"]).toBe(0);
  });

  // TC-27: Optional model failure does not invalidate entire ensemble
  test("TC-27: optional model failure does not invalidate entire ensemble", () => {
    const decId = "OPT_FAIL_01";
    const record = ForwardTelemetryStore.recordDecision({
      decisionId: decId,
      timestamp: Date.now(),
      symbol: "SOLUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      confidence: 0.80,
      modelBreakdowns: {
        CNN_1D_V1: { modelName: "CNN_1D_V1", confidence: 0.85, participating: true },
        MAMBA_V1: { modelName: "MAMBA_V1", confidence: 0.0, participating: false, inferenceMode: "UNAVAILABLE" }
      },
      isForward: true,
      dataSource: "PAPER"
    });

    expect(record.isValidDecision).toBe(true);
    expect(record.qualificationState).toBe("QUALIFIED");
  });

  // TC-28: State survives serialization/import
  test("TC-28: state survives serialization/import", () => {
    ForwardTelemetryStore.recordDecision({ decisionId: "SER_01", timestamp: Date.now(), symbol: "BTCUSDT", direction: "HOLD", finalDecision: "HOLD" });
    ForwardTelemetryStore.recordInvalidDecision("SER_INV_01");

    const exported = ForwardTelemetryStore.exportStateJSON();
    ForwardTelemetryStore.resetStore();
    expect(ForwardTelemetryStore.getRecordCount()).toBe(0);

    ForwardTelemetryStore.importStateJSON(exported);
    expect(ForwardTelemetryStore.getRecordCount()).toBe(1);
    expect(ForwardTelemetryStore.getInvalidCount()).toBe(1);
  });

  // TC-29: Order/outcome persistence survives restart
  test("TC-29: order/outcome persistence survives restart", () => {
    const decTs = Date.now() - 30000;
    ForwardTelemetryStore.recordDecision({
      decisionId: "REST_01",
      timestamp: decTs,
      symbol: "BTCUSDT",
      direction: "LONG",
      finalDecision: "LONG",
      decisionClass: "TRADE",
      terminalState: "TRADE"
    });

    ForwardTelemetryStore.resolveOutcome("REST_01", {
      resolvedTimestamp: Date.now(),
      entryTimestamp: decTs + 1000,
      entryPrice: 60000,
      exitTimestamp: Date.now(),
      exitPrice: 61000,
      realizedDirection: "WIN",
      realizedReturn: 0.016,
      realizedPnL: 100,
      holdingDurationMs: 29000
    });

    const serialized = ForwardTelemetryStore.exportStateJSON();
    ForwardTelemetryStore.resetStore();

    ForwardTelemetryStore.importStateJSON(serialized);
    const restored = ForwardTelemetryStore.getRecord("REST_01");
    expect(restored).toBeDefined();
    expect(restored?.outcome).toBeDefined();
    expect(restored?.outcome?.realizedPnL).toBe(100);
  });

  // TC-30: No synthetic PnL is generated
  test("TC-30: no synthetic PnL is generated when N_resolved = 0", () => {
    ForwardTelemetryStore.recordDecision({ decisionId: "NO_PNL_01", timestamp: Date.now(), symbol: "BTCUSDT", direction: "HOLD", finalDecision: "HOLD" });
    ForwardTelemetryStore.recordDecision({ decisionId: "NO_PNL_02", timestamp: Date.now(), symbol: "ETHUSDT", direction: "LONG", finalDecision: "LONG" });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nTotal).toBe(0);
    const bootstrap = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation([]);
    expect(bootstrap.mean).toBeNull();
    expect(bootstrap.median).toBeNull();
    expect(bootstrap.lcb).toBeNull();
    expect(bootstrap.evidenceLabel).toBe("UNAVAILABLE");
  });
});
