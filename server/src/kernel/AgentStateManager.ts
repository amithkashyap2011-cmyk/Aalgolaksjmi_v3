/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — STATE MANAGER
 * ═══════════════════════════════════════════════════════════════════
 * Central state store with deterministic state transitions.
 */

import { ControlMode, IGoal, IKernelDecision, ITradeExecutionPlan } from "./types.js";
import { AgentEventBus } from "./AgentEventBus.js";

export interface IKernelSystemState {
  controlMode: ControlMode;
  isEmergencyStopped: boolean;
  emergencyStopReason?: string;
  uptimeSeconds: number;
  bootTimestamp: number;
  totalGoalsCreated: number;
  totalGoalsCompleted: number;
  totalDecisionsCreated: number;
  totalExecutionsAttempted: number;
  totalExecutionsSuccessful: number;
  activeGoals: Record<string, IGoal>;
  latestDecisions: Record<string, IKernelDecision>; // per symbol
  activeExecutionPlans: Record<string, ITradeExecutionPlan>;
  circuitBreakers: Record<string, { state: "CLOSED" | "OPEN" | "HALF_OPEN"; failures: number; lastTripMs: number }>;
}

export class AgentStateManager {
  private static instance: AgentStateManager;
  private state: IKernelSystemState;
  private bootTime = Date.now();

  private constructor() {
    this.state = {
      controlMode: "AI_AUTONOMOUS",
      isEmergencyStopped: false,
      uptimeSeconds: 0,
      bootTimestamp: this.bootTime,
      totalGoalsCreated: 0,
      totalGoalsCompleted: 0,
      totalDecisionsCreated: 0,
      totalExecutionsAttempted: 0,
      totalExecutionsSuccessful: 0,
      activeGoals: {},
      latestDecisions: {},
      activeExecutionPlans: {},
      circuitBreakers: {},
    };
  }

  public static getInstance(): AgentStateManager {
    if (!AgentStateManager.instance) {
      AgentStateManager.instance = new AgentStateManager();
    }
    return AgentStateManager.instance;
  }

  public getSnapshot(): Readonly<IKernelSystemState> {
    return {
      ...this.state,
      uptimeSeconds: Math.floor((Date.now() - this.bootTime) / 1000),
    };
  }

  public getControlMode(): ControlMode {
    if (this.state.isEmergencyStopped) return "SAFE";
    return this.state.controlMode;
  }

  public setControlMode(mode: ControlMode, reason: string = "User update"): void {
    const previous = this.state.controlMode;
    this.state.controlMode = mode;
    
    AgentEventBus.getInstance().publish(
      "CONTROL_MODE_CHANGED",
      { previous, current: mode, reason },
      { source: "AgentStateManager" }
    );
  }

  public triggerEmergencyStop(reason: string): void {
    this.state.isEmergencyStopped = true;
    this.state.emergencyStopReason = reason;
    this.state.controlMode = "SAFE";

    AgentEventBus.getInstance().publish(
      "EMERGENCY_STOP_TRIGGERED",
      { reason, timestamp: Date.now() },
      { source: "AgentStateManager" }
    );
  }

  public clearEmergencyStop(operator: string = "admin"): void {
    this.state.isEmergencyStopped = false;
    this.state.emergencyStopReason = undefined;
    this.state.controlMode = "MANUAL"; // Default back to MANUAL for safety

    AgentEventBus.getInstance().publish(
      "CONTROL_MODE_CHANGED",
      { previous: "SAFE", current: "MANUAL", reason: `Emergency stop cleared by ${operator}` },
      { source: "AgentStateManager" }
    );
  }

  public registerActiveGoal(goal: IGoal): void {
    this.state.activeGoals[goal.goalId] = goal;
    this.state.totalGoalsCreated++;
  }

  public removeActiveGoal(goalId: string, success: boolean = true): void {
    if (this.state.activeGoals[goalId]) {
      delete this.state.activeGoals[goalId];
      if (success) this.state.totalGoalsCompleted++;
    }
  }

  public recordDecision(decision: IKernelDecision): void {
    this.state.latestDecisions[decision.symbol] = decision;
    this.state.totalDecisionsCreated++;
  }

  public recordExecution(plan: ITradeExecutionPlan, success: boolean): void {
    this.state.activeExecutionPlans[plan.executionId] = plan;
    this.state.totalExecutionsAttempted++;
    if (success) this.state.totalExecutionsSuccessful++;
  }

  public updateCircuitBreaker(
    serviceKey: string,
    state: "CLOSED" | "OPEN" | "HALF_OPEN",
    failures: number = 0
  ): void {
    this.state.circuitBreakers[serviceKey] = {
      state,
      failures,
      lastTripMs: state === "OPEN" ? Date.now() : (this.state.circuitBreakers[serviceKey]?.lastTripMs || 0),
    };
  }

  public getCircuitBreaker(serviceKey: string): { state: "CLOSED" | "OPEN" | "HALF_OPEN"; failures: number; lastTripMs: number } {
    return this.state.circuitBreakers[serviceKey] || { state: "CLOSED", failures: 0, lastTripMs: 0 };
  }
}
