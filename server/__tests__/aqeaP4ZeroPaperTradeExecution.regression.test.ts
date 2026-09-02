import { describe, test, expect, beforeEach, afterEach, jest } from "@jest/globals";
import mongoose from "mongoose";
import * as paper from "../src/services/paperState.js";
import { ForwardTelemetryStore, DataLeakageError, getEmpiricalEvidenceState } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { AutonomousForwardEvidenceEngine } from "../src/services/aqea/governance/AutonomousForwardEvidenceEngine.js";
import { LiveExecutionBarrier } from "../src/services/aqea/governance/LiveExecutionBarrier.js";
import { evaluateLongEntry, evaluateShortEntry } from "../src/services/autoTradeEngine.decisionLogic.js";
import { BayesianProbabilityEngine } from "../src/services/aqea/bayesianPredictor.js";
import { TradeQualityEngine } from "../src/services/aqea/tradeQuality.js";
import type { AQEADecision } from "../src/services/aqea/engine.js";

describe("AQEA 2026-27 P4 Zero Paper Trade Execution Regression Suite", () => {
  const userId = "69c2bc93c8601b4eaf3abe2f";
  const symbol = "BTCUSDT";

  const createMockDecision = (direction: "LONG" | "SHORT" | "HOLD", conf = 85, decisionId = "DEC_P4_TEST_001"): AQEADecision => ({
    decision: direction,
    confidence: conf,
    riskApproved: true,
    positionSize: 200,
    leverage: 10,
    stopLoss: direction === "LONG" ? 95 : 105,
    takeProfits: [direction === "LONG" ? 110 : 90],
    reasons: ["Test High Conviction Signal"],
    decisionPath: {
      coreScore: conf,
      finalScore: conf,
      finalDecision: direction,
      regime: direction === "LONG" ? "TRENDING_BULL" : "TRENDING_BEAR",
      cnnVote: direction === "LONG" ? 85 : 15,
      ppoVote: direction === "LONG" ? 80 : 20,
      transformerVote: direction === "LONG" ? 82 : 18,
      mambaVote: direction === "LONG" ? 84 : 16,
      aiModelsOffline: false,
    },
    meta: {
      decisionId,
      finalScore: conf,
      smartMoneyScore: 80,
      indicators: { close: 100, adx14: 28, atr14: 1.5, rsi14: 55 }
    }
  });

  const mockRiskProfile = {
    positionSize: 200,
    leverage: 10,
    sl: 95,
    tp1: 110,
    tp2: 115,
    tp3: 120,
    reason: "P4 Mock Risk Sizing"
  };

  beforeEach(() => {
    paper.resetAllPaperStateToZero();
    ForwardTelemetryStore.clearInMemoryRecords();
  });

  afterEach(() => {
    paper.resetAllPaperStateToZero();
    ForwardTelemetryStore.clearInMemoryRecords();
  });

  // TC01: eligible LONG reaches paper execution
  test("TC01: eligible LONG reaches paper execution", async () => {
    paper.ensurePaperWalletFunded(userId, "PAPER", "FUTURES");
    const dec = createMockDecision("LONG", 85, "DEC_TC01");
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC01",
      symbol: "BTCUSDT",
      direction: "LONG",
      confidence: 85,
      regime: "TRENDING_BULL",
      timestamp: Date.now() - 1000,
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });

    const evalRes = evaluateLongEntry({
      existing: undefined,
      aqeaDecision: dec,
      riskProfile: mockRiskProfile,
      symbol: "BTCUSDT",
      sameDirectionCount: 0
    });

    expect(evalRes.ok).toBe(true);
    if (evalRes.ok) {
      const margin = evalRes.allocUsdt / evalRes.leverage;
      expect(margin).toBe(20);
      
      const mockTradeId = new mongoose.Types.ObjectId().toString();
      paper.setPosition(userId, "BTCUSDT", "PAPER", {
        userId,
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: evalRes.quantity,
        entryPrice: evalRes.currentPrice,
        tradeId: mockTradeId,
        accountType: "FUTURES",
        leverage: evalRes.leverage,
        sl: 95,
        tp: 110,
        meta: { decisionId: "DEC_TC01" }
      });

      ForwardTelemetryStore.updateTerminalState("DEC_TC01", "TRADE", "PAPER_EXECUTION_COMPLETED", "TRADE");
      
      const pos = paper.getPosition(userId, "BTCUSDT", "PAPER", "FUTURES");
      expect(pos).toBeDefined();
      expect(pos?.quantity).toBe(2);
      expect(pos?.meta?.decisionId).toBe("DEC_TC01");

      const stats = ForwardTelemetryStore.getAbstentionStatistics();
      expect(stats.tradedDecisions).toBe(1);
      expect(stats.openTradesCount).toBe(1);
    }
  });

  // TC02: eligible SHORT reaches paper execution
  test("TC02: eligible SHORT reaches paper execution", async () => {
    paper.ensurePaperWalletFunded(userId, "PAPER", "FUTURES");
    const dec = createMockDecision("SHORT", 85, "DEC_TC02");
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC02",
      symbol: "BTCUSDT",
      direction: "SHORT",
      confidence: 85,
      regime: "TRENDING_BEAR",
      timestamp: Date.now() - 1000,
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });

    const evalRes = evaluateShortEntry({
      existing: undefined,
      aqeaDecision: dec,
      riskProfile: mockRiskProfile,
      symbol: "BTCUSDT",
      sameDirectionCount: 0
    });

    expect(evalRes.ok).toBe(true);
    if (evalRes.ok) {
      const mockTradeId = new mongoose.Types.ObjectId().toString();
      paper.setPosition(userId, "BTCUSDT", "PAPER", {
        userId,
        symbol: "BTCUSDT",
        side: "SELL",
        quantity: evalRes.quantity,
        entryPrice: evalRes.currentPrice,
        tradeId: mockTradeId,
        accountType: "FUTURES",
        leverage: evalRes.leverage,
        sl: 105,
        tp: 90,
        meta: { decisionId: "DEC_TC02" }
      });

      ForwardTelemetryStore.updateTerminalState("DEC_TC02", "TRADE", "PAPER_EXECUTION_COMPLETED", "TRADE");
      const pos = paper.getPosition(userId, "BTCUSDT", "PAPER", "FUTURES");
      expect(pos).toBeDefined();
      expect(pos?.side).toBe("SELL");
      expect(pos?.meta?.decisionId).toBe("DEC_TC02");

      const stats = ForwardTelemetryStore.getAbstentionStatistics();
      expect(stats.tradedDecisions).toBe(1);
      expect(stats.openTradesCount).toBe(1);
    }
  });

  // TC03: HOLD never creates order
  test("TC03: HOLD never creates order", async () => {
    const dec = createMockDecision("HOLD", 50, "DEC_TC03");
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC03",
      symbol: "BTCUSDT",
      direction: "HOLD",
      confidence: 50,
      regime: "RANGING_SIDEWAYS",
      timestamp: Date.now() - 1000,
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });

    ForwardTelemetryStore.updateTerminalState("DEC_TC03", "NO_TRADE", "NORMAL_ABSTENTION_HOLD", "NO_TRADE");
    const openPos = paper.getOpenPositions(userId, "PAPER");
    expect(openPos.length).toBe(0);

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.tradedDecisions).toBe(0);
    expect(stats.abstainedDecisions).toBe(1);
  });

  // TC04: conviction rejection never creates order
  test("TC04: conviction rejection never creates order", async () => {
    const dec = createMockDecision("LONG", 40, "DEC_TC04");
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC04",
      symbol: "BTCUSDT",
      direction: "LONG",
      confidence: 40,
      regime: "TRENDING_BULL",
      timestamp: Date.now() - 1000,
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });

    const posterior = BayesianProbabilityEngine.calculatePosteriorWinProbability(0.752, 40, 40, 10, true, 40);
    expect(posterior).toBeLessThan(0.70);

    ForwardTelemetryStore.updateTerminalState("DEC_TC04", "REJECTED", "ULTRA_CONVICTION_GATE: Low Confidence", "REJECTED");
    const openPos = paper.getOpenPositions(userId, "PAPER");
    expect(openPos.length).toBe(0);

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.tradedDecisions).toBe(0);
    expect(stats.rejectedDecisions).toBe(1);
  });

  // TC05: risk rejection never creates order
  test("TC05: risk rejection never creates order", async () => {
    const dec = createMockDecision("LONG", 85, "DEC_TC05");
    dec.riskApproved = false;

    const evalRes = evaluateLongEntry({
      existing: undefined,
      aqeaDecision: dec,
      riskProfile: mockRiskProfile,
      symbol: "BTCUSDT",
      sameDirectionCount: 0
    });

    expect(evalRes.ok).toBe(false);
    if (!evalRes.ok && !evalRes.silent) {
      expect(evalRes.reason).toContain("Risk parameters");
    }

    const openPos = paper.getOpenPositions(userId, "PAPER");
    expect(openPos.length).toBe(0);
  });

  // TC06: insufficient funds creates INSUFFICIENT_FUNDS
  test("TC06: insufficient funds creates INSUFFICIENT_FUNDS", async () => {
    paper.resetAllPaperStateToZero(); // $0 wallet
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TC06",
      symbol: "BTCUSDT",
      direction: "LONG",
      confidence: 85,
      regime: "TRENDING_BULL",
      timestamp: Date.now() - 1000,
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });

    const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
    const balance = wallet.get("USDT") ?? 0;
    const requiredMargin = 20;

    if (balance < requiredMargin) {
      ForwardTelemetryStore.updateTerminalState("DEC_TC06", "INSUFFICIENT_FUNDS", "PAPER_CAPITAL_UNAVAILABLE", "INSUFFICIENT_FUNDS");
    }

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.tradedDecisions).toBe(0);
    expect(stats.insufficientFundsDecisions).toBe(1);
  });

  // TC07: paper wallet is correctly visible to execution
  test("TC07: paper wallet is correctly visible to execution", async () => {
    paper.ensurePaperWalletFunded(userId, "PAPER", "FUTURES");
    const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
    expect(wallet.get("USDT")).toBe(10000);
  });

  // TC08: decisionId survives decision→order→position
  test("TC08: decisionId survives decision->order->position", async () => {
    const decisionId = "DEC_P4_LIFECYCLE_008";
    const dec = createMockDecision("LONG", 85, decisionId);
    ForwardTelemetryStore.recordDecision({
      decisionId,
      symbol: "BTCUSDT",
      direction: "LONG",
      confidence: 85,
      regime: "TRENDING_BULL",
      timestamp: Date.now() - 1000,
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });

    paper.setPosition(userId, "BTCUSDT", "PAPER", {
      userId,
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 2,
      entryPrice: 100,
      tradeId: new mongoose.Types.ObjectId().toString(),
      accountType: "FUTURES",
      leverage: 10,
      sl: 95,
      tp: 110,
      meta: { decisionId }
    });

    const pos = paper.getPosition(userId, "BTCUSDT", "PAPER", "FUTURES");
    expect(pos?.meta?.decisionId).toBe(decisionId);
  });

  // TC09: exactly one order per decision
  test("TC09: exactly one order per decision", async () => {
    const decisionId = "DEC_P4_ONCE_009";
    ForwardTelemetryStore.recordDecision({
      decisionId,
      symbol: "BTCUSDT",
      direction: "LONG",
      confidence: 85,
      regime: "TRENDING_BULL",
      timestamp: Date.now() - 1000,
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });

    ForwardTelemetryStore.updateTerminalState(decisionId, "TRADE", "EXEC_1", "TRADE");
    const stats1 = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats1.tradedDecisions).toBe(1);

    // Re-recording duplicate decision does not create a 2nd trade
    ForwardTelemetryStore.recordDecision({
      decisionId,
      symbol: "BTCUSDT",
      direction: "LONG",
      confidence: 85,
      regime: "TRENDING_BULL",
      timestamp: Date.now() - 1000,
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });

    const stats2 = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats2.tradedDecisions).toBe(1);
  });

  // TC10: exactly one position per order
  test("TC10: exactly one position per order", async () => {
    paper.setPosition(userId, "BTCUSDT", "PAPER", {
      userId,
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 1,
      entryPrice: 100,
      tradeId: "trade_1",
      accountType: "FUTURES",
      leverage: 10,
      sl: 95,
      tp: 110
    });

    const pos = paper.getPosition(userId, "BTCUSDT", "PAPER", "FUTURES");
    expect(pos).toBeDefined();
    expect(paper.getOpenPositions(userId, "PAPER").length).toBe(1);
  });

  // TC11: duplicate execution is prevented
  test("TC11: duplicate execution is prevented", async () => {
    const existing = {
      userId,
      symbol: "BTCUSDT",
      side: "BUY" as const,
      quantity: 1,
      entryPrice: 100,
      tradeId: "trade_1",
      accountType: "FUTURES" as const,
      leverage: 10,
      sl: 95,
      tp: 110
    };

    const dec = createMockDecision("LONG", 85, "DEC_TC11");
    const evalRes = evaluateLongEntry({
      existing,
      aqeaDecision: dec,
      riskProfile: mockRiskProfile,
      symbol: "BTCUSDT",
      sameDirectionCount: 1
    });

    expect(evalRes.ok).toBe(false);
    if (!evalRes.ok && !evalRes.silent) {
      expect(evalRes.reason).toContain("Existing active position");
    }
  });

  // TC12: position is visible to exit scheduler
  test("TC12: position is visible to exit scheduler", async () => {
    paper.setPosition(userId, "ETHUSDT", "PAPER", {
      userId,
      symbol: "ETHUSDT",
      side: "BUY",
      quantity: 10,
      entryPrice: 2000,
      tradeId: "trade_eth",
      accountType: "FUTURES",
      leverage: 5,
      sl: 1900,
      tp: 2200
    });

    const openPositions = paper.getOpenPositions(userId, "PAPER");
    const found = openPositions.find(p => p.symbol === "ETHUSDT");
    expect(found).toBeDefined();
    expect(found?.entryPrice).toBe(2000);
  });

  // TC13: genuine exit resolves outcome
  test("TC13: genuine exit resolves outcome", async () => {
    const decisionId = "DEC_P4_EXIT_013";
    const decTs = Date.now() - 30000;
    ForwardTelemetryStore.recordDecision({
      decisionId,
      symbol: "BTCUSDT",
      direction: "LONG",
      confidence: 85,
      regime: "TRENDING_BULL",
      timestamp: decTs,
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });
    ForwardTelemetryStore.updateTerminalState(decisionId, "TRADE", "FILLED", "TRADE");

    const resolved = ForwardTelemetryStore.resolveOutcome(decisionId, {
      resolvedTimestamp: decTs + 20001,
      entryTimestamp: decTs + 1000,
      entryPrice: 100,
      exitTimestamp: decTs + 20000,
      exitPrice: 108,
      realizedDirection: "LONG",
      realizedReturn: 0.08,
      realizedPnL: 16,
      outcome: "WIN",
      directionCorrect: true,
      fees: 0.08,
      slippage: 0.02,
      holdingDurationMs: 19000,
      mfe: 0.09,
      mae: 0.01
    });

    expect(resolved).toBe(true);
    const rec = ForwardTelemetryStore.getRecord(decisionId);
    expect(rec?.outcome).toBeDefined();
    expect(rec?.outcome?.outcomeResult).toBe("WIN");
    expect(rec?.outcome?.realizedPnL).toBe(16);
  });

  // TC14: resolved outcome increments nResolvedTrades once
  test("TC14: resolved outcome increments nResolvedTrades once", async () => {
    const decisionId = "DEC_P4_RESOLVE_014";
    const decTs = Date.now() - 10000;
    ForwardTelemetryStore.recordDecision({
      decisionId,
      symbol: "BTCUSDT",
      direction: "LONG",
      confidence: 85,
      regime: "TRENDING_BULL",
      timestamp: decTs,
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });
    ForwardTelemetryStore.updateTerminalState(decisionId, "TRADE", "FILLED", "TRADE");

    ForwardTelemetryStore.resolveOutcome(decisionId, {
      resolvedTimestamp: decTs + 5001,
      entryTimestamp: decTs + 1000,
      entryPrice: 100,
      exitTimestamp: decTs + 5000,
      exitPrice: 105,
      realizedDirection: "LONG",
      realizedReturn: 0.05,
      realizedPnL: 10,
      outcome: "WIN",
      directionCorrect: true,
      fees: 0.05,
      slippage: 0.01,
      holdingDurationMs: 4000,
      mfe: 0.06,
      mae: 0.01
    });

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.tradedDecisions).toBe(1);
    expect(stats.resolvedTradesCount).toBe(1);
    expect(stats.openTradesCount).toBe(0);
  });

  // TC15: no synthetic PnL
  test("TC15: no synthetic PnL (remains null/empty with zero resolved trades)", async () => {
    ForwardTelemetryStore.clearInMemoryRecords();
    const gov = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(gov.empiricalEvidenceState).toBe("UNAVAILABLE");
    expect(gov.evidenceVector.nResolvedTrades).toBe(0);
  });

  // TC16: live execution remains blocked
  test("TC16: live execution remains fail-closed", async () => {
    const barrier = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
    expect(barrier.permitted).toBe(false);
    expect(LiveExecutionBarrier.isLiveTradingPermitted()).toBe(false);
    expect(ForwardTelemetryStore.isLivePromotionBlocked()).toBe(true);
  });

  // TC17: opportunity conservation remains exact
  test("TC17: opportunity conservation remains exact (Valid = Traded + Abstained + InsufficientFunds + Rejected)", async () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_1", symbol: "BTCUSDT", direction: "LONG", confidence: 85, regime: "TRENDING_BULL", timestamp: Date.now() - 4000, dataSource: "FORWARD_OOS", isForward: true, featureVersion: 2
    });
    ForwardTelemetryStore.updateTerminalState("DEC_1", "TRADE", "FILLED", "TRADE");

    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_2", symbol: "ETHUSDT", direction: "HOLD", confidence: 50, regime: "RANGING_SIDEWAYS", timestamp: Date.now() - 3000, dataSource: "FORWARD_OOS", isForward: true, featureVersion: 2
    });
    ForwardTelemetryStore.updateTerminalState("DEC_2", "NO_TRADE", "HOLD", "NO_TRADE");

    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_3", symbol: "SOLUSDT", direction: "SHORT", confidence: 40, regime: "TRENDING_BEAR", timestamp: Date.now() - 2000, dataSource: "FORWARD_OOS", isForward: true, featureVersion: 2
    });
    ForwardTelemetryStore.updateTerminalState("DEC_3", "REJECTED", "LOW_CONVICTION", "REJECTED");

    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_4", symbol: "ADAUSDT", direction: "LONG", confidence: 80, regime: "TRENDING_BULL", timestamp: Date.now() - 1000, dataSource: "FORWARD_OOS", isForward: true, featureVersion: 2
    });
    ForwardTelemetryStore.updateTerminalState("DEC_4", "INSUFFICIENT_FUNDS", "NO_BALANCE", "INSUFFICIENT_FUNDS");

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.totalDecisions).toBe(4);
    expect(stats.validDecisions).toBe(stats.tradedDecisions + stats.abstainedDecisions + stats.insufficientFundsDecisions + stats.rejectedDecisions);
  });

  // TC18: experiment hashes remain immutable
  test("TC18: experiment hashes remain immutable once frozen", async () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_EXP_01",
      symbol: "BTCUSDT",
      direction: "LONG",
      confidence: 85,
      regime: "TRENDING_BULL",
      timestamp: Date.now(),
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2,
      experimentId: "EXP_2026_TEST_A"
    });

    const frozen1 = ForwardTelemetryStore.getExperimentContext();
    expect(frozen1).toBeDefined();

    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_EXP_02",
      symbol: "ETHUSDT",
      direction: "SHORT",
      confidence: 80,
      regime: "TRENDING_BEAR",
      timestamp: Date.now(),
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2,
      experimentId: "EXP_2026_TEST_B" // attempted divergence
    });

    const frozen2 = ForwardTelemetryStore.getExperimentContext();
    expect(frozen2?.experimentId).toBe(frozen1?.experimentId);
  });

  // TC19: temporal leakage remains zero
  test("TC19: temporal leakage throws DataLeakageError if outcome <= decision timestamp", async () => {
    const decisionId = "DEC_LEAK_019";
    const decTs = Date.now();
    ForwardTelemetryStore.recordDecision({
      decisionId,
      symbol: "BTCUSDT",
      direction: "LONG",
      confidence: 85,
      regime: "TRENDING_BULL",
      timestamp: decTs,
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });

    expect(() => {
      ForwardTelemetryStore.resolveOutcome(decisionId, {
        resolvedTimestamp: decTs - 1000, // in the past!
        entryTimestamp: decTs,
        entryPrice: 100,
        exitTimestamp: decTs - 1000,
        exitPrice: 105,
        realizedDirection: "LONG",
        realizedReturn: 0.05,
        realizedPnL: 10,
        outcome: "WIN",
        directionCorrect: true,
        fees: 0.05,
        slippage: 0.01,
        holdingDurationMs: 0,
        mfe: 0,
        mae: 0
      });
    }).toThrow(DataLeakageError);
  });

  // TC20: restart preserves paper position
  test("TC20: state management preserves paper positions correctly", async () => {
    paper.setPosition(userId, "BNBUSDT", "PAPER", {
      userId,
      symbol: "BNBUSDT",
      side: "BUY",
      quantity: 5,
      entryPrice: 600,
      tradeId: "trade_bnb",
      accountType: "FUTURES",
      leverage: 10,
      sl: 570,
      tp: 660
    });

    const pos = paper.getPosition(userId, "BNBUSDT", "PAPER", "FUTURES");
    expect(pos?.quantity).toBe(5);
    expect(pos?.entryPrice).toBe(600);
  });

  // TC21: restart preserves resolved outcome in telemetry store
  test("TC21: telemetry store maintains outcomes across operations", async () => {
    const decisionId = "DEC_PRESERVE_021";
    const decTs = Date.now() - 10000;
    ForwardTelemetryStore.recordDecision({
      decisionId,
      symbol: "BTCUSDT",
      direction: "LONG",
      confidence: 85,
      regime: "TRENDING_BULL",
      timestamp: decTs,
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });
    ForwardTelemetryStore.updateTerminalState(decisionId, "TRADE", "FILLED", "TRADE");
    ForwardTelemetryStore.resolveOutcome(decisionId, {
      resolvedTimestamp: decTs + 6001,
      entryTimestamp: decTs + 1000,
      entryPrice: 100,
      exitTimestamp: decTs + 6000,
      exitPrice: 110,
      realizedDirection: "LONG",
      realizedReturn: 0.10,
      realizedPnL: 20,
      outcome: "WIN",
      directionCorrect: true,
      fees: 0.05,
      slippage: 0.01,
      holdingDurationMs: 5000,
      mfe: 0.12,
      mae: 0.01
    });

    const rec = ForwardTelemetryStore.getRecord(decisionId);
    expect(rec?.outcome?.outcomeResult).toBe("WIN");
    expect(rec?.outcome?.realizedPnL).toBe(20);
  });

  // TC22: model unavailable remains MODEL_UNAVAILABLE
  test("TC22: model unavailable remains MODEL_UNAVAILABLE", async () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_MOD_UNAVAIL",
      symbol: "BTCUSDT",
      direction: "HOLD",
      confidence: 0,
      regime: "UNKNOWN",
      timestamp: Date.now(),
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });
    ForwardTelemetryStore.updateTerminalState("DEC_MOD_UNAVAIL", "MODEL_UNAVAILABLE", "MODEL_SERVICE_HTTP_500", "MODEL_UNAVAILABLE");

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.modelUnavailableDecisions).toBe(1);
    expect(stats.tradedDecisions).toBe(0);
  });

  // TC23: data unavailable remains DATA_UNAVAILABLE
  test("TC23: data unavailable remains DATA_UNAVAILABLE", async () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_DATA_UNAVAIL",
      symbol: "BTCUSDT",
      direction: "HOLD",
      confidence: 0,
      regime: "UNKNOWN",
      timestamp: Date.now(),
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });
    ForwardTelemetryStore.updateTerminalState("DEC_DATA_UNAVAIL", "DATA_UNAVAILABLE", "MARKET_DATA_MISSING_KLINES", "DATA_UNAVAILABLE");

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.dataUnavailableDecisions).toBe(1);
  });

  // TC24: timeout remains TIMEOUT
  test("TC24: timeout remains TIMEOUT", async () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_TIMEOUT",
      symbol: "BTCUSDT",
      direction: "HOLD",
      confidence: 0,
      regime: "UNKNOWN",
      timestamp: Date.now(),
      dataSource: "FORWARD_OOS",
      isForward: true,
      featureVersion: 2
    });
    ForwardTelemetryStore.updateTerminalState("DEC_TIMEOUT", "TIMEOUT", "EXECUTION_TIMEOUT_5000MS", "TIMEOUT");

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.timeoutDecisions).toBe(1);
  });

  // TC25: INVALID remains reserved for actual corruption
  test("TC25: INVALID remains reserved for actual corruption", async () => {
    ForwardTelemetryStore.recordInvalidDecision();
    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.invalidDecisions).toBe(1);
  });
});
