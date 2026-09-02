/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Authoritative Decision Object Schema (Phase 3)
 * ═══════════════════════════════════════════════════════════════════
 * Single authoritative immutable decision object containing the
 * entire evidence trail, model breakdown, lower confidence bound EV,
 * uncertainty, risk gating, and execution decision.
 */

import mongoose, { Schema, Document } from "mongoose";
import { InferenceMode } from "../services/aqea/ai/IModelExpert.js";

export interface IModelPredictionRecord {
  modelName: string;
  modelFamily: string;
  inferenceMode: InferenceMode;
  rawProbabilities: { LONG: number; SHORT: number; HOLD: number };
  calibratedProbabilities: { LONG: number; SHORT: number; HOLD: number };
  direction: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  reliability: number;
  calibrationQuality: number;
  biasPenalty: number;
  correlationPenalty: number;
  effectiveWeight: number;
  participating: boolean;
  status: string;
}

export interface IAQEAAuthoritativeDecision extends Document {
  decisionId: string;
  timestamp: number;
  marketDomain: "CRYPTO" | "INDIAN";
  symbol: string;
  accountType: string;
  mode: "PAPER" | "LIVE";
  regime: string;
  featureVersion: number;
  inputSnapshotHash: string;

  allModelPredictions: Record<string, IModelPredictionRecord>;
  validatedPredictions: Record<string, IModelPredictionRecord>;
  effectiveModelCount: number;

  ensembleProbability: { P_BUY: number; P_HOLD: number; P_SELL: number };
  ensembleEntropy: number;
  ensembleAgreement: number;

  selectedSubset: string[];
  excludedModels: string[];
  excludedReasons: Record<string, string>;

  expectedGrossReturn: number;
  estimatedFees: number;
  estimatedSpread: number;
  estimatedSlippage: number;
  estimatedMarketImpact: number;
  expectedNetReturn: number;
  expectedLoss: number;
  riskAdjustedEV: number;
  EVConfidenceInterval: { lower: number; mean: number; upper: number };
  EVLowerConfidenceBound: number;

  conformalUncertainty: number;
  bayesianPosterior: number;
  riskOfRuin: number;

  finalDecision: "LONG" | "SHORT" | "NO_TRADE";
  noTradeReason: string | null;
  riskApproval: boolean;
  ppoSizing: number;
  executionDecision: {
    action: "ENTER_LONG" | "ENTER_SHORT" | "HOLD" | "EXIT_ALL";
    targetLeverage: number;
    positionSizeUSD: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    orderType: "MARKET" | "LIMIT";
  };

  createdAt: Date;
}

const ModelPredictionRecordSchema = new Schema({
  modelName: { type: String, required: true },
  modelFamily: { type: String, required: true },
  inferenceMode: { type: String, required: true },
  rawProbabilities: {
    LONG: { type: Number, required: true },
    SHORT: { type: Number, required: true },
    HOLD: { type: Number, required: true }
  },
  calibratedProbabilities: {
    LONG: { type: Number, required: true },
    SHORT: { type: Number, required: true },
    HOLD: { type: Number, required: true }
  },
  direction: { type: String, required: true },
  confidence: { type: Number, required: true },
  reliability: { type: Number, required: true },
  calibrationQuality: { type: Number, required: true },
  biasPenalty: { type: Number, default: 0 },
  correlationPenalty: { type: Number, default: 1 },
  effectiveWeight: { type: Number, required: true },
  participating: { type: Boolean, required: true },
  status: { type: String, required: true }
}, { _id: false });

const AQEAAuthoritativeDecisionSchema = new Schema({
  decisionId: { type: String, required: true, unique: true, index: true },
  timestamp: { type: Number, required: true, index: true },
  marketDomain: { type: String, enum: ["CRYPTO", "INDIAN"], required: true, index: true },
  symbol: { type: String, required: true, index: true },
  accountType: { type: String, required: true },
  mode: { type: String, enum: ["PAPER", "LIVE"], required: true },
  regime: { type: String, required: true, index: true },
  featureVersion: { type: Number, default: 2 },
  inputSnapshotHash: { type: String, required: true },

  allModelPredictions: { type: Schema.Types.Mixed, required: true },
  validatedPredictions: { type: Schema.Types.Mixed, required: true },
  effectiveModelCount: { type: Number, required: true },

  ensembleProbability: {
    P_BUY: { type: Number, required: true },
    P_HOLD: { type: Number, required: true },
    P_SELL: { type: Number, required: true }
  },
  ensembleEntropy: { type: Number, required: true },
  ensembleAgreement: { type: Number, required: true },

  selectedSubset: { type: [String], required: true },
  excludedModels: { type: [String], default: [] },
  excludedReasons: { type: Schema.Types.Mixed, default: {} },

  expectedGrossReturn: { type: Number, required: true },
  estimatedFees: { type: Number, required: true },
  estimatedSpread: { type: Number, required: true },
  estimatedSlippage: { type: Number, required: true },
  estimatedMarketImpact: { type: Number, required: true },
  expectedNetReturn: { type: Number, required: true },
  expectedLoss: { type: Number, required: true },
  riskAdjustedEV: { type: Number, required: true },
  EVConfidenceInterval: {
    lower: { type: Number, required: true },
    mean: { type: Number, required: true },
    upper: { type: Number, required: true }
  },
  EVLowerConfidenceBound: { type: Number, required: true },

  conformalUncertainty: { type: Number, required: true },
  bayesianPosterior: { type: Number, required: true },
  riskOfRuin: { type: Number, required: true },

  finalDecision: { type: String, enum: ["LONG", "SHORT", "NO_TRADE"], required: true, index: true },
  noTradeReason: { type: String, default: null },
  riskApproval: { type: Boolean, required: true },
  ppoSizing: { type: Number, required: true },
  executionDecision: {
    action: { type: String, required: true },
    targetLeverage: { type: Number, default: 1 },
    positionSizeUSD: { type: Number, default: 0 },
    stopLossPrice: { type: Number, default: 0 },
    takeProfitPrice: { type: Number, default: 0 },
    orderType: { type: String, default: "MARKET" }
  },

  createdAt: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true,
  versionKey: false
});

AQEAAuthoritativeDecisionSchema.index({ symbol: 1, timestamp: -1 });
AQEAAuthoritativeDecisionSchema.index({ finalDecision: 1, timestamp: -1 });

export const AQEAAuthoritativeDecision = (mongoose?.models && mongoose.models.AQEAAuthoritativeDecision) ||
  (mongoose?.model && mongoose.model<IAQEAAuthoritativeDecision>("AQEAAuthoritativeDecision", AQEAAuthoritativeDecisionSchema)) ||
  ({} as any);
