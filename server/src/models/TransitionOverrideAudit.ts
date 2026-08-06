import mongoose, { Schema, type Document } from "mongoose";

export interface ITransitionOverrideAudit extends Document {
  timestamp: Date;
  symbol: string;
  regime: string;
  coreScore: number;
  smScore: number;
  ofScore: number;
  finalScore: number;
  transitionOverride: boolean;
  wouldTrade: boolean;
  actualTrade: boolean;
  riskApproved: boolean;
  positionSize: number;
  leverage: number;
  actualOutcome?: "WIN" | "LOSS" | "BREAKEVEN";
  pnl?: number;
  meta?: any;
}

const TransitionOverrideAuditSchema = new Schema<ITransitionOverrideAudit>({
  timestamp: { type: Date, default: Date.now, index: true },
  symbol: { type: String, required: true, index: true },
  regime: { type: String, required: true, index: true },
  coreScore: { type: Number, required: true },
  smScore: { type: Number, required: true },
  ofScore: { type: Number, required: true },
  finalScore: { type: Number, required: true },
  transitionOverride: { type: Boolean, required: true },
  wouldTrade: { type: Boolean, required: true },
  actualTrade: { type: Boolean, required: true },
  riskApproved: { type: Boolean, required: true },
  positionSize: { type: Number, required: true },
  leverage: { type: Number, required: true },
  actualOutcome: { type: String },
  pnl: { type: Number },
  meta: { type: Schema.Types.Mixed }
});

export const TransitionOverrideAudit = mongoose.model<ITransitionOverrideAudit>("TransitionOverrideAudit", TransitionOverrideAuditSchema);
