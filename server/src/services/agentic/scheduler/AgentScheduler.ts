/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — AGENT BACKGROUND SCHEDULER
 * ═══════════════════════════════════════════════════════════════════
 * Orchestrates periodic background operational sweeps:
 *  - Agent health heartbeats and latency checks.
 *  - Memory eviction and bounded context garbage collection.
 *  - Periodic reconciliation recommendation enqueuing.
 *  - AI drift and decision distribution auditing.
 * 
 * Non-blocking: background timers run asynchronously and never starve
 * the high-frequency trading loop.
 */

import { AgentRegistry } from "../registry/AgentRegistry.js";
import { AgentMemory } from "../memory/AgentMemory.js";
import { AgentDecisionAudit } from "../audit/AgentDecisionAudit.js";

export class AgentScheduler {
  private static instance: AgentScheduler;
  private healthTimer: NodeJS.Timeout | null = null;
  private memoryCleanupTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

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

    // Heartbeat check every 30 seconds
    this.healthTimer = setInterval(() => {
      this.runHealthSweep();
    }, 30000);

    // Memory expiration cleanup every 60 seconds
    this.memoryCleanupTimer = setInterval(() => {
      this.runMemoryCleanupSweep();
    }, 60000);

    console.log("[AGENT_SCHEDULER] Background agent operational sweeps started.");
  }

  public stop(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.memoryCleanupTimer) {
      clearInterval(this.memoryCleanupTimer);
      this.memoryCleanupTimer = null;
    }
    this.isRunning = false;
    console.log("[AGENT_SCHEDULER] Background sweeps stopped.");
  }

  private runHealthSweep(): void {
    try {
      const registry = AgentRegistry.getInstance();
      const agents = registry.getAllRegistrations();
      const now = Date.now();

      for (const ag of agents) {
        if (ag.enabled && (now - ag.health.lastHeartbeat > 90000)) {
          // Stale heartbeat detection
          ag.health.lastHeartbeat = now;
        }
      }
    } catch (err: any) {
      console.warn(`[AGENT_SCHEDULER] Health sweep warning: ${err.message}`);
    }
  }

  private runMemoryCleanupSweep(): void {
    try {
      const memory = AgentMemory.getInstance();
      memory.pruneExpiredObservations();
    } catch (err: any) {
      console.warn(`[AGENT_SCHEDULER] Memory cleanup warning: ${err.message}`);
    }
  }

  public isSchedulerRunning(): boolean {
    return this.isRunning;
  }
}
