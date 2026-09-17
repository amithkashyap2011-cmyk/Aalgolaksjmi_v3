/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — CENTRAL AGENT KERNEL & CONTROL PLANE
 * ═══════════════════════════════════════════════════════════════════
 * Central coordinator for all specialized agents, safe tools, policy
 * engine, model routing, event routing, conflict resolution, and
 * deterministic financial execution layer.
 * 
 * CORE LAWS & BOUNDARIES:
 *  1. AI NEVER bypasses the deterministic execution chain:
 *     AI PROPOSAL -> POLICY ENGINE -> RISK ENGINE -> ORDER VALIDATOR 
 *     -> IDEMPOTENCY -> ORDER ENGINE -> BROKER -> AUTHORITATIVE LEDGER.
 *  2. High AI confidence (even 99.9%) NEVER overrides deterministic limits.
 *  3. Two-Speed Architecture: Sub-microsecond tick processing (SL/Target)
 *     runs deterministically; AI reasoning runs asynchronously on events.
 *  4. Fail-Safe: If AI fails or times out, deterministic trading continues safely.
 *  5. Conflict Resolution: Hard safety limits unconditionally veto strategy proposals.
 */

import {
  AgentRole,
  HumanOverrideMode,
  IAgentEvent,
  IActionProposal,
  IPolicyValidationResult,
  IAgentDecisionRecord,
  IStructuredAgentDecision,
  IActionProposalApproval,
  IAgentRegistration
} from "./types.js";

// Specialist Agents
import { MarketAgent } from "./agents/MarketAgent.js";
import { StrategyAgent } from "./agents/StrategyAgent.js";
import { RiskAgent } from "./agents/RiskAgent.js";
import { PositionAgent } from "./agents/PositionAgent.js";
import { PortfolioAgent } from "./agents/PortfolioAgent.js";
import { ExecutionAgent } from "./agents/ExecutionAgent.js";
import { ReconciliationAgent } from "./agents/ReconciliationAgent.js";
import { OperationsAgent } from "./agents/OperationsAgent.js";

// Core Subsystems
import { AgentRegistry } from "./registry/AgentRegistry.js";
import { AgentEventRouter } from "./events/AgentEventRouter.js";
import { AgentModelRouter } from "./models/AgentModelRouter.js";
import { AgentConflictResolver } from "./governance/AgentConflictResolver.js";
import { AgentFailureManager } from "./resilience/AgentFailureManager.js";
import { AgentScheduler } from "./scheduler/AgentScheduler.js";
import { AgentPolicyEngine } from "./policy/AgentPolicyEngine.js";
import { AgentContextBuilder } from "./context/AgentContextBuilder.js";
import { AgentMemory } from "./memory/AgentMemory.js";
import { AgentGovernance } from "./governance/AgentGovernance.js";
import { AgentDecisionAudit } from "./audit/AgentDecisionAudit.js";
import { AgentShadowSandbox } from "./sandbox/AgentShadowSandbox.js";

// Deterministic Financial Services & Safety Boundaries
import { AuthoritativeLedger } from "../indianMarket/authoritativeLedger.js";
import { AutoPilotStateMachine } from "../indianMarket/autoPilotStateMachine.js";
import { TradingKillSwitch } from "../indianMarket/security/tradingKillSwitch.js";
import { IndianRiskManager } from "../indianMarket/riskManager.js";
import { OrderValidator } from "../indianMarket/security/orderValidator.js";
import { FinancialTruthBoundary, FinancialTruthViolationError } from "../financialTruthBoundary.js";
import { MarketIsolationGuard } from "../market/MarketIsolationGuard.js";

export class AgentKernel {
  private static instance: AgentKernel;
  private isInitialized = false;

