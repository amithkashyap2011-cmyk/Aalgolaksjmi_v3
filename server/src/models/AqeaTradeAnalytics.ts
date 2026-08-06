import mongoose, { Schema, type Document } from "mongoose";

export interface IAqeaTradeAnalytics extends Document {
  timestamp: Date;
  userId: mongoose.Types.ObjectId;
  symbol: string;
  decision: "LONG" | "SHORT" | "HOLD" | "EXIT";
  
  // Market Features
  marketFeatures: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    atr: number;
    adx: number;
    rsi: number;
    macd: number;
    vwap: number;
    ema20: number;
    ema50: number;
    ema200: number;
  };

  // Regime Features
  regimeState: string;
  regimeScore: number;
  
  // Order Flow Features
  orderFlowFeatures: {
    cvd: number;
    delta: number;
    oiExpansion: number;
    fundingRate: number;
    liquidationScore: number;
  };

  // Smart Money Features
  smartMoneyFeatures: {
    liquiditySweep: boolean;
    bos: boolean;
    orderBlock: boolean;
    fvg: boolean;
    poc: number;
  };

  ppoRecommendation: string;
  exitReason?: string;

  // Execution Features
  executionFeatures: {
    positionSize: number;
    stopLoss: number;
    takeProfit: number;
  };

  // Outcome Features (Labels)
  outcomeFeatures: {
    winLoss: number; // 1 for win, 0 for loss
    rMultiple: number;
    profit: number;
    maxDrawdown: number;
    durationMs: number;
  };

  // Labels for training
  labels: {
    shortTerm: number;      // 1 or 0
    longTerm: number;       // 1 or 0
    reversal: number;       // 1 or 0
    trendContinuation: number; // 1 or 0
  };

  meta: any;
}

const AqeaTradeAnalyticsSchema = new Schema<IAqeaTradeAnalytics>({
  timestamp: { type: Date, default: Date.now, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  symbol: { type: String, required: true, index: true },
  decision: { type: String, enum: ["LONG", "SHORT", "HOLD", "EXIT"], required: true },
  
  marketFeatures: { type: Schema.Types.Mixed, default: {} },
  regimeState: { type: String },
  regimeScore: { type: Number },
  
  orderFlowFeatures: { type: Schema.Types.Mixed, default: {} },
  smartMoneyFeatures: { type: Schema.Types.Mixed, default: {} },
  ppoRecommendation: { type: String },
  executionFeatures: { type: Schema.Types.Mixed, default: {} },
  outcomeFeatures: { type: Schema.Types.Mixed, default: {} },
  
  labels: { type: Schema.Types.Mixed, default: {} },
  
  meta: { type: Schema.Types.Mixed, default: {} },
});

export const AqeaTradeAnalytics = mongoose.model<IAqeaTradeAnalytics>("AqeaTradeAnalytics", AqeaTradeAnalyticsSchema);
