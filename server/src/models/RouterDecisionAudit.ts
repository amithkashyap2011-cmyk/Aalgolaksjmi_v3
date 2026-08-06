import mongoose, { Schema, type Document } from "mongoose";

export interface IRouterDecisionAudit extends Document {
  timestamp: Date;
  symbol: string;
  regime: string;
  selectedModel: string;
  prediction: string;
  confidence: number;
  actualOutcome?: string;
  routerCorrect?: boolean;
  latencyMs: number;
  meta?: any;
}

const RouterDecisionAuditSchema = new Schema<IRouterDecisionAudit>({
  timestamp: { type: Date, default: Date.now, index: true },
  symbol: { type: String, required: true, index: true },
  regime: { type: String, required: true, index: true },
  selectedModel: { type: String, required: true, index: true },
  prediction: { type: String, required: true },
  confidence: { type: Number, required: true },
  actualOutcome: { type: String },
  routerCorrect: { type: Boolean },
  latencyMs: { type: Number, required: true },
  meta: { type: Schema.Types.Mixed }
});

// Added compound index for efficiency
RouterDecisionAuditSchema.index({ symbol: 1, timestamp: -1 });

export const RouterDecisionAudit = mongoose.model<IRouterDecisionAudit>("RouterDecisionAudit", RouterDecisionAuditSchema);
