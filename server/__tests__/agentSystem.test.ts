/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT SYSTEM — UNIT TESTS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Complements agentKernel.test.ts by testing the foundational
 * infrastructure that every agent and the kernel rely on:
 *
 * 1. BaseAgent lifecycle & state machine
 * 2. AgentEventBus pub/sub, wildcard, circular buffer
 * 3. AgentMemory 4-layer system (working, episodic, semantic, performance)
 * 4. AgentGoalManager (creation, dedup, expiry, queue ordering, cancel)
 * 5. AgentRegistry (findByCapability, recordTaskMetrics, status summary)
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { AgentEventBus } from "../src/kernel/AgentEventBus.js";
import { AgentMemory } from "../src/kernel/AgentMemory.js";
import { AgentGoalManager } from "../src/kernel/AgentGoalManager.js";
import { AgentRegistry } from "../src/kernel/AgentRegistry.js";
import { AgentStateManager } from "../src/kernel/AgentStateManager.js";
import { AgentPriorityEngine } from "../src/kernel/AgentPriorityEngine.js";
import { BaseAgent } from "../src/kernel/agents/BaseAgent.js";
import {
  PriorityClass,
  type IAgentContext,
  type IAgentObservation,
  type IAgentObservationResult,
  type IAgentExecutionResult,
  type ToolCapability,
  type AgentState,
} from "../src/kernel/types.js";

// ────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────

/** A minimal concrete agent for testing BaseAgent lifecycle. */
class TestAgent extends BaseAgent {
  public readonly id = "TestAgent";
  public readonly name = "Test Agent";
  public readonly version = "1.0.0";
  public readonly capabilities: ToolCapability[] = ["READ_MARKET"];

  public initCalled = false;
  public observePayload: any = null;
  public shouldObserveFail = false;
  public shouldPlanFail = false;
  public shouldRecoverFail = false;
  public recoverError: Error | null = null;

  protected async onInitialize(): Promise<void> {
    this.initCalled = true;
  }

  protected async onObserve(input: IAgentObservation): Promise<IAgentObservationResult> {
    if (this.shouldObserveFail) throw new Error("Observation failed");
    this.observePayload = input;
    return { valid: true, metrics: { price: 100 } };
  }

  protected async onPlan(): Promise<any> {
    if (this.shouldPlanFail) throw new Error("Plan generation failed");
    return { planId: "test-plan", path: "FAST_PATH", steps: [] };
  }

  protected async onVerify(result: IAgentExecutionResult): Promise<any> {
    return {
      verified: result.success,
      requiresCorrection: !result.success,
      notes: "Test verification",
    };
  }

  protected async onRecover(error: Error): Promise<any> {
    if (this.shouldRecoverFail) throw error;
    this.recoverError = error;
    return { recovered: true, actionTaken: "Reset state", newStatus: "READY" as AgentState };
  }
}

/** Second test agent for multi-agent scenarios. */
class AnotherTestAgent extends BaseAgent {
  public readonly id = "AnotherTestAgent";
  public readonly name = "Another Test Agent";
  public readonly version = "2.0.0";
  public readonly capabilities: ToolCapability[] = ["PAPER_EXECUTION", "READ_MARKET"];
}

const makeContext = (): IAgentContext => ({
  kernelVersion: "3.0.0",
  controlMode: "AI_AUTONOMOUS",
  isEmergencyStopped: false,
  systemState: {} as any,
});

// ────────────────────────────────────────────────────────────────────
// 1. BASE AGENT LIFECYCLE & STATE MACHINE
// ────────────────────────────────────────────────────────────────────

