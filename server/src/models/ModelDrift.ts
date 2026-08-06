import mongoose, { Schema, Document } from "mongoose";

export interface IModelDrift extends Document {
  modelName: string;
  conceptDriftScore: number; // PSI or Wasserstein distance
  predictionDriftScore: number;
  featureDriftScore: number;
  dataDriftScore: number;
  status: "STABLE" | "WARNING" | "CRITICAL";
  evaluatedAt: Date;
}

const ModelDriftSchema: Schema = new Schema({
  modelName: { type: String, required: true, index: true },
  conceptDriftScore: { type: Number, default: 0 },
  predictionDriftScore: { type: Number, default: 0 },
  featureDriftScore: { type: Number, default: 0 },
  dataDriftScore: { type: Number, default: 0 },
  status: { type: String, enum: ["STABLE", "WARNING", "CRITICAL"], default: "STABLE" },
  evaluatedAt: { type: Date, default: Date.now, index: true },
});

export const ModelDrift = mongoose.models.ModelDrift || mongoose.model<IModelDrift>("ModelDrift", ModelDriftSchema);
