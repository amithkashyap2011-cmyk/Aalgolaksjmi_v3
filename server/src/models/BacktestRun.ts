/*
 * ─── BacktestRun model ─────────────────────────────────
 *
 * Stores params, aggregate metrics, equity curve, and individual trades
 * for each backtest execution.
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IBacktestMetrics {
  cagr: number;
  maxDD: number;
  winRate: number;
  profitFactor: number;
  sharpeEst: number;
  totalTrades: number;
}

export interface IEquityPoint {
  time: number; // epoch ms
  equity: number;
}

export interface IBacktestTrade {
  symbol: string;
  side: "BUY" | "SELL";
  entry: number;
  exit: number;
  pnl: number;
  openedAt: number;
  closedAt: number;
}

export interface IBacktestRun extends Document {
  userId: Types.ObjectId;
  params: {
    symbol: string;
    timeframe: string;
    startDate: string;     // ISO date string
    endDate: string;
    strategies: string[];
  };
  metrics: IBacktestMetrics;
  equityCurve: IEquityPoint[];
  trades: IBacktestTrade[];
  createdAt: Date;
}

const BacktestRunSchema = new Schema<IBacktestRun>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    params: {
      type: new Schema(
        {
          symbol: { type: String, required: true },
          timeframe: { type: String, required: true },
          startDate: { type: String, required: true },
          endDate: { type: String, required: true },
          strategies: { type: [String], required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    metrics: {
      type: new Schema(
        {
          cagr: Number,
          maxDD: Number,
          winRate: Number,
          profitFactor: Number,
          sharpeEst: Number,
          totalTrades: Number,
        },
        { _id: false },
      ),
      required: true,
    },
    equityCurve: {
      type: [
        new Schema({ time: Number, equity: Number }, { _id: false }),
      ],
      default: [],
    },
    trades: {
      type: [
        new Schema(
          {
            symbol: String,
            side: { type: String, enum: ["BUY", "SELL"] },
            entry: Number,
            exit: Number,
            pnl: Number,
            openedAt: Number,
            closedAt: Number,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const BacktestRun = mongoose.model<IBacktestRun>("BacktestRun", BacktestRunSchema);
