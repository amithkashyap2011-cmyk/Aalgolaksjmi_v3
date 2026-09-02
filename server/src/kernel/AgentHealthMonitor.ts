/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — HEALTH MONITOR
 * ═══════════════════════════════════════════════════════════════════
 * Continuous telemetry evaluating CPU, memory, latency budgets, and queue depths.
 */

import os from "node:os";
import mongoose from "mongoose";
import { AgentRegistry } from "./AgentRegistry.js";
import { AgentStateManager } from "./AgentStateManager.js";
import { AgentGoalManager } from "./AgentGoalManager.js";
import { AgentRecoveryManager } from "./AgentRecoveryManager.js";
import { getQuantEngineURL, isReachable } from "../config/serviceDiscovery.js";
import { systemManager } from "../services/systemManager.js";

export interface IKernelHealthSnapshot {
  timestamp: number;
  overallStatus: "HEALTHY" | "DEGRADED" | "CRITICAL";
  controlMode: string;
  isEmergencyStopped: boolean;
  cpuUsagePct: number;
  freeMemoryMB: number;
  totalMemoryMB: number;
  mongoStatus: "CONNECTED" | "DISCONNECTED" | "CONNECTING";
  mongoPingMs: number;
  quantEngine: {
    reachable: boolean;
    url: string;
  };
  agentSummary: Record<string, any>[];
  pendingGoalsCount: number;
  activeGoalsCount: number;
}

export class AgentHealthMonitor {
  private static instance: AgentHealthMonitor;
  private timer: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  private constructor() {}

  public static getInstance(): AgentHealthMonitor {
    if (!AgentHealthMonitor.instance) {
      AgentHealthMonitor.instance = new AgentHealthMonitor();
    }
    return AgentHealthMonitor.instance;
  }

  public start(): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    this.timer = setInterval(() => this.runCheck(), 10000);
  }

  public stop(): void {
    this.isMonitoring = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async getHealthSnapshot(): Promise<IKernelHealthSnapshot> {
    const stateManager = AgentStateManager.getInstance();
    const systemState = stateManager.getSnapshot();
    const goalManager = AgentGoalManager.getInstance();
    const registry = AgentRegistry.getInstance();
    const recovery = AgentRecoveryManager.getInstance();

    // 1. Memory & CPU
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const freeMem = Math.round(os.freemem() / 1024 / 1024);
    const cpus = os.cpus();
    const numCpus = Math.max(1, cpus.length);
    const load1 = os.loadavg()[0];
    const cpuPct = Math.min(100, Math.max(1, Math.round((load1 / numCpus) * 10)));

    // 2. Mongo
    const mongoState = mongoose.connection.readyState;
    const mongoStatus = mongoState === 1 ? "CONNECTED" : (mongoState === 2 ? "CONNECTING" : "DISCONNECTED");
    let mongoPingMs = 0;
    if (mongoState === 1 && mongoose.connection.db) {
      const t0 = Date.now();
      try {
        await mongoose.connection.db.admin().ping();
        mongoPingMs = Date.now() - t0;
        recovery.recordSuccess("mongodb");
      } catch (err: any) {
        recovery.recordFailure("mongodb", err.message);
      }
    }

    // 3. Quant Engine
    let quantUrl = "";
    let quantReachable = false;
    try {
      quantUrl = await getQuantEngineURL();
      const qService = systemManager.getService("quant_engine");
      const isFreshHeartbeat = Boolean(qService && (Date.now() - qService.lastHeartbeat < 30000));
      quantReachable = isFreshHeartbeat || await isReachable(quantUrl);
      if (quantReachable) {
        recovery.recordSuccess("quant_engine");
      } else {
        recovery.recordFailure("quant_engine", "Unreachable");
      }
    } catch {
      recovery.recordFailure("quant_engine", "Discovery error");
    }

    // Determine overall status
    let overallStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" = "HEALTHY";
    if (mongoStatus === "DISCONNECTED") {
      overallStatus = "CRITICAL";
    } else if (!quantReachable || mongoPingMs > 500) {
      overallStatus = "DEGRADED";
    }

    return {
      timestamp: Date.now(),
      overallStatus,
      controlMode: systemState.controlMode,
      isEmergencyStopped: systemState.isEmergencyStopped,
      cpuUsagePct: cpuPct,
      freeMemoryMB: freeMem,
      totalMemoryMB: totalMem,
      mongoStatus,
      mongoPingMs,
      quantEngine: {
        reachable: quantReachable,
        url: quantUrl,
      },
      agentSummary: registry.getStatusSummary(),
      pendingGoalsCount: goalManager.getPendingCount(),
      activeGoalsCount: goalManager.getActiveGoals().length,
    };
  }

  private async runCheck(): Promise<void> {
    try {
      await this.getHealthSnapshot();
    } catch (err) {
      console.warn("[AgentHealthMonitor] Health check cycle failed:", err);
    }
  }
}
