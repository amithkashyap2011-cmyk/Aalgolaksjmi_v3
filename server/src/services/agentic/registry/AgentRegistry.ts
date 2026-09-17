/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — SPECIALIZED AGENT REGISTRY
 * ═══════════════════════════════════════════════════════════════════
 * Manages registration, lifecycle state transitions, permissions,
 * independent enable/disable controls, and health tracking for all 8 agents.
 */

import {
  AgentRole,
  AgentState,
  AgentPermission,
  AgentEventType,
  IAgentRegistration,
  ModelTier
} from "../types.js";
import { BaseAgent } from "../agents/BaseAgent.js";

export class AgentRegistry {
  private static instance: AgentRegistry;
  private registrations: Map<string, IAgentRegistration> = new Map();
  private agentInstances: Map<string, BaseAgent> = new Map();

  private constructor() {}

  public static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  /**
   * Registers a specialized agent with explicit role, capabilities, and permissions.
   */
  public registerAgent(reg: IAgentRegistration, instance: BaseAgent): void {
    if (this.registrations.has(reg.agentId)) {
      console.warn(`[AGENT_REGISTRY] Updating registration for existing agent: ${reg.agentId}`);
    }
    this.registrations.set(reg.agentId, { ...reg, status: "READY" });
    this.agentInstances.set(reg.agentId, instance);
    console.log(`[AGENT_REGISTRY] Registered agent [${reg.agentId}] Role=${reg.role} Permissions=${reg.permissions}`);
  }

  public getRegistration(agentId: string): IAgentRegistration | undefined {
    return this.registrations.get(agentId);
  }

  public getRegistrationByRole(role: AgentRole): IAgentRegistration | undefined {
    for (const reg of this.registrations.values()) {
      if (reg.role === role) return reg;
    }
    return undefined;
  }

  public getAllRegistrations(): IAgentRegistration[] {
    return Array.from(this.registrations.values());
  }

  public getAgentInstance(agentId: string): BaseAgent | undefined {
    return this.agentInstances.get(agentId);
  }

  public getAllAgentInstances(): BaseAgent[] {
    return Array.from(this.agentInstances.values());
  }

  /**
   * Sets lifecycle state for an agent.
   */
  public setState(agentId: string, state: AgentState): void {
    const reg = this.registrations.get(agentId);
    if (!reg) return;
    reg.status = state;
    reg.health.lastHeartbeat = Date.now();
  }

  /**
   * Toggles agent enabled state (must be authorized).
   */
  public setEnabled(agentId: string, enabled: boolean, authorizedBy: string): { success: boolean; message: string } {
    const reg = this.registrations.get(agentId);
    if (!reg) {
      return { success: false, message: `Agent ${agentId} not found` };
    }
    reg.enabled = enabled;
    reg.status = enabled ? "READY" : "STOPPED";
    console.log(`[AGENT_REGISTRY] Agent [${agentId}] toggled to ${enabled ? "ENABLED" : "DISABLED"} by ${authorizedBy}`);
    return {
      success: true,
      message: `Agent ${reg.name} successfully ${enabled ? "enabled" : "disabled"} by ${authorizedBy}`
    };
  }

  /**
   * Records execution telemetry for an agent.
   */
  public recordExecution(agentId: string, latencyMs: number, success: boolean): void {
    const reg = this.registrations.get(agentId);
    if (!reg) return;

    reg.health.lastExecution = Date.now();
    reg.health.lastHeartbeat = Date.now();

    // Exponential moving average for latency
    reg.health.averageLatencyMs = Number(
      (reg.health.averageLatencyMs * 0.8 + latencyMs * 0.2).toFixed(2)
    );

    if (success) {
      reg.health.consecutiveFailures = 0;
      if (reg.status === "ERROR" || reg.status === "DEGRADED") {
        reg.status = "READY";
      }
    } else {
      reg.health.errorCount += 1;
      reg.health.consecutiveFailures += 1;
      if (reg.health.consecutiveFailures >= 3) {
        reg.status = "DEGRADED";
        console.warn(`[AGENT_REGISTRY] Agent [${agentId}] transitioned to DEGRADED due to consecutive failures`);
      }
    }
  }

  /**
   * Resets an agent from degraded/error state.
   */
  public resetAgentState(agentId: string, authorizedBy: string): boolean {
    const reg = this.registrations.get(agentId);
    if (!reg) return false;
    reg.health.consecutiveFailures = 0;
    reg.status = "READY";
    console.log(`[AGENT_REGISTRY] Agent [${agentId}] state manually reset to READY by ${authorizedBy}`);
    return true;
  }

  /**
   * Checks if an agent is authorized to perform an action requiring a permission level.
   */
  public hasPermission(agentId: string, requiredPermission: AgentPermission): boolean {
    const reg = this.registrations.get(agentId);
    if (!reg || !reg.enabled) return false;
    return reg.permissions === requiredPermission || reg.permissions === "READ_SAFE_OPERATIONS";
  }

  /**
   * Checks if an agent is allowed to invoke a specific tool.
   */
  public isToolAllowed(agentId: string, toolName: string): boolean {
    const reg = this.registrations.get(agentId);
    if (!reg || !reg.enabled) return false;
    return reg.allowedTools.includes(toolName) || reg.allowedTools.includes("*");
  }

  public clear(): void {
    this.registrations.clear();
    this.agentInstances.clear();
  }
}
