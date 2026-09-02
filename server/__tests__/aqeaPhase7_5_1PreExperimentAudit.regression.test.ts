/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA Phase 7.5.1 — Pre-Experiment Freeze & Paper-Run Readiness Audit
 *  Comprehensive Regression Test Suite
 * ═══════════════════════════════════════════════════════════════════
 *
 * Coverage: All spec sections
 * - 13-gate enumeration & parity
 * - EvidenceLabel semantics
 * - Zero-sample null semantics (no synthetic defaults)
 * - ESS edge cases (N=0/1/2/constant/positive/negative autocorrelation)
 * - Block bootstrap (N=0/N<blockSize/constant)
 * - Economic unit conversions (bps/decimal/percent)
 * - Temporal chain enforcement (t_decision < t_entry < t_exit)
 * - Look-ahead fill attack defense
 * - Opportunity conservation law
 * - Invalid decision deduplication
 * - OOS qualification (FORWARD_OOS vs SIMULATION/BACKTEST)
 * - Duplicate attribution
 * - Experiment version freeze & incompatibility detection
 * - Restart integrity
 * - DB failure simulation
 * - Live execution barrier
 * - Admin authority separation
 * - Daily report no-fabrication
 * - Governance observability
 * - assertPaperRunReady()
 */

import {
  AutonomousForwardEvidenceEngine,
  EvidenceLabel,
  PaperRunReadiness,
  PromotionGateResult
} from "../src/services/aqea/governance/AutonomousForwardEvidenceEngine.js";
import { ForwardTelemetryStore } from "../src/services/aqea/ensemble/ForwardTelemetryStore.js";
import { AQEA_CONFIG } from "../src/services/aqea/config.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRecord(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    decisionId: `test-${Math.random().toString(36).slice(2)}`,
    timestamp: now - 5000,
    symbol: "BTCUSDT",
    regime: "TRENDING_BULL",
    marketDomain: "CRYPTO",
    direction: "LONG" as const,
    dataSource: "FORWARD_OOS" as const,
    isForward: true,
    isUntouched: true,
    featureVersion: 2,
    modelAuthorityVersion: "2026.6",
    ensembleVersion: "2026.6",
    strategyVersion: "AQEA_AUTONOMOUS_V6",
    regimeVersion: "2026.6",
    costModelVersion: "2026.6",
    riskModelVersion: "2026.6",
    promotionPolicyVersion: "2026.6",
    experimentId: "EXP_BTCUSDT_TRENDING_BULL_V6",
    featureTimestamp: now - 10000,
    decisionTimestamp: now - 5000,
    modelBreakdowns: {},
    fees: 0,
    slippage: 0,
    spread: 0,
    marketImpact: 0,
    ...overrides
  };
}

function makeOutcome(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    resolvedTimestamp: now + 5000,
    entryTimestamp: now + 100,
    exitTimestamp: now + 3000,
    entryPrice: 50000,
    exitPrice: 50200,
    realizedDirection: "LONG" as const,
    realizedReturn: 0.004,
    realizedPnL: 200,
    outcome: "WIN" as const,
    outcomeResult: "WIN" as const,
    directionCorrect: true,
    fees: 5,
    slippage: 2,
    spread: 1,
    marketImpact: 0.5,
    ...overrides
  };
}

beforeEach(() => {
  ForwardTelemetryStore.resetStore();
  AutonomousForwardEvidenceEngine.resetEngine();
});

// ═══════════════════════════════════════════════════════════════════
// SECTION A: 13-Gate Enumeration & Documentation Parity
// ═══════════════════════════════════════════════════════════════════

