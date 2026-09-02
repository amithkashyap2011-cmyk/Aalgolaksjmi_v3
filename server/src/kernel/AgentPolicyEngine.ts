/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — POLICY ENGINE
 * ═══════════════════════════════════════════════════════════════════
 * Immutable safety rules, risk gates, and permission policies.
 */

import { ControlMode, IKernelDecision, ITradeExecutionPlan } from "./types.js";
import { AgentStateManager } from "./AgentStateManager.js";

export interface IPolicyEvaluationResult {
  allowed: boolean;
  violations: string[];
  requiresConfirmation?: boolean;
}

export class AgentPolicyEngine {
  private static instance: AgentPolicyEngine;

  // Hard global constraints
  private readonly MAX_LEVERAGE = 20;
  private readonly MAX_POSITION_FRACTION = 0.25; // max 25% of wallet in single position
  private readonly MAX_DRAWDOWN_LIMIT_PCT = 15.0; // 15% system circuit breaker

  private constructor() {}

  public static getInstance(): AgentPolicyEngine {
    if (!AgentPolicyEngine.instance) {
      AgentPolicyEngine.instance = new AgentPolicyEngine();
    }
    return AgentPolicyEngine.instance;
  }

  public validateDecision(decision: IKernelDecision): IPolicyEvaluationResult {
    const violations: string[] = [];
    const state = AgentStateManager.getInstance().getSnapshot();

    // 1. Control Mode check
    if (state.isEmergencyStopped) {
      violations.push(`EMERGENCY_STOP_ACTIVE: Decision rejected due to emergency stop.`);
    }

    if (state.controlMode === "SAFE" && decision.action !== "HOLD") {
      violations.push(`SAFE_MODE_RESTRICTION: Active trade decisions forbidden in SAFE mode.`);
    }

    // 2. Risk check
    if (!decision.riskEvaluation.approved && decision.direction !== "HOLD") {
      violations.push(`RISK_GATE_REJECTED: ${decision.riskEvaluation.blockingGate || "Risk limits exceeded"}`);
    }

    // 3. Leverage ceiling
    if (decision.riskEvaluation.leverage > this.MAX_LEVERAGE) {
      violations.push(`LEVERAGE_VIOLATION: Requested ${decision.riskEvaluation.leverage}x exceeds hard cap of ${this.MAX_LEVERAGE}x.`);
    }

    // 4. Drawdown check
    if (decision.riskEvaluation.currentDrawdown > this.MAX_DRAWDOWN_LIMIT_PCT) {
      violations.push(`DRAWDOWN_BREACH: Current drawdown ${decision.riskEvaluation.currentDrawdown}% exceeds limit ${this.MAX_DRAWDOWN_LIMIT_PCT}%.`);
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  public validateExecution(plan: ITradeExecutionPlan, availableBalance: number): IPolicyEvaluationResult {
    const violations: string[] = [];
    const state = AgentStateManager.getInstance().getSnapshot();

    if (state.isEmergencyStopped) {
      return { allowed: false, violations: ["EMERGENCY_STOP_ACTIVE: Execution strictly prohibited."] };
    }

    if (state.controlMode === "SAFE") {
      return { allowed: false, violations: ["SAFE_MODE_ACTIVE: Autonomous execution blocked in SAFE mode."] };
    }

    if (state.controlMode === "MANUAL" && plan.executionMode === "LIVE") {
      return {
        allowed: false,
        violations: ["MANUAL_MODE_ACTIVE: Live trade execution requires manual human approval."],
        requiresConfirmation: true,
      };
    }

    // Mathematical sanity checks
    if (!plan.quantity || plan.quantity <= 0) {
      violations.push(`INVALID_QUANTITY: Quantity must be greater than 0.`);
    }

    if (!plan.entryPrice || plan.entryPrice <= 0) {
      violations.push(`INVALID_ENTRY_PRICE: Entry price must be strictly positive.`);
    }

    if (plan.leverage > this.MAX_LEVERAGE) {
      violations.push(`LEVERAGE_VIOLATION: Requested ${plan.leverage}x exceeds hard cap of ${this.MAX_LEVERAGE}x.`);
    }

    const notional = plan.quantity * plan.entryPrice;
    const requiredMargin = notional / Math.max(1, plan.leverage);

    if (requiredMargin > availableBalance) {
      violations.push(
        `INSUFFICIENT_FUNDS: Required margin $${requiredMargin.toFixed(2)} exceeds available balance $${availableBalance.toFixed(2)}.`
      );
    }

    if (requiredMargin > availableBalance * this.MAX_POSITION_FRACTION) {
      violations.push(
        `POSITION_SIZE_CAP_EXCEEDED: Position margin ($${requiredMargin.toFixed(2)}) exceeds ${(this.MAX_POSITION_FRACTION * 100)}% of total balance.`
      );
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }
}
