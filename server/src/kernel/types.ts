/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — TYPE DEFINITIONS & CONTRACTS
 * ═══════════════════════════════════════════════════════════════════
 * Central type definitions for the Agent Kernel architecture.
 */

// ── Control Modes ─────────────────────────────────────────────
export type ControlMode = "AI_AUTONOMOUS" | "MANUAL" | "SAFE";

// ── Agent Lifecycle States ────────────────────────────────────
export type AgentState =
  | "REGISTERING"
  | "INITIALIZING"
  | "READY"
  | "OBSERVING"
  | "PLANNING"
  | "EXECUTING"
  | "VERIFYING"
  | "IDLE"
  | "DEGRADED"
  | "RECOVERING"
  | "FAILED"
  | "STOPPED";

// ── Priority Classes ──────────────────────────────────────────
export enum PriorityClass {
  P0_SAFETY = 0,       // System safety, emergency stop, risk bounds
  P1_EXECUTION = 1,    // Live/Paper trade execution, fills, cancellation
  P2_DECISION = 2,     // Symbol evaluation, ensemble, Bayesian evidence
  P3_PERFORMANCE = 3,  // Latency monitoring, service discovery, health
  P4_LEARNING = 4,     // Attribution, model scorecard, offline training
  P5_ANALYTICS = 5,    // Reporting, historical aggregations, stats
}

// ── Event Types ───────────────────────────────────────────────
export type KernelEventType =
  | "MARKET_UPDATE"
  | "FEATURES_READY"
  | "MODEL_READY"
  | "MODEL_FAILED"
  | "MODEL_TIMEOUT"
  | "MODEL_DISAGREEMENT"
  | "OPPORTUNITY_DETECTED"
  | "DECISION_CREATED"
  | "RISK_APPROVED"
  | "RISK_REJECTED"
  | "EXECUTION_REQUESTED"
  | "EXECUTION_APPROVED"
  | "ORDER_SUBMITTED"
  | "ORDER_FILLED"
  | "ORDER_REJECTED"
  | "OUTCOME_AVAILABLE"
  | "AGENT_STARTED"
  | "AGENT_STOPPED"
  | "AGENT_FAILED"
  | "AGENT_RECOVERED"
  | "SYSTEM_DEGRADED"
  | "SYSTEM_RECOVERED"
  | "SAFE_MODE_ENTERED"
  | "CONTROL_MODE_CHANGED"
  | "EMERGENCY_STOP_TRIGGERED";

export interface IKernelEvent<T = any> {
  eventId: string;
  type: KernelEventType;
  source: string;
  timestamp: number;
  correlationId: string;
  causationId?: string;
  decisionId?: string;
  executionId?: string;
  symbol?: string;
  payload: T;
  schemaVersion: string;
}

// ── Tool Contracts ────────────────────────────────────────────
export type ToolCapability =
  | "READ_MARKET"
  | "COMPUTE_FEATURES"
  | "RUN_MODEL"
  | "READ_RISK"
  | "EVALUATE_RISK"
  | "CREATE_DECISION"
  | "PAPER_EXECUTION"
  | "LIVE_EXECUTION"
  | "RECORD_TELEMETRY"
  | "SYSTEM_MANAGEMENT";

export interface IToolDefinition<TInput = any, TOutput = any> {
  toolId: string;
  description: string;
  requiredCapability: ToolCapability;
  timeoutMs: number;
  retryPolicy: { maxRetries: number; backoffMs: number };
  hasSideEffects: boolean;
  validateInput?: (input: TInput) => boolean;
  execute: (input: TInput, context: IAgentExecutionContext) => Promise<TOutput>;
}

// ── Goal & Plan Contracts ─────────────────────────────────────
export type GoalStatus = "PENDING" | "PLANNING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED";

export interface IGoal {
  goalId: string;
  type: string;
  priority: PriorityClass;
  source: string;
  createdAt: number;
  deadline: number;
  symbol?: string;
  context: Record<string, any>;
  status: GoalStatus;
  correlationId: string;
  retryCount: number;
  maxRetries: number;
  result?: any;
  error?: string;
}

export type PlanExecutionPath = "FAST_PATH" | "REASONING_PATH";

export interface IPlanStep {
  stepId: string;
  order: number;
  name: string;
  agentId: string;
  toolId: string;
  input: any;
  deadline: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
  result?: any;
  error?: string;
  durationMs?: number;
}

