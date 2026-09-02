import mongoose, { Schema, Document } from "mongoose";

export type ModelState = "ACTIVE" | "REDUCED_WEIGHT" | "STANDBY" | "RETRAINING" | "RECOVERY";

export interface IModelRegistry extends Document {
  modelName: string;
  category: string;
  version: string;
  trainingDataset: string;
  trainingDate: string;
  validationScore: number;
  walkForwardScore: number;
  paperTradingScore: number;
  currentWeight: number;
  currentState: ModelState;
  lastRetrainedAt: Date;
  deployedAt: Date;
  approvalStatus: "APPROVED" | "PENDING" | "REJECTED";
  updatedAt: Date;
}

const ModelRegistrySchema: Schema = new Schema({
  modelName: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  version: { type: String, default: "v3.2.0" },
  trainingDataset: { type: String, default: "2022_2024_CRYPTO_INDIAN_EQUITIES" },
  trainingDate: { type: String, default: "2024-12-31" },
  validationScore: { type: Number, default: 0.88 },
  walkForwardScore: { type: Number, default: 0.82 },
  paperTradingScore: { type: Number, default: 0.84 },
  currentWeight: { type: Number, default: 0.10 },
  currentState: {
    type: String,
    enum: ["ACTIVE", "REDUCED_WEIGHT", "STANDBY", "RETRAINING", "RECOVERY"],
    default: "ACTIVE",
    index: true,
  },
  lastRetrainedAt: { type: Date, default: Date.now },
  deployedAt: { type: Date, default: Date.now },
  approvalStatus: { type: String, enum: ["APPROVED", "PENDING", "REJECTED"], default: "APPROVED" },
  updatedAt: { type: Date, default: Date.now },
});

export const ModelRegistry = mongoose.models.ModelRegistry || mongoose.model<IModelRegistry>("ModelRegistry", ModelRegistrySchema);
