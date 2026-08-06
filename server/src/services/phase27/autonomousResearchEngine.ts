/*
 * ─── Phase 27: Autonomous Research & Human Approval Gate Engine ─
 *
 * Runs automated experiments, enforces statistical rejection gates,
 * and generates research reports with Human Approval recommendation.
 */

import { ResearchHypothesis } from "../../models/ResearchHypothesis.js";
import { AutonomousExperiment } from "../../models/AutonomousExperiment.js";
import { ResearchReport } from "../../models/ResearchReport.js";

export class AutonomousResearchEngine {
  /**
   * Evaluates experiment candidate results against baseline metrics.
   * Requires ΔPF >= +0.10 and ΔSR >= +0.10 for promotion recommendation.
   */
  public static async evaluateExperiment(
    hypothesisId: string,
    candidatePF: number,
    candidateSR: number
  ): Promise<any> {
    const hyp = await ResearchHypothesis.findOne({ hypothesisId });
    if (!hyp) throw new Error(`Hypothesis ${hypothesisId} not found`);

    const baselinePF = hyp.baselineProfitFactor || 1.84;
    const baselineSR = hyp.baselineSharpe || 1.82;

    const deltaPF = +(candidatePF - baselinePF).toFixed(2);
    const deltaSR = +(candidateSR - baselineSR).toFixed(2);

    const statisticallySignificant = deltaPF >= 0.10 && deltaSR >= 0.10;
    const decision = statisticallySignificant ? "PROCEED_TO_HUMAN_APPROVAL" : "REJECTED";

    const experimentId = "EXP_AUTO_" + Date.now();
    await AutonomousExperiment.create({
      experimentId,
      hypothesisId,
      experimentType: "WALK_FORWARD",
      candidateProfitFactor: candidatePF,
      candidateSharpe: candidateSR,
      deltaProfitFactor: deltaPF,
      deltaSharpe: deltaSR,
      statisticallySignificant,
      decision,
    });

    // Update hypothesis state
    await ResearchHypothesis.updateOne(
      { hypothesisId },
      { $set: { state: statisticallySignificant ? "APPROVED_FOR_PROMOTION" : "REJECTED_STATISTICALLY" } }
    );

    // Create research report
    const reportId = "REP_" + Date.now();
    const report = await ResearchReport.create({
      reportId,
      hypothesisId,
      title: `Autonomous Research Report: ${hyp.targetComponent}`,
      summary: hyp.proposedHypothesis,
      results: { baselinePF, candidatePF, deltaPF, baselineSR, candidateSR, deltaSR, statisticallySignificant },
      recommendation: statisticallySignificant ? "APPROVE_PROMOTION" : "REJECT_EXPERIMENT",
      humanApproved: false,
    });

    return {
      experimentId,
      hypothesisId,
      deltaProfitFactor: deltaPF,
      deltaSharpeRatio: deltaSR,
      statisticallySignificant,
      decision,
      report,
    };
  }

  /**
   * Executes explicit human operator approval before any production promotion occurs.
   */
  public static async approvePromotion(reportId: string): Promise<any> {
    const report = await ResearchReport.findOne({ reportId });
    if (!report) throw new Error(`Research Report ${reportId} not found`);

    if (report.recommendation !== "APPROVE_PROMOTION") {
      throw new Error("Cannot approve experiment recommendation marked REJECT_EXPERIMENT");
    }

    await ResearchReport.updateOne(
      { reportId },
      { $set: { humanApproved: true, approvedAt: new Date() } }
    );

    return {
      reportId,
      humanApproved: true,
      status: "PROMOTED_TO_PRODUCTION_CHAMPION_WITH_HUMAN_APPROVAL",
    };
  }
}
