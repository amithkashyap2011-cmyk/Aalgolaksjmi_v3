import mongoose, { Schema, type Document } from "mongoose";

export interface IResearchRedundancyReport extends Document {
  modelA: string;
  modelB: string;
  pearson: number;
  spearman: number;
  redundant: boolean;
  timestamp: Date;
}

const ResearchRedundancyReportSchema = new Schema<IResearchRedundancyReport>({
  modelA: { type: String, required: true, index: true },
  modelB: { type: String, required: true, index: true },
  pearson: { type: Number, required: true },
  spearman: { type: Number, required: true },
  redundant: { type: Boolean, required: true },
  timestamp: { type: Date, default: Date.now, index: true }
});

// Create compound index for fast lookups of pairs
ResearchRedundancyReportSchema.index({ modelA: 1, modelB: 1 });

export const ResearchRedundancyReport = mongoose.model<IResearchRedundancyReport>("ResearchRedundancyReport", ResearchRedundancyReportSchema);