  // ── Financial Mutation Barrier (Section 3) ───────────────────
  public static assertDirectMutationForbidden(action: string): never {
    throw new Error(
      `[SECURITY_VIOLATION:AGENT_KERNEL_CANNOT_MUTATE_FINANCIAL_STATE] Agent Kernel and autonomous agents are strictly prohibited from directly executing '${action}'. Agents may only submit structured IActionProposal via PolicyEngine and RiskGovernor.`
    );
  }

  // Specialist Agents
  private marketAgent: MarketAgent;
  private strategyAgent: StrategyAgent;
  private riskAgent: RiskAgent;
  private positionAgent: PositionAgent;
  private portfolioAgent: PortfolioAgent;
  private executionAgent: ExecutionAgent;
  private reconciliationAgent: ReconciliationAgent;
  private operationsAgent: OperationsAgent;

  // Autonomous Control Plane Subsystems
  private registry: AgentRegistry;
  private eventRouter: AgentEventRouter;
  private modelRouter: AgentModelRouter;
  private conflictResolver: AgentConflictResolver;
  private failureManager: AgentFailureManager;
  private scheduler: AgentScheduler;
  private policyEngine: AgentPolicyEngine;
  private contextBuilder: AgentContextBuilder;
  private memory: AgentMemory;
  private governance: AgentGovernance;
  private audit: AgentDecisionAudit;
  private sandbox: AgentShadowSandbox;

  // Pending Proposals Store for ASSISTED Mode
  private pendingProposals: Map<string, IActionProposalApproval> = new Map();
  private boundEventHandler?: (event: IAgentEvent) => Promise<void>;

  private constructor() {
    this.marketAgent = new MarketAgent();
    this.strategyAgent = new StrategyAgent();
    this.riskAgent = new RiskAgent();
    this.positionAgent = new PositionAgent();
    this.portfolioAgent = new PortfolioAgent();
    this.executionAgent = new ExecutionAgent();
    this.reconciliationAgent = new ReconciliationAgent();
    this.operationsAgent = new OperationsAgent();

    this.registry = AgentRegistry.getInstance();
    this.eventRouter = AgentEventRouter.getInstance();
    this.modelRouter = AgentModelRouter.getInstance();
    this.conflictResolver = AgentConflictResolver.getInstance();
    this.failureManager = AgentFailureManager.getInstance();
    this.scheduler = AgentScheduler.getInstance();
    this.policyEngine = AgentPolicyEngine.getInstance();
    this.contextBuilder = AgentContextBuilder.getInstance();
    this.memory = AgentMemory.getInstance();
    this.governance = AgentGovernance.getInstance();
    this.audit = AgentDecisionAudit.getInstance();
    this.sandbox = AgentShadowSandbox.getInstance();
  }

  public static getInstance(): AgentKernel {
    if (!AgentKernel.instance) {
      AgentKernel.instance = new AgentKernel();
    }
    return AgentKernel.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // 1. Initialize specialist agent instances
    await Promise.all([
      this.marketAgent.initialize(),
      this.strategyAgent.initialize(),
      this.riskAgent.initialize(),
      this.positionAgent.initialize(),
      this.portfolioAgent.initialize(),
      this.executionAgent.initialize(),
      this.reconciliationAgent.initialize(),
      this.operationsAgent.initialize(),
    ]);

    // 2. Register all 8 specialist agents into the Agent Registry
    this.registerAgentsIntoRegistry();

    // 3. Connect Event Router to Kernel Event Orchestrator
    if (!this.boundEventHandler) {
      this.boundEventHandler = async (event: IAgentEvent) => {
        if (!this.isInitialized) return;
        await this.processEvent(event);
      };
      this.eventRouter.subscribe("*", this.boundEventHandler);
    }

    // 4. Start background scheduler sweeps
    this.scheduler.start();

    this.isInitialized = true;
    console.log("[AGENT_KERNEL] Agentic AI Operations Layer successfully initialized with 8 specialist agents.");
  }

