import mongoose, { Schema, Document } from "mongoose";

export interface IModelHealth extends Document {
  modelName: string;
  accuracyScore: number;       // 20% weight
  profitFactorScore: number;   // 20% weight
  sharpeScore: number;         // 15% weight
  contributionScore: number;   // 15% weight
  calibrationScore: number;    // 10% weight
  stabilityScore: number;      // 10% weight
  driftScore: number;          // 10% weight (1 - drift)
  overallHealthScore: number;  // 0 - 100
  evaluatedAt: Date;
}

const ModelHealthSchema: Schema = new Schema({
  modelName: { type: String, required: true, index: true },
  accuracyScore: { type: Number, default: 65 },
  profitFactorScore: { type: Number, default: 70 },
  sharpeScore: { type: Number, default: 72 },
  contributionScore: { type: Number, default: 68 },
  calibrationScore: { type: Number, default: 85 },
  stabilityScore: { type: Number, default: 80 },
  driftScore: { type: Number, default: 90 },
  overallHealthScore: { type: Number, default: 75, index: true },
  evaluatedAt: { type: Date, default: Date.now, index: true },
});

export const ModelHealth = mongoose.models.ModelHealth || mongoose.model<IModelHealth>("ModelHealth", ModelHealthSchema);
