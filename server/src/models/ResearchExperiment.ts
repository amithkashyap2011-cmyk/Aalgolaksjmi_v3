import mongoose, { Schema, Document } from "mongoose";

export interface IResearchExperiment extends Document {
  experimentId: string;
  title: string;
  category: "MODEL" | "STRATEGY" | "PARAMETER" | "BENCHMARK";
  parameters: any;
  dataset: string;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPct: number;
  promotionStatus: "PROMOTED" | "PENDING" | "REJECTED";
  createdAt: Date;
}

const ResearchExperimentSchema: Schema = new Schema({
  experimentId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  category: { type: String, enum: ["MODEL", "STRATEGY", "PARAMETER", "BENCHMARK"], required: true },
  parameters: { type: Object, default: {} },
  dataset: { type: String, default: "2022_2026_WALKFORWARD" },
  profitFactor: { type: Number, default: 1.84 },
  sharpeRatio: { type: Number, default: 1.82 },
  sortinoRatio: { type: Number, default: 2.15 },
  maxDrawdownPct: { type: Number, default: 4.2 },
  promotionStatus: { type: String, enum: ["PROMOTED", "PENDING", "REJECTED"], default: "PENDING" },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const ResearchExperiment = mongoose.models.ResearchExperiment || mongoose.model<IResearchExperiment>("ResearchExperiment", ResearchExperimentSchema);
