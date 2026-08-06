import mongoose, { Schema, Document } from "mongoose";

export interface IExecutionQualityLog extends Document {
  symbol: string;
  latencyScore: number;
  slippageScore: number;
  fillQualityScore: number;
  orderDelayScore: number;
  spreadScore: number;
  overallQualityScore: number;
  timestamp: Date;
}

const ExecutionQualityLogSchema: Schema = new Schema({
  symbol: { type: String, required: true, index: true },
  latencyScore: { type: Number, required: true },
  slippageScore: { type: Number, required: true },
  fillQualityScore: { type: Number, required: true },
  orderDelayScore: { type: Number, required: true },
  spreadScore: { type: Number, required: true },
  overallQualityScore: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
});

export const ExecutionQualityLog = mongoose.models.ExecutionQualityLog || mongoose.model<IExecutionQualityLog>("ExecutionQualityLog", ExecutionQualityLogSchema);
