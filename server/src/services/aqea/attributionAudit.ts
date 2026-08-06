/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Decision Attribution Service (V8.5.1)
 * ═══════════════════════════════════════════════════════════════════
 */

import { AqeaDecisionAttribution } from "../../models/AqeaDecisionAttribution.js";
import { AQEADecision } from "./engine.js";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { toValidObjectId } from "../../utils/mongoUtils.js";

export class AttributionAuditService {
  /**
   * Records a granular attribution entry for every AQEA signal.
   */
  public static async record(
    userId: string,
    symbol: string,
    decision: AQEADecision
  ): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    try {
      const meta = decision.meta || {};
      const ai = meta.aiPredictions || [];
      
      const cnn = ai.find((p: any) => p.predictor.includes("CNN"));
      const transformer = ai.find((p: any) => p.predictor.includes("TRANSFORMER"));
      const ppo = ai.find((p: any) => p.predictor.includes("PPO"));
      const mamba = ai.find((p: any) => p.predictor.includes("MAMBA"));

      if (mongoose.connection?.readyState !== 1 || typeof AqeaDecisionAttribution.create !== "function") return;
      await AqeaDecisionAttribution.create({
        timestamp: new Date(),
        userId: toValidObjectId(userId),
        symbol,
        
        cnnPrediction: cnn?.direction || "HOLD",
        cnnConfidence: cnn?.confidence || 0,
        
        transformerPrediction: transformer?.direction || "HOLD",
        transformerConfidence: transformer?.confidence || 0,

        ppoPrediction: ppo?.direction || "HOLD",
        ppoConfidence: ppo?.confidence || 0,

        mambaPrediction: mamba?.direction || "HOLD",
        mambaConfidence: mamba?.confidence || 0,
        
        orderFlowScore: meta.orderFlowScore || 0,
        smartMoneyScore: meta.smartMoneyScore || 0,
        
        regimeState: meta.regime || "UNKNOWN",
        
        finalDecision: decision.decision,
        riskApproved: decision.riskApproved,
        positionSize: decision.positionSize,

        entryPrice: meta.indicators?.close || 0,
        
        meta
      });
    } catch (err: any) {
      console.error(`[attribution] Failed to record: ${err.message}`);
    }
  }

  /**
   * Generates a daily attribution report tracing signal drivers.
   */
  public static async generateDailyReport(dayNumber: number): Promise<string> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const attributions = await AqeaDecisionAttribution.find({
      timestamp: { $gte: startOfDay }
    }).sort({ timestamp: -1 }).lean();

    if (attributions.length === 0) return "";

    const reportPath = path.join((process.env.PROJECT_ROOT || path.resolve(__dirname, "../../../")), `AQEA_ATTRIBUTION_DAY_${dayNumber}.md`);
    
    let content = `# AQEA Decision Attribution — Day ${dayNumber}\n\n`;
    content += `**Timestamp:** ${new Date().toISOString()}\n`;
    content += `**Total Signals Audited:** ${attributions.length}\n\n`;
    
    content += `## Traceability Matrix\n`;
    content += `| Time | Symbol | Decision | CNN | Transf | PPO | Mamba | OF | SM | Regime | Risk |\n`;
    content += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    
    attributions.slice(0, 50).forEach(a => {
      const time = a.timestamp.toISOString().split("T")[1].split(".")[0];
      content += `| ${time} | ${a.symbol} | **${a.finalDecision}** | ${a.cnnPrediction} | ${a.transformerPrediction} | ${a.ppoPrediction} | ${a.mambaPrediction} | ${a.orderFlowScore} | ${a.smartMoneyScore} | ${a.regimeState} | ${a.riskApproved ? "✅" : "❌"} |\n`;
    });

    if (attributions.length > 50) {
      content += `\n*... and ${attributions.length - 50} more signals.*`;
    }

    fs.writeFileSync(reportPath, content);
    return reportPath;
  }
}
