import mongoose, { Schema, Document } from "mongoose";

export interface IStrategyAttribution extends Document {
  tradeId: string;
  symbol: string;
  strategyId: string;
  marketRegime: string;
  confidence: number;
  expectedEdgeR: number;
  actualPnlUsdt: number;
  actualReturnR: number;
  holdingTimeHours: number;
  createdAt: Date;
}

const StrategyAttributionSchema: Schema = new Schema({
  tradeId: { type: String, required: true, index: true },
  symbol: { type: String, required: true, index: true },
  strategyId: { type: String, required: true, index: true },
  marketRegime: { type: String, required: true },
  confidence: { type: Number, required: true },
  expectedEdgeR: { type: Number, required: true },
  actualPnlUsdt: { type: Number, required: true },
  actualReturnR: { type: Number, required: true },
  holdingTimeHours: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const StrategyAttribution = mongoose.models.StrategyAttribution || mongoose.model<IStrategyAttribution>("StrategyAttribution", StrategyAttributionSchema);
