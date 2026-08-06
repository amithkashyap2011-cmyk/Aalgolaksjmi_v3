/*
 * ─── Dynamic Model Lifecycle Manager ─────────────────────────
 *
 * Enforces automatic state transition rules statistically:
 * ACTIVE ↔ REDUCED_WEIGHT ↔ STANDBY ↔ RETRAINING ↔ RECOVERY
 *
 * Models in STANDBY are never permanently deleted; they continue
 * generating shadow predictions and automatically recover when
 * Rolling PF > 1.3 and Health > 70 for 200 shadow trades.
 */

import { ModelRegistry, ModelState } from "../../models/ModelRegistry.js";
import { ModelLifecycleLog } from "../../models/ModelLifecycleLog.js";

export interface LifecycleEvaluationInput {
  modelName: string;
  currentState: ModelState;
  healthScore: number;
  rollingProfitFactor: number;
  rollingSharpe: number;
  rollingShadowTrades: number;
  conceptDriftScore: number;
}

export class LifecycleManager {
  /**
   * Evaluates state transition rules for a model.
   */
  public static evaluateTransition(input: LifecycleEvaluationInput): {
    nextState: ModelState;
    transitioned: boolean;
    reason: string;
  } {
    let nextState = input.currentState;
    let transitioned = false;
    let reason = "NO_CHANGE";

    // Rule 1: Move to RETRAINING if severe drift detected
    if (input.conceptDriftScore > 0.25 && input.currentState !== "RETRAINING") {
      nextState = "RETRAINING";
      transitioned = true;
      reason = "CONCEPT_DRIFT_EXCEEDS_0.25";
    }
    // Rule 2: Move to STANDBY if rolling PF < 1.0, Sharpe < 0.5, and Health < 40
    else if (
      input.rollingProfitFactor < 1.0 &&
      input.rollingSharpe < 0.5 &&
      input.healthScore < 40 &&
      input.currentState !== "STANDBY"
    ) {
      nextState = "STANDBY";
      transitioned = true;
      reason = "STATISTICAL_UNDERPERFORMANCE_PF_BELOW_1.0";
    }
    // Rule 3: Move to RECOVERY from STANDBY if rolling PF > 1.3 and Health > 70 for 200 shadow trades
    else if (
      input.currentState === "STANDBY" &&
      input.rollingProfitFactor > 1.3 &&
      input.healthScore > 70 &&
      input.rollingShadowTrades >= 200
    ) {
      nextState = "RECOVERY";
      transitioned = true;
      reason = "SHADOW_RECOVERY_CRITERIA_MET";
    }
    // Rule 4: Move to ACTIVE from RECOVERY or REDUCED_WEIGHT if Health >= 75
    else if (
      (input.currentState === "RECOVERY" || input.currentState === "REDUCED_WEIGHT") &&
      input.healthScore >= 75
    ) {
      nextState = "ACTIVE";
      transitioned = true;
      reason = "HEALTH_RECOVERED_ABOVE_75";
    }
    // Rule 5: Reduce Weight if Health drops between 40 and 70
    else if (input.healthScore < 70 && input.healthScore >= 40 && input.currentState === "ACTIVE") {
      nextState = "REDUCED_WEIGHT";
      transitioned = true;
      reason = "HEALTH_MODERATE_DEGRADE_REDUCE_WEIGHT";
    }

    return { nextState, transitioned, reason };
  }

  public static async executeTransition(input: LifecycleEvaluationInput): Promise<any> {
    const res = this.evaluateTransition(input);
    if (res.transitioned) {
      await ModelRegistry.updateOne(
        { modelName: input.modelName },
        { $set: { currentState: res.nextState, updatedAt: new Date() } }
      );

      await ModelLifecycleLog.create({
        modelName: input.modelName,
        fromState: input.currentState,
        toState: res.nextState,
        reason: res.reason,
        healthScoreAtTransition: input.healthScore,
        rollingProfitFactor: input.rollingProfitFactor,
        rollingSharpe: input.rollingSharpe,
        timestamp: new Date(),
      });
    }
    return res;
  }
}
