/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI OPERATIONS — TYPE DEFINITIONS & CONTRACTS
 * ═══════════════════════════════════════════════════════════════════
 * Strict schemas for Agent Proposals, Tools, Policy Engine,
 * Audit Trails, Memory, and Deterministic Boundaries.
 */

// ── Human Override & Operational Modes ─────────────────────────
export type HumanOverrideMode = "MANUAL" | "ASSISTED" | "AUTO" | "EMERGENCY_STOP";

// ── Agent Lifecycle States ────────────────────────────────────
export type AgentState =
  | "INITIALIZING"
  | "READY"
  | "OBSERVING"
  | "EVALUATING"
  | "PROPOSING"
  | "IDLE"
  | "DEGRADED"
  | "ERROR"
  | "STOPPED";

// ── Agent Roles ───────────────────────────────────────────────
export type AgentRole =
  | "MARKET_AGENT"
  | "STRATEGY_AGENT"
  | "RESEARCH_AGENT"
  | "RISK_AGENT"
  | "POSITION_AGENT"
  | "PORTFOLIO_AGENT"
  | "EXECUTION_AGENT"
  | "RECONCILIATION_AGENT"
  | "OPERATIONS_AGENT";

// ── Agent Permissions ─────────────────────────────────────────
export type AgentPermission =
  | "READ_ONLY"
  | "READ_PROPOSE"
  | "READ_VETO"
  | "PROPOSE_EXECUTION"
  | "READ_PROPOSE_CORRECTION"
  | "READ_SAFE_OPERATIONS";

// ── Significant Market & System Event Types ────────────────────
export type AgentEventType =
  | "SIGNIFICANT_PRICE_MOVE"
  | "PRICE_BREAKOUT"
  | "TARGET_APPROACHING"
  | "TARGET_HIT"
  | "STOP_APPROACHING"
  | "VOLATILITY_CHANGE"
  | "POSITION_CHANGE"
  | "POSITION_OPENED"
  | "POSITION_UPDATED"
  | "ORDER_FILLED"
  | "ORDER_REJECTED"
  | "RISK_THRESHOLD"
  | "MARKET_REGIME_CHANGE"
  | "BROKER_STATE_CHANGE"
  | "BROKER_DISCONNECTED"
  | "BROKER_RECONNECTED"
  | "RECONCILIATION_MISMATCH"
  | "SYSTEM_WARNING"
  | "SYSTEM_FAILURE"
  | "HEARTBEAT";

export interface IAgentEvent<T = any> {
  eventId: string;
  type: AgentEventType;
  source: string;
  timestamp: number;
  correlationId: string;
  symbol?: string;
  market?: "INDIA" | "CRYPTO";
  payload: T;
}

// ── Action Proposal Model (Requirement 6) ─────────────────────
export interface IActionProposal {
  actionId: string;
  agentId: string;
  accountId: string;
  positionId?: string;
  instrument: string;
  action: "BUY" | "SELL" | "EXIT" | "HOLD" | "REDUCE" | "PAUSE" | "RECONCILE";
  side?: "BUY" | "SELL";
  quantity: number;
  orderType: "MARKET" | "LIMIT";
  price?: number;
  triggerPrice?: number;
  reason: string;
  confidence: number; // 0.0 to 1.0
  timestamp: number;
  strategyId: string;
  market?: "INDIA" | "CRYPTO";
  accountType?: string;
  mode?: "PAPER" | "LIVE";
  stopLoss?: number;
  target?: number;
  expectedValue?: number;
  contextVersion?: string;
  modelVersion?: string;
  riskSnapshot: {
    dailyLoss: number;
    availableCapital: number;
    openPositions: number;
    currentDrawdown: number;
    portfolioExposure: number;
  };
  metadata?: Record<string, any>;
}

// ── Structured Agent Decision Output (Requirement 18) ─────────
export interface IStructuredAgentDecision {
  decision: "BUY" | "SELL" | "EXIT" | "HOLD" | "REDUCE" | "PAUSE" | "RECONCILE";
  confidence: number;
  rationale: string;
  proposed_quantity: number;
  risk_assessment: string;
  required_tools: string[];
  blockingReason?: string;
}

// ── Safe Tool Contracts (Requirement 4 & 36) ──────────────────
export interface IToolSchema<TParams = any, TResult = any> {
  name: string;
  description: string;
  allowedRoles: AgentRole[];
  rateLimitPerMinute: number;
  timeoutMs: number;
  execute: (params: TParams, callerRole: AgentRole) => Promise<TResult>;
}

// ── Policy Engine Validation Result (Requirement 7) ───────────
export interface IPolicyValidationResult {
  allowed: boolean;
  actionId: string;
  reason: string;
  violatedRules: string[];
  sanitizedQuantity?: number;
  executionMode: "PAPER" | "LIVE" | "SHADOW";
  timestamp: number;
}