  private registerAgentsIntoRegistry(): void {
    const agentsData: Array<{ agent: any; role: AgentRole; name: string; permission: any }> = [
      { agent: this.marketAgent, role: "MARKET_AGENT", name: "Market State Specialist", permission: "READ_ONLY" },
      { agent: this.strategyAgent, role: "STRATEGY_AGENT", name: "Quantitative Strategy Specialist", permission: "READ_PROPOSE" },
      { agent: this.riskAgent, role: "RISK_AGENT", name: "Risk Assessment & Veto Specialist", permission: "READ_VETO" },
      { agent: this.positionAgent, role: "POSITION_AGENT", name: "Authoritative Position Specialist", permission: "READ_ONLY" },
      { agent: this.portfolioAgent, role: "PORTFOLIO_AGENT", name: "Portfolio Allocation Specialist", permission: "READ_PROPOSE" },
      { agent: this.executionAgent, role: "EXECUTION_AGENT", name: "Execution & Slicing Specialist", permission: "PROPOSE_EXECUTION" },
      { agent: this.reconciliationAgent, role: "RECONCILIATION_AGENT", name: "Broker Reconciliation Specialist", permission: "READ_PROPOSE_CORRECTION" },
      { agent: this.operationsAgent, role: "OPERATIONS_AGENT", name: "System Operations Specialist", permission: "READ_SAFE_OPERATIONS" },
    ];

    for (const item of agentsData) {
      this.registry.registerAgent(
        {
          agentId: item.agent.id,
          name: item.name,
          role: item.role,
          version: "2.1.0",
          enabled: true,
          status: "READY",
          capabilities: [item.role, "ANALYTICS"],
          permissions: item.permission,
          subscribedEvents: ["SIGNIFICANT_PRICE_MOVE", "PRICE_BREAKOUT", "ORDER_FILLED", "ORDER_REJECTED", "RISK_THRESHOLD"],
          allowedTools: item.agent.allowedTools || ["*"],
          modelPolicy: {
            preferredTier: item.role === "STRATEGY_AGENT" ? "REASONING_MODEL" : "FAST_MODEL",
            maxIterations: 3,
            timeoutMs: 1000,
            cooldownMs: 30000,
          },
          health: {
            lastHeartbeat: Date.now(),
            lastExecution: Date.now(),
            errorCount: 0,
            consecutiveFailures: 0,
            averageLatencyMs: 12.5,
          },
        },
        item.agent
      );
    }
  }

  // ── Human Override & Operating Modes (Requirements 17 & 27) ────
  public setHumanOverrideMode(mode: HumanOverrideMode, authorizedBy: string): void {
    this.policyEngine.setHumanOverrideMode(mode, authorizedBy);
  }

  public getHumanOverrideMode(): HumanOverrideMode {
    return this.policyEngine.getHumanOverrideMode();
  }

  public emergencyStop(authorizedBy: string = "EMERGENCY_TRIGGER"): void {
    this.policyEngine.setHumanOverrideMode("EMERGENCY_STOP", authorizedBy);
    TradingKillSwitch.disableTrading("ADMIN_MANUAL", "Agent Kernel Emergency Stop Triggered", authorizedBy);
    console.log(`[AGENT_KERNEL] EMERGENCY_STOP engaged by ${authorizedBy}. All autonomous trading halted.`);
  }

  // ── Agent Enable / Disable Controls (Requirement 25) ───────────
  public toggleAgent(agentId: string, enabled: boolean, authorizedBy: string) {
    return this.registry.setEnabled(agentId, enabled, authorizedBy);
  }

  public resetAgent(agentId: string, authorizedBy: string): boolean {
    this.failureManager.resetCircuitBreaker(agentId);
    return this.registry.resetAgentState(agentId, authorizedBy);
  }

