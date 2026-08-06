import mongoose, { Schema, type Document } from "mongoose";

export interface IResearchAlphaAttribution extends Document {
  modelName: string;
  totalSignals: number;
  winningSignals: number;
  losingSignals: number;
  uniqueAlphaRate: number;
  profitFactorContribution: number;
  sharpeContribution: number;
  sortinoContribution: number;
  drawdownImpact: number;
  correlationToEnsemble: number;
  promotionEligible: boolean;
  timestamp: Date;
}

const ResearchAlphaAttributionSchema = new Schema<IResearchAlphaAttribution>({
  modelName: { type: String, required: true, index: true },
  totalSignals: { type: Number, required: true },
  winningSignals: { type: Number, required: true },
  losingSignals: { type: Number, required: true },
  uniqueAlphaRate: { type: Number, required: true },
  profitFactorContribution: { type: Number, required: true },
  sharpeContribution: { type: Number, required: true },
  sortinoContribution: { type: Number, required: true },
  drawdownImpact: { type: Number, required: true },
  correlationToEnsemble: { type: Number, required: true },
  promotionEligible: { type: Boolean, required: true },
  timestamp: { type: Date, default: Date.now, index: true }
});

export const ResearchAlphaAttribution = mongoose.model<IResearchAlphaAttribution>("ResearchAlphaAttribution", ResearchAlphaAttributionSchema);
