/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — BASE AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Common base class implementing the explicit agent lifecycle contract.
 */

import {
  IAQEAAgent,
  AgentState,
  ToolCapability,
  IAgentContext,
  IAgentObservation,
  IAgentObservationResult,
  IAgentPlanningContext,
  IExecutionPlan,
  IPlanStep,
  IAgentExecutionContext,
  IAgentExecutionResult,
  IAgentVerificationResult,
  IAgentRecoveryResult,
} from "../types.js";
import { AgentToolRegistry } from "../AgentToolRegistry.js";
import { AgentRegistry } from "../AgentRegistry.js";

export abstract class BaseAgent implements IAQEAAgent {
  public abstract readonly id: string;
  public abstract readonly name: string;
  public abstract readonly version: string;
  public abstract readonly capabilities: ToolCapability[];

  public state: AgentState = "REGISTERING";
  public lastHeartbeat: number = Date.now();
  public latencyMs: number = 0;
  public errorCount: number = 0;

  protected context?: IAgentContext;

  public async initialize(context: IAgentContext): Promise<void> {
    this.state = "INITIALIZING";
    this.context = context;
    await this.onInitialize();
    this.state = "READY";
    this.lastHeartbeat = Date.now();
  }

  protected async onInitialize(): Promise<void> {}

  public async observe(input: IAgentObservation): Promise<IAgentObservationResult> {
    this.state = "OBSERVING";
    this.lastHeartbeat = Date.now();
    try {
      const result = await this.onObserve(input);
      this.state = "READY";
      return result;
    } catch (err) {
      this.state = "DEGRADED";
      throw err;
    }
  }

  protected async onObserve(input: IAgentObservation): Promise<IAgentObservationResult> {
    return { valid: true, metrics: {} };
  }

  public async plan(input: IAgentPlanningContext): Promise<IExecutionPlan> {
    this.state = "PLANNING";
    this.lastHeartbeat = Date.now();
    try {
      const plan = await this.onPlan(input);
      this.state = "READY";
      return plan;
    } catch (err) {
      this.state = "DEGRADED";
      throw err;
    }
  }

  protected async onPlan(input: IAgentPlanningContext): Promise<IExecutionPlan> {
    throw new Error(`Plan method not implemented for agent ${this.id}`);
  }

  public async executeStep(step: IPlanStep, execContext: IAgentExecutionContext): Promise<IAgentExecutionResult> {
    this.state = "EXECUTING";
    this.lastHeartbeat = Date.now();
    const t0 = Date.now();

    try {
      // Execute through the tool registry to enforce schema and capability permissions
      const toolRegistry = AgentToolRegistry.getInstance();
      const toolOutput = await toolRegistry.executeTool(
        step.toolId,
        step.input,
        execContext,
        this.capabilities
      );

      this.state = "READY";
      return {
        success: true,
        data: toolOutput,
        durationMs: Date.now() - t0,
      };
    } catch (err: any) {
      this.state = "DEGRADED";
      this.errorCount++;
      return {
        success: false,
        data: null,
        error: err.message,
        durationMs: Date.now() - t0,
      };
    }
  }

  public async verify(result: IAgentExecutionResult): Promise<IAgentVerificationResult> {
    this.state = "VERIFYING";
    this.lastHeartbeat = Date.now();
    const verification = await this.onVerify(result);
    this.state = "READY";
    return verification;
  }

  protected async onVerify(result: IAgentExecutionResult): Promise<IAgentVerificationResult> {
    return {
      verified: result.success && !result.error,
      requiresCorrection: !result.success,
    };
  }

  public async recover(error: Error): Promise<IAgentRecoveryResult> {
    this.state = "RECOVERING";
    this.lastHeartbeat = Date.now();
    try {
      const res = await this.onRecover(error);
      this.state = res.newStatus;
      return res;
    } catch {
      this.state = "FAILED";
      return { recovered: false, actionTaken: "Recovery failed", newStatus: "FAILED" };
    }
  }

  protected async onRecover(error: Error): Promise<IAgentRecoveryResult> {
    return { recovered: true, actionTaken: "State reset", newStatus: "READY" };
  }

  public async shutdown(): Promise<void> {
    this.state = "STOPPED";
    await this.onShutdown();
  }

  protected async onShutdown(): Promise<void> {}
}
