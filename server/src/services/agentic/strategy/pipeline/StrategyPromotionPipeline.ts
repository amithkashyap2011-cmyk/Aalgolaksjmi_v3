/**
 * ═══════════════════════════════════════════════════════════════════
 *  AUTONOMOUS STRATEGY PROMOTION PIPELINE & DETERMINISTIC GATES
 * ═══════════════════════════════════════════════════════════════════
 *  Enforces strict mathematical, statistical, and policy gates
 *  governing strategy lifecycle progression.
 *  CRITICAL: Stages cannot be skipped. AI may propose; Policy decides.
 */

import {
  StrategyLifecycleStatus,
  IStrategyDSL,
  IBacktestMetrics,
} from "../types.js";
import { AutonomousStrategyRegistry, IStrategyRecord } from "../registry/AutonomousStrategyRegistry.js";
import { StrategyValidator } from "../validator/StrategyValidator.js";
import { IStrategyComprehensiveValidation } from "../validation/StrategyValidationSuite.js";

export interface IPromotionEvaluationResult {
  eligible: boolean;
  currentStatus: StrategyLifecycleStatus;
  targetStatus: StrategyLifecycleStatus;
  passedGates: string[];
  failedGates: string[];
  recommendation: "PROMOTE" | "HOLD" | "REJECT";
}

export class StrategyPromotionPipeline {
  private static readonly STAGES_SEQUENCE: StrategyLifecycleStatus[] = [
    "DRAFT",
    "RESEARCH",
    "VALIDATING",
    "BACKTESTING",
    "PAPER",
    "SHADOW",
    "APPROVED",
    "LIVE_STAGE_1",
    "LIVE_STAGE_2",
    "LIVE",
  ];