// ── Agent Memory Snapshots (Requirement 10 & 11) ──────────────
export interface IAgentContextSnapshot {
  marketContext: {
    symbol: string;
    ltp: number;
    atr: number;
    adx: number;
    regime: string;
    volatility: string;
    isFresh: boolean;
    tickAgeMs: number;
  };
  positionContext: {
    openPositionsCount: number;
    activePositions: Array<{
      tradeId: string;
      symbol: string;
      quantity: number;
      entryPrice: number;
      unrealizedPnl: number;
      targetPrice?: number;
      stopLossPrice?: number;
    }>;
  };
  riskContext: {
    dailyLoss: number;
    maxDailyLossLimit: number;
    usedMargin: number;
    availableMargin: number;
    portfolioHeatPercent: number;
    killSwitchActive: boolean;
  };
  accountContext: {
    accountId: string;
    accountType: string;
    tradingMode: "PAPER" | "LIVE";
  };
  strategyContext: {
    strategyId: string;
    recentWinRate: number;
    activeSignalsCount: number;
  };
  systemHealth: {
    brokerConnected: boolean;
    databaseHealthy: boolean;
    marketDataFresh: boolean;
    reconciliationStatus: "VERIFIED" | "MISMATCH";
    agentStatus: "HEALTHY" | "DEGRADED";
  };
}

// ── Decision Audit Record (Requirement 19 & 20) ───────────────
export interface IAgentDecisionRecord {
  auditId: string;
  timestamp: number;
  agentId: string;
  role: AgentRole;
  model: string;
  modelVersion: string;
  promptVersion: string;
  inputEvent: IAgentEvent;
  contextSnapshot: IAgentContextSnapshot;
  structuredDecision: IStructuredAgentDecision;
  proposal?: IActionProposal;
  policyResult?: IPolicyValidationResult;
  riskVeto?: {
    vetoed: boolean;
    reason?: string;
  };
  finalDecision: "APPROVED" | "REJECTED" | "SHADOW_RECORDED" | "DEGRADED_FALLBACK";
  executionResult?: {
    orderPlaced: boolean;
    orderId?: string;
    fillPrice?: number;
    error?: string;
  };
}

// ── Shadow Mode Comparison (Requirement 30) ───────────────────
export interface IShadowComparisonRecord {
  shadowId: string;
  timestamp: number;
  symbol: string;
  aiProposal: IActionProposal;
  deterministicBaseline: {
    signal: string;
    actionTaken: string;
  };
  actualMarketOutcome?: {
    priceAfter1m?: number;
    priceAfter5m?: number;
    simulatedPnL?: number;
  };
}

// ── Model Routing & Tiers (Phase 9 Requirement 12) ────────────
export type ModelTier = "FAST_MODEL" | "REASONING_MODEL" | "SPECIALIZED_MODEL" | "FALLBACK_MODEL";

export interface IModelRoutingConfig {
  taskType: string;
  primaryTier: ModelTier;
  fallbackTier: ModelTier;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

export interface IModelTelemetry {
  callId: string;
  provider: "INTERNAL_QUANT" | "ANTHROPIC" | "OPENAI" | "DEEPSEEK" | "DETERMINISTIC_FALLBACK";
  modelName: string;
  modelVersion: string;
  promptVersion: string;
  tier: ModelTier;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  timestamp: number;
}

// ── Conflict Resolution Hierarchy (Phase 9 Requirement 16) ────
export enum ConflictPriorityLevel {
  LEVEL_0_EMERGENCY_STOP = 0,
  LEVEL_1_HARD_RISK_LIMIT = 1,
  LEVEL_2_BROKER_SAFETY = 2,
  LEVEL_3_POSITION_PROTECTION = 3,
  LEVEL_4_PORTFOLIO_RISK = 4,
  LEVEL_5_POLICY_ENGINE = 5,
  LEVEL_6_STRATEGY_SIGNAL = 6,
  LEVEL_7_AI_OPTIMIZATION = 7,
}

// ── Agent Registration & Metadata (Phase 9 Requirement 3) ─────
export interface IAgentRegistration {
  agentId: string;
  name: string;
  role: AgentRole;
  version: string;
  enabled: boolean;
  status: AgentState;
  capabilities: string[];
  permissions: AgentPermission;
  subscribedEvents: AgentEventType[];
  allowedTools: string[];
  modelPolicy: {
    preferredTier: ModelTier;
    maxIterations: number;
    timeoutMs: number;
    cooldownMs: number;
  };
  health: {
    lastHeartbeat: number;
    lastExecution: number;
    errorCount: number;
    consecutiveFailures: number;
    averageLatencyMs: number;
  };
}

// ── Proposal Approval & Operator Control (Phase 9 Requirement 17) ─
export interface IActionProposalApproval {
  proposalId: string;
  actionId: string;
  status: "PENDING_APPROVAL" | "OPERATOR_APPROVED" | "OPERATOR_REJECTED" | "AUTO_APPROVED" | "AUTO_REJECTED";
  proposal: IActionProposal;
  policyResult: IPolicyValidationResult;
  reviewedBy?: string;
  reviewedAt?: number;
  rejectionReason?: string;
}

