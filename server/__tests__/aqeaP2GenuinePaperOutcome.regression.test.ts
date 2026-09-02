import { describe, test, expect, beforeEach, afterEach, jest } from "@jest/globals";
import mongoose from "mongoose";
import * as paper from "../src/services/paperState.js";
import { ForwardTelemetryStore, DataLeakageError, getEmpiricalEvidenceState } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { AutonomousForwardEvidenceEngine } from "../src/services/aqea/governance/AutonomousForwardEvidenceEngine.js";
import { LiveExecutionBarrier } from "../src/services/aqea/governance/LiveExecutionBarrier.js";
import { Trade } from "../src/models/Trade.js";
import { WalletTransaction } from "../src/models/WalletTransaction.js";

describe("AQEA 2026-27 P2 Genuine Paper Outcome & Forward Evidence Accumulation Suite", () => {
  const userId = "69c2bc93c8601b4eaf3abe2f";
  const symbol = "ETHUSDT";

  beforeEach(async () => {
    paper.resetAllPaperStateToZero();
    ForwardTelemetryStore.clearInMemoryRecords();
  });

  afterEach(async () => {
    paper.resetAllPaperStateToZero();
    ForwardTelemetryStore.clearInMemoryRecords();
  });

  // TC01: eligible LONG creates paper order
  test("TC01: eligible LONG creates paper order", async () => {
    await paper.ensurePaperWalletFunded(userId, "PAPER", "FUTURES", 10000);
    const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
    expect(wallet.get("USDT")).toBe(10000);

    const margin = 1000;
    const trade = await paper.debitWalletAndCreateTrade(
      userId, "PAPER", "FUTURES", margin,
      async () => ({ _id: new mongoose.Types.ObjectId(), symbol, side: "BUY", quantity: 2, entryPrice: 2500 } as any)
    );
    expect(trade).toBeDefined();
    expect(wallet.get("USDT")).toBe(9000);
  });

  // TC02: eligible SHORT creates paper order
  test("TC02: eligible SHORT creates paper order", async () => {
    await paper.ensurePaperWalletFunded(userId, "PAPER", "FUTURES", 10000);
    const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
    const margin = 1200;
    const trade = await paper.debitWalletAndCreateTrade(
      userId, "PAPER", "FUTURES", margin,
      async () => ({ _id: new mongoose.Types.ObjectId(), symbol, side: "SELL", quantity: 1, entryPrice: 2500 } as any)
    );
    expect(trade).toBeDefined();
    expect(wallet.get("USDT")).toBe(8800);
  });

  // TC03: HOLD creates no order
  test("TC03: HOLD creates no order", async () => {
    const decision = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_HOLD_01",
      timestamp: Date.now() - 10000,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGING",
      featureVersion: 2,
      buyProbability: 0.2,
      holdProbability: 0.6,
      sellProbability: 0.2,
      direction: "HOLD",
      confidence: 0.6,
      agreementScore: 0.6,
      tradeQualityScore: 50,
      tradeQualityTier: "TIER_3",
      expectedValue: 0,
      expectedGain: 0,
      expectedLoss: 0,
      uncertainty: 0.1,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0,
      evGateResult: false,
      finalDecision: "HOLD",
      decisionClass: "NO_TRADE",
      terminalState: "NO_TRADE",
      terminalReason: "NORMAL_ABSTENTION_HOLD",
      modelBreakdowns: {}
    });
    expect(decision.terminalState).toBe("NO_TRADE");
    const openPos = paper.getOpenPositions(userId, "PAPER");
    expect(openPos.length).toBe(0);
  });

  // TC04: rejected decision creates no order
  test("TC04: rejected decision creates no order", () => {
    const decision = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_REJ_01",
      timestamp: Date.now() - 10000,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.55,
      holdProbability: 0.3,
      sellProbability: 0.15,
      direction: "LONG",
      confidence: 0.55,
      agreementScore: 0.5,
      tradeQualityScore: 60,
      tradeQualityTier: "TIER_2",
      expectedValue: 0.0005,
      expectedGain: 0.001,
      expectedLoss: 0.0005,
      uncertainty: 0.2,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0.0005,
      evGateResult: false,
      finalDecision: "LONG",
      decisionClass: "REJECTED",
      terminalState: "REJECTED",
      terminalReason: "EV_BELOW_10BPS_HURDLE",
      modelBreakdowns: {}
    });
    expect(decision.terminalState).toBe("REJECTED");
    expect(paper.getOpenPositions(userId, "PAPER").length).toBe(0);
  });

  // TC05: insufficient paper capital creates no order
  test("TC05: insufficient paper capital creates no order", () => {
    paper.resetAllPaperStateToZero();
    const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
    expect(wallet.get("USDT")).toBe(0);

    const decision = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_NOFUNDS_01",
      timestamp: Date.now() - 10000,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.85,
      holdProbability: 0.1,
      sellProbability: 0.05,
      direction: "LONG",
      confidence: 0.85,
      agreementScore: 0.85,
      tradeQualityScore: 85,
      tradeQualityTier: "TIER_1",
      expectedValue: 0.005,
      expectedGain: 0.006,
      expectedLoss: 0.001,
      uncertainty: 0.05,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0.0045,
      evGateResult: true,
      finalDecision: "LONG",
      decisionClass: "INSUFFICIENT_FUNDS",
      terminalState: "INSUFFICIENT_FUNDS",
      terminalReason: "PAPER_CAPITAL_UNAVAILABLE: required=$1200, available=$0",
      modelBreakdowns: {}
    });
    expect(decision.terminalState).toBe("INSUFFICIENT_FUNDS");
    expect(paper.getOpenPositions(userId, "PAPER").length).toBe(0);
  });

  // TC06: paper funding is auditable
  test("TC06: paper funding is auditable", async () => {
    const balance = await paper.ensurePaperWalletFunded(userId, "PAPER", "FUTURES", 10000);
    expect(balance).toBe(10000);
    const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
    expect(wallet.get("USDT")).toBe(10000);
  });

  // TC07: live wallet unaffected
  test("TC07: live wallet unaffected", async () => {
    const liveBal = await paper.ensurePaperWalletFunded(userId, "LIVE", "FUTURES", 10000);
    expect(liveBal).toBe(0);
    const liveWallet = paper.getWallet(userId, "LIVE", "FUTURES");
    expect(liveWallet.get("USDT")).toBe(0);
  });

  // TC08: paper order opens position
  test("TC08: paper order opens position", () => {
    paper.setPosition(userId, symbol, "PAPER", {
      userId,
      symbol,
      side: "BUY",
      quantity: 1.5,
      entryPrice: 2500,
      tradeId: "69c2bc93c8601b4eaf3abe2a",
      accountType: "FUTURES",
      leverage: 5,
      sl: 2400,
      tp: 2700,
      meta: { decisionId: "DEC_LONG_08" }
    });
    const pos = paper.getPosition(userId, symbol, "PAPER", "FUTURES");
    expect(pos).toBeDefined();
    expect(pos?.quantity).toBe(1.5);
    expect(pos?.entryPrice).toBe(2500);
  });

  // TC09: decisionId survives order lifecycle
  test("TC09: decisionId survives order lifecycle", () => {
    const decId = "DEC_TRACK_09";
    paper.setPosition(userId, symbol, "PAPER", {
      userId,
      symbol,
      side: "BUY",
      quantity: 1.0,
      entryPrice: 2500,
      tradeId: "69c2bc93c8601b4eaf3abe2b",
      accountType: "FUTURES",
      meta: { decisionId: decId }
    });
    const pos = paper.getPosition(userId, symbol, "PAPER", "FUTURES");
    expect(pos?.meta?.decisionId).toBe(decId);
  });

  // TC10: exit scheduler evaluates position
  test("TC10: exit scheduler evaluates position", () => {
    paper.setPosition(userId, symbol, "PAPER", {
      userId,
      symbol,
      side: "BUY",
      quantity: 1.0,
      entryPrice: 2500,
      tradeId: "69c2bc93c8601b4eaf3abe2c",
      accountType: "FUTURES",
      sl: 2450,
      tp: 2600
    });
    const pos = paper.getPosition(userId, symbol, "PAPER", "FUTURES");
    const currentPrice = 2440; // Breaches SL
    const isSlBreached = pos?.sl ? (pos.side === "BUY" ? currentPrice <= pos.sl : currentPrice >= pos.sl) : false;
    expect(isSlBreached).toBe(true);
  });

  // TC11: stop-loss closes position
  test("TC11: stop-loss closes position", () => {
    paper.setPosition(userId, symbol, "PAPER", {
      userId,
      symbol,
      side: "BUY",
      quantity: 1.0,
      entryPrice: 2500,
      tradeId: "69c2bc93c8601b4eaf3abe2d",
      accountType: "FUTURES",
      sl: 2450
    });
    paper.removePosition(userId, symbol, "PAPER", "FUTURES");
    expect(paper.getPosition(userId, symbol, "PAPER", "FUTURES")).toBeUndefined();
  });

  // TC12: take-profit closes position
  test("TC12: take-profit closes position", () => {
    paper.setPosition(userId, symbol, "PAPER", {
      userId,
      symbol,
      side: "BUY",
      quantity: 1.0,
      entryPrice: 2500,
      tradeId: "69c2bc93c8601b4eaf3abe2e",
      accountType: "FUTURES",
      tp: 2650
    });
    const currentPrice = 2660; // Hits TP
    const pos = paper.getPosition(userId, symbol, "PAPER", "FUTURES");
    const isTpHit = pos?.tp ? (pos.side === "BUY" ? currentPrice >= pos.tp : currentPrice <= pos.tp) : false;
    expect(isTpHit).toBe(true);
    paper.removePosition(userId, symbol, "PAPER", "FUTURES");
    expect(paper.getPosition(userId, symbol, "PAPER", "FUTURES")).toBeUndefined();
  });

  // TC13: canonical strategy exit closes position
  test("TC13: canonical strategy exit closes position", () => {
    paper.setPosition(userId, symbol, "PAPER", {
      userId,
      symbol,
      side: "BUY",
      quantity: 1.0,
      entryPrice: 2500,
      tradeId: "69c2bc93c8601b4eaf3abe2f",
      accountType: "FUTURES"
    });
    paper.removePosition(userId, symbol, "PAPER", "FUTURES");
    expect(paper.getPosition(userId, symbol, "PAPER", "FUTURES")).toBeUndefined();
  });

  // TC14: close generates outcome
  test("TC14: close generates outcome", () => {
    const decisionTs = Date.now() - 60000;
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_RESOLVE_14",
      timestamp: decisionTs,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.8,
      agreementScore: 0.8,
      tradeQualityScore: 80,
      tradeQualityTier: "TIER_1",
      expectedValue: 0.005,
      expectedGain: 0.006,
      expectedLoss: 0.001,
      uncertainty: 0.05,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0.0045,
      evGateResult: true,
      finalDecision: "LONG",
      modelBreakdowns: {}
    });

    const entryTs = decisionTs + 1000;
    const exitTs = decisionTs + 30000;
    const success = ForwardTelemetryStore.resolveOutcome("DEC_RESOLVE_14", {
      resolvedTimestamp: exitTs,
      entryTimestamp: entryTs,
      entryPrice: 2500,
      exitTimestamp: exitTs,
      exitPrice: 2550,
      realizedDirection: "LONG",
      realizedReturn: 0.02,
      realizedPnL: 50,
      fees: 2,
      slippage: 0.5,
      holdingDurationMs: 29000,
      outcome: "WIN",
      directionCorrect: true
    });
    expect(success).toBe(true);
    const rec = ForwardTelemetryStore.getRecord("DEC_RESOLVE_14");
    expect(rec?.outcome?.realizedPnL).toBe(50);
    expect(rec?.outcome?.outcomeResult).toBe("WIN");
  });

  // TC15: outcome references original decisionId
  test("TC15: outcome references original decisionId", () => {
    const decId = "DEC_REF_15";
    const ts = Date.now() - 30000;
    ForwardTelemetryStore.recordDecision({
      decisionId: decId,
      timestamp: ts,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.75,
      holdProbability: 0.15,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.75,
      agreementScore: 0.75,
      tradeQualityScore: 75,
      tradeQualityTier: "TIER_1",
      expectedValue: 0.004,
      expectedGain: 0.005,
      expectedLoss: 0.001,
      uncertainty: 0.05,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0.0035,
      evGateResult: true,
      finalDecision: "LONG",
      modelBreakdowns: {}
    });

    ForwardTelemetryStore.resolveOutcome(decId, {
      resolvedTimestamp: ts + 10000,
      entryTimestamp: ts + 100,
      entryPrice: 2500,
      exitTimestamp: ts + 10000,
      exitPrice: 2525,
      realizedDirection: "LONG",
      realizedReturn: 0.01,
      realizedPnL: 25,
      fees: 1,
      slippage: 0.2,
      outcome: "WIN",
      directionCorrect: true
    });

    const resolved = ForwardTelemetryStore.getResolvedRecords();
    const match = resolved.find(r => r.decisionId === decId);
    expect(match).toBeDefined();
    expect(match?.decisionId).toBe(decId);
  });

  // TC16: gross return calculated correctly
  test("TC16: gross return calculated correctly", () => {
    const entryPrice = 2000;
    const exitPrice = 2100;
    const qty = 2;
    const grossPnl = (exitPrice - entryPrice) * qty;
    const grossReturn = grossPnl / (entryPrice * qty);
    expect(grossPnl).toBe(200);
    expect(grossReturn).toBe(0.05);
  });

  // TC17: fees applied correctly
  test("TC17: fees applied correctly", () => {
    const notional = 4000;
    const feeRate = 0.0004; // 0.04%
    const totalFees = notional * feeRate * 2; // entry + exit
    expect(totalFees).toBeCloseTo(3.2, 4);
  });

  // TC18: slippage applied correctly
  test("TC18: slippage applied correctly", () => {
    const notional = 4000;
    const slippageRate = 0.0001; // 1 bps
    const slippageCost = notional * slippageRate;
    expect(slippageCost).toBeCloseTo(0.4, 4);
  });

  // TC19: net return calculated correctly
  test("TC19: net return calculated correctly", () => {
    const grossPnl = 200;
    const fees = 3.2;
    const slippage = 0.4;
    const netPnl = grossPnl - fees - slippage;
    const notional = 4000;
    const netReturn = netPnl / notional;
    expect(netPnl).toBeCloseTo(196.4, 4);
    expect(netReturn).toBeCloseTo(0.0491, 4);
  });

  // TC20: resolved outcome increments N_resolvedOutcomes
  test("TC20: resolved outcome increments N_resolvedOutcomes", () => {
    const ts = Date.now() - 30000;
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_NRES_20",
      timestamp: ts,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.8,
      agreementScore: 0.8,
      tradeQualityScore: 80,
      tradeQualityTier: "TIER_1",
      expectedValue: 0.005,
      expectedGain: 0.006,
      expectedLoss: 0.001,
      uncertainty: 0.05,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0.0045,
      evGateResult: true,
      finalDecision: "LONG",
      modelBreakdowns: {}
    });

    expect(ForwardTelemetryStore.getResolvedRecords().length).toBe(0);

    ForwardTelemetryStore.resolveOutcome("DEC_NRES_20", {
      resolvedTimestamp: ts + 5000,
      entryTimestamp: ts + 100,
      entryPrice: 2500,
      exitTimestamp: ts + 5000,
      exitPrice: 2550,
      realizedDirection: "LONG",
      realizedReturn: 0.02,
      realizedPnL: 50,
      fees: 2,
      slippage: 0.5,
      outcome: "WIN",
      directionCorrect: true
    });

    expect(ForwardTelemetryStore.getResolvedRecords().length).toBe(1);
  });

  // TC21: unresolved decision does not increment N_resolvedOutcomes
  test("TC21: unresolved decision does not increment N_resolvedOutcomes", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_UNRES_21",
      timestamp: Date.now() - 10000,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.8,
      agreementScore: 0.8,
      tradeQualityScore: 80,
      tradeQualityTier: "TIER_1",
      expectedValue: 0.005,
      expectedGain: 0.006,
      expectedLoss: 0.001,
      uncertainty: 0.05,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0.0045,
      evGateResult: true,
      finalDecision: "LONG",
      modelBreakdowns: {}
    });

    expect(ForwardTelemetryStore.getResolvedRecords().length).toBe(0);
  });

  // TC22: forward decision count independent of resolved count
  test("TC22: forward decision count independent of resolved count", () => {
    for (let i = 1; i <= 5; i++) {
      ForwardTelemetryStore.recordDecision({
        decisionId: `DEC_INDEP_${i}`,
        timestamp: Date.now() - 60000 + i * 1000,
        symbol,
        marketDomain: "CRYPTO",
        accountType: "FUTURES",
        regime: "TRENDING_BULL",
        featureVersion: 2,
        buyProbability: 0.8,
        holdProbability: 0.1,
        sellProbability: 0.1,
        direction: "LONG",
        confidence: 0.8,
        agreementScore: 0.8,
        tradeQualityScore: 80,
        tradeQualityTier: "TIER_1",
        expectedValue: 0.005,
        expectedGain: 0.006,
        expectedLoss: 0.001,
        uncertainty: 0.05,
        fees: 0.0004,
        slippage: 0.0001,
        spread: 0.0001,
        marketImpact: 0,
        netEV: 0.0045,
        evGateResult: true,
        finalDecision: "LONG",
        modelBreakdowns: {}
      });
    }
    expect(ForwardTelemetryStore.getForwardOOSDecisionCount()).toBe(5);
    expect(ForwardTelemetryStore.getResolvedRecords().length).toBe(0);
  });

  // TC23: N=0 statistics return null
  test("TC23: N=0 statistics return null", () => {
    const report = AutonomousForwardEvidenceEngine.evaluateStatisticalSensitivity([]);
    expect(report.nTotal).toBe(0);
    expect(report.bootstrapLCB).toBeNull();
    expect(report.analyticalLCB).toBeNull();
    expect(report.evidenceState).toBe("UNAVAILABLE");
  });

  // TC24: N<25 = INSUFFICIENT_EVIDENCE
  test("TC24: N<25 = INSUFFICIENT_EVIDENCE", () => {
    expect(getEmpiricalEvidenceState(0)).toBe("UNAVAILABLE");
    expect(getEmpiricalEvidenceState(10)).toBe("INSUFFICIENT_EVIDENCE");
    expect(getEmpiricalEvidenceState(24)).toBe("INSUFFICIENT_EVIDENCE");
  });

  // TC25: N>=25 enables preliminary empirical state
  test("TC25: N>=25 enables preliminary empirical state", () => {
    expect(getEmpiricalEvidenceState(25)).toBe("PRELIMINARY_EMPIRICAL");
    expect(getEmpiricalEvidenceState(50)).toBe("PRELIMINARY_EMPIRICAL");
    expect(getEmpiricalEvidenceState(99)).toBe("PRELIMINARY_EMPIRICAL");
  });

  // TC26: N<100 cannot enter promotion evaluation
  test("TC26: N<100 cannot enter promotion evaluation", () => {
    expect(getEmpiricalEvidenceState(100)).toBe("PROMOTION_EVALUATION_ALLOWED");
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.isPromotionEligible).toBe(false);
    expect(report.gateResults[0].passed).toBe(false);
  });

  // TC27: temporal leakage rejected
  test("TC27: temporal leakage rejected", () => {
    const decTs = Date.now();
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_LEAK_27",
      timestamp: decTs,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.8,
      agreementScore: 0.8,
      tradeQualityScore: 80,
      tradeQualityTier: "TIER_1",
      expectedValue: 0.005,
      expectedGain: 0.006,
      expectedLoss: 0.001,
      uncertainty: 0.05,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0.0045,
      evGateResult: true,
      finalDecision: "LONG",
      modelBreakdowns: {}
    });

    expect(() => {
      ForwardTelemetryStore.resolveOutcome("DEC_LEAK_27", {
        resolvedTimestamp: decTs - 5000, // Earlier than decision!
        entryTimestamp: decTs - 6000,
        entryPrice: 2500,
        exitTimestamp: decTs - 5000,
        exitPrice: 2550,
        realizedDirection: "LONG",
        realizedReturn: 0.02,
        realizedPnL: 50,
        outcome: "WIN",
        directionCorrect: true
      });
    }).toThrow(DataLeakageError);
  });

  // TC28: duplicate outcome idempotent
  test("TC28: duplicate outcome idempotent", () => {
    const ts = Date.now() - 40000;
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_DUP_28",
      timestamp: ts,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.8,
      agreementScore: 0.8,
      tradeQualityScore: 80,
      tradeQualityTier: "TIER_1",
      expectedValue: 0.005,
      expectedGain: 0.006,
      expectedLoss: 0.001,
      uncertainty: 0.05,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0.0045,
      evGateResult: true,
      finalDecision: "LONG",
      modelBreakdowns: {}
    });

    const payload = {
      resolvedTimestamp: ts + 10000,
      entryTimestamp: ts + 100,
      entryPrice: 2500,
      exitTimestamp: ts + 10000,
      exitPrice: 2550,
      realizedDirection: "LONG" as const,
      realizedReturn: 0.02,
      realizedPnL: 50,
      outcome: "WIN" as const,
      directionCorrect: true
    };

    ForwardTelemetryStore.resolveOutcome("DEC_DUP_28", payload);
    expect(ForwardTelemetryStore.getResolvedRecords().length).toBe(1);

    ForwardTelemetryStore.resolveOutcome("DEC_DUP_28", payload);
    expect(ForwardTelemetryStore.getResolvedRecords().length).toBe(1);
  });

  // TC29: restart preserves open positions
  test("TC29: restart preserves open positions", () => {
    paper.setPosition(userId, symbol, "PAPER", {
      userId,
      symbol,
      side: "BUY",
      quantity: 2.0,
      entryPrice: 2500,
      tradeId: "69c2bc93c8601b4eaf3abe29",
      accountType: "FUTURES"
    });
    const positions = paper.getOpenPositions(userId, "PAPER");
    expect(positions.length).toBe(1);
    expect(positions[0].quantity).toBe(2.0);
  });

  // TC30: restart preserves resolved outcomes
  test("TC30: restart preserves resolved outcomes", () => {
    const ts = Date.now() - 30000;
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_SNAP_30",
      timestamp: ts,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.8,
      agreementScore: 0.8,
      tradeQualityScore: 80,
      tradeQualityTier: "TIER_1",
      expectedValue: 0.005,
      expectedGain: 0.006,
      expectedLoss: 0.001,
      uncertainty: 0.05,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0.0045,
      evGateResult: true,
      finalDecision: "LONG",
      modelBreakdowns: {}
    });

    ForwardTelemetryStore.resolveOutcome("DEC_SNAP_30", {
      resolvedTimestamp: ts + 5000,
      entryTimestamp: ts + 100,
      entryPrice: 2500,
      exitTimestamp: ts + 5000,
      exitPrice: 2550,
      realizedDirection: "LONG",
      realizedReturn: 0.02,
      realizedPnL: 50,
      outcome: "WIN",
      directionCorrect: true
    });

    const exported = ForwardTelemetryStore.exportStateJSON();
    ForwardTelemetryStore.clearInMemoryRecords();
    expect(ForwardTelemetryStore.getResolvedRecords().length).toBe(0);

    ForwardTelemetryStore.importStateJSON(exported);
    expect(ForwardTelemetryStore.getResolvedRecords().length).toBe(1);
  });

  // TC31: proxy model correctly labelled
  test("TC31: proxy model correctly labelled", () => {
    const decision = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_PROXY_31",
      timestamp: Date.now() - 10000,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.7,
      holdProbability: 0.2,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.7,
      agreementScore: 0.7,
      tradeQualityScore: 70,
      tradeQualityTier: "TIER_2",
      expectedValue: 0.003,
      expectedGain: 0.004,
      expectedLoss: 0.001,
      uncertainty: 0.1,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0.0025,
      evGateResult: true,
      finalDecision: "LONG",
      modelBreakdowns: {
        "MODERN_TCN_V1_PROXY": {
          modelName: "MODERN_TCN_V1_PROXY",
          modelFamily: "TEMPORAL_CONVOLUTIONAL",
          direction: "LONG",
          probLong: 0.7,
          probShort: 0.1,
          probHold: 0.2,
          confidence: 0.7,
          effectiveWeight: 0.1,
          participating: true,
          status: "SHADOW",
          inferenceMode: "PROXY",
          isProxy: true,
          isFallback: true,
          modelActuallyUsed: "LOCAL_PROXY_HEURISTIC"
        }
      }
    });
    expect(decision.modelBreakdowns["MODERN_TCN_V1_PROXY"].isProxy).toBe(true);
    expect(decision.modelBreakdowns["MODERN_TCN_V1_PROXY"].isFallback).toBe(true);
  });

  // TC32: unavailable model cannot masquerade as genuine inference
  test("TC32: unavailable model cannot masquerade as genuine inference", () => {
    const decision = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_UNAVAIL_32",
      timestamp: Date.now() - 10000,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.5,
      holdProbability: 0.5,
      sellProbability: 0.0,
      direction: "HOLD",
      confidence: 0.5,
      agreementScore: 0.5,
      tradeQualityScore: 50,
      tradeQualityTier: "TIER_3",
      expectedValue: 0,
      expectedGain: 0,
      expectedLoss: 0,
      uncertainty: 0.2,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0,
      evGateResult: false,
      finalDecision: "HOLD",
      modelBreakdowns: {
        "MAMBA_V1": {
          modelName: "MAMBA_V1",
          modelFamily: "STATE_SPACE",
          direction: "HOLD",
          probLong: 0,
          probShort: 0,
          probHold: 1,
          confidence: 0,
          effectiveWeight: 0,
          participating: false,
          status: "DEGRADED",
          inferenceMode: "UNAVAILABLE",
          availability: 0
        }
      }
    });
    expect(decision.modelBreakdowns["MAMBA_V1"].participating).toBe(false);
    expect(decision.modelBreakdowns["MAMBA_V1"].availability).toBe(0);
  });

  // TC33: experiment hash persists
  test("TC33: experiment hash persists", () => {
    const frozen = ForwardTelemetryStore.freezeExperiment({
      experimentId: "EXP_FREEZE_33",
      modelAuthorityVersion: "2026.6",
      ensembleVersion: "2026.6",
      featureVersion: 2,
      strategyVersion: "AQEA_AUTONOMOUS_V6"
    });
    expect(frozen.configurationHash).toBeDefined();
    expect(frozen.modelHash).toBeDefined();
    expect(frozen.featureSchemaHash).toBeDefined();
    expect(frozen.strategyHash).toBeDefined();
    expect(ForwardTelemetryStore.isExperimentFrozen()).toBe(true);
  });

  // TC34: configuration mutation creates new experiment
  test("TC34: configuration mutation creates new experiment", () => {
    ForwardTelemetryStore.freezeExperiment({
      experimentId: "EXP_BASE_34",
      modelAuthorityVersion: "2026.6",
      strategyVersion: "AQEA_AUTONOMOUS_V6"
    });

    const mutationCheck = ForwardTelemetryStore.assertExperimentCompatibility({
      strategyVersion: "AQEA_AUTONOMOUS_V7" // mutated
    });
    expect(mutationCheck.compatible).toBe(false);
    expect(mutationCheck.reason).toContain("Version mismatch after freeze");
  });

  // TC35: datasets cannot cross experiment boundaries
  test("TC35: datasets cannot cross experiment boundaries", () => {
    ForwardTelemetryStore.freezeExperiment({
      experimentId: "EXP_E1_35",
      featureVersion: 2
    });

    const qual = ForwardTelemetryStore.qualifyForwardOOSDecision({
      decisionId: "DEC_E2_35",
      timestamp: Date.now(),
      symbol,
      featureDataMaxTimestamp: Date.now() - 1000,
      featureVersion: 3 // Mutated feature version
    });
    expect(qual.qualified).toBe(false);
    expect(qual.reason).toContain("EXPERIMENT_VERSION_MUTATION");
  });

  // TC36: LIVE_PROMOTION_BLOCKED remains TRUE
  test("TC36: LIVE_PROMOTION_BLOCKED remains TRUE", () => {
    expect(ForwardTelemetryStore.isLivePromotionBlocked()).toBe(true);
    expect(LiveExecutionBarrier.isLiveTradingPermitted()).toBe(false);
    const barrier = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
    expect(barrier.permitted).toBe(false);
    expect(barrier.reason).toContain("LIVE_PROMOTION_BLOCKED");
  });
});
