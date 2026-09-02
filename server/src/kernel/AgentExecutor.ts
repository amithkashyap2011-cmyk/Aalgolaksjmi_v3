/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — EXECUTOR
 * ═══════════════════════════════════════════════════════════════════
 * Executes plan steps, invokes agents/tools, and enforces step verification.
 */

import { IExecutionPlan, IPlanStep, IGoal, IAgentExecutionContext, IAgentContext } from "./types.js";
import { AgentRegistry } from "./AgentRegistry.js";
import { AgentToolRegistry } from "./AgentToolRegistry.js";
import { AgentStateManager } from "./AgentStateManager.js";
import { AgentEventBus } from "./AgentEventBus.js";

export class AgentExecutor {
  private static instance: AgentExecutor;

  private constructor() {}

  public static getInstance(): AgentExecutor {
    if (!AgentExecutor.instance) {
      AgentExecutor.instance = new AgentExecutor();
    }
    return AgentExecutor.instance;
  }

  public async executePlan(plan: IExecutionPlan, goal: IGoal): Promise<{ success: boolean; results: Record<string, any>; error?: string }> {
    plan.status = "RUNNING";
    const aggregatedResults: Record<string, any> = {};
    const stateManager = AgentStateManager.getInstance();
    const systemState = stateManager.getSnapshot();

    const agentCtx: IAgentContext = {
      kernelVersion: "3.0.0",
      controlMode: stateManager.getControlMode(),
      isEmergencyStopped: systemState.isEmergencyStopped,
      systemState: { ...systemState },
    };

    for (const step of plan.steps) {
      const now = Date.now();
      if (now >= step.deadline || now >= plan.deadline) {
        step.status = "FAILED";
        step.error = `DEADLINE_EXCEEDED: Step deadline expired (budget: ${step.deadline - now}ms).`;
        plan.status = "FAILED";
        return { success: false, results: aggregatedResults, error: step.error };
      }

      step.status = "RUNNING";
      const startMs = Date.now();

      const execContext: IAgentExecutionContext = {
        goal,
        plan,
        step,
        context: agentCtx,
        traceId: `${plan.planId}_${step.stepId}`,
      };

      try {
        const agent = AgentRegistry.getInstance().get(step.agentId);
        if (!agent) {
          throw new Error(`AGENT_NOT_FOUND: Specialist agent "${step.agentId}" is not registered.`);
        }

        // 1. Pass previously accumulated results in input
        step.input = { ...step.input, ...aggregatedResults };

        // 2. Execute step through agent
        const stepResult = await agent.executeStep(step, execContext);
        step.durationMs = Date.now() - startMs;

        if (!stepResult.success) {
          step.status = "FAILED";
          step.error = stepResult.error || "Step execution failed.";
          plan.status = "FAILED";
          AgentRegistry.getInstance().recordTaskMetrics(step.agentId, step.durationMs, false);
          return { success: false, results: aggregatedResults, error: step.error };
        }

        // 3. Verify step
        const verifyResult = await agent.verify(stepResult);
        if (!verifyResult.verified) {
          step.status = "FAILED";
          step.error = `VERIFICATION_FAILED: ${verifyResult.discrepancies?.join("; ") || "Verification check failed"}`;
          plan.status = "FAILED";
          AgentRegistry.getInstance().recordTaskMetrics(step.agentId, step.durationMs, false);
          return { success: false, results: aggregatedResults, error: step.error };
        }

        step.status = "COMPLETED";
        step.result = stepResult.data;
        aggregatedResults[step.stepId] = stepResult.data;
        aggregatedResults[step.name] = stepResult.data;
        if (stepResult.data && typeof stepResult.data === "object") {
          Object.assign(aggregatedResults, stepResult.data);
        }

        AgentRegistry.getInstance().recordTaskMetrics(step.agentId, step.durationMs, true);
      } catch (err: any) {
        step.status = "FAILED";
        step.error = err.message;
        step.durationMs = Date.now() - startMs;
        plan.status = "FAILED";
        AgentRegistry.getInstance().recordTaskMetrics(step.agentId, step.durationMs, false);
        return { success: false, results: aggregatedResults, error: err.message };
      }
    }

    plan.status = "COMPLETED";
    return { success: true, results: aggregatedResults };
  }
}
