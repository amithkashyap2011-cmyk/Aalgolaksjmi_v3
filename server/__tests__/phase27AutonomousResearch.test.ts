import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import mongoose from "mongoose";
import { WeaknessDetectorEngine } from "../src/services/phase27/weaknessDetectorEngine.js";
import { HypothesisGeneratorEngine } from "../src/services/phase27/hypothesisGeneratorEngine.js";
import { AutonomousResearchEngine } from "../src/services/phase27/autonomousResearchEngine.js";
import { ResearchHypothesis } from "../src/models/ResearchHypothesis.js";
import { ResearchReport } from "../src/models/ResearchReport.js";

describe("Phase 27 — Institutional Autonomous Validation & Self-Improvement Framework", () => {
  beforeAll(async () => {
    const connected = await connectIfAvailable();
    if (!connected) return;
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  it("Step 1 & 2: Autonomous Weakness Detector — should detect premature exits & high slippage from telemetry", () => {
    if (skipIfNoMongo()) return;
    const weaknesses = WeaknessDetectorEngine.scanTelemetry([
      { tradeId: "T1", strategyId: "STRAT_TREND", marketRegime: "HIGH_VOLATILITY", slippagePct: 0.07, holdingTimeMinutes: 15, pnlR: -0.5 },
    ]);

    expect(weaknesses.length).toBe(2);
    expect(weaknesses.some((w) => w.weaknessType === "HIGH_SLIPPAGE")).toBe(true);
    expect(weaknesses.some((w) => w.weaknessType === "PREMATURE_EXITS")).toBe(true);
  });

  it("Step 3: Hypothesis Generator Engine — should formulate research hypotheses from weaknesses", async () => {
    if (skipIfNoMongo()) return;
    const weaknesses = WeaknessDetectorEngine.scanTelemetry([
      { tradeId: "T1", strategyId: "STRAT_TREND", marketRegime: "HIGH_VOLATILITY", slippagePct: 0.07, holdingTimeMinutes: 15, pnlR: -0.5 },
    ]);
    const hypotheses = await HypothesisGeneratorEngine.generateHypotheses(weaknesses);

    expect(hypotheses.length).toBe(2);
    expect(hypotheses.some((h) => h.proposedHypothesis.includes("ATR stop-loss multiplier"))).toBe(true);
  });

  it("Step 4 & 5: Statistical Rejection Gate — should REJECT experiments failing ΔPF >= +0.10 threshold", async () => {
    if (skipIfNoMongo()) return;
    await ResearchHypothesis.findOneAndUpdate(
      { hypothesisId: "HYP_TEST_FAIL" },
      {
        $set: {
          weaknessType: "PREMATURE_EXITS",
          targetComponent: "ATRExitEngine",
          problemStatement: "Premature exits",
          proposedHypothesis: "Test hypothesis failure",
          proposedParameterChange: { atrStopMultiplier: 2.1 },
          baselineProfitFactor: 1.84,
          baselineSharpe: 1.82,
          state: "GENERATED",
        },
      },
      { upsert: true, new: true }
    );

    const evalRes = await AutonomousResearchEngine.evaluateExperiment("HYP_TEST_FAIL", 1.85, 1.83); // ΔPF = 0.01 < 0.10

    expect(evalRes.statisticallySignificant).toBe(false);
    expect(evalRes.decision).toBe("REJECTED");
    expect(evalRes.report.recommendation).toBe("REJECT_EXPERIMENT");
  });

  it("Step 6 & 7: Human Approval Promotion Gate — should proceed to Human Approval for statistically valid candidates and promote only on explicit approval", async () => {
    if (skipIfNoMongo()) return;
    await ResearchHypothesis.findOneAndUpdate(
      { hypothesisId: "HYP_TEST_PASS" },
      {
        $set: {
          weaknessType: "PREMATURE_EXITS",
          targetComponent: "ATRExitEngine",
          problemStatement: "Premature exits",
          proposedHypothesis: "Test hypothesis pass",
          proposedParameterChange: { atrStopMultiplier: 2.5 },
          baselineProfitFactor: 1.84,
          baselineSharpe: 1.82,
          state: "GENERATED",
        },
      },
      { upsert: true, new: true }
    );

    const evalRes = await AutonomousResearchEngine.evaluateExperiment("HYP_TEST_PASS", 1.98, 1.95); // ΔPF = 0.14 >= 0.10, ΔSR = 0.13 >= 0.10

    expect(evalRes.statisticallySignificant).toBe(true);
    expect(evalRes.decision).toBe("PROCEED_TO_HUMAN_APPROVAL");
    expect(evalRes.report.recommendation).toBe("APPROVE_PROMOTION");

    // Human operator approves promotion
    const approval = await AutonomousResearchEngine.approvePromotion(evalRes.report.reportId);
    expect(approval.humanApproved).toBe(true);
    expect(approval.status).toContain("PROMOTED_TO_PRODUCTION_CHAMPION_WITH_HUMAN_APPROVAL");
  });
});
