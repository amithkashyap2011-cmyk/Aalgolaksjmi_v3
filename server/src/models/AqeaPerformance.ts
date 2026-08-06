import mongoose, { Schema, type Document } from "mongoose";

export interface IAqeaPerformance extends Document {
  timestamp: Date;
  userId: mongoose.Types.ObjectId;
  symbol: string;
  legacySignal: string;
  aqeaSignal: string;
  legacyResult: number; // theoretical or actual PnL
  aqeaResult: number;   // theoretical PnL
  agreement: boolean;
  metrics: {
    profitFactor: number;
    sharpe: number;
    sortino: number;
    drawdown: number;
    winRate: number;
    expectancy: number;
  };
}

const AqeaPerformanceSchema = new Schema<IAqeaPerformance>({
  timestamp: { type: Date, default: Date.now, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  symbol: { type: String, required: true, index: true },
  legacySignal: { type: String },
  aqeaSignal: { type: String },
  legacyResult: { type: Number, default: 0 },
  aqeaResult: { type: Number, default: 0 },
  agreement: { type: Boolean, default: false },
  metrics: {
    profitFactor: { type: Number, default: 0 },
    sharpe: { type: Number, default: 0 },
    sortino: { type: Number, default: 0 },
    drawdown: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    expectancy: { type: Number, default: 0 },
  },
});

export const AqeaPerformance = mongoose.model<IAqeaPerformance>("AqeaPerformance", AqeaPerformanceSchema);
