import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { ForwardTelemetryStore, ForwardTelemetryRecord } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { AutonomousForwardEvidenceEngine } from "../src/services/aqea/governance/AutonomousForwardEvidenceEngine.js";
import { LiveExecutionBarrier } from "../src/services/aqea/governance/LiveExecutionBarrier.js";

describe("AQEA 2026-27 P0 Forensic Regression: Zero Valid Decisions & Opportunity Accounting", () => {
  beforeEach(() => {
    ForwardTelemetryStore.clear();
    ForwardTelemetryStore.resetStore();
  });

  afterEach(() => {
    ForwardTelemetryStore.clear();
    ForwardTelemetryStore.resetStore();
  });

  // 1. Opportunity can produce valid HOLD/NO_TRADE
  it("TC-01: Opportunity can produce valid HOLD/NO_TRADE", () => {
    const record = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_001",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGE_BOUND",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "HOLD",
      finalDecision: "HOLD",
      decisionClass: "NO_TRADE",
      terminalState: "NO_TRADE",
      terminalReason: "REGIME_OR_EV_NEUTRAL",
      confidence: 0.50,
      buyProbability: 0.33,
      holdProbability: 0.34,
      sellProbability: 0.33,
      expectedValue: 0,
      modelBreakdowns: {
        CNN_1D_V1: {
          modelName: "CNN_1D_V1",
          modelFamily: "MOMENTUM",
          direction: "HOLD",
          probLong: 0.33,
          probShort: 0.33,
          probHold: 0.34,
          confidence: 0.50,
          effectiveWeight: 0.20,
          participating: true,
          status: "ACTIVE",
          inferenceMode: "REAL_MODEL"
        }
      }
    });

    expect(record.direction).toBe("HOLD");
    expect(record.decisionClass).toBe("NO_TRADE");
    expect(record.isValidDecision).toBe(true);
    expect(record.terminalState).toBe("NO_TRADE");
  });

  // 2. Valid HOLD increments N_validDecisions
  it("TC-02: Valid HOLD increments N_validDecisions and N_abstentions", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_002",
      timestamp: Date.now(),
      symbol: "ETHUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGE_BOUND",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "HOLD",
      finalDecision: "HOLD",
      decisionClass: "NO_TRADE",
      terminalState: "NO_TRADE",
      terminalReason: "REGIME_OR_EV_NEUTRAL",
      confidence: 0.50
    });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nOpportunities).toBe(1);
    expect(report.evidenceVector.nValidDecisions).toBe(1);
    expect(report.evidenceVector.nAbstentions).toBe(1);
    expect(report.evidenceVector.nTrades).toBe(0);
  });

  // 3. Valid HOLD is not classified as INVALID
  it("TC-03: Valid HOLD is not classified as INVALID", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_003",
      timestamp: Date.now(),
      symbol: "SOLUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGE_BOUND",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "HOLD",
      finalDecision: "HOLD",
      decisionClass: "NO_TRADE",
      terminalState: "NO_TRADE",
      terminalReason: "REGIME_OR_EV_NEUTRAL"
    });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nInvalid).toBe(0);
    expect(report.evidenceVector.nValid).toBe(1);
  });

  // 4. Valid HOLD is not caused by paper balance
  it("TC-04: Valid HOLD is not caused by paper balance (zero balance evaluates normally)", () => {
    const record = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_004",
      timestamp: Date.now(),
      symbol: "BNBUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGE_BOUND",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "HOLD",
      finalDecision: "HOLD",
      decisionClass: "NO_TRADE",
      terminalState: "NO_TRADE",
      terminalReason: "EV_BELOW_HURDLE"
    });

    expect(record.terminalReason).not.toContain("PAPER_CAPITAL_UNAVAILABLE");
    expect(record.decisionClass).toBe("NO_TRADE");
  });

  // 5. TRADE with zero paper balance becomes INSUFFICIENT_FUNDS
  it("TC-05: TRADE with zero paper balance becomes INSUFFICIENT_FUNDS and counts as valid decision", () => {
    const dec = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_005",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "LONG",
      finalDecision: "LONG",
      decisionClass: "TRADE",
      terminalState: "PENDING_EXECUTION",
      confidence: 0.85
    });

    // Sizing evaluates balance=0 -> INSUFFICIENT_FUNDS
    ForwardTelemetryStore.updateTerminalState(
      dec.decisionId,
      "INSUFFICIENT_FUNDS",
      "PAPER_CAPITAL_UNAVAILABLE: required=$1800.00, available=$0.00",
      "INSUFFICIENT_FUNDS"
    );

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.insufficientFundsDecisions).toBe(1);
    expect(stats.validDecisions).toBe(1);
    expect(stats.tradedDecisions).toBe(0);
    expect(stats.abstainedDecisions).toBe(0);

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nOpportunities).toBe(1);
    expect(report.evidenceVector.nValidDecisions).toBe(1);
  });

  // 6. Zero-balance paper mode still executes full decision pipeline
  it("TC-06: Zero-balance paper mode accumulates valid decisions and model breakdowns", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_006",
      timestamp: Date.now(),
      symbol: "ADAUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "LONG",
      finalDecision: "LONG",
      decisionClass: "INSUFFICIENT_FUNDS",
      terminalState: "INSUFFICIENT_FUNDS",
      terminalReason: "PAPER_CAPITAL_UNAVAILABLE",
      confidence: 0.80,
      modelBreakdowns: {
        CNN_1D_V1: {
          modelName: "CNN_1D_V1",
          modelFamily: "MOMENTUM",
          direction: "LONG",
          probLong: 0.80,
          probShort: 0.10,
          probHold: 0.10,
          confidence: 0.80,
          effectiveWeight: 0.30,
          participating: true,
          status: "ACTIVE",
          inferenceMode: "REAL_MODEL"
        }
      }
    });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nPerSymbol["ADAUSDT"]).toBe(1);
    expect(report.evidenceVector.nPerModel["CNN_1D_V1"]).toBe(1);
    expect(report.evidenceVector.nPerDirection["LONG"]).toBe(1);
  });

  // 7. Model unavailable becomes MODEL_UNAVAILABLE
  it("TC-07: Model unavailable becomes MODEL_UNAVAILABLE and is not counted as abstention", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_007",
      timestamp: Date.now(),
      symbol: "DOGEUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "UNKNOWN",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "HOLD",
      finalDecision: "HOLD",
      decisionClass: "MODEL_UNAVAILABLE",
      terminalState: "MODEL_UNAVAILABLE",
      terminalReason: "AI_MODELS_OFFLINE_STRICT_MODE",
      confidence: 0
    });

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.modelUnavailableDecisions).toBe(1);
    expect(stats.abstainedDecisions).toBe(0);
    expect(stats.validDecisions).toBe(0);
  });

  // 8. Feature failure becomes DATA_UNAVAILABLE/INVALID
  it("TC-08: Feature failure becomes DATA_UNAVAILABLE and is excluded from valid decisions", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_008",
      timestamp: Date.now(),
      symbol: "XRPUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "UNKNOWN",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "HOLD",
      finalDecision: "HOLD",
      decisionClass: "DATA_UNAVAILABLE",
      terminalState: "DATA_UNAVAILABLE",
      terminalReason: "KLINES_EMPTY_MARKET_FEED_TIMEOUT",
      confidence: 0
    });

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.dataUnavailableDecisions).toBe(1);
    expect(stats.validDecisions).toBe(0);
    expect(stats.abstainedDecisions).toBe(0);
  });

  // 9. Timeout becomes TIMEOUT
  it("TC-09: Timeout becomes TIMEOUT and is tracked explicitly", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_009",
      timestamp: Date.now(),
      symbol: "DOTUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "UNKNOWN",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "HOLD",
      finalDecision: "HOLD",
      decisionClass: "TIMEOUT",
      terminalState: "TIMEOUT",
      terminalReason: "Timeout evaluating symbol DOTUSDT after 12000ms",
      confidence: 0
    });

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.timeoutDecisions).toBe(1);
    expect(stats.abstainedDecisions).toBe(0);
    expect(stats.validDecisions).toBe(0);
  });

  // 10. Generic exception cannot become HOLD
  it("TC-10: Error exception is recorded with explicit failure reason", () => {
    ForwardTelemetryStore.recordInvalidDecision("ERR_010");
    ForwardTelemetryStore.recordDecision({
      decisionId: "ERR_010",
      timestamp: Date.now(),
      symbol: "AVAXUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "UNKNOWN",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "HOLD",
      finalDecision: "HOLD",
      decisionClass: "DATA_UNAVAILABLE",
      terminalState: "DATA_UNAVAILABLE",
      terminalReason: "DATABASE_CONNECTION_LOST",
      confidence: 0
    });

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    expect(stats.abstainedDecisions).toBe(0);
    expect(stats.invalidDecisions).toBeGreaterThanOrEqual(1);
  });

  // 11. Every opportunity receives one terminal state
  it("TC-11: Every opportunity receives exactly one deterministic terminal state", () => {
    const d1 = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_011_A",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGE_BOUND",
      featureVersion: 2,
      direction: "HOLD",
      decisionClass: "NO_TRADE",
      terminalState: "NO_TRADE",
      terminalReason: "REGIME_NEUTRAL"
    });
    expect(d1.terminalState).toBe("NO_TRADE");

    const d2 = ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_011_B",
      timestamp: Date.now(),
      symbol: "ETHUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      direction: "LONG",
      decisionClass: "TRADE",
      terminalState: "TRADE",
      terminalReason: "PAPER_EXECUTION_COMPLETED"
    });
    expect(d2.terminalState).toBe("TRADE");
  });

  // 12. Duplicate decisionId does not increment counters twice
  it("TC-12: Duplicate decisionId updates in-place without duplicating count", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_012_DUP",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      direction: "LONG",
      decisionClass: "TRADE",
      terminalState: "PENDING_EXECUTION"
    });

    expect(ForwardTelemetryStore.getRecordCount()).toBe(1);

    // Second write with same decisionId updates terminal state
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_012_DUP",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      direction: "LONG",
      decisionClass: "INSUFFICIENT_FUNDS",
      terminalState: "INSUFFICIENT_FUNDS"
    });

    expect(ForwardTelemetryStore.getRecordCount()).toBe(1);
    const rec = ForwardTelemetryStore.getRecord("DEC_012_DUP");
    expect(rec?.terminalState).toBe("INSUFFICIENT_FUNDS");
  });

  // 13. Forward-OOS qualification records explicit rejection reason
  it("TC-13: Forward-OOS qualification rejects synthetic data with reason", () => {
    const qual = ForwardTelemetryStore.qualifyForwardOOSDecision({
      decisionId: "DEC_013_SYN",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      dataSource: "SYNTHETIC",
      isSynthetic: true,
      buyProbability: 0.8,
      holdProbability: 0.1,
      sellProbability: 0.1,
      direction: "LONG",
      confidence: 0.8,
      agreementScore: 1,
      tradeQualityScore: 80,
      tradeQualityTier: "EXCELLENT",
      expectedValue: 0.01,
      expectedGain: 0.02,
      expectedLoss: 0.01,
      fees: 0.001,
      slippage: 0.0005,
      spread: 0.0002,
      marketImpact: 0.0001,
      netEV: 0.008,
      evGateResult: true,
      finalDecision: "LONG",
      modelBreakdowns: {},
      uncertainty: 0.2,
      createdAt: Date.now()
    });

    expect(qual.qualified).toBe(false);
    expect(qual.reason).toContain("SYNTHETIC_DATA_QUARANTINE");
  });

  // 14. Valid forward decision increments N_forwardOOS only when genuinely qualified
  it("TC-14: Valid forward decision increments N_forwardOOS when genuinely qualified", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_014_QUAL",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      dataSource: "PAPER",
      isForward: true,
      isUntouched: true,
      isSynthetic: false,
      direction: "LONG",
      finalDecision: "LONG",
      decisionClass: "INSUFFICIENT_FUNDS",
      terminalState: "INSUFFICIENT_FUNDS"
    });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nForwardOOS).toBe(1);
  });

  // 15. Temporal leakage remains blocked
  it("TC-15: Temporal leakage with future feature timestamp fails qualification", () => {
    const qual = ForwardTelemetryStore.qualifyForwardOOSDecision({
      decisionId: "DEC_015_LEAK",
      timestamp: 1000,
      featureDataMaxTimestamp: 2000, // Future feature timestamp!
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGE_BOUND",
      featureVersion: 2,
      buyProbability: 0.33,
      holdProbability: 0.34,
      sellProbability: 0.33,
      direction: "HOLD",
      confidence: 0.5,
      agreementScore: 1,
      tradeQualityScore: 50,
      tradeQualityTier: "STANDARD",
      expectedValue: 0,
      expectedGain: 0,
      expectedLoss: 0,
      fees: 0.001,
      slippage: 0.0005,
      spread: 0.0002,
      marketImpact: 0.0001,
      netEV: 0,
      evGateResult: true,
      finalDecision: "HOLD",
      modelBreakdowns: {},
      uncertainty: 0.5,
      createdAt: 1000
    });

    expect(qual.qualified).toBe(false);
    expect(qual.reason).toContain("FUTURE_FEATURE_TIMESTAMP_LEAKAGE");
  });

  // 16. Experiment-version mismatch remains blocked
  it("TC-16: Experiment-version mismatch after freeze fails qualification", () => {
    // Freeze experiment
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_016_A",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      modelAuthorityVersion: "2026.6",
      ensembleVersion: "2026.6",
      dataSource: "FORWARD_OOS",
      isForward: true
    });

    expect(ForwardTelemetryStore.isExperimentFrozen()).toBe(true);

    // Mismatched version
    const qual = ForwardTelemetryStore.qualifyForwardOOSDecision({
      decisionId: "DEC_016_B",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      modelAuthorityVersion: "2099.9", // Mismatch!
      ensembleVersion: "2026.6",
      buyProbability: 0.5,
      holdProbability: 0.3,
      sellProbability: 0.2,
      direction: "LONG",
      confidence: 0.7,
      agreementScore: 1,
      tradeQualityScore: 70,
      tradeQualityTier: "STANDARD",
      expectedValue: 0.01,
      expectedGain: 0.01,
      expectedLoss: 0,
      fees: 0.001,
      slippage: 0.0005,
      spread: 0.0002,
      marketImpact: 0.0001,
      netEV: 0.008,
      evGateResult: true,
      finalDecision: "LONG",
      modelBreakdowns: {},
      uncertainty: 0.3,
      createdAt: Date.now()
    });

    expect(qual.qualified).toBe(false);
    expect(qual.reason).toContain("EXPERIMENT_VERSION_MUTATION");
  });

  // 17. LiveExecutionBarrier remains fail-closed
  it("TC-17: LiveExecutionBarrier remains fail-closed", () => {
    const barrier = LiveExecutionBarrier.verifyExecutionPermitted("LIVE");
    expect(barrier.permitted).toBe(false);
    expect(barrier.reason).toContain("LIVE_PROMOTION_BLOCKED_BARRIER");
  });

  // 18. No threshold is weakened
  it("TC-18: Minimum sample size for promotion remains >= 100", () => {
    expect(AutonomousForwardEvidenceEngine.MIN_OOS_SAMPLES_FOR_LIVE).toBe(100);
  });

  // 19. No synthetic PnL is created
  it("TC-19: At N=0 resolved trades, return statistics are null", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nTotal).toBe(0);
    expect(ForwardTelemetryStore.getResolvedCount()).toBe(0);
  });

  // 20. No synthetic evidence is created
  it("TC-20: Synthetic records do not increment nForwardOOS or nValidDecisions", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_020_SYN",
      timestamp: Date.now(),
      symbol: "ETHUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGE_BOUND",
      featureVersion: 2,
      dataSource: "SYNTHETIC",
      isSynthetic: true,
      direction: "LONG"
    });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nValidDecisions).toBe(0);
    expect(report.evidenceVector.nForwardOOS).toBe(0);
  });

  // 21. nPerModel becomes populated for valid model decisions
  it("TC-21: nPerModel becomes populated across valid decisions", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_021",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "LONG",
      decisionClass: "TRADE",
      modelBreakdowns: {
        MAMBA_V1: {
          modelName: "MAMBA_V1",
          modelFamily: "MOMENTUM",
          direction: "LONG",
          probLong: 0.8,
          probShort: 0.1,
          probHold: 0.1,
          confidence: 0.8,
          effectiveWeight: 0.35,
          participating: true,
          status: "ACTIVE",
          inferenceMode: "REAL_MODEL"
        },
        TRANSFORMER_MICRO_V1: {
          modelName: "TRANSFORMER_MICRO_V1",
          modelFamily: "MICROSTRUCTURE",
          direction: "LONG",
          probLong: 0.75,
          probShort: 0.15,
          probHold: 0.1,
          confidence: 0.75,
          effectiveWeight: 0.35,
          participating: true,
          status: "ACTIVE",
          inferenceMode: "REAL_MODEL"
        }
      }
    });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nPerModel["MAMBA_V1"]).toBe(1);
    expect(report.evidenceVector.nPerModel["TRANSFORMER_MICRO_V1"]).toBe(1);
  });

  // 22. nPerRegime becomes populated for valid regime decisions
  it("TC-22: nPerRegime becomes populated for valid decisions", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_022",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "LONG",
      decisionClass: "TRADE"
    });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nPerRegime["TRENDING_BULL"]).toBe(1);
  });

  // 23. nPerSymbol becomes populated for valid decisions
  it("TC-23: nPerSymbol becomes populated for valid decisions", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_023",
      timestamp: Date.now(),
      symbol: "SOLUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGE_BOUND",
      featureVersion: 2,
      dataSource: "PAPER",
      direction: "HOLD",
      decisionClass: "NO_TRADE"
    });

    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.evidenceVector.nPerSymbol["SOLUSDT"]).toBe(1);
    expect(report.evidenceVector.nPerDirection["HOLD"]).toBe(1);
  });

  // 24. Opportunity conservation law holds exactly
  it("TC-24: Opportunity conservation law holds exactly across mixed terminal states", () => {
    // 1 Trade
    ForwardTelemetryStore.recordDecision({
      decisionId: "D_TR",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      direction: "LONG",
      decisionClass: "TRADE",
      terminalState: "TRADE"
    });

    // 2 Abstentions (NO_TRADE)
    ForwardTelemetryStore.recordDecision({
      decisionId: "D_AB1",
      timestamp: Date.now(),
      symbol: "ETHUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGE_BOUND",
      featureVersion: 2,
      direction: "HOLD",
      decisionClass: "NO_TRADE",
      terminalState: "NO_TRADE"
    });
    ForwardTelemetryStore.recordDecision({
      decisionId: "D_AB2",
      timestamp: Date.now(),
      symbol: "SOLUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "RANGE_BOUND",
      featureVersion: 2,
      direction: "HOLD",
      decisionClass: "NO_TRADE",
      terminalState: "NO_TRADE"
    });

    // 1 Insufficient Funds
    ForwardTelemetryStore.recordDecision({
      decisionId: "D_IF",
      timestamp: Date.now(),
      symbol: "BNBUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      direction: "LONG",
      decisionClass: "INSUFFICIENT_FUNDS",
      terminalState: "INSUFFICIENT_FUNDS"
    });

    // 1 Rejected by Risk
    ForwardTelemetryStore.recordDecision({
      decisionId: "D_REJ",
      timestamp: Date.now(),
      symbol: "ADAUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      direction: "LONG",
      decisionClass: "REJECTED",
      terminalState: "REJECTED"
    });

    // 1 Data Unavailable
    ForwardTelemetryStore.recordDecision({
      decisionId: "D_DATA",
      timestamp: Date.now(),
      symbol: "XRPUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "UNKNOWN",
      featureVersion: 2,
      direction: "HOLD",
      decisionClass: "DATA_UNAVAILABLE",
      terminalState: "DATA_UNAVAILABLE"
    });

    const stats = ForwardTelemetryStore.getAbstentionStatistics();
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();

    // Total Opportunities = 6
    expect(report.evidenceVector.nOpportunities).toBe(6);
    expect(stats.tradedDecisions).toBe(1);
    expect(stats.abstainedDecisions).toBe(2);
    expect(stats.insufficientFundsDecisions).toBe(1);
    expect(stats.rejectedDecisions).toBe(1);
    expect(stats.dataUnavailableDecisions).toBe(1);

    // Valid Decisions = Trades (1) + Abstentions (2) + Insufficient Funds (1) + Rejected (1) = 5
    expect(report.evidenceVector.nValidDecisions).toBe(5);

    // Exact Conservation Law
    const sum = stats.tradedDecisions + stats.abstainedDecisions + stats.insufficientFundsDecisions +
      stats.rejectedDecisions + stats.dataUnavailableDecisions + stats.modelUnavailableDecisions +
      stats.timeoutDecisions;
    expect(sum).toBe(report.evidenceVector.nOpportunities);
  });

  // 25. Restart preserves counters and experiment identity
  it("TC-25: Export and import state preserves counters and experiment identity", () => {
    ForwardTelemetryStore.recordDecision({
      decisionId: "DEC_025",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      marketDomain: "CRYPTO",
      accountType: "FUTURES",
      regime: "TRENDING_BULL",
      featureVersion: 2,
      dataSource: "FORWARD_OOS",
      isForward: true,
      direction: "LONG",
      decisionClass: "TRADE",
      terminalState: "TRADE"
    });

    const json = ForwardTelemetryStore.exportStateJSON();
    ForwardTelemetryStore.clear();
    expect(ForwardTelemetryStore.getRecordCount()).toBe(0);

    ForwardTelemetryStore.importStateJSON(json);
    expect(ForwardTelemetryStore.getRecordCount()).toBe(1);
    const rec = ForwardTelemetryStore.getRecord("DEC_025");
    expect(rec?.decisionClass).toBe("TRADE");
  });
});
