/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — AGENT FAILURE & RESILIENCE MANAGER
 * ═══════════════════════════════════════════════════════════════════
 * Manages fault tolerance, timeouts, circuit breaking, and degraded fallbacks.
 * 
 * CORE INVARIANT:
 *  If an AI agent times out, throws, or disconnects:
 *   - The agent transitions to DEGRADED mode.
 *   - Proposed action safely defaults to HOLD.
 *   - Deterministic trading core, SL/Target, AutoPilot, and Kill Switch
 *     CONTINUE UNINTERRUPTED.
 */

import { AgentState, IStructuredAgentDecision } from "../types.js";
import { AgentRegistry } from "../registry/AgentRegistry.js";

export interface ICircuitBreakerState {
  agentId: string;
  consecutiveFailures: number;
  isOpen: boolean;
  openedAt?: number;
  lastError?: string;
}

export class AgentFailureManager {
  private static instance: AgentFailureManager;
  private circuitBreakers: Map<string, ICircuitBreakerState> = new Map();
  private maxConsecutiveFailures = 3;
  private cooldownMs = 60000; // 1 minute cooldown for tripped circuit breakers

  private constructor() {}

  public static getInstance(): AgentFailureManager {
    if (!AgentFailureManager.instance) {
      AgentFailureManager.instance = new AgentFailureManager();
    }
    return AgentFailureManager.instance;
  }

  /**
   * Executes a specialist agent call protected by timeout and circuit breaker.
   */
  public async executeWithResilience<T extends IStructuredAgentDecision>(
    agentId: string,
    operation: () => Promise<T>,
    timeoutMs: number = 1000
  ): Promise<T> {
    const cb = this.getOrCreateCircuitBreaker(agentId);

    // Check if circuit breaker is tripped
    if (cb.isOpen) {
      const now = Date.now();
      if (cb.openedAt && (now - cb.openedAt) < this.cooldownMs) {
        console.warn(`[FAILURE_MANAGER] Circuit breaker OPEN for ${agentId}. Returning fail-safe HOLD.`);
        return this.createDegradedHoldDecision(agentId, "CIRCUIT_BREAKER_OPEN") as T;
      }
      // Half-open attempt
      cb.isOpen = false;
      console.log(`[FAILURE_MANAGER] Circuit breaker HALF-OPEN retry for ${agentId}`);
    }

    // Execute with strict timeout boundary
    return new Promise<T>((resolve) => {
      let completed = false;

      const timer = setTimeout(() => {
        if (!completed) {
          completed = true;
          this.handleAgentFailure(agentId, `EXECUTION_TIMEOUT: Exceeded ${timeoutMs}ms limit`);
          resolve(this.createDegradedHoldDecision(agentId, "REASONING_TIMEOUT") as T);
        }
      }, timeoutMs);

      operation()
        .then((res) => {
          if (!completed) {
            completed = true;
            clearTimeout(timer);
            this.handleAgentSuccess(agentId);
            resolve(res);
          }
        })
        .catch((err) => {
          if (!completed) {
            completed = true;
            clearTimeout(timer);
            this.handleAgentFailure(agentId, err.message || "AGENT_EXECUTION_ERROR");
            resolve(this.createDegradedHoldDecision(agentId, `ERROR: ${err.message}`) as T);
          }
        });
    });
  }

  private handleAgentSuccess(agentId: string): void {
    const cb = this.getOrCreateCircuitBreaker(agentId);
    cb.consecutiveFailures = 0;
    cb.isOpen = false;
    AgentRegistry.getInstance().recordExecution(agentId, 10, true);
  }

  private handleAgentFailure(agentId: string, error: string): void {
    const cb = this.getOrCreateCircuitBreaker(agentId);
    cb.consecutiveFailures += 1;
    cb.lastError = error;

    AgentRegistry.getInstance().recordExecution(agentId, 1000, false);

    if (cb.consecutiveFailures >= this.maxConsecutiveFailures) {
      cb.isOpen = true;
      cb.openedAt = Date.now();
      AgentRegistry.getInstance().setState(agentId, "DEGRADED");
      console.warn(
        `[FAILURE_MANAGER] Circuit breaker TRIPPED for agent ${agentId} after ${cb.consecutiveFailures} failures.`
      );
    }
  }

  private createDegradedHoldDecision(agentId: string, reason: string): IStructuredAgentDecision {
    return {
      decision: "HOLD",
      confidence: 0.0,
      rationale: `Fail-safe fallback for agent ${agentId}: ${reason}`,
      proposed_quantity: 0,
      risk_assessment: "NO_ACTION_DUE_TO_DEGRADED_STATE",
      required_tools: [],
      blockingReason: reason
    };
  }

  public getCircuitBreakerStatus(agentId: string): ICircuitBreakerState {
    return this.getOrCreateCircuitBreaker(agentId);
  }

  public resetCircuitBreaker(agentId: string): void {
    const cb = this.getOrCreateCircuitBreaker(agentId);
    cb.consecutiveFailures = 0;
    cb.isOpen = false;
    delete cb.openedAt;
    delete cb.lastError;
    AgentRegistry.getInstance().resetAgentState(agentId, "ADMIN_RESET");
  }

  private getOrCreateCircuitBreaker(agentId: string): ICircuitBreakerState {
    let cb = this.circuitBreakers.get(agentId);
    if (!cb) {
      cb = { agentId, consecutiveFailures: 0, isOpen: false };
      this.circuitBreakers.set(agentId, cb);
    }
    return cb;
  }
}
