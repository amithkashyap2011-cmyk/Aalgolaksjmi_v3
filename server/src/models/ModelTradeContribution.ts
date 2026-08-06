import mongoose, { Schema, Document } from "mongoose";

export interface IModelTradeContribution extends Document {
  tradeId: string;
  symbol: string;
  modelName: string;
  prediction: "BUY" | "SELL" | "HOLD";
  confidence: number;
  weight: number;
  correctness: number; // +1 for correct, -1 for incorrect, 0 for hold/neutral
  tradeReturnR: number;
  calibrationFactor: number;
  contributionR: number;
  createdAt: Date;
}

const ModelTradeContributionSchema: Schema = new Schema({
  tradeId: { type: String, required: true, index: true },
  symbol: { type: String, required: true },
  modelName: { type: String, required: true, index: true },
  prediction: { type: String, enum: ["BUY", "SELL", "HOLD"], required: true },
  confidence: { type: Number, required: true },
  weight: { type: Number, required: true },
  correctness: { type: Number, required: true },
  tradeReturnR: { type: Number, required: true },
  calibrationFactor: { type: Number, default: 1.0 },
  contributionR: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const ModelTradeContribution = mongoose.models.ModelTradeContribution || mongoose.model<IModelTradeContribution>("ModelTradeContribution", ModelTradeContributionSchema);
