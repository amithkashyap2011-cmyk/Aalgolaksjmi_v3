import mongoose, { Schema, Document } from "mongoose";

export interface IStrategyRegistry extends Document {
  strategyId: string;
  strategyName: string;
  description: string;
  category: string;
  supportedMarkets: string[];
  supportedTimeframes: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  minimumConfidence: number;
  minimumLiquidityUsdt: number;
  allowedVolatilityRatio: number;
  maxDrawdownPct: number;
  expectedHoldingTimeHours: number;
  averageProfitFactor: number;
  averageSharpe: number;
  averageWinRate: number;
  healthScore: number; // 0 - 100
  currentState: "ACTIVE" | "REDUCED" | "STANDBY" | "RETRAINING" | "RECOVERY";
  version: string;
  updatedAt: Date;
}

const StrategyRegistrySchema: Schema = new Schema({
  strategyId: { type: String, required: true, unique: true, index: true },
  strategyName: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  supportedMarkets: { type: [String], default: ["CRYPTO_SPOT", "CRYPTO_FUTURES", "INDIAN_EQUITIES"] },
  supportedTimeframes: { type: [String], default: ["5m", "15m", "1h"] },
  riskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], default: "MEDIUM" },
  minimumConfidence: { type: Number, default: 75 },
  minimumLiquidityUsdt: { type: Number, default: 100000 },
  allowedVolatilityRatio: { type: Number, default: 2.0 },
  maxDrawdownPct: { type: Number, default: 8.0 },
  expectedHoldingTimeHours: { type: Number, default: 4.0 },
  averageProfitFactor: { type: Number, default: 1.84 },
  averageSharpe: { type: Number, default: 1.82 },
  averageWinRate: { type: Number, default: 62.5 },
  healthScore: { type: Number, default: 85, index: true },
  currentState: {
    type: String,
    enum: ["ACTIVE", "REDUCED", "STANDBY", "RETRAINING", "RECOVERY"],
    default: "ACTIVE",
    index: true,
  },
  version: { type: String, default: "v5.0.0" },
  updatedAt: { type: Date, default: Date.now },
});

export const StrategyRegistry = mongoose.models.StrategyRegistry || mongoose.model<IStrategyRegistry>("StrategyRegistry", StrategyRegistrySchema);
