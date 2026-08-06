import mongoose, { Schema, Document } from "mongoose";

export interface IMarketRegimeLog extends Document {
  symbol: string;
  regime: string;
  volatilityRatio: number;
  liquidityScore: number;
  macroEvent: string;
  adjustedStopLossMultiplier: number;
  adjustedTakeProfitMultiplier: number;
  evaluatedAt: Date;
}

const MarketRegimeLogSchema: Schema = new Schema({
  symbol: { type: String, required: true, index: true },
  regime: { type: String, required: true, index: true },
  volatilityRatio: { type: Number, default: 1.0 },
  liquidityScore: { type: Number, default: 85 },
  macroEvent: { type: String, default: "NONE" },
  adjustedStopLossMultiplier: { type: Number, default: 1.0 },
  adjustedTakeProfitMultiplier: { type: Number, default: 1.0 },
  evaluatedAt: { type: Date, default: Date.now, index: true },
});

export const MarketRegimeLog = mongoose.models.MarketRegimeLog || mongoose.model<IMarketRegimeLog>("MarketRegimeLog", MarketRegimeLogSchema);