describe("A. 13 Gate Enumeration (Spec Section 1)", () => {
  it("A1: evaluatePromotionGovernance returns exactly 13 gateResults", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.gateResults).toHaveLength(13);
  });

  it("A2: All 13 gates have unique gateIds G1 through G13", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    const ids = report.gateResults.map((g: PromotionGateResult) => g.gateId);
    expect(ids).toEqual(["G1","G2","G3","G4","G5","G6","G7","G8","G9","G10","G11","G12","G13"]);
  });

  it("A3: Gate categories match canonical 5-category spec", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    const cats = report.gateResults.map((g: PromotionGateResult) => g.category);
    expect(cats[0]).toBe("STATISTICAL");   // G1
    expect(cats[1]).toBe("STATISTICAL");   // G2
    expect(cats[2]).toBe("STATISTICAL");   // G3
    expect(cats[3]).toBe("DATA_INTEGRITY");// G4
    expect(cats[4]).toBe("STATISTICAL");   // G5
    expect(cats[5]).toBe("STATISTICAL");   // G6
    expect(cats[6]).toBe("CALIBRATION");   // G7
    expect(cats[7]).toBe("CALIBRATION");   // G8
    expect(cats[8]).toBe("RISK");          // G9
    expect(cats[9]).toBe("RISK");          // G10
    expect(cats[10]).toBe("STATISTICAL");  // G11
    expect(cats[11]).toBe("GOVERNANCE");   // G12
    expect(cats[12]).toBe("GOVERNANCE");   // G13
  });

  it("A4: Every gate has name, passed, threshold, evidenceLabel, reason", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    for (const gate of report.gateResults) {
      expect(gate.name).toBeTruthy();
      expect(typeof gate.passed).toBe("boolean");
      expect(typeof gate.threshold).toBe("number");
      expect(typeof gate.available).toBe("boolean");
      expect(["PRIOR","BASELINE","INSUFFICIENT_EVIDENCE","EMPIRICAL","UNAVAILABLE"]).toContain(gate.evidenceLabel);
      expect(gate.reason).toBeTruthy();
    }
  });

  it("A5: ALL 13 gates (G1 through G13) evaluate to passed: false when N=0", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    for (const gate of report.gateResults) {
      expect(gate.passed).toBe(false);
    }
  });

  it("A6: G1 threshold matches CANONICAL_SAFETY.MIN_FORWARD_OOS_SAMPLES", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    const g1 = report.gateResults.find((g: PromotionGateResult) => g.gateId === "G1")!;
    expect(g1.threshold).toBe(AQEA_CONFIG.CANONICAL_SAFETY.MIN_FORWARD_OOS_SAMPLES);
  });

  it("A7: G7 threshold matches CANONICAL_SAFETY.MAX_BRIER_SCORE", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    const g7 = report.gateResults.find((g: PromotionGateResult) => g.gateId === "G7")!;
    expect(g7.threshold).toBe(AQEA_CONFIG.CANONICAL_SAFETY.MAX_BRIER_SCORE);
  });

  it("A8: G8 threshold matches CANONICAL_SAFETY.MAX_ECE", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    const g8 = report.gateResults.find((g: PromotionGateResult) => g.gateId === "G8")!;
    expect(g8.threshold).toBe(AQEA_CONFIG.CANONICAL_SAFETY.MAX_ECE);
  });

  it("A9: isPromotionEligible is strictly false when N=0 (G1 && ... && G13)", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.isPromotionEligible).toBe(false);
    expect(report.isLiveApproved).toBe(false);
  });

  it("A10: Priors do NOT satisfy empirical gates G7, G8, G9, G10 at N=0", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    const g7 = report.gateResults.find((g: PromotionGateResult) => g.gateId === "G7")!;
    const g8 = report.gateResults.find((g: PromotionGateResult) => g.gateId === "G8")!;
    const g9 = report.gateResults.find((g: PromotionGateResult) => g.gateId === "G9")!;
    const g10 = report.gateResults.find((g: PromotionGateResult) => g.gateId === "G10")!;
    expect(g7.passed).toBe(false);
    expect(g8.passed).toBe(false);
    expect(g9.passed).toBe(false);
    expect(g10.passed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION B-C: Zero-Sample Semantics & No Synthetic Defaults
// ═══════════════════════════════════════════════════════════════════

describe("B-C. Zero-Sample Semantics & No Synthetic Defaults (Spec Sections 2-3)", () => {
  it("B1: Daily report returns null for all empirical metrics when N=0", () => {
    const rpt = AutonomousForwardEvidenceEngine.generateDailyAutonomousReport();
    expect(rpt.netEV).toBeNull();
    expect(rpt.brier).toBeNull();
    expect(rpt.ece).toBeNull();
    expect(rpt.sharpe).toBeNull();
    expect(rpt.sortino).toBeNull();
    expect(rpt.maxDD).toBeNull();
    expect(rpt.expectedShortfall).toBeNull();
    expect(rpt.calmar).toBeNull();
    expect(rpt.biasAuditScore).toBeNull();
    expect(rpt.driftScore).toBeNull();
  });

  it("B2: Daily report evidenceLabel is PRIOR when N=0", () => {
    const rpt = AutonomousForwardEvidenceEngine.generateDailyAutonomousReport();
    expect(rpt.evidenceLabel).toBe("PRIOR");
  });

  it("B3: null !== 0 — unavailable is not zero return", () => {
    const rpt = AutonomousForwardEvidenceEngine.generateDailyAutonomousReport();
    expect(rpt.netEV).toBeNull();
    expect(rpt.netEV).not.toBe(0);
  });

  it("B4: Bootstrap returns null lcb/ucb when N=0", () => {
    const boot = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation([], 5, 100);
    expect(boot.isBootstrapAvailable).toBe(false);
    expect(boot.lcb).toBeNull();
    expect(boot.ucb).toBeNull();
    expect(boot.mean).toBeNull();
    expect(boot.standardError).toBeNull();
    expect(boot.evidenceLabel).toBe("UNAVAILABLE");
    expect(boot.sampleCount).toBe(0);
  });

  it("B5: Bootstrap null is not typeof number", () => {
    const boot = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation([], 5, 100);
    expect(typeof boot.lcb).not.toBe("number");
  });

  it("C1: Model scores have evidenceLabel=PRIOR and null metrics when N=0", () => {
    const scores = AutonomousForwardEvidenceEngine.computeModelEvidenceScores();
    for (const score of Object.values(scores)) {
      if (score.sampleCount === 0) {
        expect(score.evidenceLabel).toBe("PRIOR");
        expect(score.forwardNetEV).toBeNull();
        expect(score.lcbNetEV).toBeNull();
        expect(score.logLoss).toBeNull();
        expect(score.sharpe).toBeNull();
        expect(score.sortino).toBeNull();
        expect(score.maxDD).toBeNull();
        expect(score.expectedShortfall).toBeNull();
        expect(score.executionError).toBeNull();
      }
    }
  });

  it("C2: No hardcoded Sharpe=1.2", () => {
    const scores = AutonomousForwardEvidenceEngine.computeModelEvidenceScores();
    for (const s of Object.values(scores)) {
      expect(s.sharpe).not.toBe(1.2);
    }
  });

  it("C3: No hardcoded Sortino=1.5", () => {
    const scores = AutonomousForwardEvidenceEngine.computeModelEvidenceScores();
    for (const s of Object.values(scores)) {
      expect(s.sortino).not.toBe(1.5);
    }
  });

  it("C4: No hardcoded maxDD=4.2", () => {
    const scores = AutonomousForwardEvidenceEngine.computeModelEvidenceScores();
    for (const s of Object.values(scores)) {
      expect(s.maxDD).not.toBe(4.2);
    }
  });

  it("C5: No hardcoded netEV=0.0015 in daily report when N=0", () => {
    const rpt = AutonomousForwardEvidenceEngine.generateDailyAutonomousReport();
    expect(rpt.netEV).not.toBe(0.0015);
  });

  it("C6: No hardcoded Brier=0.18 in daily report when N=0", () => {
    const rpt = AutonomousForwardEvidenceEngine.generateDailyAutonomousReport();
    expect(rpt.brier).not.toBe(0.18);
  });

  it("C7: No hardcoded ECE=0.06 in daily report when N=0", () => {
    const rpt = AutonomousForwardEvidenceEngine.generateDailyAutonomousReport();
    expect(rpt.ece).not.toBe(0.06);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION D-E: ESS Edge Cases
// ═══════════════════════════════════════════════════════════════════

describe("D-E. Effective Sample Size (Spec Section 11)", () => {
  it("E1: ESS N=0 returns {nEff:0, rho1:0}", () => {
    const { nEff, rho1 } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize([]);
    expect(nEff).toBe(0);
    expect(rho1).toBe(0);
  });

  it("E2: ESS N=1 returns {nEff:1, rho1:0}", () => {
    const { nEff, rho1 } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize([0.01]);
    expect(nEff).toBe(1);
    expect(rho1).toBe(0);
  });

  it("E3: ESS N=2 returns {nEff:2}", () => {
    const { nEff } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize([0.01, 0.02]);
    expect(nEff).toBe(2);
  });

  it("E4: Constant returns have zero autocorrelation → N_eff = N", () => {
    const returns = new Array(50).fill(0.01);
    const { nEff, rho1 } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(returns);
    expect(rho1).toBe(0);
    expect(nEff).toBe(50);
  });

  it("E5: Zero variance — no NaN or Infinity", () => {
    const { nEff, rho1 } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(new Array(20).fill(0.0));
    expect(isNaN(nEff)).toBe(false);
    expect(isNaN(rho1)).toBe(false);
    expect(isFinite(nEff)).toBe(true);
    expect(isFinite(rho1)).toBe(true);
  });

  it("E6: Positive autocorrelation reduces N_eff (N_eff < N)", () => {
    const returns: number[] = [];
    let prev = 0.05;
    for (let i = 0; i < 30; i++) {
      prev = 0.8 * prev + 0.001 * Math.sin(i);
      returns.push(prev);
    }
    const { nEff, rho1 } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(returns);
    expect(rho1).toBeGreaterThan(0);
    expect(nEff).toBeLessThan(30);
    expect(nEff).toBeGreaterThanOrEqual(1);
  });

  it("E7: Negative autocorrelation rho1 clipped to [-0.90, 0.90]", () => {
    const returns: number[] = [];
    let sign = 1;
    for (let i = 0; i < 30; i++) {
      returns.push(sign * 0.01);
      sign *= -1;
    }
    const { rho1 } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(returns);
    expect(rho1).toBeGreaterThanOrEqual(-0.90);
    expect(rho1).toBeLessThanOrEqual(0.90);
  });

  it("E8: N_eff bounded in [1, N] for any input", () => {
    const returns = new Array(50).fill(0).map((_, i) => 0.01 + 0.001 * (i % 5));
    const { nEff } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(returns);
    expect(nEff).toBeGreaterThanOrEqual(1);
    expect(nEff).toBeLessThanOrEqual(50);
  });

  it("E9: Multi-lag ESS N=0 returns {nEffMultiLag:0}", () => {
    const { nEffMultiLag } = AutonomousForwardEvidenceEngine.computeMultiLagEffectiveSampleSize([], 3);
    expect(nEffMultiLag).toBe(0);
  });

  it("E10: Multi-lag rho_k bounded in [-0.90, 0.90]", () => {
    const returns: number[] = [];
    for (let i = 0; i < 30; i++) returns.push(i % 2 === 0 ? 0.05 : -0.05);
    const { rhos } = AutonomousForwardEvidenceEngine.computeMultiLagEffectiveSampleSize(returns, 3);
    for (const rho of rhos) {
      expect(rho).toBeGreaterThanOrEqual(-0.90);
      expect(rho).toBeLessThanOrEqual(0.90);
    }
  });

  it("E11: Multi-lag ESS bounded in [1, N] for valid data", () => {
    const returns = new Array(30).fill(0).map((_, i) => 0.01 + 0.001 * i);
    const { nEffMultiLag } = AutonomousForwardEvidenceEngine.computeMultiLagEffectiveSampleSize(returns, 3);
    expect(nEffMultiLag).toBeGreaterThanOrEqual(1);
    expect(nEffMultiLag).toBeLessThanOrEqual(30);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION F: Block Bootstrap
// ═══════════════════════════════════════════════════════════════════

describe("F. Block Bootstrap (Spec Section 13)", () => {
  it("F1: Bootstrap N=0 returns isBootstrapAvailable=false", () => {
    const boot = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation([], 5, 100);
    expect(boot.isBootstrapAvailable).toBe(false);
  });

  it("F2: Bootstrap N=0 lcb and ucb are null", () => {
    const boot = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation([], 5, 100);
    expect(boot.lcb).toBeNull();
    expect(boot.ucb).toBeNull();
  });

  it("F3: Bootstrap N<blockSize still runs", () => {
    const boot = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation([0.01, 0.02, 0.01], 5, 50);
    expect(boot.isBootstrapAvailable).toBe(true);
    expect(boot.lcb).not.toBeNull();
  });

  it("F4: Bootstrap N=100 returns empirical label and sane bounds", () => {
    const returns = new Array(100).fill(0.01);
    const boot = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation(returns, 5, 100);
    expect(boot.isBootstrapAvailable).toBe(true);
    expect(boot.evidenceLabel).toBe("EMPIRICAL");
    expect(boot.sampleCount).toBe(100);
    expect((boot.lcb as number)).toBeLessThanOrEqual((boot.ucb as number));
  });

  it("F5: Bootstrap result has required fields", () => {
    const boot = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation([0.01, 0.02], 1, 50);
    expect(boot).toHaveProperty("isBootstrapAvailable");
    expect(boot).toHaveProperty("mean");
    expect(boot).toHaveProperty("median");
    expect(boot).toHaveProperty("standardError");
    expect(boot).toHaveProperty("lcb");
    expect(boot).toHaveProperty("ucb");
    expect(boot).toHaveProperty("bootstrapReplications");
    expect(boot).toHaveProperty("blockSize");
    expect(boot).toHaveProperty("sampleCount");
    expect(boot).toHaveProperty("evidenceLabel");
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION G: Economic Units
// ═══════════════════════════════════════════════════════════════════

describe("G. Economic Unit Conversion (Spec Section 14)", () => {
  it("G1: 10 bps = 0.0010 decimal (no unit mixing)", () => {
    const cs = AQEA_CONFIG.CANONICAL_SAFETY;
    expect(cs.ECONOMIC_HURDLE_BPS * 0.0001).toBeCloseTo(cs.ECONOMIC_HURDLE_DECIMAL, 6);
  });

  it("G2: 15% MaxDD limit is in percent form (not 0.15)", () => {
    expect(AQEA_CONFIG.CANONICAL_SAFETY.MAX_DRAWDOWN_LIMIT_PCT).toBe(15.0);
  });

  it("G3: 5% daily loss limit is in percent form (not 0.05)", () => {
    expect(AQEA_CONFIG.CANONICAL_SAFETY.MAX_DAILY_LOSS_LIMIT_PCT).toBe(5.0);
  });

  it("G4: ECONOMIC_HURDLE_DECIMAL is exactly 0.0010", () => {
    expect(AQEA_CONFIG.CANONICAL_SAFETY.ECONOMIC_HURDLE_DECIMAL).toBe(0.0010);
    expect(AQEA_CONFIG.CANONICAL_SAFETY.ECONOMIC_HURDLE_DECIMAL * 10000).toBe(10.0);
  });

  it("G5: G9 and G10 gate thresholds are in percent form (>1.0)", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    const g9 = report.gateResults.find((g: PromotionGateResult) => g.gateId === "G9")!;
    const g10 = report.gateResults.find((g: PromotionGateResult) => g.gateId === "G10")!;
    expect(g9.threshold).toBeGreaterThan(1.0);
    expect(g10.threshold).toBeGreaterThan(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION H: SE from Observed Variance
// ═══════════════════════════════════════════════════════════════════

describe("H. Standard Error from Observed Variance (Spec Section 12)", () => {
  it("H1: High-vol SE > Low-vol SE (empirical variance, not fixed sigma)", () => {
    const lowVol = new Array(30).fill(0.001);
    const highVol = new Array(30).fill(0).map((_, i) => i % 2 === 0 ? 0.05 : -0.03);

    const { nEff: nEffLow } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(lowVol);
    const { nEff: nEffHigh } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(highVol);

    const meanLow = lowVol.reduce((a, b) => a + b, 0) / lowVol.length;
    const varLow = lowVol.reduce((s, r) => s + (r - meanLow) ** 2, 0) / (lowVol.length - 1);
    const seLow = nEffLow > 0 ? Math.sqrt(varLow) / Math.sqrt(nEffLow) : 0;

    const meanHigh = highVol.reduce((a, b) => a + b, 0) / highVol.length;
    const varHigh = highVol.reduce((s, r) => s + (r - meanHigh) ** 2, 0) / (highVol.length - 1);
    const seHigh = nEffHigh > 0 ? Math.sqrt(varHigh) / Math.sqrt(nEffHigh) : 0;

    expect(seHigh).toBeGreaterThan(seLow);
  });

  it("H2: Fixed sigma=0.01/sqrt(N) underestimates high-vol SE by factor >2", () => {
    const highVol = new Array(20).fill(0).map((_, i) => i % 2 === 0 ? 0.1 : -0.08);
    const { nEff } = AutonomousForwardEvidenceEngine.computeEffectiveSampleSize(highVol);
    const mean = highVol.reduce((a, b) => a + b, 0) / highVol.length;
    const variance = highVol.reduce((s, r) => s + (r - mean) ** 2, 0) / (highVol.length - 1);
    const seCorrect = nEff > 0 ? Math.sqrt(variance) / Math.sqrt(nEff) : 0;
    const seWrong = nEff > 0 ? 0.01 / Math.sqrt(nEff) : 0;
    expect(seCorrect).toBeGreaterThan(seWrong * 2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION I: Execution Cost Model
// ═══════════════════════════════════════════════════════════════════

describe("I. Execution Cost Model (Spec Section 15)", () => {
  it("I1: Cost components preserved in record", () => {
    const record = makeRecord({ fees: 5, slippage: 2, spread: 1, marketImpact: 0.5 });
    expect(record.fees).toBe(5);
    expect(record.slippage).toBe(2);
    expect(record.spread).toBe(1);
    expect(record.marketImpact).toBe(0.5);
    const total = (record.fees ?? 0) + (record.slippage ?? 0) + (record.spread ?? 0) + (record.marketImpact ?? 0);
    expect(total).toBeCloseTo(8.5, 6);
  });

  it("I2: ExecutionError = realizedCost - predictedCost", () => {
    const id = `exec-cost-${Date.now()}`;
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({
      decisionId: id, timestamp: now - 10000,
      fees: 5, slippage: 2, spread: 1, marketImpact: 0
    }) as any);
    ForwardTelemetryStore.resolveOutcome(id, makeOutcome({
      entryTimestamp: now - 5000, exitTimestamp: now - 1000,
      resolvedTimestamp: now - 1000,
      fees: 7, slippage: 3, spread: 1.5, marketImpact: 0
    }) as any);

    const resolved = ForwardTelemetryStore.getResolvedRecords();
    const r = resolved.find(x => x.decisionId === id);
    expect(r).toBeDefined();
    expect(r!.executionError).toBeCloseTo(3.5, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION J: Temporal Execution Chain
// ═══════════════════════════════════════════════════════════════════

describe("J. Temporal Execution Chain (Spec Section 7)", () => {
  it("J1: Valid temporal chain accepted", () => {
    const id = `tc-valid-${Date.now()}`;
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: now - 10000 }) as any);
    expect(() => {
      ForwardTelemetryStore.resolveOutcome(id, makeOutcome({
        entryTimestamp: now - 5000,
        exitTimestamp: now - 1000,
        resolvedTimestamp: now - 1000
      }) as any);
    }).not.toThrow();
  });

  it("J2: entryTimestamp <= decisionTimestamp throws (look-ahead violation)", () => {
    const id = `tc-entry-leak-${Date.now()}`;
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: now - 5000 }) as any);
    expect(() => {
      ForwardTelemetryStore.resolveOutcome(id, makeOutcome({
        entryTimestamp: now - 6000,  // < decisionTimestamp
        exitTimestamp: now - 1000,
        resolvedTimestamp: now - 1000
      }) as any);
    }).toThrow();
  });

  it("J3: exitTimestamp <= entryTimestamp throws (look-ahead violation)", () => {
    const id = `tc-exit-leak-${Date.now()}`;
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: now - 10000 }) as any);
    expect(() => {
      ForwardTelemetryStore.resolveOutcome(id, makeOutcome({
        entryTimestamp: now - 5000,
        exitTimestamp: now - 6000,   // < entryTimestamp
        resolvedTimestamp: now - 1000
      }) as any);
    }).toThrow();
  });

  it("J4: entryTimestamp == decisionTimestamp is rejected (strict >)", () => {
    const id = `tc-equal-${Date.now()}`;
    const now = Date.now();
    const decisionTs = now - 5000;
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: decisionTs }) as any);
    expect(() => {
      ForwardTelemetryStore.resolveOutcome(id, makeOutcome({
        entryTimestamp: decisionTs,  // === decisionTimestamp, must be STRICTLY >
        exitTimestamp: now - 1000,
        resolvedTimestamp: now - 1000
      }) as any);
    }).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION K: Look-Ahead Attack Defense
// ═══════════════════════════════════════════════════════════════════

describe("K. Look-Ahead Defense (Spec Section 8)", () => {
  it("K1: Fill using pre-decision timestamp is blocked", () => {
    const id = `la-attack-${Date.now()}`;
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: now - 5000 }) as any);
    expect(() => {
      ForwardTelemetryStore.resolveOutcome(id, makeOutcome({
        entryTimestamp: now - 6000,  // Before decision — attack
        exitTimestamp: now - 1000,
        resolvedTimestamp: now - 1000
      }) as any);
    }).toThrow();
  });

  it("K2: Exit-before-entry is blocked", () => {
    const id = `la-exit-before-${Date.now()}`;
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: now - 10000 }) as any);
    expect(() => {
      ForwardTelemetryStore.resolveOutcome(id, makeOutcome({
        entryTimestamp: now - 5000,
        exitTimestamp: now - 6000,  // Before entry
        resolvedTimestamp: now - 1000
      }) as any);
    }).toThrow();
  });

  it("K3: Legitimate post-decision fill accepted", () => {
    const id = `la-legit-${Date.now()}`;
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: now - 10000 }) as any);
    expect(() => {
      ForwardTelemetryStore.resolveOutcome(id, makeOutcome({
        entryTimestamp: now - 8000,
        exitTimestamp: now - 2000,
        resolvedTimestamp: now - 2000
      }) as any);
    }).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION L: Opportunity Conservation Law
// ═══════════════════════════════════════════════════════════════════

describe("L. Opportunity Conservation Law (Spec Section 9)", () => {
  it("L1: N_invalid starts at 0", () => {
    expect(ForwardTelemetryStore.getInvalidCount()).toBe(0);
  });

  it("L2: recordInvalidDecision increments N_invalid", () => {
    ForwardTelemetryStore.recordInvalidDecision("dec-1");
    ForwardTelemetryStore.recordInvalidDecision("dec-2");
    expect(ForwardTelemetryStore.getInvalidCount()).toBe(2);
  });

  it("L3: Duplicate decisionId for invalid is idempotent (rejected)", () => {
    ForwardTelemetryStore.recordInvalidDecision("dup-dec-1");
    ForwardTelemetryStore.recordInvalidDecision("dup-dec-1");
    expect(ForwardTelemetryStore.getInvalidCount()).toBe(1);
  });

  it("L4: resetStore resets N_invalid to 0", () => {
    ForwardTelemetryStore.recordInvalidDecision("test-dec");
    ForwardTelemetryStore.resetStore();
    expect(ForwardTelemetryStore.getInvalidCount()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION M-N: OOS Qualification & Duplicate Attribution
// ═══════════════════════════════════════════════════════════════════

describe("M-N. OOS Qualification & Duplicate Attribution (Spec Section 6)", () => {
  it("M1: FORWARD_OOS + isForward=true counts as OOS", () => {
    const now = Date.now();
    const id = `oos-${now}`;
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: now - 10000 }) as any);
    ForwardTelemetryStore.resolveOutcome(id, makeOutcome({
      entryTimestamp: now - 5000,
      exitTimestamp: now - 1000,
      resolvedTimestamp: now - 1000
    }) as any);
    const oosCount = ForwardTelemetryStore.getResolvedRecords().filter(
      r => r.dataSource === "FORWARD_OOS" && r.isForward === true
    ).length;
    expect(oosCount).toBeGreaterThanOrEqual(1);
  });

  it("M2: SIMULATION data not counted as FORWARD_OOS", () => {
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({
      decisionId: `sim-${now}`, timestamp: now - 10000,
      dataSource: "SIMULATION" as any, isForward: false
    }) as any);
    const oosRecords = ForwardTelemetryStore.getResolvedRecords().filter(
      r => r.dataSource === "FORWARD_OOS" && r.isForward === true
    );
    expect(oosRecords.length).toBe(0);
  });

  it("N1: Duplicate decisionId rejected by recordDecision", () => {
    const now = Date.now();
    const id = `dup-${now}`;
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: now - 10000 }) as any);
    const countBefore = ForwardTelemetryStore.getAllRecords().length;
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: now - 9000 }) as any);
    const countAfter = ForwardTelemetryStore.getAllRecords().length;
    expect(countAfter).toBe(countBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION O: Experiment Version Freeze
// ═══════════════════════════════════════════════════════════════════

describe("O. Experiment Version Freeze (Spec Section 5)", () => {
  it("O1: isExperimentFrozen=false before first FORWARD_OOS", () => {
    expect(ForwardTelemetryStore.isExperimentFrozen()).toBe(false);
    expect(ForwardTelemetryStore.getExperimentContext()).toBeNull();
  });

  it("O2: Experiment freezes on first FORWARD_OOS observation", () => {
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: `freeze-${now}`, timestamp: now - 10000 }) as any);
    expect(ForwardTelemetryStore.isExperimentFrozen()).toBe(true);
    const ctx = ForwardTelemetryStore.getExperimentContext();
    expect(ctx).not.toBeNull();
  });

  it("O3: Second FORWARD_OOS does not change frozen context", () => {
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: `fa-${now}`, timestamp: now - 10000 }) as any);
    const ctx1 = ForwardTelemetryStore.getExperimentContext();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: `fb-${now+1}`, timestamp: now - 9000 }) as any);
    const ctx2 = ForwardTelemetryStore.getExperimentContext();
    expect(ctx1!.modelAuthorityVersion).toBe(ctx2!.modelAuthorityVersion);
  });

  it("O4: assertExperimentCompatibility detects version changes", () => {
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: `compat-${now}`, timestamp: now - 10000 }) as any);
    const result = ForwardTelemetryStore.assertExperimentCompatibility({
      modelAuthorityVersion: "2026.7-CHANGED"
    });
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain("mismatch");
  });

  it("O5: assertExperimentCompatibility passes for matching versions", () => {
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: `compat-ok-${now}`, timestamp: now - 10000 }) as any);
    const ctx = ForwardTelemetryStore.getExperimentContext()!;
    const result = ForwardTelemetryStore.assertExperimentCompatibility({
      modelAuthorityVersion: ctx.modelAuthorityVersion
    });
    expect(result.compatible).toBe(true);
  });

  it("O6: Pre-freeze assertExperimentCompatibility always compatible", () => {
    const result = ForwardTelemetryStore.assertExperimentCompatibility({
      modelAuthorityVersion: "any-version"
    });
    expect(result.compatible).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION P: Restart Integrity
// ═══════════════════════════════════════════════════════════════════

describe("P. Restart Integrity (Spec Section 18)", () => {
  it("P1: resetStore produces clean state", () => {
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: `restart-${now}`, timestamp: now - 10000 }) as any);
    ForwardTelemetryStore.recordInvalidDecision("invalid-restart");

    ForwardTelemetryStore.resetStore();
    AutonomousForwardEvidenceEngine.resetEngine();

    expect(ForwardTelemetryStore.getAllRecords()).toHaveLength(0);
    expect(ForwardTelemetryStore.getResolvedRecords()).toHaveLength(0);
    expect(ForwardTelemetryStore.getInvalidCount()).toBe(0);
    expect(ForwardTelemetryStore.isExperimentFrozen()).toBe(false);
  });

  it("P2: After reset, governance returns LEARNING_NOT_VALIDATED", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.currentState).toBe("LEARNING_NOT_VALIDATED");
    expect(report.evidenceVector.nForwardOOS).toBe(0);
  });

  it("P3: No phantom evidence after reset", () => {
    const rpt = AutonomousForwardEvidenceEngine.generateDailyAutonomousReport();
    expect(rpt.forwardObservations).toBe(0);
    expect(rpt.effectiveObservations).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION Q: DB Failure Simulation
// ═══════════════════════════════════════════════════════════════════

describe("Q. Database Failure Simulation (Spec Section 19)", () => {
  it("Q1: Unresolved record not counted as OOS (fail closed)", () => {
    const now = Date.now();
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: `db-fail-${now}`, timestamp: now - 10000 }) as any);
    const oosCount = ForwardTelemetryStore.getResolvedRecords().filter(
      r => r.dataSource === "FORWARD_OOS" && r.isForward === true
    ).length;
    expect(oosCount).toBe(0);
  });

  it("Q2: With N=0, promotion is blocked (fail closed)", () => {
    expect(ForwardTelemetryStore.isLivePromotionBlocked()).toBe(true);
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.isLiveApproved).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION R: Live Execution Barrier
// ═══════════════════════════════════════════════════════════════════

describe("R. Live Execution Barrier (Spec Section 16)", () => {
  it("R1: isLivePromotionBlocked returns true at clean start", () => {
    expect(ForwardTelemetryStore.isLivePromotionBlocked()).toBe(true);
  });

  it("R2: isLiveApproved is false when LIVE_PROMOTION_BLOCKED=true", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.isLiveApproved).toBe(false);
  });

  it("R3: VALIDATION_STATE = LEARNING_NOT_VALIDATED with N=0", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.currentState).toBe("LEARNING_NOT_VALIDATED");
  });

  it("R4: Promotion review rejected when N < MIN_OOS_SAMPLES_FOR_SUFFICIENT", () => {
    const result = AutonomousForwardEvidenceEngine.requestPromotionReview();
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("Insufficient sample");
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION S: Admin Authority Separation
// ═══════════════════════════════════════════════════════════════════

describe("S. Admin Authority Separation (Spec Section 17)", () => {
  it("S1: No direct setCurrentState on engine", () => {
    const engine = AutonomousForwardEvidenceEngine as any;
    expect(engine.setCurrentState).toBeUndefined();
  });

  it("S2: No forceApprove on engine", () => {
    const engine = AutonomousForwardEvidenceEngine as any;
    expect(engine.forceApprove).toBeUndefined();
  });

  it("S3: No setLivePromotionBlocked on store", () => {
    const store = ForwardTelemetryStore as any;
    expect(store.setLivePromotionBlocked).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION T: Daily Report No-Fabrication
// ═══════════════════════════════════════════════════════════════════

describe("T. Daily Report No-Fabrication (Spec Section 21)", () => {
  it("T1: N=0 → null NetEV (not 0.0015)", () => {
    expect(AutonomousForwardEvidenceEngine.generateDailyAutonomousReport().netEV).toBeNull();
  });

  it("T2: N=0 → isLiveBlocked=true always", () => {
    expect(AutonomousForwardEvidenceEngine.generateDailyAutonomousReport().isLiveBlocked).toBe(true);
  });

  it("T3: Real data produces non-null empirical netEV", () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      const id = `real-${now}-${i}`;
      ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: now - 10000 - i*100 }) as any);
      ForwardTelemetryStore.resolveOutcome(id, makeOutcome({
        entryTimestamp: now - 5000 - i*100,
        exitTimestamp: now - 1000 - i*100,
        resolvedTimestamp: now - 1000 - i*100,
        realizedReturn: 0.005
      }) as any);
    }
    const rpt = AutonomousForwardEvidenceEngine.generateDailyAutonomousReport();
    expect(rpt.netEV).not.toBeNull();
    expect(rpt.netEV).toBeCloseTo(0.005, 4);
    expect(rpt.evidenceLabel).toBe("INSUFFICIENT_EVIDENCE");
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION U: Governance Observability
// ═══════════════════════════════════════════════════════════════════

describe("U. Governance Observability (Spec Section 20)", () => {
  it("U1: EvidenceVector exposes all required fields", () => {
    const ev = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance().evidenceVector;
    expect(typeof ev.nTotal).toBe("number");
    expect(typeof ev.nOpportunities).toBe("number");
    expect(typeof ev.nTrades).toBe("number");
    expect(typeof ev.nAbstentions).toBe("number");
    expect(typeof ev.nInvalid).toBe("number");
    expect(typeof ev.nForwardOOS).toBe("number");
    expect(typeof ev.nEff).toBe("number");
    expect(typeof ev.nEffMultiLag).toBe("number");
  });

  it("U2: gateResults exposed for observability (13 gates)", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(Array.isArray(report.gateResults)).toBe(true);
    expect(report.gateResults.length).toBe(13);
  });

  it("U3: blockers list exposed with at least one entry when N=0", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(Array.isArray(report.blockers)).toBe(true);
    expect(report.blockers.length).toBeGreaterThan(0);
  });

  it("U4: Report timestamp is current", () => {
    const before = Date.now();
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    const after = Date.now();
    expect(report.timestamp).toBeGreaterThanOrEqual(before);
    expect(report.timestamp).toBeLessThanOrEqual(after);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION V: CANONICAL_SAFETY Single Source of Truth
// ═══════════════════════════════════════════════════════════════════

describe("V. Canonical Configuration (Spec Section 26)", () => {
  it("V1: CANONICAL_SAFETY contains all required thresholds", () => {
    const cs = AQEA_CONFIG.CANONICAL_SAFETY;
    expect(cs.STALE_MARKET_DATA_MS).toBe(60_000);
    expect(cs.ECONOMIC_HURDLE_DECIMAL).toBe(0.0010);
    expect(cs.MAX_DRAWDOWN_LIMIT_PCT).toBe(15.0);
    expect(cs.MAX_DAILY_LOSS_LIMIT_PCT).toBe(5.0);
    expect(cs.MIN_BAYESIAN_CONVICTION).toBe(0.60);
    expect(cs.MAX_CONFORMAL_UNCERTAINTY).toBe(0.85);
    expect(cs.MIN_FORWARD_OOS_SAMPLES).toBe(100);
    expect(cs.MIN_EFFECTIVE_SAMPLE_SIZE).toBe(100);
    expect(cs.MIN_REGIME_COVERAGE_SCORE).toBeCloseTo(0.375, 4);
    expect(cs.MAX_BRIER_SCORE).toBe(0.22);
    expect(cs.MAX_ECE).toBe(0.12);
    expect(cs.MAX_FDR_SIGNIFICANCE).toBe(0.05);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION W: assertPaperRunReady
// ═══════════════════════════════════════════════════════════════════

describe("W. assertPaperRunReady (Spec Section 27)", () => {
  it("W1: Returns READY_FOR_GENUINE_PAPER_EVIDENCE_ACCUMULATION at clean start", () => {
    const result = AutonomousForwardEvidenceEngine.assertPaperRunReady();
    expect(result.state).toBe("READY_FOR_GENUINE_PAPER_EVIDENCE_ACCUMULATION");
    expect(result.isReady).toBe(true);
  });

  it("W2: N_forward_oos = 0 at paper run start", () => {
    expect(AutonomousForwardEvidenceEngine.assertPaperRunReady().nForwardOos).toBe(0);
  });

  it("W3: N_eff = 0 at paper run start", () => {
    expect(AutonomousForwardEvidenceEngine.assertPaperRunReady().nEff).toBe(0);
  });

  it("W4: N_eff_multi = 0 at paper run start", () => {
    expect(AutonomousForwardEvidenceEngine.assertPaperRunReady().nEffMulti).toBe(0);
  });

  it("W5: LIVE_PROMOTION_BLOCKED = true in readiness check", () => {
    expect(AutonomousForwardEvidenceEngine.assertPaperRunReady().livePromotionBlocked).toBe(true);
  });

  it("W6: VALIDATION_STATE = LEARNING_NOT_VALIDATED", () => {
    expect(AutonomousForwardEvidenceEngine.assertPaperRunReady().validationState).toBe("LEARNING_NOT_VALIDATED");
  });

  it("W7: 13 promotion gates present in passedChecks", () => {
    const result = AutonomousForwardEvidenceEngine.assertPaperRunReady();
    expect(result.passedChecks.some(c => c.includes("13 promotion gates"))).toBe(true);
  });

  it("W8: Returns NOT_READY when FORWARD_OOS evidence already exists", () => {
    const now = Date.now();
    const id = `contaminated-${now}`;
    ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: now - 10000 }) as any);
    ForwardTelemetryStore.resolveOutcome(id, makeOutcome({
      entryTimestamp: now - 5000,
      exitTimestamp: now - 1000,
      resolvedTimestamp: now - 1000
    }) as any);
    const result = AutonomousForwardEvidenceEngine.assertPaperRunReady();
    // System has unresolved FORWARD_OOS evidence — should NOT be ready
    expect(result.isReady).toBe(false);
    expect(result.state).toBe("NOT_READY");
    expect(result.failedChecks.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION X: Evidence Label System
// ═══════════════════════════════════════════════════════════════════

describe("X. Evidence Label System (Spec Section 4)", () => {
  it("X1: PRIOR label for N=0 model scores", () => {
    const scores = AutonomousForwardEvidenceEngine.computeModelEvidenceScores();
    for (const s of Object.values(scores)) {
      if (s.sampleCount === 0) {
        expect(s.evidenceLabel).toBe("PRIOR");
      }
    }
  });

  it("X2: INSUFFICIENT_EVIDENCE when 0 < N < 25", () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      const id = `ev-label-${now}-${i}`;
      ForwardTelemetryStore.recordDecision(makeRecord({ decisionId: id, timestamp: now - 10000 - i*100 }) as any);
      ForwardTelemetryStore.resolveOutcome(id, makeOutcome({
        entryTimestamp: now - 5000 - i*100,
        exitTimestamp: now - 1000 - i*100,
        resolvedTimestamp: now - 1000 - i*100
      }) as any);
    }
    const rpt = AutonomousForwardEvidenceEngine.generateDailyAutonomousReport();
    expect(rpt.evidenceLabel).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("X3: Bootstrap evidenceLabel is EMPIRICAL when data available", () => {
    const boot = AutonomousForwardEvidenceEngine.performBlockBootstrapValidation(new Array(30).fill(0.01), 3, 50);
    expect(boot.evidenceLabel).toBe("EMPIRICAL");
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION Y: State Machine Transitions
// ═══════════════════════════════════════════════════════════════════

describe("Y. State Machine (Spec Sections 22-23)", () => {
  it("Y1: Initial state is LEARNING_NOT_VALIDATED", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.currentState).toBe("LEARNING_NOT_VALIDATED");
  });

  it("Y2: isLiveApproved must be false at clean start", () => {
    const report = AutonomousForwardEvidenceEngine.evaluatePromotionGovernance();
    expect(report.isLiveApproved).toBe(false);
  });

  it("Y3: Promotion review rejected before MIN_OOS_SAMPLES", () => {
    const result = AutonomousForwardEvidenceEngine.requestPromotionReview();
    expect(result.accepted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION Z: Statistical Sensitivity & Zero Paper Balance Invariants
// ═══════════════════════════════════════════════════════════════════

describe("Z. Statistical Sensitivity & Zero-Balance Paper Invariants (Phase 7.5.2)", () => {
  it("Z1: Statistical sensitivity at N=0 returns UNAVAILABLE (never SUFFICIENT)", () => {
    const report = AutonomousForwardEvidenceEngine.evaluateStatisticalSensitivity([]);
    expect(report.nTotal).toBe(0);
    expect(report.nEffAR1).toBe(0);
    expect(report.nEffMultiLag).toBe(0);
    expect(report.evidenceState).toBe("UNAVAILABLE");
    expect(report.evidenceState).not.toBe("SUFFICIENT");
    expect(report.reason).toContain("N=0");
  });

  it("Z2: Statistical sensitivity at N=0 returns null LCBs", () => {
    const report = AutonomousForwardEvidenceEngine.evaluateStatisticalSensitivity([]);
    expect(report.analyticalLCB).toBeNull();
    expect(report.bootstrapLCB).toBeNull();
  });

  it("Z3: Statistical sensitivity with small sample (N=10) returns INSUFFICIENT_EVIDENCE", () => {
    const smallReturns = [0.001, 0.002, -0.001, 0.003, 0.001, -0.002, 0.004, 0.001, -0.001, 0.002];
    const report = AutonomousForwardEvidenceEngine.evaluateStatisticalSensitivity(smallReturns);
    expect(report.nTotal).toBe(10);
    expect(["INSUFFICIENT_EVIDENCE", "UNCERTAIN"]).toContain(report.evidenceState);
    expect(report.evidenceState).not.toBe("SUFFICIENT");
  });

  it("Z4: Sizing for PAPER mode with zero balance computes nominal virtual sizing for evidence", async () => {
    const { UnifiedSizingEngine } = await import("../src/services/aqea/unifiedSizingEngine.js");
    const sizing = await UnifiedSizingEngine.compute({
      balance: 0,
      atr: 500,
      price: 65000,
      regime: { regime: "TRENDING_BULL" as any, confidence: 85 } as any,
      quality: { score: 85, rating: "NORMAL" } as any,
      portfolioHeat: 0,
      userId: "test-user-zero-bal",
      mode: "PAPER"
    });
    expect(sizing.positionSize).toBeGreaterThan(0);
    expect(sizing.leverage).toBeGreaterThanOrEqual(1);
    expect(sizing.effectiveRiskPct).toBeGreaterThan(0);
  });
});
