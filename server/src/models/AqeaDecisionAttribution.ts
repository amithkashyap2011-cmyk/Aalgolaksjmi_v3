import mongoose, { Schema, type Document } from "mongoose";

export interface IAqeaDecisionAttribution extends Document {
  timestamp: Date;
  symbol: string;
  userId: mongoose.Types.ObjectId;
  
  // AI Predictors
  cnnPrediction: string;
  cnnConfidence: number;
  transformerPrediction: string;
  transformerConfidence: number;
  ppoPrediction: string;
  ppoConfidence: number;
  mambaPrediction: string;
  mambaConfidence: number;
  
  // Quantitative Scores
  orderFlowScore: number;
  smartMoneyScore: number;
  
  // Market Context
  regimeState: string;
  
  // Final Outcome
  finalDecision: string;
  riskApproved: boolean;
  positionSize: number;

  // V8.5.2 Outcome Analysis
  entryPrice: number;
  price15m?: number;
  price30m?: number;
  price60m?: number;
  
  outcome15m?: "WIN" | "LOSS" | "NEUTRAL";
  outcome30m?: "WIN" | "LOSS" | "NEUTRAL";
  outcome60m?: "WIN" | "LOSS" | "NEUTRAL";

  // Individual Subsystem Correctness (60m window)
  cnnCorrect?: boolean;
  transformerCorrect?: boolean;
  ppoCorrect?: boolean;
  mambaCorrect?: boolean;
  orderFlowCorrect?: boolean;
  smartMoneyCorrect?: boolean;
  regimeCorrect?: boolean;
  riskApprovalCorrect?: boolean;

  pnlSimulated?: number;
  
  meta: any;
}

const AqeaDecisionAttributionSchema = new Schema<IAqeaDecisionAttribution>({
  timestamp: { type: Date, default: Date.now },
  symbol: { type: String, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  
  cnnPrediction: { type: String },
  cnnConfidence: { type: Number },
  transformerPrediction: { type: String },
  transformerConfidence: { type: Number },
  ppoPrediction: { type: String },
  ppoConfidence: { type: Number },
  mambaPrediction: { type: String },
  mambaConfidence: { type: Number },
  
  orderFlowScore: { type: Number },
  smartMoneyScore: { type: Number },
  
  regimeState: { type: String },
  
  finalDecision: { type: String },
  riskApproved: { type: Boolean },
  positionSize: { type: Number },

  // V8.5.2 Outcome Analysis
  entryPrice: { type: Number },
  price15m: { type: Number },
  price30m: { type: Number },
  price60m: { type: Number },
  
  outcome15m: { type: String, enum: ["WIN", "LOSS", "NEUTRAL"] },
  outcome30m: { type: String, enum: ["WIN", "LOSS", "NEUTRAL"] },
  outcome60m: { type: String, enum: ["WIN", "LOSS", "NEUTRAL"] },

  cnnCorrect: { type: Boolean },
  transformerCorrect: { type: Boolean },
  ppoCorrect: { type: Boolean },
  mambaCorrect: { type: Boolean },
  orderFlowCorrect: { type: Boolean },
  smartMoneyCorrect: { type: Boolean },
  regimeCorrect: { type: Boolean },
  riskApprovalCorrect: { type: Boolean },

  pnlSimulated: { type: Number },
  
  meta: { type: Schema.Types.Mixed, default: {} }
});

AqeaDecisionAttributionSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 }); // 7-day automatic TTL expiration

export const AqeaDecisionAttribution = mongoose.model<IAqeaDecisionAttribution>("AqeaDecisionAttribution", AqeaDecisionAttributionSchema);
