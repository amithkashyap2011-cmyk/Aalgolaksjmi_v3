import { ResearchPromotionAudit } from "../../../models/ResearchPromotionAudit.js";
import { AlphaAttributionEngine } from "./alphaAttribution.js";
import { SignificanceAnalyzer } from "./significanceAnalyzer.js";
import { RedundancyMonitor } from "./redundancyMonitor.js";

export interface PromotionReport {
  modelName: string;
  eligible: boolean;
  reasons: string[];
  metrics: {
    uniqueAlpha: number;
    pfContribution: number;
    sharpeContribution: number;
    pValue: number;
    correlation: number;
    trades: number;
  };
}

export class ShadowValidationFramework {
  /**
   * The final promotion authority for any research model.
   * Ensures the model passes all institutional scientific validation gates.
   */
  public static async validateForPromotion(
    model: string, 
    predictions: any[], 
    baselineOutcomes: any[], 
    returns: number[],
    peerModels: string[],
    peerSeries: Record<string, number[]>
  ): Promise<PromotionReport> {
    
    const reasons: string[] = [];
    
    // Run Alpha Attribution
    const alpha = await AlphaAttributionEngine.evaluate(model, predictions, baselineOutcomes);
    
    // Run Significance Analysis
    const stats = await SignificanceAnalyzer.analyze(model, returns);
    
    // Run Redundancy Checks against peers
    let maxCorrelation = 0;
    for (const peer of peerModels) {
        const redundancy = await RedundancyMonitor.check(model, peer, returns, peerSeries[peer] || []);
        maxCorrelation = Math.max(maxCorrelation, redundancy.pearson, redundancy.spearman);
        if (redundancy.redundant) {
            reasons.push(`Redundant with ${peer} (corr: ${maxCorrelation.toFixed(2)})`);
        }
    }

    // Evaluate Promotion Rules
    const trades = predictions.length;
    let eligible = true;

    if (trades < 2000) {
        eligible = false;
        reasons.push(`Insufficient trades: ${trades} < 2000`);
    }
    if (alpha.uniqueAlphaRate < 0.10) {
        eligible = false;
        reasons.push(`Insufficient Unique Alpha: ${alpha.uniqueAlphaRate.toFixed(3)} < 0.10`);
    }
    if (alpha.profitFactorContribution < 0.05) {
        eligible = false;
        reasons.push(`Insufficient PF Contribution: ${alpha.profitFactorContribution.toFixed(3)} < 0.05`);
    }
    if (alpha.sharpeContribution < 0.05) {
        eligible = false;
        reasons.push(`Insufficient Sharpe Contribution: ${alpha.sharpeContribution.toFixed(3)} < 0.05`);
    }
    if (maxCorrelation > 0.85) {
        eligible = false;
        reasons.push(`Excessive Correlation: ${maxCorrelation.toFixed(3)} > 0.85`);
    }
    if (alpha.drawdownImpact > 0.01) { // 1%
        eligible = false;
        reasons.push(`Excessive Drawdown Impact: ${alpha.drawdownImpact.toFixed(3)} > 0.01`);
    }
    if (!stats.statisticallySignificant) {
        eligible = false;
        reasons.push(`Not statistically significant (p-value: ${stats.pValue.toFixed(3)} >= 0.05)`);
    }

    if (eligible) {
        reasons.push("All scientific validation gates passed. Eligible for voting review.");
    }

    const report: PromotionReport = {
      modelName: model,
      eligible,
      reasons,
      metrics: {
        uniqueAlpha: alpha.uniqueAlphaRate,
        pfContribution: alpha.profitFactorContribution,
        sharpeContribution: alpha.sharpeContribution,
        pValue: stats.pValue,
        correlation: maxCorrelation,
        trades
      }
    };

    await ResearchPromotionAudit.create(report);

    return report;
  }
}
