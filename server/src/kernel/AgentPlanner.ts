/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — PLANNER
 * ═══════════════════════════════════════════════════════════════════
 * Fast Path vs Reasoning Path planner converting goals into structured execution plans.
 */

import crypto from "node:crypto";
import { IGoal, IExecutionPlan, IPlanStep, PlanExecutionPath } from "./types.js";

export class AgentPlanner {
  private static instance: AgentPlanner;

  private constructor() {}

  public static getInstance(): AgentPlanner {
    if (!AgentPlanner.instance) {
      AgentPlanner.instance = new AgentPlanner();
    }
    return AgentPlanner.instance;
  }

  public createPlan(goal: IGoal): IExecutionPlan {
    const now = Date.now();
    const planId = `PLAN_${now}_${crypto.randomBytes(3).toString("hex")}`;
    const path: PlanExecutionPath = this.determinePath(goal);

    if (goal.type === "EVALUATE_SYMBOL") {
      return this.buildSymbolEvaluationPlan(planId, goal, path);
    } else if (goal.type === "EXECUTE_TRADE") {
      return this.buildTradeExecutionPlan(planId, goal, path);
    } else if (goal.type === "RECOVER_SERVICE") {
      return this.buildRecoveryPlan(planId, goal);
    } else if (goal.type === "SYSTEM_DIAGNOSTIC") {
      return this.buildDiagnosticPlan(planId, goal);
    }

    // Default generic fast plan
    return {
      planId,
      goalId: goal.goalId,
      correlationId: goal.correlationId,
      symbol: goal.symbol,
      path,
      createdAt: now,
      deadline: goal.deadline,
      steps: [
        {
          stepId: `STEP_1_${planId}`,
          order: 1,
          name: "Execute Generic Task",
          agentId: "PerformanceMonitorAgent",
          toolId: "system.health",
          input: goal.context,
          deadline: goal.deadline,
          status: "PENDING",
        },
      ],
      status: "CREATED",
    };
  }

  private determinePath(goal: IGoal): PlanExecutionPath {
    // If anomaly, extreme volatility, or model disagreement is flagged, route to REASONING_PATH
    if (
      goal.context?.isAnomaly ||
      goal.context?.modelDisagreement ||
      goal.type === "RECOVER_SERVICE" ||
      goal.type === "MODEL_DISAGREEMENT"
    ) {
      return "REASONING_PATH";
    }
    return "FAST_PATH";
  }

  private buildSymbolEvaluationPlan(planId: string, goal: IGoal, path: PlanExecutionPath): IExecutionPlan {
    const now = Date.now();
    const symbol = goal.symbol || "BTCUSDT";
    const totalBudgetMs = Math.min(goal.deadline - now, 15000); // 15s max budget

    const steps: IPlanStep[] = [
      {
        stepId: `STEP_1_MARKET_${planId}`,
        order: 1,
        name: "Observe Market Freshness & Ingest Bars",
        agentId: "MarketAgent",
        toolId: "market.getSnapshot",
        input: { symbol, ...goal.context },
        deadline: now + Math.min(2000, totalBudgetMs * 0.15),
        status: "PENDING",
      },
      {
        stepId: `STEP_2_FEATURES_${planId}`,
        order: 2,
        name: "Compute Canonical 15-Feature Pipeline",
        agentId: "FeatureAgent",
        toolId: "features.compute",
        input: { symbol, ...goal.context },
        deadline: now + Math.min(4000, totalBudgetMs * 0.3),
        status: "PENDING",
      },
      {
        stepId: `STEP_3_MODELS_${planId}`,
        order: 3,
        name: "Run Concurrent DL/RL Model Inference (CNN, LSTM, Trans, Mamba, PPO)",
        agentId: "ModelAgent",
        toolId: "model.predict",
        input: { symbol, ...goal.context },
        deadline: now + Math.min(7000, totalBudgetMs * 0.55),
        status: "PENDING",
      },
      {
        stepId: `STEP_4_DECISION_${planId}`,
        order: 4,
        name: "Synthesize Ensemble, Bayesian Evidence & NetEV",
        agentId: "DecisionAgent",
        toolId: "decision.evaluate",
        input: { symbol, ...goal.context },
        deadline: now + Math.min(9000, totalBudgetMs * 0.7),
        status: "PENDING",
      },
      {
        stepId: `STEP_5_RISK_${planId}`,
        order: 5,
        name: "Evaluate Hard Risk Limits & Position Sizing",
        agentId: "RiskAgent",
        toolId: "risk.evaluate",
        input: { symbol, ...goal.context },
        deadline: now + Math.min(11000, totalBudgetMs * 0.85),
        status: "PENDING",
      },
      {
        stepId: `STEP_6_VERIFY_${planId}`,
        order: 6,
        name: "Pre-Execution Verification & Control Mode Policy",
        agentId: "VerificationAgent",
        toolId: "execution.verifyPreTrade",
        input: { symbol, ...goal.context },
        deadline: now + totalBudgetMs,
        status: "PENDING",
      },
    ];

    return {
      planId,
      goalId: goal.goalId,
      correlationId: goal.correlationId,
      symbol,
      path,
      createdAt: now,
      deadline: now + totalBudgetMs,
      steps,
      status: "CREATED",
      reasoning: path === "FAST_PATH" ? "Deterministic fast-path evaluation" : "Anomaly reasoning pipeline",
    };
  }