describe("BaseAgent: Lifecycle & State Machine", () => {
  let agent: TestAgent;

  beforeEach(() => {
    agent = new TestAgent();
  });

  it("starts in REGISTERING state", () => {
    expect(agent.state).toBe("REGISTERING");
    expect(agent.errorCount).toBe(0);
  });

  it("transitions to READY after initialize()", async () => {
    await agent.initialize(makeContext());

    expect(agent.state).toBe("READY");
    expect(agent.initCalled).toBe(true);
    expect(agent.lastHeartbeat).toBeLessThanOrEqual(Date.now());
  });

  describe("observe()", () => {
    beforeEach(async () => {
      await agent.initialize(makeContext());
    });

    it("transitions READY → OBSERVING → READY on success", async () => {
      const input: IAgentObservation = {
        symbol: "BTCUSDT",
        currentPrice: 50000,
        marketDomain: "CRYPTO",
      };

      const result = await agent.observe(input);

      expect(result.valid).toBe(true);
      expect(result.metrics).toEqual({ price: 100 });
      expect(agent.state).toBe("READY");
      expect(agent.observePayload).toBe(input);
    });

    it("transitions to DEGRADED on observation failure", async () => {
      agent.shouldObserveFail = true;

      await expect(agent.observe({
        symbol: "BTCUSDT",
        currentPrice: 50000,
        marketDomain: "CRYPTO",
      })).rejects.toThrow("Observation failed");

      expect(agent.state).toBe("DEGRADED");
    });
  });

  describe("plan()", () => {
    beforeEach(async () => {
      await agent.initialize(makeContext());
    });

    it("transitions READY → PLANNING → READY on success", async () => {
      const plan = await agent.plan({ goal: {} as any, context: makeContext() });

      expect(plan.planId).toBe("test-plan");
      expect(agent.state).toBe("READY");
    });

    it("transitions to DEGRADED on plan failure", async () => {
      agent.shouldPlanFail = true;

      await expect(agent.plan({ goal: {} as any, context: makeContext() })).rejects.toThrow("Plan generation failed");
      expect(agent.state).toBe("DEGRADED");
    });
  });

  describe("verify()", () => {
    beforeEach(async () => {
      await agent.initialize(makeContext());
    });

    it("returns verified=true for successful execution result", async () => {
      const result = await agent.verify({ success: true, data: {}, durationMs: 50 });

      expect(result.verified).toBe(true);
      expect(result.requiresCorrection).toBe(false);
      expect(agent.state).toBe("READY");
    });

    it("returns verified=false for failed execution result", async () => {
      const result = await agent.verify({ success: false, data: null, error: "timeout", durationMs: 5000 });

      expect(result.verified).toBe(false);
      expect(result.requiresCorrection).toBe(true);
    });
  });

  describe("recover()", () => {
    beforeEach(async () => {
      await agent.initialize(makeContext());
    });

    it("recovers from error and transitions to the new state", async () => {
      const testError = new Error("Service unavailable");
      const result = await agent.recover(testError);

      expect(result.recovered).toBe(true);
      expect(result.actionTaken).toBe("Reset state");
      expect(agent.recoverError).toBe(testError);
      expect(agent.state).toBe("READY");
    });

    it("transitions to FAILED when recovery itself fails", async () => {
      agent.shouldRecoverFail = true;
      const result = await agent.recover(new Error("Unrecoverable"));

      expect(result.recovered).toBe(false);
      expect(agent.state).toBe("FAILED");
    });
  });

  describe("shutdown()", () => {
    it("transitions to STOPPED on shutdown", async () => {
      await agent.initialize(makeContext());
      await agent.shutdown();

      expect(agent.state).toBe("STOPPED");
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// 2. AGENT EVENT BUS
// ────────────────────────────────────────────────────────────────────

describe("AgentEventBus: Publish / Subscribe", () => {
  let bus: AgentEventBus;

  beforeEach(() => {
    bus = AgentEventBus.getInstance();
    bus.clear();
  });

  it("delivers events to specific type subscribers", () => {
    const received: any[] = [];
    bus.subscribe("AGENT_STARTED", (e) => received.push(e));

    bus.publish("AGENT_STARTED", { agentId: "TestAgent" }, { source: "test" });
    bus.publish("AGENT_FAILED", { agentId: "Other" }, { source: "test" });

    expect(received).toHaveLength(1);
    expect(received[0].payload.agentId).toBe("TestAgent");
  });

  it("delivers all events to wildcard (*) subscribers", () => {
    const received: any[] = [];
    bus.subscribe("*", (e) => received.push(e));

    bus.publish("AGENT_STARTED", { id: 1 }, { source: "test" });
    bus.publish("AGENT_FAILED", { id: 2 }, { source: "test" });
    bus.publish("GOAL_CREATED", { id: 3 }, { source: "test" });

    expect(received).toHaveLength(3);
  });

  it("generates unique event IDs", () => {
    const e1 = bus.publish("AGENT_STARTED", {}, { source: "test" });
    const e2 = bus.publish("AGENT_STARTED", {}, { source: "test" });

    expect(e1.eventId).not.toBe(e2.eventId);
    expect(e1.eventId).toMatch(/^EVT_/);
  });

  it("sets correct schema version and timestamp", () => {
    const before = Date.now();
    const event = bus.publish("AGENT_STARTED", {}, { source: "test" });
    const after = Date.now();

    expect(event.schemaVersion).toBe("3.0.0");
    expect(event.timestamp).toBeGreaterThanOrEqual(before);
    expect(event.timestamp).toBeLessThanOrEqual(after);
  });

  it("propagates metadata (correlationId, symbol, decisionId)", () => {
    const event = bus.publish("TRADE_EXECUTED", { qty: 1 }, {
      source: "ExecutionAgent",
      correlationId: "CORR_123",
      symbol: "ETHUSDT",
      decisionId: "DEC_456",
    });

    expect(event.source).toBe("ExecutionAgent");
    expect(event.correlationId).toBe("CORR_123");
    expect(event.symbol).toBe("ETHUSDT");
    expect(event.decisionId).toBe("DEC_456");
  });

  it("unsubscribe stops delivering events", () => {
    const received: any[] = [];
    const unsubscribe = bus.subscribe("AGENT_STARTED", (e) => received.push(e));

    bus.publish("AGENT_STARTED", { id: 1 }, { source: "test" });
    unsubscribe();
    bus.publish("AGENT_STARTED", { id: 2 }, { source: "test" });

    expect(received).toHaveLength(1);
  });

  it("subscribeOnce only fires once", () => {
    const received: any[] = [];
    bus.subscribeOnce("AGENT_STARTED", (e) => received.push(e));

    bus.publish("AGENT_STARTED", { id: 1 }, { source: "test" });
    bus.publish("AGENT_STARTED", { id: 2 }, { source: "test" });

    expect(received).toHaveLength(1);
    expect(received[0].payload.id).toBe(1);
  });

  describe("Circular buffer (getRecentEvents)", () => {
    it("stores recent events and respects the limit", () => {
      for (let i = 0; i < 10; i++) {
        bus.publish("AGENT_STARTED", { idx: i }, { source: "test" });
      }

      const all = bus.getRecentEvents();
      expect(all.length).toBe(10);

      const limited = bus.getRecentEvents({ limit: 3 });
      expect(limited.length).toBe(3);
      // Most recent first
      expect(limited[0].payload.idx).toBe(9);
    });

    it("filters by event type", () => {
      bus.publish("AGENT_STARTED", {}, { source: "test" });
      bus.publish("AGENT_FAILED", {}, { source: "test" });
      bus.publish("AGENT_STARTED", {}, { source: "test" });

      const starts = bus.getRecentEvents({ type: "AGENT_STARTED" });
      expect(starts.length).toBe(2);
    });

    it("filters by symbol", () => {
      bus.publish("TRADE_EXECUTED", {}, { source: "test", symbol: "BTCUSDT" });
      bus.publish("TRADE_EXECUTED", {}, { source: "test", symbol: "ETHUSDT" });
      bus.publish("TRADE_EXECUTED", {}, { source: "test", symbol: "BTCUSDT" });

      const btc = bus.getRecentEvents({ symbol: "BTCUSDT" });
      expect(btc.length).toBe(2);
    });

    it("clear() removes all events and listeners", () => {
      const received: any[] = [];
      bus.subscribe("AGENT_STARTED", (e) => received.push(e));
      bus.publish("AGENT_STARTED", { before: true }, { source: "test" });

      bus.clear();

      bus.publish("AGENT_STARTED", { after: true }, { source: "test" });
      // Listener was removed during clear, so only the pre-clear event was captured
      expect(received).toHaveLength(1);
      // But getRecentEvents was also cleared
      expect(bus.getRecentEvents()).toHaveLength(1); // post-clear event is still buffered
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// 3. AGENT MEMORY — 4-LAYER SYSTEM
// ────────────────────────────────────────────────────────────────────

describe("AgentMemory: 4-Layer Memory System", () => {
  let memory: AgentMemory;

  beforeEach(() => {
    memory = AgentMemory.getInstance();
    memory.clearWorking();
  });

  describe("Layer 1: Working Memory (ephemeral)", () => {
    it("stores and retrieves values by key", () => {
      memory.setWorking("currentSymbol", "BTCUSDT");
      expect(memory.getWorking("currentSymbol")).toBe("BTCUSDT");
    });

    it("returns undefined for missing keys", () => {
      expect(memory.getWorking("nonexistent")).toBeUndefined();
    });

    it("clearWorking() removes all working memory entries", () => {
      memory.setWorking("a", 1);
      memory.setWorking("b", 2);
      memory.clearWorking();

      expect(memory.getWorking("a")).toBeUndefined();
      expect(memory.getWorking("b")).toBeUndefined();
    });

    it("overwrites existing keys", () => {
      memory.setWorking("price", 100);
      memory.setWorking("price", 200);

      expect(memory.getWorking("price")).toBe(200);
    });
  });

  describe("Layer 2: Episodic Memory (decision history)", () => {
    it("records episodes with auto-generated IDs", () => {
      memory.recordEpisode({
        timestamp: Date.now(),
        symbol: "BTCUSDT",
        decisionId: "DEC_1",
        direction: "LONG",
        confidence: 0.85,
        status: "OPEN",
      });

      const episodes = memory.getRecentEpisodes();
      expect(episodes.length).toBeGreaterThanOrEqual(1);
      expect(episodes[0].recordId).toMatch(/^EP_/);
      expect(episodes[0].symbol).toBe("BTCUSDT");
      expect(episodes[0].confidence).toBe(0.85);
    });

    it("returns most recent episodes first", () => {
      memory.recordEpisode({
        timestamp: 1000,
        symbol: "BTC",
        decisionId: "D1",
        direction: "LONG",
        confidence: 0.5,
        status: "OPEN",
      });
      memory.recordEpisode({
        timestamp: 2000,
        symbol: "ETH",
        decisionId: "D2",
        direction: "SHORT",
        confidence: 0.9,
        status: "OPEN",
      });

      const episodes = memory.getRecentEpisodes();
      expect(episodes[0].symbol).toBe("ETH"); // most recent
    });

    it("filters episodes by symbol", () => {
      memory.recordEpisode({
        timestamp: 1,
        symbol: "BTCUSDT",
        decisionId: "D1",
        direction: "LONG",
        confidence: 0.7,
        status: "OPEN",
      });
      memory.recordEpisode({
        timestamp: 2,
        symbol: "ETHUSDT",
        decisionId: "D2",
        direction: "SHORT",
        confidence: 0.8,
        status: "OPEN",
      });

      const btcOnly = memory.getRecentEpisodes("BTCUSDT");
      expect(btcOnly.every((e) => e.symbol === "BTCUSDT")).toBe(true);
    });

    it("respects the limit parameter", () => {
      for (let i = 0; i < 30; i++) {
        memory.recordEpisode({
          timestamp: i,
          symbol: "SYM",
          decisionId: `D${i}`,
          direction: "LONG",
          confidence: 0.5,
          status: "OPEN",
        });
      }

      const limited = memory.getRecentEpisodes(undefined, 5);
      expect(limited.length).toBe(5);
    });
  });

  describe("Layer 3: Semantic Memory (domain knowledge)", () => {
    it("is seeded with baseline volatility knowledge on construction", () => {
      const crypto = memory.getSemantic("volatility_baseline:CRYPTO");
      expect(crypto).toBeDefined();
      expect(crypto.defaultAtr).toBe(0.02);

      const nse = memory.getSemantic("volatility_baseline:INDIAN_NSE");
      expect(nse).toBeDefined();
      expect(nse.defaultAtr).toBe(0.012);

      const limits = memory.getSemantic("risk_limits");
      expect(limits).toBeDefined();
      expect(limits.maxLeverage).toBe(20);
      expect(limits.maxDrawdown).toBe(0.15);
    });

    it("stores and retrieves custom semantic knowledge", () => {
      memory.setSemantic("correlation:BTC-ETH", { coefficient: 0.87, window: 30 });

      const corr = memory.getSemantic<{ coefficient: number }>("correlation:BTC-ETH");
      expect(corr!.coefficient).toBe(0.87);
    });

    it("returns undefined for missing semantic keys", () => {
      expect(memory.getSemantic("nonexistent_knowledge")).toBeUndefined();
    });
  });

  describe("Layer 4: Performance Memory (model metrics)", () => {
    it("creates a new performance record on first update", () => {
      memory.updateModelPerformance("model_A", true, 50);

      const perf = memory.getModelPerformance("model_A");
      expect(perf).toBeDefined();
      expect(perf!.modelId).toBe("model_A");
      expect(perf!.sampleCount).toBe(1);
      // First sample: accuracy = 100 (correct)
      expect(perf!.accuracy100).toBe(100);
    });

    it("uses exponential moving average for accuracy (0.95/0.05)", () => {
      memory.updateModelPerformance("model_B", true, 100);  // sample 1: acc=100
      memory.updateModelPerformance("model_B", false, 100); // sample 2: EMA = 100*0.95 + 0*0.05 = 95.0

      const perf = memory.getModelPerformance("model_B");
      expect(perf!.sampleCount).toBe(2);
      expect(perf!.accuracy100).toBe(95.0);
    });

    it("uses exponential moving average for latency (0.9/0.1)", () => {
      memory.updateModelPerformance("model_C", true, 100);   // first: latency=100
      memory.updateModelPerformance("model_C", true, 200);   // EMA = 100*0.9 + 200*0.1 = 110

      const perf = memory.getModelPerformance("model_C");
      expect(perf!.avgLatencyMs).toBe(110);
    });

    it("getAllModelPerformance returns all tracked models", () => {
      memory.updateModelPerformance("m1", true, 10);
      memory.updateModelPerformance("m2", false, 20);

      const all = memory.getAllModelPerformance();
      const ids = all.map((p) => p.modelId);
      expect(ids).toContain("m1");
      expect(ids).toContain("m2");
    });

    it("returns undefined for untracked models", () => {
      expect(memory.getModelPerformance("nonexistent_model")).toBeUndefined();
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// 4. AGENT GOAL MANAGER
// ────────────────────────────────────────────────────────────────────

describe("AgentGoalManager: Goal Lifecycle", () => {
  let goalManager: AgentGoalManager;

  beforeEach(() => {
    goalManager = AgentGoalManager.getInstance();
    // Drain pending queue AND active goals from previous tests (singleton)
    let g: any;
    while ((g = goalManager.getNextGoal())) {
      goalManager.completeGoal(g.goalId, { cleanup: true });
    }
    // Also cancel any remaining active goals
    for (const ag of goalManager.getActiveGoals()) {
      goalManager.completeGoal(ag.goalId);
    }
  });

  describe("Goal creation", () => {
    it("creates goals with unique IDs and PENDING status", () => {
      const goal = goalManager.createGoal({
        type: "EVALUATE_SYMBOL",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        symbol: "BTCUSDT",
        context: {},
      });

      expect(goal.goalId).toMatch(/^GOAL_/);
      expect(goal.status).toBe("PENDING");
      expect(goal.type).toBe("EVALUATE_SYMBOL");
      expect(goal.symbol).toBe("BTCUSDT");
      expect(goal.retryCount).toBe(0);
    });

    it("sets P0_SAFETY goals with shorter TTL (10s)", () => {
      const now = Date.now();
      const goal = goalManager.createGoal({
        type: "EMERGENCY_STOP",
        priority: PriorityClass.P0_SAFETY,
        source: "test",
        context: {},
      });

      // Default TTL for P0 = 10000ms
      expect(goal.deadline - goal.createdAt).toBe(10000);
    });

    it("sets non-P0 goals with longer TTL (30s)", () => {
      const goal = goalManager.createGoal({
        type: "EVALUATE_SYMBOL",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        context: {},
      });

      expect(goal.deadline - goal.createdAt).toBe(30000);
    });

    it("allows custom TTL override", () => {
      const goal = goalManager.createGoal({
        type: "CUSTOM_TASK",
        priority: PriorityClass.P3_OPTIMIZATION,
        source: "test",
        context: {},
        ttlMs: 5000,
      });

      expect(goal.deadline - goal.createdAt).toBe(5000);
    });

    it("P0/P1 goals get maxRetries=2, others get maxRetries=1", () => {
      const p0 = goalManager.createGoal({
        type: "EMERGENCY",
        priority: PriorityClass.P0_SAFETY,
        source: "test",
        context: {},
      });
      const p1 = goalManager.createGoal({
        type: "EXECUTE",
        priority: PriorityClass.P1_EXECUTION,
        source: "test",
        context: {},
      });
      const p3 = goalManager.createGoal({
        type: "LEARN",
        priority: PriorityClass.P3_OPTIMIZATION,
        source: "test",
        context: {},
      });

      expect(p0.maxRetries).toBe(2);
      expect(p1.maxRetries).toBe(2);
      expect(p3.maxRetries).toBe(1);
    });
  });

  describe("Deduplication", () => {
    it("deduplicates EVALUATE_SYMBOL goals for the same symbol within 2s", () => {
      const g1 = goalManager.createGoal({
        type: "EVALUATE_SYMBOL",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        symbol: "BTCUSDT",
        context: {},
      });
      const g2 = goalManager.createGoal({
        type: "EVALUATE_SYMBOL",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        symbol: "BTCUSDT",
        context: {},
      });

      // Should return the same goal (deduplicated)
      expect(g1.goalId).toBe(g2.goalId);
    });

    it("does NOT deduplicate different symbols", () => {
      const g1 = goalManager.createGoal({
        type: "EVALUATE_SYMBOL",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        symbol: "BTCUSDT",
        context: {},
      });
      const g2 = goalManager.createGoal({
        type: "EVALUATE_SYMBOL",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        symbol: "ETHUSDT",
        context: {},
      });

      expect(g1.goalId).not.toBe(g2.goalId);
    });

    it("does NOT deduplicate non-EVALUATE_SYMBOL goal types", () => {
      const g1 = goalManager.createGoal({
        type: "EXECUTE_TRADE",
        priority: PriorityClass.P1_EXECUTION,
        source: "test",
        symbol: "BTCUSDT",
        context: {},
      });
      const g2 = goalManager.createGoal({
        type: "EXECUTE_TRADE",
        priority: PriorityClass.P1_EXECUTION,
        source: "test",
        symbol: "BTCUSDT",
        context: {},
      });

      expect(g1.goalId).not.toBe(g2.goalId);
    });
  });

  describe("Queue ordering & retrieval", () => {
    it("getNextGoal returns highest priority goal and sets IN_PROGRESS", () => {
      goalManager.createGoal({
        type: "LEARN",
        priority: PriorityClass.P4_LEARNING,
        source: "test",
        context: {},
      });
      goalManager.createGoal({
        type: "EMERGENCY",
        priority: PriorityClass.P0_SAFETY,
        source: "test",
        context: {},
      });
      goalManager.createGoal({
        type: "EVALUATE",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        context: {},
      });

      const next = goalManager.getNextGoal();
      expect(next).toBeDefined();
      expect(next!.priority).toBe(PriorityClass.P0_SAFETY);
      expect(next!.status).toBe("IN_PROGRESS");
    });

    it("getPendingCount reflects queue size", () => {
      goalManager.createGoal({
        type: "TASK1",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        context: {},
      });
      goalManager.createGoal({
        type: "TASK2",
        priority: PriorityClass.P3_OPTIMIZATION,
        source: "test",
        context: {},
      });

      expect(goalManager.getPendingCount()).toBe(2);

      goalManager.getNextGoal(); // dequeue one
      expect(goalManager.getPendingCount()).toBe(1);
    });

    it("getNextGoal returns undefined when queue is empty", () => {
      expect(goalManager.getNextGoal()).toBeUndefined();
    });
  });

  describe("Goal completion, failure, cancellation", () => {
    it("completeGoal marks goal as COMPLETED and removes from active", () => {
      const goal = goalManager.createGoal({
        type: "TASK",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        context: {},
      });

      const active = goalManager.getNextGoal(); // moves to active
      goalManager.completeGoal(active!.goalId, { result: "success" });

      expect(active!.status).toBe("COMPLETED");
      expect(active!.result).toEqual({ result: "success" });
      expect(goalManager.getActiveGoals()).toHaveLength(0);
    });

    it("failGoal marks goal as FAILED with error message", () => {
      goalManager.createGoal({
        type: "TASK",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        context: {},
      });

      const active = goalManager.getNextGoal()!;
      goalManager.failGoal(active.goalId, "Service timeout");

      expect(active.status).toBe("FAILED");
      expect(active.error).toBe("Service timeout");
      expect(goalManager.getActiveGoals()).toHaveLength(0);
    });

    it("cancelGoal removes from both active and pending queue", () => {
      const goal = goalManager.createGoal({
        type: "TASK",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        context: {},
      });

      goalManager.cancelGoal(goal.goalId, "User cancelled");

      expect(goalManager.getPendingCount()).toBe(0);
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// 5. AGENT REGISTRY
// ────────────────────────────────────────────────────────────────────

describe("AgentRegistry: Registration & Capability Queries", () => {
  let registry: AgentRegistry;
  let testAgent: TestAgent;
  let anotherAgent: AnotherTestAgent;

  beforeEach(async () => {
    registry = AgentRegistry.getInstance();
    testAgent = new TestAgent();
    anotherAgent = new AnotherTestAgent();
  });

  it("registers an agent and retrieves it by ID", () => {
    registry.register(testAgent);

    const retrieved = registry.get("TestAgent");
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe("TestAgent");
    expect(retrieved!.name).toBe("Test Agent");
  });

  it("getAll returns all registered agents", () => {
    registry.register(testAgent);
    registry.register(anotherAgent);

    const all = registry.getAll();
    const ids = all.map((a) => a.id);
    expect(ids).toContain("TestAgent");
    expect(ids).toContain("AnotherTestAgent");
  });

  it("findByCapability returns agents with the requested capability", () => {
    registry.register(testAgent);
    registry.register(anotherAgent);

    // Both have READ_MARKET
    const readers = registry.findByCapability("READ_MARKET");
    expect(readers.length).toBeGreaterThanOrEqual(2);

    // Only AnotherTestAgent has PAPER_EXECUTION
    const executors = registry.findByCapability("PAPER_EXECUTION");
    const executorIds = executors.map((a) => a.id);
    expect(executorIds).toContain("AnotherTestAgent");
    expect(executorIds).not.toContain("TestAgent");
  });

  it("get returns undefined for unregistered agents", () => {
    expect(registry.get("NonExistentAgent")).toBeUndefined();
  });

  describe("recordTaskMetrics", () => {
    it("increments totalTasksExecuted and updates latency EMA", () => {
      registry.register(testAgent);

      registry.recordTaskMetrics("TestAgent", 100, true);
      registry.recordTaskMetrics("TestAgent", 200, true);

      const summary = registry.getStatusSummary().find((s) => s.id === "TestAgent");
      expect(summary).toBeDefined();
      expect(summary!.tasksExecuted).toBe(2);
      // EMA: first=100, second = 100*0.9 + 200*0.1 = 110
      expect(summary!.avgLatencyMs).toBe(110);
    });

    it("increments errorCount on failed tasks", () => {
      registry.register(testAgent);

      registry.recordTaskMetrics("TestAgent", 50, true);
      registry.recordTaskMetrics("TestAgent", 5000, false);

      const summary = registry.getStatusSummary().find((s) => s.id === "TestAgent");
      expect(summary!.errorCount).toBe(1);
    });

    it("does nothing for unknown agent IDs", () => {
      // Should not throw
      expect(() => registry.recordTaskMetrics("Unknown", 100, true)).not.toThrow();
    });
  });

  describe("updateState", () => {
    it("updates agent state", () => {
      registry.register(testAgent);
      registry.updateState("TestAgent", "DEGRADED");

      expect(testAgent.state).toBe("DEGRADED");
    });

    it("emits AGENT_FAILED event on FAILED state transition", () => {
      const bus = AgentEventBus.getInstance();
      bus.clear();
      registry.register(testAgent);

      const received: any[] = [];
      bus.subscribe("AGENT_FAILED", (e) => received.push(e));

      registry.updateState("TestAgent", "FAILED", "Out of memory");

      expect(received).toHaveLength(1);
      expect(received[0].payload.agentId).toBe("TestAgent");
      expect(received[0].payload.reason).toBe("Out of memory");
    });

    it("emits AGENT_RECOVERED when transitioning from RECOVERING to READY", () => {
      const bus = AgentEventBus.getInstance();
      bus.clear();
      registry.register(testAgent);

      const received: any[] = [];
      bus.subscribe("AGENT_RECOVERED", (e) => received.push(e));

      // First set to RECOVERING
      registry.updateState("TestAgent", "RECOVERING");
      // Then recover to READY
      registry.updateState("TestAgent", "READY");

      expect(received).toHaveLength(1);
      expect(received[0].payload.agentId).toBe("TestAgent");
    });

    it("does nothing for unknown agent IDs", () => {
      expect(() => registry.updateState("Unknown", "READY")).not.toThrow();
    });
  });

  describe("getStatusSummary", () => {
    it("returns complete status objects for all registered agents", () => {
      registry.register(testAgent);

      const summary = registry.getStatusSummary();
      const entry = summary.find((s) => s.id === "TestAgent");

      expect(entry).toBeDefined();
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("version");
      expect(entry).toHaveProperty("state");
      expect(entry).toHaveProperty("capabilities");
      expect(entry).toHaveProperty("lastHeartbeat");
      expect(entry).toHaveProperty("latencyMs");
      expect(entry).toHaveProperty("avgLatencyMs");
      expect(entry).toHaveProperty("errorCount");
      expect(entry).toHaveProperty("tasksExecuted");
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// 6. AGENT PRIORITY ENGINE — SORTING & PREEMPTION
// ────────────────────────────────────────────────────────────────────

describe("AgentPriorityEngine: Comparison & Preemption", () => {
  const makeGoal = (priority: PriorityClass, createdAt: number) => ({
    goalId: `G_${priority}_${createdAt}`,
    type: "TEST",
    priority,
    source: "test",
    createdAt,
    deadline: createdAt + 30000,
    context: {},
    status: "PENDING" as const,
    correlationId: "c",
    retryCount: 0,
    maxRetries: 1,
  });

  it("higher priority (lower number) comes first in sort order", () => {
    const p0 = makeGoal(PriorityClass.P0_SAFETY, Date.now());
    const p2 = makeGoal(PriorityClass.P2_DECISION, Date.now());

    expect(AgentPriorityEngine.compare(p0, p2)).toBeLessThan(0);
  });

  it("same priority sorts by creation time (oldest first / FIFO)", () => {
    const older = makeGoal(PriorityClass.P2_DECISION, Date.now() - 5000);
    const newer = makeGoal(PriorityClass.P2_DECISION, Date.now());

    expect(AgentPriorityEngine.compare(older, newer)).toBeLessThan(0);
  });

  it("P0 can preempt P2", () => {
    const p2 = makeGoal(PriorityClass.P2_DECISION, Date.now());
    const p0 = makeGoal(PriorityClass.P0_SAFETY, Date.now());

    expect(AgentPriorityEngine.isPreemptible(p2, p0)).toBe(true);
  });

  it("P2 cannot preempt P0", () => {
    const p0 = makeGoal(PriorityClass.P0_SAFETY, Date.now());
    const p2 = makeGoal(PriorityClass.P2_DECISION, Date.now());

    expect(AgentPriorityEngine.isPreemptible(p0, p2)).toBe(false);
  });

  it("same priority cannot preempt each other", () => {
    const g1 = makeGoal(PriorityClass.P2_DECISION, Date.now());
    const g2 = makeGoal(PriorityClass.P2_DECISION, Date.now());

    expect(AgentPriorityEngine.isPreemptible(g1, g2)).toBe(false);
  });
});
