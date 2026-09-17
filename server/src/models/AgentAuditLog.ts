/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — AUDIT LOG & DECISION PERSISTENCE MODEL
 * ═══════════════════════════════════════════════════════════════════
 * Normalized MongoDB schema storing immutable records of:
 *  - AI decision evaluations
 *  - Trade proposals and policy results
 *  - Risk agent vetoes
 *  - Safe tool invocations
 *  - Model telemetry (provider, version, tokens, cost)
 * 
 * INVARIANT: Does NOT store or mutate authoritative financial balances or positions.
 */

import mongoose, { Schema, Document } from "mongoose";

export interface IAgentAuditLogDocument extends Document {
  auditId: string;
  timestamp: Date;
  agentId: string;
  role: string;
  modelIdentifier: string;
  modelVersion: string;
  promptVersion: string;
  eventType: string;
  symbol?: string;
  structuredDecision: {
    decision: string;
    confidence: number;
    rationale: string;
    proposed_quantity: number;
    risk_assessment: string;
  };
  proposal?: {
    actionId: string;
    instrument: string;
    action: string;
    quantity: number;
    price?: number;
    confidence: number;
    reason: string;
    strategyId: string;
  };
  policyResult?: {
    allowed: boolean;
    reason: string;
    violatedRules: string[];
    executionMode: string;
  };
  riskVeto?: {
    vetoed: boolean;
    reason?: string;
  };
  finalDecision: string;
  executionResult?: {
    orderPlaced: boolean;
    orderId?: string;
    fillPrice?: number;
    error?: string;
  };
  createdAt: Date;
}

const AgentAuditLogSchema = new Schema<IAgentAuditLogDocument>(
  {
    auditId: { type: String, required: true, unique: true, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    agentId: { type: String, required: true, index: true },
    role: { type: String, required: true, index: true },
    modelIdentifier: { type: String, required: true },
    modelVersion: { type: String, required: true },
    promptVersion: { type: String, required: true },
    eventType: { type: String, required: true, index: true },
    symbol: { type: String, index: true },
    structuredDecision: {
      decision: { type: String, required: true },
      confidence: { type: Number, required: true },
      rationale: { type: String, required: true },
      proposed_quantity: { type: Number, default: 0 },
      risk_assessment: { type: String, default: "" },
    },
    proposal: {
      actionId: { type: String },
      instrument: { type: String },
      action: { type: String },
      quantity: { type: Number },
      price: { type: Number },
      confidence: { type: Number },
      reason: { type: String },
      strategyId: { type: String },
    },
    policyResult: {
      allowed: { type: Boolean },
      reason: { type: String },
      violatedRules: [{ type: String }],
      executionMode: { type: String },
    },
    riskVeto: {
      vetoed: { type: Boolean, default: false },
      reason: { type: String },
    },
    finalDecision: { type: String, required: true, index: true },
    executionResult: {
      orderPlaced: { type: Boolean, default: false },
      orderId: { type: String },
      fillPrice: { type: Number },
      error: { type: String },
    },
  },
  {
    timestamps: true,
    collection: "agent_audit_logs",
  }
);

// Compound index for querying audit history by symbol and time
AgentAuditLogSchema.index({ symbol: 1, timestamp: -1 });
AgentAuditLogSchema.index({ agentId: 1, timestamp: -1 });

export const AgentAuditLog = mongoose.models.AgentAuditLog || mongoose.model<IAgentAuditLogDocument>("AgentAuditLog", AgentAuditLogSchema);
