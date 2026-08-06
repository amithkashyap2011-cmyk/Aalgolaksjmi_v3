import mongoose, { Schema, Document } from "mongoose";

export interface IEnsembleWeightHistory extends Document {
  timestamp: Date;
  regime: string;
  weights: Record<string, number>;
  reason: string;
}

const EnsembleWeightHistorySchema: Schema = new Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  regime: { type: String, required: true },
  weights: { type: Map, of: Number, required: true },
  reason: { type: String, default: "DYNAMIC_REBALANCING" },
});

export const EnsembleWeightHistory = mongoose.models.EnsembleWeightHistory || mongoose.model<IEnsembleWeightHistory>("EnsembleWeightHistory", EnsembleWeightHistorySchema);
