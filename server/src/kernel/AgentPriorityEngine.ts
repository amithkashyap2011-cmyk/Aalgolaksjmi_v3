/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — PRIORITY ENGINE
 * ═══════════════════════════════════════════════════════════════════
 * Strict priority classification preventing low-priority tasks from starving critical operations.
 */

import { PriorityClass, IGoal } from "./types.js";

export class AgentPriorityEngine {
  public static compare(a: IGoal, b: IGoal): number {
    // 1. Higher priority first (lower numerical value in PriorityClass enum)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    // 2. Urgent deadline first
    if (a.deadline !== b.deadline) {
      return a.deadline - b.deadline;
    }

    // 3. Older creation timestamp first (FIFO within same class)
    return a.createdAt - b.createdAt;
  }

  public static isPreemptible(runningGoal: IGoal, incomingGoal: IGoal): boolean {
    // P0 Safety always preempts P2-P5 tasks
    if (incomingGoal.priority === PriorityClass.P0_SAFETY && runningGoal.priority >= PriorityClass.P2_DECISION) {
      return true;
    }
    // P1 Execution preempts P3-P5 tasks
    if (incomingGoal.priority === PriorityClass.P1_EXECUTION && runningGoal.priority >= PriorityClass.P3_PERFORMANCE) {
      return true;
    }
    return false;
  }
}
