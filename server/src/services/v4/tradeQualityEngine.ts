/*
 * ─── Trade Quality Engine ────────────────────────────────────
 *
 * Computes Trade Quality Score (TQS) (0–100):
 * TQS = 0.20*Consensus + 0.15*Cal + 0.15*Regime + 0.15*OrderFlow + 0.15*Vol + 0.10*Liq + 0.10*Corr
 *
 * Action Rules:
 * TQS >= 95       → FULL_SIZE
 * 85 <= TQS < 95  → NORMAL
 * 70 <= TQS < 85  → HALF_POSITION
 * 50 <= TQS < 70  → WATCH
 * TQS < 50        → REJECT
 */

import { TradeQualityLog } from "../../models/TradeQualityLog.js";

export interface TradeQualityInput {
  symbol: string;
  consensusStrength: number;
  confidenceCalibration: number;
  historicalSimilarity: number;
  marketRegime: string;
  orderFlowScore: number;
  volatilityScore: number;
  liquidityScore: number;
  correlationScore: number;
}

export interface TradeQualityResult {
  tradeQualityScore: number;
  action: "FULL_SIZE" | "NORMAL" | "HALF_POSITION" | "WATCH" | "REJECT";
  sizingMultiplier: number;
  allowedToExecute: boolean;
}

export class TradeQualityEngine {
  public static calculateQuality(input: TradeQualityInput): TradeQualityResult {
    const tqs = +(
      (0.20 * input.consensusStrength) +
      (0.15 * input.confidenceCalibration) +
      (0.15 * (input.marketRegime.includes("BULL") || input.marketRegime.includes("BREAKOUT") ? 90 : 60)) +
      (0.15 * input.orderFlowScore) +
      (0.15 * input.volatilityScore) +
      (0.10 * input.liquidityScore) +
      (0.10 * input.correlationScore)
    ).toFixed(1);

    let action: "FULL_SIZE" | "NORMAL" | "HALF_POSITION" | "WATCH" | "REJECT" = "REJECT";
    let sizingMultiplier = 0;
    let allowedToExecute = false;

    if (tqs >= 95) {
      action = "FULL_SIZE";
      sizingMultiplier = 1.0;
      allowedToExecute = true;
    } else if (tqs >= 85) {
      action = "NORMAL";
      sizingMultiplier = 0.75;
      allowedToExecute = true;
    } else if (tqs >= 70) {
      action = "HALF_POSITION";
      sizingMultiplier = 0.50;
      allowedToExecute = true;
    } else if (tqs >= 50) {
      action = "WATCH";
      sizingMultiplier = 0;
      allowedToExecute = false;
    } else {
      action = "REJECT";
      sizingMultiplier = 0;
      allowedToExecute = false;
    }

    return { tradeQualityScore: tqs, action, sizingMultiplier, allowedToExecute };
  }

  public static async logQuality(input: TradeQualityInput, res: TradeQualityResult): Promise<void> {
    await TradeQualityLog.create({
      symbol: input.symbol,
      consensusStrength: input.consensusStrength,
      confidenceCalibration: input.confidenceCalibration,
      historicalSimilarity: input.historicalSimilarity,
      marketRegime: input.marketRegime,
      orderFlowScore: input.orderFlowScore,
      volatilityScore: input.volatilityScore,
      liquidityScore: input.liquidityScore,
      tradeQualityScore: res.tradeQualityScore,
      action: res.action,
      createdAt: new Date(),
    });
  }
}
