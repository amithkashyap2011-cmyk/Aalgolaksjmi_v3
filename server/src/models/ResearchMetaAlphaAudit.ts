import mongoose, { Schema, type Document } from "mongoose";

export interface IResearchMetaAlphaAudit extends Document {
  timestamp: Date;
  symbol: string;
  regime: string;
  weights: Record<string, number>;
  confidence: number;
  prediction: string;
  actualOutcome?: string;
  pnlImpact?: number;
  latencyMs: number;
  stabilityScoreAtTime: number;
  meta?: any;
}

const ResearchMetaAlphaAuditSchema = new Schema<IResearchMetaAlphaAudit>({
  timestamp: { type: Date, default: Date.now, index: true },
  symbol: { type: String, required: true, index: true },
  regime: { type: String, required: true, index: true },
  weights: { type: Schema.Types.Mixed, required: true },
  confidence: { type: Number, required: true },
  prediction: { type: String, required: true },
  actualOutcome: { type: String },
  pnlImpact: { type: Number },
  latencyMs: { type: Number, required: true },
  stabilityScoreAtTime: { type: Number, required: true },
  meta: { type: Schema.Types.Mixed }
});

ResearchMetaAlphaAuditSchema.index({ timestamp: -1, symbol: 1 });

export const ResearchMetaAlphaAudit = mongoose.model<IResearchMetaAlphaAudit>("ResearchMetaAlphaAudit", ResearchMetaAlphaAuditSchema);
