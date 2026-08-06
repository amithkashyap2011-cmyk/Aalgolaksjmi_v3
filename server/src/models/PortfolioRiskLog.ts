import mongoose, { Schema, Document } from "mongoose";

export interface IPortfolioRiskLog extends Document {
  portfolioHeatPct: number;
  var95Pct: number;
  cvar95Pct: number;
  expectedShortfallUsdt: number;
  riskBudgetRemainingUsdt: number;
  systemicRiskAlert: boolean;
  evaluatedAt: Date;
}

const PortfolioRiskLogSchema: Schema = new Schema({
  portfolioHeatPct: { type: Number, required: true },
  var95Pct: { type: Number, required: true },
  cvar95Pct: { type: Number, required: true },
  expectedShortfallUsdt: { type: Number, required: true },
  riskBudgetRemainingUsdt: { type: Number, required: true },
  systemicRiskAlert: { type: Boolean, default: false },
  evaluatedAt: { type: Date, default: Date.now, index: true },
});

export const PortfolioRiskLog = mongoose.models.PortfolioRiskLog || mongoose.model<IPortfolioRiskLog>("PortfolioRiskLog", PortfolioRiskLogSchema);
