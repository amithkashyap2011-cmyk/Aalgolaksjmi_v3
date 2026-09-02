import { AgentKernel } from "../src/kernel/AgentKernel.js";
import { AgentStateManager } from "../src/kernel/AgentStateManager.js";
import { AgentRegistry } from "../src/kernel/AgentRegistry.js";
import { AgentToolRegistry } from "../src/kernel/AgentToolRegistry.js";
import { AgentPolicyEngine } from "../src/kernel/AgentPolicyEngine.js";
import { AgentPriorityEngine } from "../src/kernel/AgentPriorityEngine.js";
import { AgentGoalManager } from "../src/kernel/AgentGoalManager.js";
import { AgentPlanner } from "../src/kernel/AgentPlanner.js";
import { AgentRecoveryManager } from "../src/kernel/AgentRecoveryManager.js";
import { AgentDecisionCoordinator } from "../src/kernel/AgentDecisionCoordinator.js";
import { PriorityClass, IGoal, ITradeExecutionPlan } from "../src/kernel/types.js";

describe("AQEA AGENT KERNEL — COMPREHENSIVE TEST SUITE", () => {
  let kernel: AgentKernel;

  beforeAll(async () => {
    kernel = AgentKernel.getInstance();
    await kernel.initialize();
  });

  afterAll(async () => {
    await kernel.shutdown();
  });

  describe("1. Kernel Lifecycle & Agent Registry", () => {
    it("should successfully register all 9 specialist agents", () => {
      const registry = AgentRegistry.getInstance();
      const agents = registry.getAll();
      expect(agents.length).toBe(9);

      const agentIds = agents.map((a) => a.id);
      expect(agentIds).toContain("MarketAgent");
      expect(agentIds).toContain("FeatureAgent");
      expect(agentIds).toContain("ModelAgent");
      expect(agentIds).toContain("RiskAgent");
      expect(agentIds).toContain("DecisionAgent");
      expect(agentIds).toContain("ExecutionAgent");
      expect(agentIds).toContain("VerificationAgent");
      expect(agentIds).toContain("PerformanceMonitorAgent");
      expect(agentIds).toContain("LearningAgent");
    });

    it("should initialize agents in READY state", () => {
      const registry = AgentRegistry.getInstance();
      const agents = registry.getAll();
      for (const agent of agents) {
        expect(agent.state).toBe("READY");
        expect(agent.lastHeartbeat).toBeGreaterThan(0);
      }
    });
  });

  describe("2. Control Modes & Emergency Stop", () => {
    it("should support switching between AI_AUTONOMOUS, MANUAL, and SAFE", () => {
      kernel.setControlMode("MANUAL", "Test switch");
      expect(kernel.getControlMode()).toBe("MANUAL");

      kernel.setControlMode("AI_AUTONOMOUS", "Test switch");
      expect(kernel.getControlMode()).toBe("AI_AUTONOMOUS");

      kernel.setControlMode("SAFE", "Test switch");
      expect(kernel.getControlMode()).toBe("SAFE");

      kernel.setControlMode("AI_AUTONOMOUS");
    });

    it("should enforce Emergency Stop and override control mode to SAFE", () => {
      kernel.emergencyStop("High volatility detected");
      expect(kernel.getControlMode()).toBe("SAFE");

      const status = AgentStateManager.getInstance().getSnapshot();
      expect(status.isEmergencyStopped).toBe(true);
      expect(status.emergencyStopReason).toBe("High volatility detected");

      // Clearing emergency stop restores MANUAL mode for safe verification
      kernel.clearEmergencyStop("admin");
      expect(kernel.getControlMode()).toBe("MANUAL");
      expect(AgentStateManager.getInstance().getSnapshot().isEmergencyStopped).toBe(false);

      // Restore AI_AUTONOMOUS
      kernel.setControlMode("AI_AUTONOMOUS");
    });
  });

  describe("3. Priority Engine & Preemption", () => {
    it("should prioritize P0 Safety goals over P2 Decision and P4 Learning", () => {
      const now = Date.now();
      const p0Goal: IGoal = {
        goalId: "G0",
        type: "EMERGENCY_STOP",
        priority: PriorityClass.P0_SAFETY,
        source: "test",
        createdAt: now,
        deadline: now + 5000,
        context: {},
        status: "PENDING",
        correlationId: "c0",
        retryCount: 0,
        maxRetries: 1,
      };

      const p2Goal: IGoal = {
        goalId: "G2",
        type: "EVALUATE_SYMBOL",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        createdAt: now - 1000,
        deadline: now + 10000,
        context: {},
        status: "PENDING",
        correlationId: "c2",
        retryCount: 0,
        maxRetries: 1,
      };

      const cmp = AgentPriorityEngine.compare(p0Goal, p2Goal);
      expect(cmp).toBeLessThan(0); // p0 before p2

      const preempts = AgentPriorityEngine.isPreemptible(p2Goal, p0Goal);
      expect(preempts).toBe(true);
    });
  });

  describe("4. Planner & Execution Paths", () => {
    it("should route standard evaluation goals to FAST_PATH", () => {
      const planner = AgentPlanner.getInstance();
      const goal = AgentGoalManager.getInstance().createGoal({
        type: "EVALUATE_SYMBOL",
        priority: PriorityClass.P2_DECISION,
        source: "test",
        symbol: "ETHUSDT",
        context: {},
      });

      const plan = planner.createPlan(goal);
      expect(plan.path).toBe("FAST_PATH");
      expect(plan.steps.length).toBe(6);
      expect(plan.steps[0].agentId).toBe("MarketAgent");
      expect(plan.steps[1].agentId).toBe("FeatureAgent");
      expect(plan.steps[2].agentId).toBe("ModelAgent");
      expect(plan.steps[3].agentId).toBe("DecisionAgent");
      expect(plan.steps[4].agentId).toBe("RiskAgent");
      expect(plan.steps[5].agentId).toBe("VerificationAgent");
    });

    it("should route service anomalies to REASONING_PATH", () => {
      const planner = AgentPlanner.getInstance();
      const goal = AgentGoalManager.getInstance().createGoal({
        type: "RECOVER_SERVICE",
        priority: PriorityClass.P0_SAFETY,
        source: "test",
        context: { serviceName: "quant_engine" },
      });

      const plan = planner.createPlan(goal);
      expect(plan.path).toBe("REASONING_PATH");
    });
  });

  describe("5. Tool Registry & Permissions", () => {
    it("should enforce required capability checks", async () => {
      const toolRegistry = AgentToolRegistry.getInstance();
      const dummyContext: any = {
        goal: { goalId: "g1" },
        plan: { planId: "p1" },
        step: { stepId: "s1", agentId: "MarketAgent" },
        context: { controlMode: "AI_AUTONOMOUS", isEmergencyStopped: false },
      };

      // MarketAgent only has READ_MARKET capability, calling LIVE_EXECUTION must reject
      await expect(
        toolRegistry.executeTool("order.submitLive", {}, dummyContext, ["READ_MARKET"])
      ).rejects.toThrow(/PERMISSION_DENIED/);
    });

    it("should block side-effects in SAFE mode", async () => {
      const toolRegistry = AgentToolRegistry.getInstance();
      const dummyContext: any = {
        goal: { goalId: "g1" },
        plan: { planId: "p1" },
        step: { stepId: "s1", agentId: "ExecutionAgent" },
        context: { controlMode: "SAFE", isEmergencyStopped: true },
      };

      await expect(
        toolRegistry.executeTool("order.submitPaper", { plan: {} }, dummyContext, ["PAPER_EXECUTION"])
      ).rejects.toThrow(/SAFE_MODE_VIOLATION/);
    });
  });

  describe("6. Policy Engine Hard Invariants", () => {
    it("should reject orders with leverage exceeding 20x", () => {
      const policyEngine = AgentPolicyEngine.getInstance();
      const plan: ITradeExecutionPlan = {
        executionId: "e1",
        decisionId: "d1",
        idempotencyKey: "k1",
        symbol: "BTCUSDT",
        executionMode: "PAPER",
        side: "BUY",
        orderType: "MARKET",
        quantity: 1,
        entryPrice: 50000,
        leverage: 50, // exceeds 20x cap
        stopLoss: 49000,
        takeProfit: 52000,
        status: "PENDING",
      };

      const result = policyEngine.validateExecution(plan, 100000);
      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.includes("LEVERAGE_VIOLATION"))).toBe(true);
    });

    it("should reject orders exceeding available balance", () => {
      const policyEngine = AgentPolicyEngine.getInstance();
      const plan: ITradeExecutionPlan = {
        executionId: "e1",
        decisionId: "d1",
        idempotencyKey: "k1",
        symbol: "BTCUSDT",
        executionMode: "PAPER",
        side: "BUY",
        orderType: "MARKET",
        quantity: 10,
        entryPrice: 50000,
        leverage: 1,
        stopLoss: 49000,
        takeProfit: 52000,
        status: "PENDING",
      };

      const result = policyEngine.validateExecution(plan, 5000);
      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.includes("INSUFFICIENT_FUNDS"))).toBe(true);
    });
  });

  describe("7. Decision Coordinator & Multi-Model Synthesis", () => {
    it("should produce a valid canonical decision for BTCUSDT", async () => {
      const decisionCoordinator = AgentDecisionCoordinator.getInstance();
      const decision = await decisionCoordinator.evaluate({
        symbol: "BTCUSDT",
        marketDomain: "CRYPTO",
        currentPrice: 85000,
        ohlcBars: [
          { open: 84000, high: 85500, low: 83800, close: 85000, volume: 1200 },
          { open: 84500, high: 85600, low: 84200, close: 85200, volume: 1500 },
        ],
      });

      expect(decision.decisionId).toBeDefined();
      expect(decision.symbol).toBe("BTCUSDT");
      expect(["CALL", "HOLD", "REJECT", "WAIT", "ESCALATE"]).toContain(decision.action);
      expect(["LONG", "SHORT", "HOLD"]).toContain(decision.direction);
      expect(decision.expectedValue).toBeDefined();
      expect(decision.bayesianEvidence).toBeDefined();
      expect(decision.modelVotes.length).toBeGreaterThan(0);
      expect(decision.ensembleResult).toBeDefined();
    });
  });

  describe("8. Recovery Manager & Circuit Breaker", () => {
    it("should trip circuit breaker after threshold failures and transition back upon recovery", () => {
      const recovery = AgentRecoveryManager.getInstance();
      const service = "quant_engine";

      // Initially closed
      expect(recovery.isAvailable(service)).toBe(true);

      // Record failures
      recovery.recordFailure(service, "Test timeout 1");
      recovery.recordFailure(service, "Test timeout 2");
      recovery.recordFailure(service, "Test timeout 3");

      const cb = AgentStateManager.getInstance().getCircuitBreaker(service);
      expect(cb.state).toBe("OPEN");

      // Record recovery
      AgentStateManager.getInstance().updateCircuitBreaker(service, "HALF_OPEN", 0);
      recovery.recordSuccess(service);
      recovery.recordSuccess(service);

      const cbRecovered = AgentStateManager.getInstance().getCircuitBreaker(service);
      expect(cbRecovered.state).toBe("CLOSED");
    });
  });
});
