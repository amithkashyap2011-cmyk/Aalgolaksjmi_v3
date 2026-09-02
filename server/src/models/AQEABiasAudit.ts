/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Bias Audit Vector & Anti-Bias Governance Schema
 * ═══════════════════════════════════════════════════════════════════
 * Persistent audit storage for the 14-dimension BiasAuditVector,
 * negative-control tests, and placebo/shadow evaluations.
 */

import mongoose, { Schema, Document } from "mongoose";

export type BiasSeverity = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BiasStatus = "OPTIMAL" | "MONITORING" | "PENALIZED" | "QUARANTINED" | "FAIL_CLOSED";

export interface IBiasDimensionAudit {
  name: string;
  status: BiasStatus;
  severity: BiasSeverity;
  score: number; // 0.0 (no bias) to 1.0 (extreme bias)
  evidence: string;
  sampleCount: number;
  lastUpdated: number;
  mitigation: string;
}

export interface IBiasAuditVector {
  lookAheadBias: IBiasDimensionAudit;
  survivorshipBias: IBiasDimensionAudit;
  selectionBias: IBiasDimensionAudit;
  classBias: IBiasDimensionAudit;
  directionBias: IBiasDimensionAudit;
  regimeBias: IBiasDimensionAudit;
  recencyBias: IBiasDimensionAudit;
  modelSelectionBias: IBiasDimensionAudit;
  correlationBias: IBiasDimensionAudit;
  calibrationBias: IBiasDimensionAudit;
  executionBias: IBiasDimensionAudit;
  liquidityBias: IBiasDimensionAudit;
  domainBias: IBiasDimensionAudit;
  promotionBias: IBiasDimensionAudit;
  humanBias: IBiasDimensionAudit;
}

export interface INegativeControlResult {
  testType: "RANDOM_SIGNALS" | "PERMUTED_LABELS" | "SHUFFLED_IDENTITIES" | "RANDOM_SUBSETS";
  timestamp: number;
  baselineNetEV: number;
  nullControlNetEV: number;
  pValPermutation: number;
  isPassed: boolean; // Production must be materially better than null control
}

export interface IPlaceboTestResult {
  candidateModel: string;
  championModel: string;
  candidateEV: number;
  championEV: number;
  randomBaselineEV: number;
  simpleBaselineEV: number;
  incrementalValue: number;
  isSuperior: boolean;
}

export interface IAQEABiasAudit extends Document {
  auditId: string;
  timestamp: number;
  overallBiasScore: number;
  biasVector: IBiasAuditVector;
  modelPenalties: Record<string, number>;
  negativeControls: INegativeControlResult[];
  placeboTests: IPlaceboTestResult[];
  governanceAction: "NO_ACTION" | "WEIGHT_PENALTY_APPLIED" | "LIVE_HALTED_CRITICAL_BIAS";
  createdAt: Date;
}

const BiasDimensionSchema = new Schema({
  name: { type: String, required: true },
  status: { type: String, required: true },
  severity: { type: String, enum: ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"], required: true },
  score: { type: Number, required: true },
  evidence: { type: String, required: true },
  sampleCount: { type: Number, required: true },
  lastUpdated: { type: Number, required: true },
  mitigation: { type: String, required: true }
}, { _id: false });

const NegativeControlSchema = new Schema({
  testType: { type: String, required: true },
  timestamp: { type: Number, required: true },
  baselineNetEV: { type: Number, required: true },
  nullControlNetEV: { type: Number, required: true },
  pValPermutation: { type: Number, required: true },
  isPassed: { type: Boolean, required: true }
}, { _id: false });

const PlaceboTestSchema = new Schema({
  candidateModel: { type: String, required: true },
  championModel: { type: String, required: true },
  candidateEV: { type: Number, required: true },
  championEV: { type: Number, required: true },
  randomBaselineEV: { type: Number, required: true },
  simpleBaselineEV: { type: Number, required: true },
  incrementalValue: { type: Number, required: true },
  isSuperior: { type: Boolean, required: true }
}, { _id: false });

const AQEABiasAuditSchema = new Schema({
  auditId: { type: String, required: true, unique: true, index: true },
  timestamp: { type: Number, required: true, index: true },
  overallBiasScore: { type: Number, required: true },
  biasVector: {
    lookAheadBias: { type: BiasDimensionSchema, required: true },
    survivorshipBias: { type: BiasDimensionSchema, required: true },
    selectionBias: { type: BiasDimensionSchema, required: true },
    classBias: { type: BiasDimensionSchema, required: true },
    directionBias: { type: BiasDimensionSchema, required: true },
    regimeBias: { type: BiasDimensionSchema, required: true },
    recencyBias: { type: BiasDimensionSchema, required: true },
    modelSelectionBias: { type: BiasDimensionSchema, required: true },
    correlationBias: { type: BiasDimensionSchema, required: true },
    calibrationBias: { type: BiasDimensionSchema, required: true },
    executionBias: { type: BiasDimensionSchema, required: true },
    liquidityBias: { type: BiasDimensionSchema, required: true },
    domainBias: { type: BiasDimensionSchema, required: true },
    promotionBias: { type: BiasDimensionSchema, required: true },
    humanBias: { type: BiasDimensionSchema, required: true }
  },
  modelPenalties: { type: Schema.Types.Mixed, default: {} },
  negativeControls: { type: [NegativeControlSchema], default: [] },
  placeboTests: { type: [PlaceboTestSchema], default: [] },
  governanceAction: {
    type: String,
    enum: ["NO_ACTION", "WEIGHT_PENALTY_APPLIED", "LIVE_HALTED_CRITICAL_BIAS"],
    default: "NO_ACTION"
  },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true,
  versionKey: false
});

AQEABiasAuditSchema.index({ timestamp: -1 });

export const AQEABiasAudit = (mongoose?.models && mongoose.models.AQEABiasAudit) ||
  (mongoose?.model && mongoose.model<IAQEABiasAudit>("AQEABiasAudit", AQEABiasAuditSchema)) ||
  ({} as any);
