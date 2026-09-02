/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA 2026–27 — Champion–Challenger Model State Schema (Phase 3)
 * ═══════════════════════════════════════════════════════════════════
 * Persistent tracking of Champion, Challenger, Benchmark, Shadow,
 * Quarantined, and Retired models per domain, symbol class, and regime.
 */

import mongoose, { Schema, Document } from "mongoose";

export type ModelLifecycleState =
  | "CHAMPION"
  | "CHALLENGER"
  | "SHADOW"
  | "BENCHMARK"
  | "QUARANTINED"
  | "RETIRED";

export interface IChampionChallengerRecord extends Document {
  modelName: string;
  marketDomain: "CRYPTO" | "INDIAN";
  symbolClass: string;
  regime: string;
  state: ModelLifecycleState;
  sampleCount: number;
  costAdjustedEV: number;
  riskAdjustedReturn: number;
  brierScore: number;
  expectedCalibrationError: number;
  maxDrawdownPercent: number;
  expectedShortfall: number;
  profitFactor: number;
  sharpeRatio: number;
  incrementalEV: number;
  headToHeadWinRate: number; // vs current Champion on holdout
  isStatisticallySuperior: boolean;
  quarantineReason: string | null;
  quarantinedTimestamp: number | null;
  promotedTimestamp: number | null;
  demotedTimestamp: number | null;
  lastUpdated: number;
  createdAt: Date;
}

const AQEAChampionChallengerSchema = new Schema({
  modelName: { type: String, required: true, index: true },
  marketDomain: { type: String, enum: ["CRYPTO", "INDIAN"], required: true, index: true },
  symbolClass: { type: String, default: "ALL", index: true },
  regime: { type: String, default: "GLOBAL", index: true },
  state: {
    type: String,
    enum: ["CHAMPION", "CHALLENGER", "SHADOW", "BENCHMARK", "QUARANTINED", "RETIRED"],
    required: true,
    index: true
  },
  sampleCount: { type: Number, default: 0 },
  costAdjustedEV: { type: Number, default: 0 },
  riskAdjustedReturn: { type: Number, default: 0 },
  brierScore: { type: Number, default: 0.20 },
  expectedCalibrationError: { type: Number, default: 0.05 },
  maxDrawdownPercent: { type: Number, default: 0 },
  expectedShortfall: { type: Number, default: 0 },
  profitFactor: { type: Number, default: 1.0 },
  sharpeRatio: { type: Number, default: 0 },
  incrementalEV: { type: Number, default: 0 },
  headToHeadWinRate: { type: Number, default: 0.5 },
  isStatisticallySuperior: { type: Boolean, default: false },
  quarantineReason: { type: String, default: null },
  quarantinedTimestamp: { type: Number, default: null },
  promotedTimestamp: { type: Number, default: null },
  demotedTimestamp: { type: Number, default: null },
  lastUpdated: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true,
  versionKey: false
});

AQEAChampionChallengerSchema.index({ marketDomain: 1, regime: 1, state: 1 });
AQEAChampionChallengerSchema.index({ modelName: 1, marketDomain: 1 }, { unique: true });

export const AQEAChampionChallenger = (mongoose?.models && mongoose.models.AQEAChampionChallenger) ||
  (mongoose?.model && mongoose.model<IChampionChallengerRecord>("AQEAChampionChallenger", AQEAChampionChallengerSchema)) ||
  ({} as any);
