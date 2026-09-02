/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Forward Outcome Telemetry Schema (Phase 2 & 3)
 * ═══════════════════════════════════════════════════════════════════
 * Durable append-only record of realized trading / prediction outcomes.
 * Linked to AQEAForwardDecision by unique decisionId.
 * Enforces temporal invariant: resolvedTimestamp > decisionTimestamp.
 */

import mongoose, { Schema, Document } from "mongoose";

export interface ICostBreakdown {
  fees: number;
  slippage: number;
  spread: number;
  marketImpact: number;
  totalCost: number;
}

export interface IAQEAForwardOutcome extends Document {
  decisionId: string;
  decisionTimestamp: number;
  entryTimestamp: number;
  entryPrice: number;
  exitTimestamp: number;
  exitPrice: number;
  realizedDirection: "LONG" | "SHORT" | "HOLD";
  realizedReturn: number;
  realizedPnL: number;
  mfe: number;
  mae: number;
  holdingDurationMs: number;
  actualClass: string;
  winLoss: "WIN" | "LOSS" | "BREAKEVEN";
  directionCorrect: boolean;
  costActuallyIncurred: ICostBreakdown;
  resolvedTimestamp: number;
  createdAt: Date;
}

const AQEAForwardOutcomeSchema: Schema = new Schema({
  decisionId: { type: String, required: true, unique: true },
  decisionTimestamp: { type: Number, required: true, index: true },
  entryTimestamp: { type: Number, required: true },
  entryPrice: { type: Number, required: true },
  exitTimestamp: { type: Number, required: true, index: true },
  exitPrice: { type: Number, required: true },
  realizedDirection: { type: String, enum: ["LONG", "SHORT", "HOLD"], required: true },
  realizedReturn: { type: Number, required: true },
  realizedPnL: { type: Number, required: true },
  mfe: { type: Number, default: 0 },
  mae: { type: Number, default: 0 },
  holdingDurationMs: { type: Number, default: 0 },
  actualClass: { type: String, default: "UNKNOWN" },
  winLoss: { type: String, enum: ["WIN", "LOSS", "BREAKEVEN"], required: true, index: true },
  directionCorrect: { type: Boolean, required: true },
  costActuallyIncurred: {
    fees: { type: Number, default: 0 },
    slippage: { type: Number, default: 0 },
    spread: { type: Number, default: 0 },
    marketImpact: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 }
  },
  resolvedTimestamp: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true,
  versionKey: false
});

AQEAForwardOutcomeSchema.index({ resolvedTimestamp: -1 });

export const AQEAForwardOutcome = (mongoose?.models && mongoose.models.AQEAForwardOutcome) ||
  (mongoose?.model && mongoose.model<IAQEAForwardOutcome>("AQEAForwardOutcome", AQEAForwardOutcomeSchema)) ||
  ({} as any);
