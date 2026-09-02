/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — SCHEDULER
 * ═══════════════════════════════════════════════════════════════════
 * Bounded-concurrency priority scheduler executing goals and enforcing timeouts.
 */

import { IGoal, IExecutionPlan } from "./types.js";
import { AgentGoalManager } from "./AgentGoalManager.js";
import { AgentPlanner } from "./AgentPlanner.js";
import { AgentExecutor } from "./AgentExecutor.js";
import { AgentEventBus } from "./AgentEventBus.js";

export class AgentScheduler {
  private static instance: AgentScheduler;
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly maxConcurrentTasks = 4;
  private activeRunningCount = 0;
  private schedulerIntervalMs = 50;

  private constructor() {}

  public static getInstance(): AgentScheduler {
    if (!AgentScheduler.instance) {
      AgentScheduler.instance = new AgentScheduler();
    }
    return AgentScheduler.instance;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNextTick();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextTick(): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(() => {
      this.tick()
        .catch((err) => console.error("[AgentScheduler] Error in tick:", err))
        .finally(() => this.scheduleNextTick());
    }, this.schedulerIntervalMs);
  }

  private async tick(): Promise<void> {
    if (this.activeRunningCount >= this.maxConcurrentTasks) {
      return;
    }

    const goal = AgentGoalManager.getInstance().getNextGoal();
    if (!goal) return;

    this.activeRunningCount++;
    this.dispatchGoal(goal)
      .finally(() => {
        this.activeRunningCount--;
      });
  }

  public async dispatchGoal(goal: IGoal): Promise<{ success: boolean; result?: any; error?: string }> {
    const goalManager = AgentGoalManager.getInstance();
    const planner = AgentPlanner.getInstance();
    const executor = AgentExecutor.getInstance();

    try {
      // 1. Create plan
      const plan = planner.createPlan(goal);

      // 2. Execute plan
      const execResult = await executor.executePlan(plan, goal);

      if (execResult.success) {
        goalManager.completeGoal(goal.goalId, execResult.results);
        return { success: true, result: execResult.results };
      } else {
        goalManager.failGoal(goal.goalId, execResult.error || "Execution failed");
        return { success: false, error: execResult.error };
      }
    } catch (err: any) {
      goalManager.failGoal(goal.goalId, err.message);
      return { success: false, error: err.message };
    }
  }
}
