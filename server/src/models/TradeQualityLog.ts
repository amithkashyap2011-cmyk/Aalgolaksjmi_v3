import mongoose, { Schema, Document } from "mongoose";

export interface ITradeQualityLog extends Document {
  symbol: string;
  consensusStrength: number;
  confidenceCalibration: number;
  historicalSimilarity: number;
  marketRegime: string;
  orderFlowScore: number;
  volatilityScore: number;
  liquidityScore: number;
  tradeQualityScore: number; // 0 - 100
  action: "FULL_SIZE" | "NORMAL" | "HALF_POSITION" | "WATCH" | "REJECT";
  createdAt: Date;
}

const TradeQualityLogSchema: Schema = new Schema({
  symbol: { type: String, required: true, index: true },
  consensusStrength: { type: Number, required: true },
  confidenceCalibration: { type: Number, required: true },
  historicalSimilarity: { type: Number, required: true },
  marketRegime: { type: String, required: true },
  orderFlowScore: { type: Number, required: true },
  volatilityScore: { type: Number, required: true },
  liquidityScore: { type: Number, required: true },
  tradeQualityScore: { type: Number, required: true, index: true },
  action: {
    type: String,
    enum: ["FULL_SIZE", "NORMAL", "HALF_POSITION", "WATCH", "REJECT"],
    required: true,
  },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const TradeQualityLog = mongoose.models.TradeQualityLog || mongoose.model<ITradeQualityLog>("TradeQualityLog", TradeQualityLogSchema);
