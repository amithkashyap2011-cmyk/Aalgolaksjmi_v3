/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Model Authority Snapshot Schema
 * ═══════════════════════════════════════════════════════════════════
 * Persists full snapshot of canonical model authority states,
 * regime-specific allocations, signal family weights, and active
 * Champion/Challenger configurations to MongoDB for restart rehydration.
 */

import mongoose, { Schema, Document } from "mongoose";

export interface IModelAuthoritySnapshot extends Document {
  snapshotId: string;
  timestamp: number;
  marketDomain: "CRYPTO" | "INDIAN" | "ALL";
  version: string;
  championEnsemble: string[];
  challengerEnsembles: string[][];
  quarantinedModels: string[];
  models: Array<{
    modelId: string;
    name: string;
    type: string;
    signalFamily: string;
    adminAllowed: boolean;
    status: string;
    basePrior: number;
    effectiveWeight: number;
    regimeFit: number;
    forwardEV: number;
    incrementalEV: number;
    brierScore: number;
    ece: number;
    biasPenalty: number;
    correlationPenalty: number;
    uncertaintyPenalty: number;
    sampleCount: number;
    reason: string;
  }>;
  signalFamilies: Array<{
    family: string;
    status: string;
    effectiveWeight: number;
    incrementalEV: number;
    correlationPenalty: number;
    activeModelCount: number;
  }>;
  regimes: Record<string, any>;
  createdAt: Date;
}

const ModelAuthoritySnapshotSchema = new Schema(
  {
    snapshotId: { type: String, required: true, unique: true },
    timestamp: { type: Number, required: true, index: true },
    marketDomain: { type: String, enum: ["CRYPTO", "INDIAN", "ALL"], default: "ALL", index: true },
    version: { type: String, default: "2026.1" },
    championEnsemble: { type: [String], default: [] },
    challengerEnsembles: { type: [[String]], default: [] },
    quarantinedModels: { type: [String], default: [] },
    models: [
      {
        modelId: { type: String, required: true },
        name: { type: String, required: true },
        type: { type: String, required: true },
        signalFamily: { type: String, required: true },
        adminAllowed: { type: Boolean, default: true },
        status: { type: String, required: true },
        basePrior: { type: Number, default: 0 },
        effectiveWeight: { type: Number, default: 0 },
        regimeFit: { type: Number, default: 1.0 },
        forwardEV: { type: Number, default: 0 },
        incrementalEV: { type: Number, default: 0 },
        brierScore: { type: Number, default: 0.2 },
        ece: { type: Number, default: 0.05 },
        biasPenalty: { type: Number, default: 0 },
        correlationPenalty: { type: Number, default: 1.0 },
        uncertaintyPenalty: { type: Number, default: 0 },
        sampleCount: { type: Number, default: 0 },
        reason: { type: String, default: "" }
      }
    ],
    signalFamilies: [
      {
        family: { type: String, required: true },
        status: { type: String, required: true },
        effectiveWeight: { type: Number, default: 0 },
        incrementalEV: { type: Number, default: 0 },
        correlationPenalty: { type: Number, default: 1.0 },
        activeModelCount: { type: Number, default: 0 }
      }
    ],
    regimes: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
);

ModelAuthoritySnapshotSchema.index({ timestamp: -1, marketDomain: 1 });

export const ModelAuthoritySnapshot =
  (mongoose.models.ModelAuthoritySnapshot as mongoose.Model<IModelAuthoritySnapshot>) ||
  mongoose.model<IModelAuthoritySnapshot>("ModelAuthoritySnapshot", ModelAuthoritySnapshotSchema);
