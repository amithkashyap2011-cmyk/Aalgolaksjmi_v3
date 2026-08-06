/*
 * ─── Execution Quality Score Engine ──────────────────────────
 *
 * Computes institutional Execution Quality Score (EQS):
 * EQS = 0.12*Latency + 0.18*Slippage + 0.30*FillQuality + 0.15*OrderDelay + 0.25*Spread
 */

import { ExecutionQualityLog } from "../../models/ExecutionQualityLog.js";

export interface EQSBreakdown {
  latencyScore: number;     // 12% weight
  slippageScore: number;    // 18% weight
  fillQualityScore: number; // 30% weight
  orderDelayScore: number;  // 15% weight
  spreadScore: number;      // 25% weight
  overallQualityScore: number;
}

export class ExecutionQualityService {
  public static calculateEQS(
    latencyMs: number,
    slippagePct: number,
    fillRatio: number, // 0 to 1
    spreadPct: number
  ): EQSBreakdown {
    const latencyScore = Math.max(50, Math.min(100, 100 - (latencyMs - 20) * 0.8));
    const slippageScore = Math.max(50, Math.min(100, 100 - (slippagePct * 500)));
    const fillQualityScore = Math.max(50, Math.min(100, fillRatio * 100));
    const orderDelayScore = Math.max(50, Math.min(100, 100 - (latencyMs * 0.3)));
    const spreadScore = Math.max(50, Math.min(100, 100 - (spreadPct * 1000)));

    const overallQualityScore = +(
      (0.12 * latencyScore) +
      (0.18 * slippageScore) +
      (0.30 * fillQualityScore) +
      (0.15 * orderDelayScore) +
      (0.25 * spreadScore)
    ).toFixed(2);

    return {
      latencyScore: +latencyScore.toFixed(1),
      slippageScore: +slippageScore.toFixed(1),
      fillQualityScore: +fillQualityScore.toFixed(1),
      orderDelayScore: +orderDelayScore.toFixed(1),
      spreadScore: +spreadScore.toFixed(1),
      overallQualityScore,
    };
  }

  public static async logEQS(symbol: string, eqs: EQSBreakdown): Promise<void> {
    await ExecutionQualityLog.create({
      symbol,
      ...eqs,
      timestamp: new Date(),
    });
  }
}