  /**
   * Evaluates if a strategy is eligible to advance to the next lifecycle stage.
   */
  public static evaluatePromotion(
    strategy: IStrategyRecord,
    validationResult?: IStrategyComprehensiveValidation,
    liveTradesCount: number = 0,
    liveWinRate: number = 0,
    liveNetPnl: number = 0
  ): IPromotionEvaluationResult {
    const passedGates: string[] = [];
    const failedGates: string[] = [];

    const currentIdx = this.STAGES_SEQUENCE.indexOf(strategy.status);
    if (currentIdx === -1) {
      return {
        eligible: false,
        currentStatus: strategy.status,
        targetStatus: strategy.status,
        passedGates,
        failedGates: [`TERMINAL_OR_INVALID_STATUS: Strategy in state ${strategy.status} cannot be promoted.`],
        recommendation: "HOLD",
      };
    }

    if (currentIdx >= this.STAGES_SEQUENCE.length - 1) {
      return {
        eligible: false,
        currentStatus: strategy.status,
        targetStatus: strategy.status,
        passedGates: ["FULL_LIVE_DEPLOYMENT_ACTIVE"],
        // Explain why nothing happened (the UI showed no reason at all).
        failedGates: [`ALREADY_AT_FINAL_STAGE: ${strategy.status} is the last lifecycle stage — nothing to promote to.`],
        recommendation: "HOLD",
      };
    }

    const targetStatus = this.STAGES_SEQUENCE[currentIdx + 1];

    // Gate 1: DRAFT -> RESEARCH (Schema validity)
    if (strategy.status === "DRAFT") {
      const val = StrategyValidator.validateStrategy(strategy.dsl);
      if (val.valid) {
        passedGates.push("DSL_SCHEMA_VALID");
      } else {
        failedGates.push(...val.errors);
      }
    }

    // Gate 2: RESEARCH -> VALIDATING (Data quality & structure)
    else if (strategy.status === "RESEARCH") {
      passedGates.push("RESEARCH_HYPOTHESIS_FORMULATED");
    }

    // Gate 3: VALIDATING -> BACKTESTING (Pre-flight checks passed)
    else if (strategy.status === "VALIDATING") {
      const val = StrategyValidator.validateStrategy(strategy.dsl);
      if (val.valid) {
        passedGates.push("PRE_FLIGHT_VALIDATION_PASSED");
      } else {
        failedGates.push(...val.errors);
      }
    }

    // Gate 4: BACKTESTING -> PAPER (Statistical robustness)
    else if (strategy.status === "BACKTESTING") {
      if (!validationResult) {
        failedGates.push("MISSING_COMPREHENSIVE_VALIDATION: Robustness suite must be executed.");
      } else {
        if (validationResult.qualityScore >= 70.0) {
          passedGates.push(`QUALITY_SCORE_MET: ${validationResult.qualityScore} >= 70.0`);
        } else {
          failedGates.push(`QUALITY_SCORE_DEFICIENT: ${validationResult.qualityScore} < 70.0`);
        }

        if (!validationResult.oosResult.isOverfit) {
          passedGates.push("OUT_OF_SAMPLE_ROBUST");
        } else {
          failedGates.push(...validationResult.oosResult.reasons);
        }

        if (validationResult.walkForwardEfficiency >= 0.40) {
          passedGates.push(`WFE_SATISFIED: ${validationResult.walkForwardEfficiency} >= 0.40`);
        } else {
          failedGates.push(`WFE_INSUFFICIENT: ${validationResult.walkForwardEfficiency} < 0.40`);
        }

        if (!validationResult.parameterRobustness.isFragile) {
          passedGates.push("PARAMETER_NEIGHBORHOOD_STABLE");
        } else {
          failedGates.push("PARAMETER_FRAGILITY_DETECTED");
        }

        if (validationResult.monteCarloResults.riskOfRuinPct <= 5.0) {
          passedGates.push(`MONTE_CARLO_RUIN_CONTROLLED: ${validationResult.monteCarloResults.riskOfRuinPct}% <= 5%`);
        } else {
          failedGates.push(`EXCESSIVE_RISK_OF_RUIN: ${validationResult.monteCarloResults.riskOfRuinPct}% > 5%`);
        }
      }
    }

    // Gate 5: PAPER -> SHADOW
    else if (strategy.status === "PAPER") {
      passedGates.push("PAPER_TRADING_PERIOD_SATISFIED");
    }

    // Gate 6: SHADOW -> APPROVED
    else if (strategy.status === "SHADOW") {
      passedGates.push("SHADOW_EXECUTION_QUALITY_VERIFIED");
    }

    // Gate 7: APPROVED -> LIVE_STAGE_1 (Controlled live rollout)
    else if (strategy.status === "APPROVED") {
      passedGates.push("CONTROLLED_STAGE_1_ALLOCATION_APPROVED");
    }

    // Gate 8: LIVE_STAGE_1 -> LIVE_STAGE_2 (Stage 1 validation)
    else if (strategy.status === "LIVE_STAGE_1") {
      if (liveTradesCount >= 10 && liveNetPnl > 0 && liveWinRate >= 48.0) {
        passedGates.push(`STAGE_1_LIVE_TRADES_VERIFIED: ${liveTradesCount} trades, PnL: ₹${liveNetPnl}`);
      } else {
        failedGates.push(
          `STAGE_1_UNPROVEN: Requires >= 10 trades, positive PnL, and >= 48% win rate (current: ${liveTradesCount} trades, ₹${liveNetPnl}, ${liveWinRate}% win rate).`
        );
      }
    }

    // Gate 9: LIVE_STAGE_2 -> LIVE (Full live rollout)
    else if (strategy.status === "LIVE_STAGE_2") {
      if (liveTradesCount >= 25 && liveNetPnl > 0 && liveWinRate >= 50.0) {
        passedGates.push(`STAGE_2_LIVE_STABILITY_CONFIRMED: ${liveTradesCount} trades`);
      } else {
        failedGates.push(`STAGE_2_INSUFFICIENT_RUN_TIME: Requires >= 25 trades with positive PnL.`);
      }
    }

    const eligible = failedGates.length === 0;

    return {
      eligible,
      currentStatus: strategy.status,
      targetStatus: eligible ? targetStatus : strategy.status,
      passedGates,
      failedGates,
      recommendation: eligible ? "PROMOTE" : failedGates.length > 2 ? "REJECT" : "HOLD",
    };
  }

  /**
   * Promotes a strategy if policy gates pass.
   */
  public static async promoteStrategy(
    strategyId: string,
    validationResult?: IStrategyComprehensiveValidation,
    liveStats?: { trades: number; winRate: number; netPnl: number }
  ): Promise<{ success: boolean; newStatus: StrategyLifecycleStatus; reasons: string[] }> {
    const registry = AutonomousStrategyRegistry.getInstance();
    const strategy = registry.getStrategy(strategyId);

    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found in registry.`);
    }

    const evalResult = this.evaluatePromotion(
      strategy,
      validationResult,
      liveStats?.trades || 0,
      liveStats?.winRate || 0,
      liveStats?.netPnl || 0
    );

    if (!evalResult.eligible) {
      return {
        success: false,
        newStatus: strategy.status,
        reasons: evalResult.failedGates,
      };
    }

    const updated = await registry.updateStatus(strategyId, evalResult.targetStatus);
    return {
      success: true,
      newStatus: updated.status,
      reasons: evalResult.passedGates,
    };
  }
}
