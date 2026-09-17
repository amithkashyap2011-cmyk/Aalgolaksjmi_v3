/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — BASE SPECIALIST AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Abstract foundation for all specialized trading agents.
 */

import { AgentRole, AgentPermission, AgentState, IStructuredAgentDecision, IAgentEvent, IAgentContextSnapshot } from "../types.js";
import { AgentToolRegistry } from "../tools/AgentToolRegistry.js";

export abstract class BaseAgent {
  public readonly id: string;
  public readonly name: string;
  public readonly role: AgentRole;
  public readonly permission: AgentPermission;
  protected state: AgentState = "INITIALIZING";
  protected lastExecutionTime: number = 0;
  protected latencyMs: number = 0;
  protected errorCount: number = 0;
  protected toolRegistry: AgentToolRegistry;

  constructor(id: string, name: string, role: AgentRole, permission: AgentPermission) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.permission = permission;
    this.toolRegistry = AgentToolRegistry.getInstance();
  }

  public getState(): AgentState {
    return this.state;
  }

  public getMetrics() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      permission: this.permission,
      state: this.state,
      lastExecutionTime: this.lastExecutionTime,
      latencyMs: this.latencyMs,
      errorCount: this.errorCount,
    };
  }

  public async initialize(): Promise<void> {
    this.state = "READY";
  }

  public async evaluateWithTimeout(
    event: IAgentEvent,
    context: IAgentContextSnapshot,
    timeoutMs: number = 1000
  ): Promise<IStructuredAgentDecision> {
    const startTime = Date.now();
    this.state = "EVALUATING";

    try {
      const decisionPromise = this.evaluate(event, context);
      const timeoutPromise = new Promise<IStructuredAgentDecision>((_, reject) =>
        setTimeout(() => reject(new Error(`[AGENT_TIMEOUT] Agent ${this.name} exceeded reasoning timeout of ${timeoutMs}ms`)), timeoutMs)
      );

      const result = await Promise.race([decisionPromise, timeoutPromise]);
      this.latencyMs = Date.now() - startTime;
      this.lastExecutionTime = Date.now();
      this.state = "IDLE";
      return result;
    } catch (error: any) {
      this.errorCount++;
      this.latencyMs = Date.now() - startTime;
      this.state = this.errorCount >= 5 ? "DEGRADED" : "ERROR";
      return {
        decision: "HOLD",
        confidence: 0,
        rationale: `Agent reasoning fallback due to error: ${error.message || error}`,
        proposed_quantity: 0,
        risk_assessment: "FAIL_CLOSED_ON_AGENT_ERROR",
        required_tools: [],
        blockingReason: error.message
      };
    }
  }

  /**
   * Specialist agent implementation logic.
   */
  protected abstract evaluate(event: IAgentEvent, context: IAgentContextSnapshot): Promise<IStructuredAgentDecision>;

  public async shutdown(): Promise<void> {
    this.state = "STOPPED";
  }
}
