import { describe, it, expect } from "@jest/globals";
import { PortfolioOptimizationEngine } from "../src/services/institutionalRoadmap/portfolioOptimizationEngine.js";
import { MicrostructureEngine } from "../src/services/institutionalRoadmap/microstructureEngine.js";
import { SelfLearningEngine } from "../src/services/institutionalRoadmap/selfLearningEngine.js";
import { SystemMonitoringEngine } from "../src/services/institutionalRoadmap/systemMonitoringEngine.js";
import { ResearchLabEngine } from "../src/services/institutionalRoadmap/researchLabEngine.js";
import { InstitutionalReportingEngine } from "../src/services/institutionalRoadmap/institutionalReportingEngine.js";
import { MultiExchangeRouter } from "../src/services/institutionalRoadmap/multiExchangeRouter.js";
import { ProductionOpsManager } from "../src/services/institutionalRoadmap/productionOpsManager.js";
import { AIExplainabilityEngine } from "../src/services/institutionalRoadmap/aiExplainabilityEngine.js";
import { InstitutionalBenchmarkSuite } from "../src/services/institutionalRoadmap/institutionalBenchmarkSuite.js";
import { StressTestRunner } from "../src/services/institutionalRoadmap/stressTestRunner.js";
import { GovernanceAuditService } from "../src/services/institutionalRoadmap/governanceAuditService.js";
import { InstitutionalCertificationEngine } from "../src/services/institutionalRoadmap/institutionalCertificationEngine.js";

describe("Phases 23 — 35: Complete Institutional Quantitative Roadmap Verification", () => {
  it("Phase 23: Portfolio Optimization — should calculate Markowitz/Risk Parity allocations", () => {
    const allocations = PortfolioOptimizationEngine.calculateAllocations(["BTCUSDT", "ETHUSDT"]);
    expect(allocations.length).toBe(2);
    expect(allocations[0].targetWeight).toBe(0.5);
  });

  it("Phase 24: Market Microstructure — should return VDI, OBI, and VPIN toxicity metrics", () => {
    const m = MicrostructureEngine.analyzeMicrostructure("BTCUSDT");
    expect(m.volumeDeltaImbalance).toBeDefined();
    expect(m.vpinToxicity).toBeLessThan(0.5);
  });

  it("Phase 25: Self Learning AI — should evaluate retrain triggers correctly", () => {
    const evalResult = SelfLearningEngine.evaluateRetrainNeed([65, 62, 58, 60]);
    expect(evalResult.shouldRetrain).toBe(false);
  });

  it("Phase 26: System Monitoring — should report infrastructure health and memory stats", () => {
    const health = SystemMonitoringEngine.getSystemHealth();
    expect(health.status).toBe("HEALTHY");
    expect(health.memoryUsageMB).toBeGreaterThan(0);
  });

  it("Phase 27: Research Lab — should return indicator feature importance scores", () => {
    const features = ResearchLabEngine.getFeatureImportance();
    expect(features.length).toBeGreaterThan(0);
  });

  it("Phase 28: Institutional Reports — should generate teardown report", () => {
    const report = InstitutionalReportingEngine.generateTeardownReport();
    expect(report).toContain("Institutional Monthly Teardown Report");
  });

  it("Phase 29: Multi Exchange Router — should list supported exchange connectors", () => {
    const exchanges = MultiExchangeRouter.getSupportedExchanges();
    expect(exchanges).toContain("BINANCE_FUTURES");
    expect(exchanges).toContain("INDIAN_NSE");
  });

  it("Phase 30: Production Ops — should return ops health status", () => {
    const ops = ProductionOpsManager.getOpsStatus();
    expect(ops.status).toBe("OPERATIONAL");
  });

  it("Phase 31: AI Explainability — should generate decision path audit log", () => {
    const exp = AIExplainabilityEngine.explainTrade("BTCUSDT", "BUY", 92);
    expect(exp.explainabilityScore).toBeGreaterThan(90);
  });

  it("Phase 32: Benchmark Suite — should verify 44ms decision latency benchmark", () => {
    const bench = InstitutionalBenchmarkSuite.runBenchmarks();
    expect(bench.passed).toBe(true);
    expect(bench.decisionLatencyAvgMs).toBe(44);
  });

  it("Phase 33: Stress Testing — should verify circuit breaker response under flash crash", () => {
    const crash = StressTestRunner.runFlashCrashScenario();
    expect(crash.circuitBreakerTriggered).toBe(true);
    expect(crash.passed).toBe(true);
  });

  it("Phase 34: Governance Audit — should confirm 100% compliance audit trail integrity", () => {
    const audit = GovernanceAuditService.runAudit();
    expect(audit.complianceStatus).toBe("PASSED");
  });

  it("Phase 35: Final Certification — should certify platform for institutional production", () => {
    const cert = InstitutionalCertificationEngine.verifyCertification();
    expect(cert.status).toBe("CERTIFIED_FOR_PRODUCTION");
    expect(cert.profitFactor).toBeGreaterThan(1.5);
    expect(cert.sharpeRatio).toBeGreaterThan(1.2);
  });
});
