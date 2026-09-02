/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — AGENT REGISTRY
 * ═══════════════════════════════════════════════════════════════════
 * Central registry tracking all agents, capabilities, and lifecycle states.
 */

import { IAQEAAgent, AgentState, ToolCapability } from "./types.js";
import { AgentEventBus } from "./AgentEventBus.js";

export interface IAgentRegistration {
  agent: IAQEAAgent;
  registeredAt: number;
  lastStateChange: number;
  totalTasksExecuted: number;
  avgLatencyMs: number;
}

export class AgentRegistry {
  private static instance: AgentRegistry;
  private agents = new Map<string, IAgentRegistration>();

  private constructor() {}

  public static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  public register(agent: IAQEAAgent): void {
    if (this.agents.has(agent.id)) {
      console.warn(`[AgentRegistry] Agent ${agent.id} is already registered. Updating.`);
    }

    this.agents.set(agent.id, {
      agent,
      registeredAt: Date.now(),
      lastStateChange: Date.now(),
      totalTasksExecuted: 0,
      avgLatencyMs: 0,
    });

    AgentEventBus.getInstance().publish(
      "AGENT_STARTED",
      { agentId: agent.id, name: agent.name, version: agent.version, capabilities: agent.capabilities },
      { source: "AgentRegistry" }
    );
  }

  public get(agentId: string): IAQEAAgent | undefined {
    return this.agents.get(agentId)?.agent;
  }

  public getAll(): IAQEAAgent[] {
    return Array.from(this.agents.values()).map((reg) => reg.agent);
  }

  public findByCapability(capability: ToolCapability): IAQEAAgent[] {
    return Array.from(this.agents.values())
      .filter((reg) => reg.agent.capabilities.includes(capability))
      .map((reg) => reg.agent);
  }

  public updateState(agentId: string, newState: AgentState, reason?: string): void {
    const reg = this.agents.get(agentId);
    if (!reg) return;

    const previous = reg.agent.state;
    reg.agent.state = newState;
    reg.lastStateChange = Date.now();

    if (newState === "FAILED") {
      AgentEventBus.getInstance().publish(
        "AGENT_FAILED",
        { agentId, previous, current: newState, reason },
        { source: "AgentRegistry" }
      );
    } else if (previous === "RECOVERING" && newState === "READY") {
      AgentEventBus.getInstance().publish(
        "AGENT_RECOVERED",
        { agentId, current: newState },
        { source: "AgentRegistry" }
      );
    }
  }

  public recordTaskMetrics(agentId: string, durationMs: number, success: boolean): void {
    const reg = this.agents.get(agentId);
    if (!reg) return;

    reg.totalTasksExecuted++;
    reg.agent.lastHeartbeat = Date.now();
    reg.agent.latencyMs = durationMs;
    reg.avgLatencyMs = reg.avgLatencyMs === 0 ? durationMs : Number((reg.avgLatencyMs * 0.9 + durationMs * 0.1).toFixed(2));
    
    if (!success) {
      reg.agent.errorCount++;
    }
  }

  public getStatusSummary(): Record<string, any>[] {
    return Array.from(this.agents.values()).map((reg) => ({
      id: reg.agent.id,
      name: reg.agent.name,
      version: reg.agent.version,
      state: reg.agent.state,
      capabilities: reg.agent.capabilities,
      lastHeartbeat: reg.agent.lastHeartbeat,
      latencyMs: reg.agent.latencyMs,
      avgLatencyMs: reg.avgLatencyMs,
      errorCount: reg.agent.errorCount,
      tasksExecuted: reg.totalTasksExecuted,
    }));
  }
}
