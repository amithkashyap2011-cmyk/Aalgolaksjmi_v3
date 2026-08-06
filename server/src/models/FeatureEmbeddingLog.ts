import mongoose, { Schema, Document } from "mongoose";

export interface IFeatureEmbeddingLog extends Document {
  symbol: string;
  embeddingVector: number[];
  reconstructionLoss: number;
  sequenceLength: number;
  createdAt: Date;
}

const FeatureEmbeddingLogSchema: Schema = new Schema({
  symbol: { type: String, required: true, index: true },
  embeddingVector: { type: [Number], required: true },
  reconstructionLoss: { type: Number, default: 0.02 },
  sequenceLength: { type: Number, default: 64 },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const FeatureEmbeddingLog = mongoose.models.FeatureEmbeddingLog || mongoose.model<IFeatureEmbeddingLog>("FeatureEmbeddingLog", FeatureEmbeddingLogSchema);
