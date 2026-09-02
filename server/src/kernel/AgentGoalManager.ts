/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — GOAL MANAGER
 * ═══════════════════════════════════════════════════════════════════
 * Converts system events into prioritized goals with deduplication and timeout protection.
 */

import crypto from "node:crypto";
import { IGoal, PriorityClass, GoalStatus } from "./types.js";
import { AgentPriorityEngine } from "./AgentPriorityEngine.js";
import { AgentStateManager } from "./AgentStateManager.js";
import { AgentEventBus } from "./AgentEventBus.js";

export class AgentGoalManager {
  private static instance: AgentGoalManager;
  private queue: IGoal[] = [];
  private activeGoals = new Map<string, IGoal>();
  private maxQueueSize = 500;

  private constructor() {}

  public static getInstance(): AgentGoalManager {
    if (!AgentGoalManager.instance) {
      AgentGoalManager.instance = new AgentGoalManager();
    }
    return AgentGoalManager.instance;
  }

  public createGoal(params: {
    type: string;
    priority: PriorityClass;
    source: string;
    symbol?: string;
    context: Record<string, any>;
    ttlMs?: number;
    correlationId?: string;
  }): IGoal {
    const now = Date.now();
    const ttl = params.ttlMs || (params.priority === PriorityClass.P0_SAFETY ? 10000 : 30000);
    const correlationId = params.correlationId || `CORR_${now}_${crypto.randomBytes(3).toString("hex")}`;

    // Deduplication check: Do not duplicate identical evaluation goals for the same symbol within 2 seconds
    if (params.type === "EVALUATE_SYMBOL" && params.symbol) {
      const existing = this.queue.find(
        (g) => g.type === "EVALUATE_SYMBOL" && g.symbol === params.symbol && (now - g.createdAt < 2000)
      );
      if (existing) {
        return existing;
      }
    }

    const goal: IGoal = {
      goalId: `GOAL_${now}_${crypto.randomBytes(3).toString("hex")}`,
      type: params.type,
      priority: params.priority,
      source: params.source,
      createdAt: now,
      deadline: now + ttl,
      symbol: params.symbol,
      context: params.context,
      status: "PENDING",
      correlationId,
      retryCount: 0,
      maxRetries: params.priority <= PriorityClass.P1_EXECUTION ? 2 : 1,
    };

    this.enqueue(goal);
    AgentStateManager.getInstance().registerActiveGoal(goal);
    return goal;
  }

  public enqueue(goal: IGoal): void {
    // Drop expired goals from queue
    this.cleanExpired();

    if (this.queue.length >= this.maxQueueSize) {
      // Drop lowest priority item
      this.queue.pop();
    }

    this.queue.push(goal);
    this.queue.sort(AgentPriorityEngine.compare);
  }

  public getNextGoal(): IGoal | undefined {
    this.cleanExpired();
    const next = this.queue.shift();
    if (next) {
      next.status = "IN_PROGRESS";
      this.activeGoals.set(next.goalId, next);
    }
    return next;
  }

  public completeGoal(goalId: string, result?: any): void {
    const goal = this.activeGoals.get(goalId);
    if (goal) {
      goal.status = "COMPLETED";
      goal.result = result;
      this.activeGoals.delete(goalId);
      AgentStateManager.getInstance().removeActiveGoal(goalId, true);
    }
  }

  public failGoal(goalId: string, error: string): void {
    const goal = this.activeGoals.get(goalId);
    if (goal) {
      goal.status = "FAILED";
      goal.error = error;
      this.activeGoals.delete(goalId);
      AgentStateManager.getInstance().removeActiveGoal(goalId, false);
    }
  }

  public cancelGoal(goalId: string, reason: string): void {
    const goal = this.activeGoals.get(goalId);
    if (goal) {
      goal.status = "CANCELLED";
      goal.error = reason;
      this.activeGoals.delete(goalId);
      AgentStateManager.getInstance().removeActiveGoal(goalId, false);
    }
    this.queue = this.queue.filter((g) => g.goalId !== goalId);
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  public getActiveGoals(): IGoal[] {
    return Array.from(this.activeGoals.values());
  }

  private cleanExpired(): void {
    const now = Date.now();
    this.queue = this.queue.filter((g) => {
      if (g.deadline <= now) {
        g.status = "EXPIRED";
        AgentStateManager.getInstance().removeActiveGoal(g.goalId, false);
        return false;
      }
      return true;
    });

    for (const [id, goal] of this.activeGoals.entries()) {
      if (goal.deadline <= now) {
        goal.status = "EXPIRED";
        this.activeGoals.delete(id);
        AgentStateManager.getInstance().removeActiveGoal(id, false);
      }
    }
  }
}
