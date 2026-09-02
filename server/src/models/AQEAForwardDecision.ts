/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Forward Decision Telemetry Schema (Phase 2 & 3)
 * ═══════════════════════════════════════════════════════════════════
 * Immutable persistent record of every ensemble decision made in PAPER / LIVE.
 * Indexed by decisionId, timestamp, symbol, marketDomain, regime.
 * Prevents look-ahead bias and retroactive probability modifications.
 */

import mongoose, { Schema, Document } from "mongoose";

export interface IModelDecisionBreakdown {
  modelName: string;
  modelFamily: string;
  inferenceMode: string;
  status: string;
  rawProbabilities: {
    LONG: number;
    SHORT: number;
    HOLD: number;
  };
  calibratedProbabilities?: {
    LONG: number;
    SHORT: number;
    HOLD: number;
  };
  direction: string;
  confidence: number;
  effectiveWeight: number;
  regimeFit?: number;
  dataQuality?: number;
  availability?: number;
  correlationPenalty?: number;
  incrementalContribution?: number;
  participating: boolean;
}

export interface IEnsembleDecisionSummary {
  probabilities: {
    LONG: number;
    SHORT: number;
    HOLD: number;
  };
  direction: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  agreementScore: number;
  tradeQualityScore: number;
  tradeQualityTier: string;
  uncertainty: number;
  bayesianConviction?: number;
  expectedGain?: number;
  expectedLoss?: number;
  expectedValue: number;
  fees: number;
  slippage: number;
  spread?: number;
  marketImpact?: number;
  netEV?: number;
  evGateResult: boolean;
  conformalResult?: boolean;
  riskResult?: boolean;
  finalDecision: "LONG" | "SHORT" | "HOLD";
}

export interface IAQEAForwardDecision extends Document {
  decisionId: string;
  timestamp: number;
  symbol: string;
  marketDomain: "CRYPTO" | "INDIAN";
  accountType: string;
  regime: string;
  featureVersion: number;
  decisionClass?: string;
  terminalState?: string;
  terminalReason?: string;
  isValidDecision?: boolean;
  qualificationState?: string;
  qualificationReason?: string;
  modelBreakdowns: Record<string, IModelDecisionBreakdown>;
  ensemble: IEnsembleDecisionSummary;
  createdAt: Date;
}

const AQEAForwardDecisionSchema: Schema = new Schema({
  decisionId: { type: String, required: true, unique: true, index: true },
  timestamp: { type: Number, required: true, index: true },
  symbol: { type: String, required: true, index: true },
  marketDomain: { type: String, enum: ["CRYPTO", "INDIAN"], required: true, index: true },
  accountType: { type: String, required: true },
  regime: { type: String, required: true, index: true },
  featureVersion: { type: Number, default: 2 },
  decisionClass: { type: String, index: true },
  terminalState: { type: String, index: true },
  terminalReason: { type: String },
  isValidDecision: { type: Boolean, default: true },
  qualificationState: { type: String, default: "QUALIFIED" },
  qualificationReason: { type: String },
  modelBreakdowns: { type: Schema.Types.Mixed, required: true },
  ensemble: {
    probabilities: {
      LONG: { type: Number, required: true },
      SHORT: { type: Number, required: true },
      HOLD: { type: Number, required: true }
    },
    direction: { type: String, enum: ["LONG", "SHORT", "HOLD"], required: true },
    confidence: { type: Number, required: true },
    agreementScore: { type: Number, required: true },
    tradeQualityScore: { type: Number, required: true },
    tradeQualityTier: { type: String, default: "STANDARD" },
    uncertainty: { type: Number, required: true },
    bayesianConviction: { type: Number },
    expectedGain: { type: Number },
    expectedLoss: { type: Number },
    expectedValue: { type: Number, required: true },
    fees: { type: Number, default: 0 },
    slippage: { type: Number, default: 0 },
    spread: { type: Number, default: 0 },
    marketImpact: { type: Number, default: 0 },
    netEV: { type: Number },
    evGateResult: { type: Boolean, default: true },
    conformalResult: { type: Boolean, default: true },
    riskResult: { type: Boolean, default: true },
    finalDecision: { type: String, enum: ["LONG", "SHORT", "HOLD"], required: true }
  },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true,
  versionKey: false
});

AQEAForwardDecisionSchema.index({ symbol: 1, timestamp: -1 });
AQEAForwardDecisionSchema.index({ marketDomain: 1, regime: 1, timestamp: -1 });

export const AQEAForwardDecision = (mongoose?.models && mongoose.models.AQEAForwardDecision) ||
  (mongoose?.model && mongoose.model<IAQEAForwardDecision>("AQEAForwardDecision", AQEAForwardDecisionSchema)) ||
  ({} as any);
