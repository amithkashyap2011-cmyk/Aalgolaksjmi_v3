import mongoose, { Schema, Document } from "mongoose";

export interface IStrategyPerformance extends Document {
  strategyId: string;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  winRatePct: number;
  maxDrawdownPct: number;
  expectancyUsdt: number;
  totalTrades: number;
  successfulTrades: number;
  evaluatedAt: Date;
}

const StrategyPerformanceSchema: Schema = new Schema({
  strategyId: { type: String, required: true, index: true },
  profitFactor: { type: Number, required: true },
  sharpeRatio: { type: Number, required: true },
  sortinoRatio: { type: Number, required: true },
  winRatePct: { type: Number, required: true },
  maxDrawdownPct: { type: Number, required: true },
  expectancyUsdt: { type: Number, required: true },
  totalTrades: { type: Number, default: 0 },
  successfulTrades: { type: Number, default: 0 },
  evaluatedAt: { type: Date, default: Date.now, index: true },
});

export const StrategyPerformance = mongoose.models.StrategyPerformance || mongoose.model<IStrategyPerformance>("StrategyPerformance", StrategyPerformanceSchema);
