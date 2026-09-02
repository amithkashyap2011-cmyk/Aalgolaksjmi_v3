/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — RECOVERY MANAGER
 * ═══════════════════════════════════════════════════════════════════
 * Self-healing circuit breakers, degradation fallbacks, and recovery workflows.
 */

import { AgentStateManager } from "./AgentStateManager.js";
import { AgentEventBus } from "./AgentEventBus.js";

export interface ICircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenSuccessThreshold: number;
}

export class AgentRecoveryManager {
  private static instance: AgentRecoveryManager;
  private configs = new Map<string, ICircuitBreakerConfig>();
  private halfOpenSuccesses = new Map<string, number>();

  private constructor() {
    this.configs.set("quant_engine", { failureThreshold: 3, resetTimeoutMs: 15000, halfOpenSuccessThreshold: 2 });
    this.configs.set("binance_api", { failureThreshold: 5, resetTimeoutMs: 20000, halfOpenSuccessThreshold: 3 });
    this.configs.set("mongodb", { failureThreshold: 3, resetTimeoutMs: 10000, halfOpenSuccessThreshold: 2 });
  }

  public static getInstance(): AgentRecoveryManager {
    if (!AgentRecoveryManager.instance) {
      AgentRecoveryManager.instance = new AgentRecoveryManager();
    }
    return AgentRecoveryManager.instance;
  }

  public isAvailable(serviceKey: string): boolean {
    const cb = AgentStateManager.getInstance().getCircuitBreaker(serviceKey);
    const config = this.configs.get(serviceKey) || { failureThreshold: 3, resetTimeoutMs: 15000, halfOpenSuccessThreshold: 2 };

    if (cb.state === "CLOSED") return true;

    if (cb.state === "OPEN") {
      const now = Date.now();
      if (now - cb.lastTripMs > config.resetTimeoutMs) {
        // Transition to HALF_OPEN to test probe
        AgentStateManager.getInstance().updateCircuitBreaker(serviceKey, "HALF_OPEN", cb.failures);
        this.halfOpenSuccesses.set(serviceKey, 0);
        return true;
      }
      return false;
    }

    if (cb.state === "HALF_OPEN") {
      return true; // Allow probe request
    }

    return true;
  }

  public recordSuccess(serviceKey: string): void {
    const cb = AgentStateManager.getInstance().getCircuitBreaker(serviceKey);
    if (cb.state === "HALF_OPEN") {
      const successes = (this.halfOpenSuccesses.get(serviceKey) || 0) + 1;
      this.halfOpenSuccesses.set(serviceKey, successes);
      const config = this.configs.get(serviceKey) || { failureThreshold: 3, resetTimeoutMs: 15000, halfOpenSuccessThreshold: 2 };

      if (successes >= config.halfOpenSuccessThreshold) {
        AgentStateManager.getInstance().updateCircuitBreaker(serviceKey, "CLOSED", 0);
        this.halfOpenSuccesses.delete(serviceKey);
        AgentEventBus.getInstance().publish(
          "SYSTEM_RECOVERED",
          { serviceKey, status: "CLOSED" },
          { source: "AgentRecoveryManager" }
        );
      }
    } else if (cb.state === "CLOSED" && cb.failures > 0) {
      AgentStateManager.getInstance().updateCircuitBreaker(serviceKey, "CLOSED", 0);
    }
  }

  public recordFailure(serviceKey: string, error?: string): void {
    const cb = AgentStateManager.getInstance().getCircuitBreaker(serviceKey);
    const config = this.configs.get(serviceKey) || { failureThreshold: 3, resetTimeoutMs: 15000, halfOpenSuccessThreshold: 2 };
    const newFailures = cb.failures + 1;

    if (newFailures >= config.failureThreshold && cb.state !== "OPEN") {
      AgentStateManager.getInstance().updateCircuitBreaker(serviceKey, "OPEN", newFailures);
      AgentEventBus.getInstance().publish(
        "SYSTEM_DEGRADED",
        { serviceKey, failures: newFailures, error: error || "Threshold exceeded" },
        { source: "AgentRecoveryManager" }
      );
    } else {
      AgentStateManager.getInstance().updateCircuitBreaker(serviceKey, cb.state, newFailures);
    }
  }
}
