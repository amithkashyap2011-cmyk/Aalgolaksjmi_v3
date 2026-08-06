import mongoose, { Schema, type Document } from "mongoose";

export interface IResearchPromotionAudit extends Document {
  modelName: string;
  eligible: boolean;
  reasons: string[];
  metrics: {
    uniqueAlpha: number;
    pfContribution: number;
    sharpeContribution: number;
    pValue: number;
    correlation: number;
    trades: number;
  };
  timestamp: Date;
}

const ResearchPromotionAuditSchema = new Schema<IResearchPromotionAudit>({
  modelName: { type: String, required: true, index: true },
  eligible: { type: Boolean, required: true },
  reasons: { type: [String], required: true },
  metrics: {
    uniqueAlpha: { type: Number, required: true },
    pfContribution: { type: Number, required: true },
    sharpeContribution: { type: Number, required: true },
    pValue: { type: Number, required: true },
    correlation: { type: Number, required: true },
    trades: { type: Number, required: true }
  },
  timestamp: { type: Date, default: Date.now, index: true }
});

export const ResearchPromotionAudit = mongoose.model<IResearchPromotionAudit>("ResearchPromotionAudit", ResearchPromotionAuditSchema);
