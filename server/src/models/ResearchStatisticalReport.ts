import mongoose, { Schema, type Document } from "mongoose";

export interface IResearchStatisticalReport extends Document {
  modelName: string;
  pValue: number;
  confidence95: number;
  bootstrapMean: number;
  bootstrapStdDev: number;
  walkForwardPF: number;
  walkForwardSharpe: number;
  statisticallySignificant: boolean;
  timestamp: Date;
}

const ResearchStatisticalReportSchema = new Schema<IResearchStatisticalReport>({
  modelName: { type: String, required: true, index: true },
  pValue: { type: Number, required: true },
  confidence95: { type: Number, required: true },
  bootstrapMean: { type: Number, required: true },
  bootstrapStdDev: { type: Number, required: true },
  walkForwardPF: { type: Number, required: true },
  walkForwardSharpe: { type: Number, required: true },
  statisticallySignificant: { type: Boolean, required: true },
  timestamp: { type: Date, default: Date.now, index: true }
});

export const ResearchStatisticalReport = mongoose.model<IResearchStatisticalReport>("ResearchStatisticalReport", ResearchStatisticalReportSchema);
