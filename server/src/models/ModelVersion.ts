import mongoose, { Schema, Document } from "mongoose";

export interface IModelVersion extends Document {
  modelName: string;
  version: string; // e.g. "v3.2.0"
  role: "CHAMPION" | "CHALLENGER" | "ARCHIVED";
  trainingDataset: string;
  featureSet: string[];
  trainingDate: string;
  validationScore: number;
  walkForwardScore: number;
  paperTradingScore: number;
  liveProfitFactor: number;
  liveSharpe: number;
  totalEvaluatedTrades: number;
  approvalStatus: "APPROVED" | "PENDING" | "REJECTED";
  createdAt: Date;
}

const ModelVersionSchema: Schema = new Schema({
  modelName: { type: String, required: true, index: true },
  version: { type: String, required: true },
  role: { type: String, enum: ["CHAMPION", "CHALLENGER", "ARCHIVED"], default: "CHALLENGER", index: true },
  trainingDataset: { type: String, default: "2022_2024_CRYPTO_INDIAN_EQUITIES" },
  featureSet: { type: [String], default: ["VDI", "OBI", "ADX", "VWAP", "RSI"] },
  trainingDate: { type: String, default: "2024-12-31" },
  validationScore: { type: Number, default: 0.88 },
  walkForwardScore: { type: Number, default: 0.82 },
  paperTradingScore: { type: Number, default: 0.84 },
  liveProfitFactor: { type: Number, default: 1.84 },
  liveSharpe: { type: Number, default: 1.82 },
  totalEvaluatedTrades: { type: Number, default: 0 },
  approvalStatus: { type: String, enum: ["APPROVED", "PENDING", "REJECTED"], default: "APPROVED" },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const ModelVersion = mongoose.models.ModelVersion || mongoose.model<IModelVersion>("ModelVersion", ModelVersionSchema);
