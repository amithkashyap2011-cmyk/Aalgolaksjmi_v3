import mongoose, { Schema, Document } from "mongoose";

export interface IFeatureStore extends Document {
  featureName: string;
  version: string;
  category: string;
  importanceScore: number;
  correlationWithReturn: number;
  driftScore: number;
  createdDate: string;
  updatedAt: Date;
}

const FeatureStoreSchema: Schema = new Schema({
  featureName: { type: String, required: true, unique: true, index: true },
  version: { type: String, default: "v1.0.0" },
  category: { type: String, required: true },
  importanceScore: { type: Number, default: 0.20 },
  correlationWithReturn: { type: Number, default: 0.35 },
  driftScore: { type: Number, default: 0.02 },
  createdDate: { type: String, default: "2024-01-01" },
  updatedAt: { type: Date, default: Date.now },
});

export const FeatureStore = mongoose.models.FeatureStore || mongoose.model<IFeatureStore>("FeatureStore", FeatureStoreSchema);
