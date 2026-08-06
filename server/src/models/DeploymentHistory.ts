import mongoose, { Schema, Document } from "mongoose";

export interface IDeploymentHistory extends Document {
  modelName: string;
  promotedVersion: string;
  previousVersion: string;
  reason: string;
  promotedAt: Date;
  metricsAtPromotion: {
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    evaluatedTrades: number;
  };
}

const DeploymentHistorySchema: Schema = new Schema({
  modelName: { type: String, required: true, index: true },
  promotedVersion: { type: String, required: true },
  previousVersion: { type: String, required: true },
  reason: { type: String, required: true },
  promotedAt: { type: Date, default: Date.now, index: true },
  metricsAtPromotion: { type: Object, required: true },
});

export const DeploymentHistory = mongoose.models.DeploymentHistory || mongoose.model<IDeploymentHistory>("DeploymentHistory", DeploymentHistorySchema);
