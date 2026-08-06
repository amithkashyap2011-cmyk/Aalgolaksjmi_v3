/*
 * ─── Institutional Meta-Ensemble Engine ───────────────────────
 *
 * Inputs:
 * - Every AI model prediction + confidence
 * - Model Health Score + ModelState (ACTIVE, REDUCED_WEIGHT, STANDBY, etc.)
 * - Market Context (Regime, Volatility, Liquidity, Order Flow)
 *
 * Outputs:
 * - Dynamic Voting Weights (STANDBY models get 0 weight in live consensus)
 * - Expected Edge (in R)
 * - Final Consensus Signal ("BUY", "SELL", "HOLD")
 * - Trade Quality Score (0–100)
 */

import { ModelRegistry, ModelState } from "../../models/ModelRegistry.js";

export interface ModelPredictionInput {
  modelName: string;
  prediction: "BUY" | "SELL" | "HOLD";
  confidence: number; // 0 - 100
  healthScore?: number;
  currentState?: ModelState;
}

export interface MarketContextInput {
  symbol: string;
  regime: string;
  volatility: number;
  orderFlowImbalance: number;
}

export interface MetaConsensusResult {
  finalConsensus: "BUY" | "SELL" | "HOLD";
  confidence: number;
  expectedEdgeR: number;
  tradeQualityScore: number;
  weights: Record<string, number>;
  activeCount: number;
  standbyCount: number;
}

export class MetaEnsembleEngine {
  /**
   * Computes Meta-Ensemble consensus dynamically.
   */
  public static async evaluateMetaConsensus(
    predictions: ModelPredictionInput[],
    context: MarketContextInput
  ): Promise<MetaConsensusResult> {
    const registry = await ModelRegistry.find().lean();
    const registryMap = new Map<string, any>();
    registry.forEach((r) => registryMap.set(r.modelName, r));

    let buyWeight = 0;
    let sellWeight = 0;
    let holdWeight = 0;
    let totalWeight = 0;

    const weights: Record<string, number> = {};
    let activeCount = 0;
    let standbyCount = 0;

    for (const pred of predictions) {
      const reg = registryMap.get(pred.modelName);
      const state: ModelState = pred.currentState || reg?.currentState || "ACTIVE";
      const health = pred.healthScore || 75;

      let effectiveWeight = 0;

      // STANDBY and RETRAINING models get 0 weight in live decision
      if (state === "STANDBY" || state === "RETRAINING") {
        effectiveWeight = 0;
        standbyCount++;
      } else if (state === "REDUCED_WEIGHT") {
        effectiveWeight = 0.05 * (health / 100);
        activeCount++;
      } else if (state === "RECOVERY") {
        effectiveWeight = 0.08 * (health / 100);
        activeCount++;
      } else {
        // ACTIVE
        effectiveWeight = 0.15 * (health / 100);
        activeCount++;
      }

      weights[pred.modelName] = +effectiveWeight.toFixed(4);
      totalWeight += effectiveWeight;

      const weightedScore = effectiveWeight * (pred.confidence / 100);

      if (pred.prediction === "BUY") buyWeight += weightedScore;
      else if (pred.prediction === "SELL") sellWeight += weightedScore;
      else holdWeight += weightedScore;
    }

    // Determine Final Consensus
    let finalConsensus: "BUY" | "SELL" | "HOLD" = "HOLD";
    let maxWeight = holdWeight;

    if (buyWeight > maxWeight && buyWeight > sellWeight) {
      finalConsensus = "BUY";
      maxWeight = buyWeight;
    } else if (sellWeight > maxWeight && sellWeight > buyWeight) {
      finalConsensus = "SELL";
      maxWeight = sellWeight;
    }

    const confidence = totalWeight > 0 ? +((maxWeight / totalWeight) * 100).toFixed(1) : 50;
    const expectedEdgeR = +(0.5 + (confidence - 50) * 0.02).toFixed(2);
    const tradeQualityScore = Math.min(100, Math.round(confidence * 0.9 + activeCount * 1.0));

    return {
      finalConsensus,
      confidence,
      expectedEdgeR,
      tradeQualityScore,
      weights,
      activeCount,
      standbyCount,
    };
  }
}