export interface IExecutionPlan {
  planId: string;
  goalId: string;
  correlationId: string;
  symbol?: string;
  path: PlanExecutionPath;
  createdAt: number;
  deadline: number;
  steps: IPlanStep[];
  status: "CREATED" | "RUNNING" | "COMPLETED" | "FAILED" | "EXPIRED";
  reasoning?: string;
}

// ── Canonical Model Output ────────────────────────────────────
export interface ICanonicalModelOutput {
  modelId: string;
  modelVersion: string;
  direction: "LONG" | "SHORT" | "HOLD";
  probabilities: {
    pLong: number;
    pShort: number;
    pHold: number;
  };
  confidence: number; // 0..1
  inferenceMode: "REAL" | "FALLBACK" | "CALIBRATED";
  status: "SUCCESS" | "TIMEOUT" | "UNAVAILABLE" | "INVALID_RESPONSE";
  latencyMs: number;
  featureSchemaVersion: string;
  meta?: Record<string, any>;
}

// ── Decision Contracts ────────────────────────────────────────
export type DecisionAction = "CALL" | "HOLD" | "REJECT" | "WAIT" | "ESCALATE";

export interface IKernelDecision {
  decisionId: string;
  correlationId: string;
  symbol: string;
  marketDomain: "CRYPTO" | "INDIAN";
  timestamp: number;
  action: DecisionAction;
  direction: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  expectedValue: {
    grossEV: number;
    netEV: number;
    lcbNetEV: number;
    frictionCost: number;
  };
  bayesianEvidence: {
    prior: number;
    posterior: number;
    evidenceStrength: "STRONG" | "MODERATE" | "NEUTRAL" | "INSUFFICIENT";
  };
  modelVotes: ICanonicalModelOutput[];
  ensembleResult: {
    rawScore: number;
    calibratedScore: number;
    agreement: number;
    entropy: number;
  };
  riskEvaluation: {
    approved: boolean;
    positionSize: number;
    leverage: number;
    stopLoss: number;
    takeProfit: number;
    portfolioHeat: number;
    currentDrawdown: number;
    blockingGate?: string;
  };
  failedGates: string[];
  firstBlockingGate?: string;
  explanation: string;
}

// ── Execution Plan ────────────────────────────────────────────
export interface ITradeExecutionPlan {
  executionId: string;
  decisionId: string;
  idempotencyKey: string;
  symbol: string;
  executionMode: "PAPER" | "LIVE";
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT";
  quantity: number;
  entryPrice: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  status: "PENDING" | "SUBMITTED" | "FILLED" | "REJECTED" | "CANCELLED";
  submittedAt?: number;
  filledAt?: number;
  avgFillPrice?: number;
  reconciliationStatus?: "VERIFIED" | "DISCREPANCY" | "PENDING";
}

// ── Agent Contract ────────────────────────────────────────────
export interface IAgentContext {
  kernelVersion: string;
  controlMode: ControlMode;
  isEmergencyStopped: boolean;
  systemState: Record<string, any>;
}

export interface IAgentExecutionContext {
  goal: IGoal;
  plan: IExecutionPlan;
  step: IPlanStep;
  context: IAgentContext;
  traceId: string;
}

export interface IAgentObservation {
  symbol?: string;
  timestamp: number;
  data: Record<string, any>;
}

export interface IAgentObservationResult {
  valid: boolean;
  metrics: Record<string, any>;
  anomalyDetected?: boolean;
  anomalyReason?: string;
}

export interface IAgentPlanningContext {
  goal: IGoal;
  systemState: Record<string, any>;
  observations: IAgentObservationResult;
}

export interface IAgentExecutionResult {
  success: boolean;
  data: any;
  error?: string;
  durationMs: number;
}

export interface IAgentVerificationResult {
  verified: boolean;
  discrepancies?: string[];
  requiresCorrection: boolean;
}

export interface IAgentRecoveryResult {
  recovered: boolean;
  actionTaken: string;
  newStatus: AgentState;
}

export interface IAQEAAgent {
  id: string;
  name: string;
  version: string;
  capabilities: ToolCapability[];
  state: AgentState;
  lastHeartbeat: number;
  latencyMs: number;
  errorCount: number;

  initialize(context: IAgentContext): Promise<void>;
  observe(input: IAgentObservation): Promise<IAgentObservationResult>;
  plan(input: IAgentPlanningContext): Promise<IExecutionPlan>;
  executeStep(step: IPlanStep, execContext: IAgentExecutionContext): Promise<IAgentExecutionResult>;
  verify(result: IAgentExecutionResult): Promise<IAgentVerificationResult>;
  recover(error: Error): Promise<IAgentRecoveryResult>;
  shutdown(): Promise<void>;
}