  private buildTradeExecutionPlan(planId: string, goal: IGoal, path: PlanExecutionPath): IExecutionPlan {
    const now = Date.now();
    const symbol = goal.symbol || "BTCUSDT";

    const steps: IPlanStep[] = [
      {
        stepId: `STEP_1_EXEC_${planId}`,
        order: 1,
        name: "Submit Order via Authorized Execution Barrier",
        agentId: "ExecutionAgent",
        toolId: goal.context?.mode === "LIVE" ? "order.submitLive" : "order.submitPaper",
        input: goal.context,
        deadline: now + 3000,
        status: "PENDING",
      },
      {
        stepId: `STEP_2_FILL_VERIFY_${planId}`,
        order: 2,
        name: "Verify Fill, Wallet Ledger & Position Invariants",
        agentId: "VerificationAgent",
        toolId: "execution.verifyPostTrade",
        input: goal.context,
        deadline: now + 6000,
        status: "PENDING",
      },
      {
        stepId: `STEP_3_LEARN_${planId}`,
        order: 3,
        name: "Record Experience to Episodic Memory & Forward Store",
        agentId: "LearningAgent",
        toolId: "telemetry.recordOutcome",
        input: goal.context,
        deadline: now + 9000,
        status: "PENDING",
      },
    ];

    return {
      planId,
      goalId: goal.goalId,
      correlationId: goal.correlationId,
      symbol,
      path,
      createdAt: now,
      deadline: now + 10000,
      steps,
      status: "CREATED",
    };
  }

  private buildRecoveryPlan(planId: string, goal: IGoal): IExecutionPlan {
    const now = Date.now();
    return {
      planId,
      goalId: goal.goalId,
      correlationId: goal.correlationId,
      path: "REASONING_PATH",
      createdAt: now,
      deadline: now + 15000,
      steps: [
        {
          stepId: `STEP_1_RECOVER_${planId}`,
          order: 1,
          name: `Recover Service: ${goal.context?.serviceName || "quant_engine"}`,
          agentId: "PerformanceMonitorAgent",
          toolId: "system.restartService",
          input: goal.context,
          deadline: now + 8000,
          status: "PENDING",
        },
        {
          stepId: `STEP_2_VERIFY_RECOVER_${planId}`,
          order: 2,
          name: "Verify Model Health Post-Recovery",
          agentId: "ModelAgent",
          toolId: "model.health",
          input: goal.context,
          deadline: now + 14000,
          status: "PENDING",
        },
      ],
      status: "CREATED",
    };
  }

  private buildDiagnosticPlan(planId: string, goal: IGoal): IExecutionPlan {
    const now = Date.now();
    return {
      planId,
      goalId: goal.goalId,
      correlationId: goal.correlationId,
      path: "REASONING_PATH",
      createdAt: now,
      deadline: now + 10000,
      steps: [
        {
          stepId: `STEP_1_AUDIT_${planId}`,
          order: 1,
          name: "Audit System Health & Invariants",
          agentId: "PerformanceMonitorAgent",
          toolId: "system.health",
          input: goal.context,
          deadline: now + 8000,
          status: "PENDING",
        },
      ],
      status: "CREATED",
    };
  }
}
