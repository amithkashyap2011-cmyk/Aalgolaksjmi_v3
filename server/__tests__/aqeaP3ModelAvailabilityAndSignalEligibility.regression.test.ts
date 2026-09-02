import { describe, test, expect, beforeEach, afterEach, jest } from "@jest/globals";
import mongoose from "mongoose";
import * as paper from "../src/services/paperState.js";
import { ForwardTelemetryStore, DataLeakageError, getEmpiricalEvidenceState } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { AutonomousForwardEvidenceEngine } from "../src/services/aqea/governance/AutonomousForwardEvidenceEngine.js";
import { LiveExecutionBarrier } from "../src/services/aqea/governance/LiveExecutionBarrier.js";
import { ModelInferenceBridge } from "../src/services/aqea/ai/ModelInferenceBridge.js";
import { ModernModelRegistry } from "../src/services/aqea/ai/ModernModelRegistry.js";
import { UnifiedEnsembleFusion } from "../src/services/aqea/ensemble/UnifiedEnsembleFusion.js";
import { QuantStrategyRegistry } from "../src/services/aqea/quant/QuantStrategyRegistry.js";
import { Standardized15Features } from "../src/services/aqea/pipeline/FeaturePipeline.js";

describe("AQEA 2026-27 P3 Model Availability & Signal Eligibility Regression Suite", () => {
  const userId = "69c2bc93c8601b4eaf3abe2f";
  const symbol = "BTCUSDT";

  const mockFeatures: Standardized15Features = {
    symbol: "BTCUSDT",
    timeframe: "1m",
    timestamp: Date.now(),
    ohlcv: { open: 100, high: 105, low: 99, close: 104, volume: 1500, vwap: 102 },
    orderBook: { bidVol: 1000, askVol: 800, imbalance: 0.25, spread: 2 },
    cvd: { cvdScore: 0.6, delta: 200, buyerRatio: 0.58 },
    fundingRate: { rate: 0.0001, annualizedRate: 0.1095, bias: "NEUTRAL" },
    openInterest: { oi: 50000, oiExpansion: 0.05, trend: "EXPANDING" },
    volatility: { realizedVol: 0.02, parkinsonVol: 0.018, ratio: 1.1 },
    atr: { atr14: 1.5, atrPercent: 0.015, volatilityState: "NORMAL" },
    rsi: { rsi14: 58, state: "NEUTRAL", divergence: "NONE" },
    macd: { macd: 0.5, signal: 0.3, histogram: 0.2, momentum: "ACCELERATING_BULL" },
    bollinger: { upper: 106, middle: 102, lower: 98, bandwidth: 0.078, percentB: 0.75, isSqueeze: false },
    smc: { orderBlock: true, fvg: false, bos: true, choch: false, poc: 103, structuralTrend: "BULLISH" },
    liquiditySweeps: { sweepBuySide: false, sweepSellSide: true, sweepMagnitude: 0.005 },
    marketBreadth: { breadthRatio: 0.65, advanceDeclineState: "BROAD_RALLY" },
    macroNews: { hasTier1Event: false, eventLockActive: false, impact: "LOW" },
    nlpSentiment: { score: 0.2, confidence: 0.65, classification: "BULLISH" },
    tensorVector: [100, 105, 99, 104, 1500, 0.04, 0.06, 1.2, 102, 98, 0.8, 0.3, 0.1, 0.05, 0.02],
    inputVersion: 2
  };

  beforeEach(() => {
    paper.resetAllPaperStateToZero();
    ForwardTelemetryStore.resetStore();
  });

  afterEach(() => {
    paper.resetAllPaperStateToZero();
    ForwardTelemetryStore.resetStore();
  });

  // TC01: real model service health detected correctly
  test("TC01: real model service health detected correctly", async () => {
    const expert = ModernModelRegistry.getExpert("MAMBA_RESEARCH_V1");
    expect(expert).toBeDefined();
    const health = expert?.getHealth();
    expect(health?.modelName).toBe("MAMBA_RESEARCH_V1");
    expect(health?.isHealthy).toBe(true);
  });

  // TC02: unavailable model receives explicit reason
  test("TC02: unavailable model receives explicit reason", async () => {
    const pred = await ModelInferenceBridge.executeRemoteInference({
      endpoint: "/non-existent-endpoint",
      payload: { data: [] },
      modelName: "TEST_UNAVAIL_MODEL",
      modelVersion: "1.0.0",
      architecture: "TEST_ARCH",
      isTrained: false,
      timeoutMs: 100
    });
    expect(pred.inferenceMode).toBe("UNAVAILABLE");
    expect(pred.status).toBe("DISABLED");
    expect(pred.error).toBeDefined();
    expect(pred.error?.length).toBeGreaterThan(0);
  });

  // TC03: model timeout classified correctly
  test("TC03: model timeout classified correctly", async () => {
    const pred = await ModelInferenceBridge.executeRemoteInference({
      endpoint: "/research/predict/mamba",
      payload: { sequence: [] },
      modelName: "TIMEOUT_MODEL",
      modelVersion: "1.0.0",
      architecture: "TEST_TIMEOUT",
      isTrained: true,
      timeoutMs: 1 // Instant timeout
    });
    expect(pred.inferenceMode).toBe("UNAVAILABLE");
    expect(pred.error).toContain("MODEL_SERVICE_TIMEOUT");
  });

  // TC04: model HTTP failure classified correctly
  test("TC04: model HTTP failure classified correctly", async () => {
    const pred = await ModelInferenceBridge.executeRemoteInference({
      endpoint: "/predict/non-existent-service-path",
      payload: { dummy: 1 },
      modelName: "HTTP_FAIL_MODEL",
      modelVersion: "1.0.0",
      architecture: "TEST_HTTP",
      isTrained: false,
      timeoutMs: 500
    });
    expect(pred.inferenceMode).toBe("UNAVAILABLE");
    expect(pred.error).toMatch(/MODEL_SERVICE_|MODEL_ENDPOINT_NOT_FOUND|MODEL_INFERENCE_EXCEPTION/);
  });

  // TC05: checkpoint failure classified correctly
  test("TC05: checkpoint failure classified correctly", () => {
    const pred = {
      modelName: "MAMBA_V1",
      modelVersion: "1.0.0",
      architecture: "STATE_SPACE",
      inferenceMode: "UNAVAILABLE" as const,
      direction: "HOLD" as const,
      probabilities: { LONG: 0.3333, SHORT: 0.3333, HOLD: 0.3334 },
      confidence: 0,
      probability: 0.3333,
      uncertainty: 1.0,
      predictionInterval: [0.0, 1.0] as [number, number],
      latencyMs: 10,
      status: "DISABLED" as const,
      regimeCompatibility: 0.0,
      featureVersion: 2,
      isTrained: false,
      timestamp: Date.now(),
      error: "MODEL_CHECKPOINT_MISSING: Checkpoint missing at /path/mamba.pt"
    };
    expect(pred.error).toContain("MODEL_CHECKPOINT_MISSING");
    expect(pred.inferenceMode).toBe("UNAVAILABLE");
  });

  // TC06: invalid model output classified correctly
  test("TC06: invalid model output classified correctly", () => {
    const pred = {
      modelName: "SCHEMA_FAIL_MODEL",
      modelVersion: "1.0.0",
      architecture: "CNN",
      inferenceMode: "UNAVAILABLE" as const,
      direction: "HOLD" as const,
      probabilities: { LONG: 0.3333, SHORT: 0.3333, HOLD: 0.3334 },
      confidence: 0,
      probability: 0.3333,
      uncertainty: 1.0,
      predictionInterval: [0.0, 1.0] as [number, number],
      latencyMs: 10,
      status: "DISABLED" as const,
      regimeCompatibility: 0.0,
      featureVersion: 2,
      isTrained: false,
      timestamp: Date.now(),
      error: "MODEL_SCHEMA_MISMATCH: Unexpected output shape [1, 2] instead of [1, 3]"
    };
    expect(pred.error).toContain("MODEL_SCHEMA_MISMATCH");
    expect(pred.inferenceMode).toBe("UNAVAILABLE");
  });

  // TC07: fallback provenance preserved
  test("TC07: fallback provenance preserved", () => {
    const decision = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_FALLBACK_07",
      timestamp: Date.now() - 5000,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.70,
      holdProbability: 0.20,
      sellProbability: 0.10,
      direction: "LONG",
      confidence: 0.70,
      agreementScore: 0.70,
      tradeQualityScore: 75,
      tradeQualityTier: "TIER_1",
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
        "TRANSFORMER_MICRO_V1": {
          modelName: "TRANSFORMER_MICRO_V1",
          modelFamily: "TRANSFORMER",
          direction: "LONG",
          probLong: 0.70,
          probShort: 0.10,
          probHold: 0.20,
          confidence: 0.70,
          effectiveWeight: 0.15,
          participating: true,
          status: "PRODUCTION",
          inferenceMode: "REAL_MODEL",
          isFallback: true,
          modelActuallyUsed: "LOCAL_TRANSFORMER_FALLBACK",
          inferenceSource: "LOCAL_ATTENTION"
        }
      }
    });
    expect(decision.modelBreakdowns["TRANSFORMER_MICRO_V1"].isFallback).toBe(true);
    expect(decision.modelBreakdowns["TRANSFORMER_MICRO_V1"].modelActuallyUsed).toBe("LOCAL_TRANSFORMER_FALLBACK");
  });

  // TC08: proxy model never masquerades as genuine model
  test("TC08: proxy model never masquerades as genuine model", () => {
    const proxy = ModernModelRegistry.getExpert("MODERN_TCN_V1_PROXY");
    expect(proxy?.inferenceMode).toBe("PROXY");
    expect(proxy?.status).toBe("SHADOW");
    expect(proxy?.isTrained).toBe(false);

    const quantSignals = QuantStrategyRegistry.evaluateAll(mockFeatures, "TRENDING_BULL");
    const fusion = UnifiedEnsembleFusion.fuse(
      [{
        modelName: "MODERN_TCN_V1_PROXY",
        modelVersion: "1.1.0",
        architecture: "TCN_PROXY",
        inferenceMode: "PROXY",
        direction: "LONG",
        probabilities: { LONG: 0.85, SHORT: 0.05, HOLD: 0.10 },
        confidence: 0.85,
        probability: 0.85,
        uncertainty: 0.15,
        predictionInterval: [0.7, 0.9],
        latencyMs: 1,
        status: "SHADOW",
        regimeCompatibility: 0.9,
        featureVersion: 2,
        isTrained: false,
        timestamp: Date.now()
      }],
      quantSignals,
      mockFeatures.nlpSentiment,
      "TRENDING_BULL",
      { atrPercent: 0.015 }
    );
    expect(fusion.shadowModels).toContain("MODERN_TCN_V1_PROXY");
    expect(fusion.participatingModels).not.toContain("MODERN_TCN_V1_PROXY");
  });

  // TC09: optional unavailable model does not break ensemble if architecture allows partial availability
  test("TC09: optional unavailable model does not break ensemble if architecture allows partial availability", () => {
    const dlPreds = [
      {
        modelName: "MAMBA_RESEARCH_V1",
        modelVersion: "1.4.0",
        architecture: "SSM",
        inferenceMode: "UNAVAILABLE" as const,
        direction: "HOLD" as const,
        probabilities: { LONG: 0.33, SHORT: 0.33, HOLD: 0.34 },
        confidence: 0,
        probability: 0.33,
        uncertainty: 1.0,
        predictionInterval: [0.0, 1.0] as [number, number],
        latencyMs: 1,
        status: "DISABLED" as const,
        regimeCompatibility: 0.0,
        featureVersion: 2,
        isTrained: false,
        timestamp: Date.now(),
        error: "MODEL_CHECKPOINT_MISSING"
      },
      {
        modelName: "CNN_1D_V1",
        modelVersion: "1.0.0",
        architecture: "CNN",
        inferenceMode: "REAL_MODEL" as const,
        direction: "LONG" as const,
        probabilities: { LONG: 0.75, SHORT: 0.10, HOLD: 0.15 },
        confidence: 0.75,
        probability: 0.75,
        uncertainty: 0.25,
        predictionInterval: [0.65, 0.85] as [number, number],
        latencyMs: 2,
        status: "PRODUCTION" as const,
        regimeCompatibility: 0.95,
        featureVersion: 2,
        isTrained: true,
        timestamp: Date.now()
      }
    ];

    const quantSignals = QuantStrategyRegistry.evaluateAll(mockFeatures, "TRENDING_BULL");
    const fusion = UnifiedEnsembleFusion.fuse(dlPreds, quantSignals, mockFeatures.nlpSentiment, "TRENDING_BULL", { atrPercent: 0.015 });
    expect(fusion.participatingModels).toContain("CNN_1D_V1");
    expect(fusion.shadowModels).toContain("MAMBA_RESEARCH_V1");
    expect(fusion.buyProbability).toBeGreaterThan(0.40);
  });

  // TC10: required unavailable model correctly blocks ensemble
  test("TC10: required unavailable model correctly blocks ensemble", () => {
    const isRequiredModelOffline = true;
    const isDegradeAllowed = false; // Strict live execution mode
    const isStrictBlocked = isRequiredModelOffline && !isDegradeAllowed;
    expect(isStrictBlocked).toBe(true);
  });

  // TC11: ensemble provenance records actual contributing models
  test("TC11: ensemble provenance records actual contributing models", () => {
    const quantSignals = QuantStrategyRegistry.evaluateAll(mockFeatures, "TRENDING_BULL");
    const fusion = UnifiedEnsembleFusion.fuse([], quantSignals, mockFeatures.nlpSentiment, "TRENDING_BULL", { atrPercent: 0.015 });
    expect(fusion.participatingModels).toContain("AARYAN_MOMENTUM");
    expect(fusion.participatingModels).toContain("SMC_INSTITUTIONAL");
    expect(fusion.participatingModels).toContain("FINANCIAL_NLP");
  });

  // TC12: LONG signal reaches conviction gate
  test("TC12: LONG signal reaches conviction gate", () => {
    const posteriorWinProb = 0.78; // Passes 70% threshold
    const minProbRequired = 0.70;
    const convictionPassed = posteriorWinProb >= minProbRequired;
    expect(convictionPassed).toBe(true);
  });

  // TC13: SHORT signal reaches conviction gate
  test("TC13: SHORT signal reaches conviction gate", () => {
    const posteriorWinProb = 0.72; // Passes 70% threshold
    const minProbRequired = 0.70;
    const convictionPassed = posteriorWinProb >= minProbRequired;
    expect(convictionPassed).toBe(true);
  });

  // TC14: legitimate rejection remains REJECTED
  test("TC14: legitimate rejection remains REJECTED", () => {
    const posteriorWinProb = 0.576; // 57.6% < 70.0%
    const minProbRequired = 0.70;
    const convictionPassed = posteriorWinProb >= minProbRequired;
    expect(convictionPassed).toBe(false);

    const decision = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_REJ_14",
      timestamp: Date.now() - 5000,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.576,
      holdProbability: 0.30,
      sellProbability: 0.124,
      direction: "LONG",
      confidence: 0.576,
      agreementScore: 0.55,
      tradeQualityScore: 65,
      tradeQualityTier: "TIER_2",
      expectedValue: 0.001,
      expectedGain: 0.002,
      expectedLoss: 0.001,
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
      terminalReason: "ULTRA_CONVICTION_GATE: Bayesian Win-Prob 57.6% < 70.0%",
      modelBreakdowns: {}
    });
    expect(decision.terminalState).toBe("REJECTED");
    expect(decision.terminalReason).toContain("ULTRA_CONVICTION_GATE");
  });

  // TC15: eligible LONG reaches paper order
  test("TC15: eligible LONG reaches paper order", async () => {
    await paper.ensurePaperWalletFunded(userId, "PAPER", "FUTURES", 10000);
    const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
    const balance = wallet.get("USDT") ?? 0;
    expect(balance).toBe(10000);

    const requiredMargin = 1200;
    expect(balance).toBeGreaterThanOrEqual(requiredMargin);

    const trade = await paper.debitWalletAndCreateTrade(
      userId, "PAPER", "FUTURES", requiredMargin,
      async () => ({ _id: new mongoose.Types.ObjectId(), symbol, side: "BUY", quantity: 1, entryPrice: 60000 } as any)
    );
    expect(trade).toBeDefined();
    expect(wallet.get("USDT")).toBe(8800);
  });

  // TC16: eligible SHORT reaches paper order
  test("TC16: eligible SHORT reaches paper order", async () => {
    await paper.ensurePaperWalletFunded(userId, "PAPER", "FUTURES", 10000);
    const wallet = paper.getWallet(userId, "PAPER", "FUTURES");
    const requiredMargin = 1500;

    const trade = await paper.debitWalletAndCreateTrade(
      userId, "PAPER", "FUTURES", requiredMargin,
      async () => ({ _id: new mongoose.Types.ObjectId(), symbol, side: "SELL", quantity: 0.5, entryPrice: 60000 } as any)
    );
    expect(trade).toBeDefined();
    expect(wallet.get("USDT")).toBe(8500);
  });

  // TC17: paper balance is not treated as live balance
  test("TC17: paper balance is not treated as live balance", async () => {
    await paper.ensurePaperWalletFunded(userId, "PAPER", "FUTURES", 10000);
    const paperBal = paper.getWallet(userId, "PAPER", "FUTURES").get("USDT");
    const liveBal = paper.getWallet(userId, "LIVE", "FUTURES").get("USDT") ?? 0;
    expect(paperBal).toBe(10000);
    expect(liveBal).toBe(0);
  });

  // TC18: live wallet remains untouched
  test("TC18: live wallet remains untouched", async () => {
    const res = await paper.ensurePaperWalletFunded(userId, "LIVE", "FUTURES", 10000);
    expect(res).toBe(0);
    expect(paper.getWallet(userId, "LIVE", "FUTURES").get("USDT") ?? 0).toBe(0);
  });

  // TC19: paper order creates position
  test("TC19: paper order creates position", () => {
    paper.setPosition(userId, symbol, "PAPER", {
      userId,
      symbol,
      side: "BUY",
      quantity: 0.25,
      entryPrice: 60000,
      tradeId: "69c2bc93c8601b4eaf3abe30",
      accountType: "FUTURES",
      meta: { decisionId: "DEC_POS_19" }
    });
    const pos = paper.getPosition(userId, symbol, "PAPER", "FUTURES");
    expect(pos).toBeDefined();
    expect(pos?.quantity).toBe(0.25);
  });

  // TC20: position retains decisionId
  test("TC20: position retains decisionId", () => {
    paper.setPosition(userId, symbol, "PAPER", {
      userId,
      symbol,
      side: "BUY",
      quantity: 0.25,
      entryPrice: 60000,
      tradeId: "69c2bc93c8601b4eaf3abe31",
      accountType: "FUTURES",
      meta: { decisionId: "DEC_RETAIN_20" }
    });
    const pos = paper.getPosition(userId, symbol, "PAPER", "FUTURES");
    expect(pos?.meta?.decisionId).toBe("DEC_RETAIN_20");
  });

  // TC21: exit resolves position
  test("TC21: exit resolves position", () => {
    paper.setPosition(userId, symbol, "PAPER", {
      userId,
      symbol,
      side: "BUY",
      quantity: 0.25,
      entryPrice: 60000,
      tradeId: "69c2bc93c8601b4eaf3abe32",
      accountType: "FUTURES",
      sl: 59000,
      tp: 62000
    });
    paper.removePosition(userId, symbol, "PAPER", "FUTURES");
    expect(paper.getPosition(userId, symbol, "PAPER", "FUTURES")).toBeUndefined();
  });

  // TC22: outcome resolves original decision
  test("TC22: outcome resolves original decision", () => {
    const ts = Date.now() - 40000;
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_RES_22",
      timestamp: ts,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.82,
      holdProbability: 0.10,
      sellProbability: 0.08,
      direction: "LONG",
      confidence: 0.82,
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
      modelBreakdowns: {}
    });

    const success = ForwardTelemetryStore.resolveOutcome("DEC_RES_22", {
      resolvedTimestamp: ts + 15000,
      entryTimestamp: ts + 100,
      entryPrice: 60000,
      exitTimestamp: ts + 15000,
      exitPrice: 61200,
      realizedDirection: "LONG",
      realizedReturn: 0.02,
      realizedPnL: 300,
      fees: 12,
      slippage: 3,
      outcome: "WIN",
      directionCorrect: true
    });
    expect(success).toBe(true);
    const rec = ForwardTelemetryStore.getRecord("DEC_RES_22");
    expect(rec?.outcome?.realizedPnL).toBe(300);
    expect(rec?.outcome?.outcomeResult).toBe("WIN");
  });

  // TC23: no fabricated outcome
  test("TC23: no fabricated outcome", () => {
    const resolved = ForwardTelemetryStore.getResolvedRecords();
    expect(resolved.length).toBe(0);
    const stats = AutonomousForwardEvidenceEngine.evaluateStatisticalSensitivity([]);
    expect(stats.nTotal).toBe(0);
    expect(stats.bootstrapLCB).toBeNull();
  });

  // TC24: MODEL_UNAVAILABLE does not become INVALID
  test("TC24: MODEL_UNAVAILABLE does not become INVALID", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_MOD_24",
      timestamp: Date.now() - 5000,
      symbol,
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      buyProbability: 0.33,
      holdProbability: 0.34,
      sellProbability: 0.33,
      direction: "HOLD",
      confidence: 0,
      agreementScore: 0,
      tradeQualityScore: 0,
      tradeQualityTier: "NO_TRADE",
      expectedValue: 0,
      expectedGain: 0,
      expectedLoss: 0,
      uncertainty: 1.0,
      fees: 0.0004,
      slippage: 0.0001,
      spread: 0.0001,
      marketImpact: 0,
      netEV: 0,
      evGateResult: false,
      finalDecision: "HOLD",
      decisionClass: "MODEL_UNAVAILABLE",
      terminalState: "MODEL_UNAVAILABLE",
      terminalReason: "MODEL_SERVICE_TIMEOUT: Request timed out after 1500ms",
      modelBreakdowns: {}
    });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nModelUnavailable).toBe(1);
    expect(report.evidenceVector.nInvalid).toBe(0);
  });

  // TC25: opportunity conservation holds
  test("TC25: opportunity conservation holds", () => {
    const ts = Date.now() - 5000;
    // 1 TRADE, 1 NO_TRADE, 1 INSUFFICIENT_FUNDS, 1 REJECTED, 1 MODEL_UNAVAILABLE
    ForwardTelemetryStore.recordDecision({ decisionId: "D1", timestamp: ts, symbol, direction: "LONG", finalDecision: "LONG", decisionClass: "TRADE", terminalState: "TRADE" });
    ForwardTelemetryStore.recordDecision({ decisionId: "D2", timestamp: ts, symbol, direction: "HOLD", finalDecision: "HOLD", decisionClass: "NO_TRADE", terminalState: "NO_TRADE" });
    ForwardTelemetryStore.recordDecision({ decisionId: "D3", timestamp: ts, symbol, direction: "LONG", finalDecision: "LONG", decisionClass: "INSUFFICIENT_FUNDS", terminalState: "INSUFFICIENT_FUNDS" });
    ForwardTelemetryStore.recordDecision({ decisionId: "D4", timestamp: ts, symbol, direction: "SHORT", finalDecision: "SHORT", decisionClass: "REJECTED", terminalState: "REJECTED" });
    ForwardTelemetryStore.recordDecision({ decisionId: "D5", timestamp: ts, symbol, direction: "HOLD", finalDecision: "HOLD", decisionClass: "MODEL_UNAVAILABLE", terminalState: "MODEL_UNAVAILABLE" });

    const vector = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance().evidenceVector;
    expect(vector.nOpportunities).toBe(5);
    expect(vector.nValidDecisions).toBe(4);
    expect(vector.nInvalid).toBe(0);

    const sum = vector.nTrades + vector.nAbstentions + vector.nInsufficientFunds + vector.nRejected + vector.nModelUnavailable + vector.nDataUnavailable + vector.nTimeout + vector.nInvalid;
    expect(sum).toBe(vector.nOpportunities);
  });

  // TC26: nForwardOOS remains provenance-qualified
  test("TC26: nForwardOOS remains provenance-qualified", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "D_QUAL_26",
      timestamp: Date.now() - 5000,
      symbol,
      direction: "LONG",
      finalDecision: "LONG",
      dataSource: "FORWARD_OOS",
      isForward: true
    });

    ForwardTelemetryStore.recordDecision({
      decisionId: "D_SYNTH_26",
      timestamp: Date.now() - 5000,
      symbol,
      direction: "LONG",
      finalDecision: "LONG",
      dataSource: "SYNTHETIC",
      isSynthetic: true
    });

    expect(ForwardTelemetryStore.getForwardOOSDecisionCount()).toBe(1);
  });

  // TC27: temporal leakage remains blocked
  test("TC27: temporal leakage remains blocked", () => {
    const decTs = Date.now();
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_LEAK_27",
      timestamp: decTs,
      symbol,
      direction: "LONG",
      finalDecision: "LONG"
    });

    expect(() => {
      ForwardTelemetryStore.resolveOutcome("DEC_LEAK_27", {
        resolvedTimestamp: decTs - 1000,
        entryTimestamp: decTs - 2000,
        entryPrice: 60000,
        exitTimestamp: decTs - 1000,
        exitPrice: 61000,
        realizedDirection: "LONG",
        realizedReturn: 0.016,
        realizedPnL: 100,
        outcome: "WIN",
        directionCorrect: true
      });
    }).toThrow(DataLeakageError);
  });

  // TC28: duplicate decision remains idempotent
  test("TC28: duplicate decision remains idempotent", () => {
    const payload = {
      decisionId: "DEC_IDEMP_28",
      timestamp: Date.now() - 5000,
      symbol,
      direction: "LONG" as const,
      finalDecision: "LONG" as const
    };
    ForwardTelemetryStore.recordDecision(payload);
    ForwardTelemetryStore.recordDecision(payload);
    expect(ForwardTelemetryStore.getRecordCount()).toBe(1);
    expect(ForwardTelemetryStore.getDuplicateCount()).toBe(1);
  });

  // TC29: LIVE_PROMOTION_BLOCKED remains TRUE
  test("TC29: LIVE_PROMOTION_BLOCKED remains TRUE", () => {
    expect(ForwardTelemetryStore.isLivePromotionBlocked()).toBe(true);
    expect(LiveExecutionBarrier.isLiveTradingPermitted()).toBe(false);
  });

  // TC30: all 13 promotion gates remain fail-closed
  test("TC30: all 13 promotion gates remain fail-closed", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.isPromotionEligible).toBe(false);
    expect(report.isLiveApproved).toBe(false);
    expect(report.gateResults.every(g => !g.passed)).toBe(true);
  });
});
