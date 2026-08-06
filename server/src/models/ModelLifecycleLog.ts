import mongoose, { Schema, Document } from "mongoose";
import { ModelState } from "./ModelRegistry.js";

export interface IModelLifecycleLog extends Document {
  modelName: string;
  fromState: ModelState;
  toState: ModelState;
  reason: string;
  healthScoreAtTransition: number;
  rollingProfitFactor: number;
  rollingSharpe: number;
  timestamp: Date;
}

const ModelLifecycleLogSchema: Schema = new Schema({
  modelName: { type: String, required: true, index: true },
  fromState: { type: String, required: true },
  toState: { type: String, required: true },
  reason: { type: String, required: true },
  healthScoreAtTransition: { type: Number, required: true },
  rollingProfitFactor: { type: Number, required: true },
  rollingSharpe: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
});

export const ModelLifecycleLog = mongoose.models.ModelLifecycleLog || mongoose.model<IModelLifecycleLog>("ModelLifecycleLog", ModelLifecycleLogSchema);