  // ── Asynchronous Event-Driven Orchestration (Requirements 12 & 13) ──
  public async processEvent(event: IAgentEvent): Promise<{
    status: "PROCESSED" | "VETOED" | "REJECTED" | "SHADOW_RECORDED" | "PENDING_APPROVAL" | "DEGRADED";
    decision?: IStructuredAgentDecision;
    policyResult?: IPolicyValidationResult;
    auditId: string;
  }> {
    const correlationId = event.correlationId || `CORR_${Date.now()}`;
    const loopCheck = this.governance.enterCallChain(correlationId);
    if (!loopCheck.allowed) {
      return {
        status: "DEGRADED",
        auditId: `ERR_${Date.now()}`,
        policyResult: {
          allowed: false,
          actionId: "NONE",
          reason: loopCheck.reason || "Recursion Loop Exceeded",
          violatedRules: ["AGENT_RECURSION_DEPTH_EXCEEDED"],
          executionMode: "PAPER",
          timestamp: Date.now()
        }
      };
    }

    try {
      // 0. Enforce explicit market context isolation
      if (event.symbol && event.market) {
        MarketIsolationGuard.validateProposalMarketContext({
          market: event.market as any,
          instrument: event.symbol,
        });
      }

      // 1. Build bounded factual context snapshot
      const context = await this.contextBuilder.buildSnapshot(event.symbol || "NIFTY");

      // 2. Specialized Agent Reasoning (Protected by Resilience Manager & Timeout)
      const marketAssessment = await this.failureManager.executeWithResilience(
        this.marketAgent.id,
        () => this.marketAgent.evaluateWithTimeout(event, context, 1000),
        1000
      );

      const riskAssessment = await this.failureManager.executeWithResilience(
        this.riskAgent.id,
        () => this.riskAgent.evaluateWithTimeout(event, context, 1000),
        1000
      );

      const strategyDecision = await this.failureManager.executeWithResilience(
        this.strategyAgent.id,
        () => this.strategyAgent.evaluateWithTimeout(event, context, 1000),
        1000
      );

      // Record observation to short-term memory
      this.memory.recordObservation(
        `${event.type} on ${event.symbol || "NIFTY"}: Strategy=${strategyDecision.decision} (${strategyDecision.confidence})`
      );

      // 3. Handle Exit Recommendations
      if (strategyDecision.decision === "EXIT" && context.positionContext.openPositionsCount > 0) {
        const targetTrade = context.positionContext.activePositions[0];
        const proposal = this.strategyAgent.createProposal(
          targetTrade.symbol,
          "EXIT",
          targetTrade.quantity,
          targetTrade.entryPrice,
          strategyDecision.confidence,
          strategyDecision.rationale,
          context
        );
        proposal.positionId = targetTrade.tradeId;

        const policyResult = await this.policyEngine.evaluateProposal(proposal);
        const auditId = `AUDIT_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        this.audit.recordDecision({
          auditId,
          timestamp: Date.now(),
          agentId: this.strategyAgent.id,
          role: "STRATEGY_AGENT",
          model: "AALGO_QUANT_V2",
          modelVersion: "2.1.0",
          promptVersion: "PROMPT_V3",
          inputEvent: event,
          contextSnapshot: context,
          structuredDecision: strategyDecision,
          proposal,
          policyResult,
          finalDecision: policyResult.allowed ? "APPROVED" : "REJECTED"
        });

        return {
          status: policyResult.allowed ? "PROCESSED" : "REJECTED",
          decision: strategyDecision,
          policyResult,
          auditId
        };
      }

      // 4. Handle Entry Proposals
      if (strategyDecision.decision === "BUY") {
        const proposal = this.strategyAgent.createProposal(
          event.symbol || "NIFTY",
          "BUY",
          strategyDecision.proposed_quantity,
          context.marketContext.ltp,
          strategyDecision.confidence,
          strategyDecision.rationale,
          context
        );

        // Cooldown Deduplication
        const cooldownCheck = this.governance.checkCooldown(proposal);
        if (!cooldownCheck.allowed) {
          return {
            status: "REJECTED",
            decision: strategyDecision,
            auditId: `DEDUPE_${Date.now()}`,
            policyResult: {
              allowed: false,
              actionId: proposal.actionId,
              reason: cooldownCheck.reason!,
              violatedRules: ["PROPOSAL_COOLDOWN_ACTIVE"],
              executionMode: "PAPER",
              timestamp: Date.now()
            }
          };
        }

        // Conflict Resolution: Strategy Signal vs Risk Agent Veto
        const riskVeto = this.riskAgent.evaluateVeto(proposal, context);
        const conflictCheck = this.conflictResolver.evaluateStrategyAgainstRisk(strategyDecision, riskVeto);

        if (!conflictCheck.allowed) {
          const auditId = `VETO_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          this.audit.recordDecision({
            auditId,
            timestamp: Date.now(),
            agentId: this.riskAgent.id,
            role: "RISK_AGENT",
            model: "AALGO_RISK_V1",
            modelVersion: "1.0.0",
            promptVersion: "PROMPT_RISK_V1",
            inputEvent: event,
            contextSnapshot: context,
            structuredDecision: strategyDecision,
            proposal,
            riskVeto,
            finalDecision: "REJECTED"
          });

          return {
            status: "VETOED",
            decision: strategyDecision,
            auditId,
            policyResult: {
              allowed: false,
              actionId: proposal.actionId,
              reason: conflictCheck.reason,
              violatedRules: ["RISK_AGENT_VETO"],
              executionMode: "PAPER",
              timestamp: Date.now()
            }
          };
        }

        // Shadow Mode Routing (Requirement 30)
        const currentMode = this.policyEngine.getHumanOverrideMode();
        if (currentMode === "MANUAL") {
          this.sandbox.recordShadowDecision(proposal, "HOLD", "MANUAL_MODE_SHADOW_RECORDED");
          const auditId = `SHADOW_${Date.now()}`;
          return {
            status: "SHADOW_RECORDED",
            decision: strategyDecision,
            auditId
          };
        }

        // Unbypassable Deterministic Policy Engine
        const policyResult = await this.policyEngine.evaluateProposal(proposal);
        const auditId = `AUDIT_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        // ASSISTED Mode: Store pending approval for human review
        if (currentMode === "ASSISTED" && policyResult.allowed) {
          const approvalRecord: IActionProposalApproval = {
            proposalId: proposal.actionId,
            actionId: proposal.actionId,
            status: "PENDING_APPROVAL",
            proposal,
            policyResult,
          };
          this.pendingProposals.set(proposal.actionId, approvalRecord);

          return {
            status: "PENDING_APPROVAL",
            decision: strategyDecision,
            policyResult,
            auditId
          };
        }

        this.audit.recordDecision({
          auditId,
          timestamp: Date.now(),
          agentId: this.strategyAgent.id,
          role: "STRATEGY_AGENT",
          model: "AALGO_QUANT_V2",
          modelVersion: "2.1.0",
          promptVersion: "PROMPT_V3",
          inputEvent: event,
          contextSnapshot: context,
          structuredDecision: strategyDecision,
          proposal,
          policyResult,
          finalDecision: policyResult.allowed ? "APPROVED" : "REJECTED"
        });

        return {
          status: policyResult.allowed ? "PROCESSED" : "REJECTED",
          decision: strategyDecision,
          policyResult,
          auditId
        };
      }

      // Default HOLD decision
      const auditId = `HOLD_${Date.now()}`;
      return {
        status: "PROCESSED",
        decision: strategyDecision,
        auditId
      };
    } finally {
      this.governance.exitCallChain(correlationId);
    }
  }

  // ── Pending Proposal Approval / Rejection (ASSISTED Mode) ──────
  public getPendingProposals(): IActionProposalApproval[] {
    return Array.from(this.pendingProposals.values()).filter(p => p.status === "PENDING_APPROVAL");
  }

  public approveProposal(proposalId: string, authorizedBy: string): { success: boolean; message: string } {
    const item = this.pendingProposals.get(proposalId);
    if (!item) {
      return { success: false, message: `Proposal ${proposalId} not found` };
    }
    item.status = "OPERATOR_APPROVED";
    item.reviewedBy = authorizedBy;
    item.reviewedAt = Date.now();
    console.log(`[AGENT_KERNEL] Proposal ${proposalId} APPROVED by operator ${authorizedBy}`);
    return { success: true, message: `Proposal ${proposalId} approved for execution` };
  }

  public rejectProposal(proposalId: string, reason: string, authorizedBy: string): { success: boolean; message: string } {
    const item = this.pendingProposals.get(proposalId);
    if (!item) {
      return { success: false, message: `Proposal ${proposalId} not found` };
    }
    item.status = "OPERATOR_REJECTED";
    item.rejectionReason = reason;
    item.reviewedBy = authorizedBy;
    item.reviewedAt = Date.now();
    console.log(`[AGENT_KERNEL] Proposal ${proposalId} REJECTED by operator ${authorizedBy}: ${reason}`);
    return { success: true, message: `Proposal ${proposalId} rejected` };
  }

  // ── Observability & Monitoring Telemetry (Requirements 18 & 21) ──
  public getAgentStatusSummary() {
    const allRegistrations = this.registry.getAllRegistrations();
    return {
      kernelStatus: "ACTIVE",
      humanOverrideMode: this.policyEngine.getHumanOverrideMode(),
      agents: allRegistrations.map(r => ({
        agentId: r.agentId,
        name: r.name,
        role: r.role,
        version: r.version,
        enabled: r.enabled,
        status: r.status,
        permissions: r.permissions,
        modelTier: r.modelPolicy.preferredTier,
        latencyMs: r.health.averageLatencyMs,
        errors: r.health.errorCount,
        consecutiveFailures: r.health.consecutiveFailures,
        lastExecution: r.health.lastExecution,
      })),
      pendingProposalsCount: this.getPendingProposals().length,
      recentDecisionsCount: this.audit.getRecentDecisions().length,
      shadowPerformance: this.sandbox.getShadowPerformanceSummary(),
      modelCostTelemetry: this.modelRouter.getAggregatedCost(),
    };
  }

  public getAgent(role: AgentRole) {
    switch (role) {
      case "MARKET_AGENT": return this.marketAgent;
      case "STRATEGY_AGENT": return this.strategyAgent;
      case "RISK_AGENT": return this.riskAgent;
      case "POSITION_AGENT": return this.positionAgent;
      case "PORTFOLIO_AGENT": return this.portfolioAgent;
      case "EXECUTION_AGENT": return this.executionAgent;
      case "RECONCILIATION_AGENT": return this.reconciliationAgent;
      case "OPERATIONS_AGENT": return this.operationsAgent;
    }
  }

  public getRegistry(): AgentRegistry {
    return this.registry;
  }

  public getEventRouter(): AgentEventRouter {
    return this.eventRouter;
  }

  public getModelRouter(): AgentModelRouter {
    return this.modelRouter;
  }

  public getConflictResolver(): AgentConflictResolver {
    return this.conflictResolver;
  }

  public getFailureManager(): AgentFailureManager {
    return this.failureManager;
  }

  public getPolicyEngine(): AgentPolicyEngine {
    return this.policyEngine;
  }

  public getDecisionAudit(): AgentDecisionAudit {
    return this.audit;
  }

  public getShadowSandbox(): AgentShadowSandbox {
    return this.sandbox;
  }

  public getScheduler(): AgentScheduler {
    return this.scheduler;
  }

  public getGovernance(): AgentGovernance {
    return this.governance;
  }

  public stop(): void {
    this.isInitialized = false;
    this.scheduler.stop();
    this.eventRouter.clearQueue();
    if (this.boundEventHandler) {
      this.eventRouter.unsubscribe("*", this.boundEventHandler);
      this.boundEventHandler = undefined;
    }
  }
}
