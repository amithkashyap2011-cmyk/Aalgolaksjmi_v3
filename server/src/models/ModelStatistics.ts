import mongoose, { Schema, Document } from "mongoose";

export interface IModelStatistics extends Document {
  modelName: string;
  category: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  brierScore: number;
  sharpeContribution: number;
  sortinoContribution: number;
  winRate: number;
  avgWinner: number;
  avgLoser: number;
  totalTrades: number;
  currentWeight: number;
  avgWeight: number;
  latencyMs: number;
  driftStatus: "STABLE" | "WARNING" | "CRITICAL";
  updatedAt: Date;
}

const ModelStatisticsSchema: Schema = new Schema({
  modelName: { type: String, required: true, unique: true, index: true },
  category: { type: String, required: true },
  accuracy: { type: Number, default: 0 },
  precision: { type: Number, default: 0 },
  recall: { type: Number, default: 0 },
  f1Score: { type: Number, default: 0 },
  brierScore: { type: Number, default: 0 },
  sharpeContribution: { type: Number, default: 0 },
  sortinoContribution: { type: Number, default: 0 },
  winRate: { type: Number, default: 0 },
  avgWinner: { type: Number, default: 0 },
  avgLoser: { type: Number, default: 0 },
  totalTrades: { type: Number, default: 0 },
  currentWeight: { type: Number, default: 0.1 },
  avgWeight: { type: Number, default: 0.1 },
  latencyMs: { type: Number, default: 45 },
  driftStatus: { type: String, enum: ["STABLE", "WARNING", "CRITICAL"], default: "STABLE" },
  updatedAt: { type: Date, default: Date.now },
});

export const ModelStatistics = mongoose.models.ModelStatistics || mongoose.model<IModelStatistics>("ModelStatistics", ModelStatisticsSchema);
