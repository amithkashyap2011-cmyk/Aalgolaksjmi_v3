/*
 * ─── Trade model ───────────────────────────────────────
 *
 * Every order (PAPER or LIVE). Status lifecycle:
 *   ENTRY: PENDING → PARTIALLY_FILLED | OPEN | CANCELLED
 *   EXIT:  OPEN → PENDING_CLOSE → CLOSED | CLOSE_FAILED → MANUAL_INTERVENTION_REQUIRED
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export type TradeStatus = 
  | "PENDING" 
  | "OPEN" 
  | "PARTIALLY_FILLED" 
  | "CLOSED" 
  | "CANCELLED" 
  | "PENDING_CLOSE" 
  | "CLOSE_FAILED" 
  | "MANUAL_INTERVENTION_REQUIRED";

export interface ITrade extends Document {
  userId: Types.ObjectId;
  mode: "PAPER" | "LIVE";
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  origQty?: number;
  entryPrice: number;
  exitPrice: number | null;
  sl: number | null;
  tp: number | null;
  strategy: string | null;
  status: TradeStatus;
  pnl: number;
  grossPnl: number;
  feeCost: number;
  slippageCost: number;
  netPnl: number;
  leverage: number;
  openedAt: Date;
  closedAt: Date | null;
  accountType: "SPOT" | "FUTURES";

  // V8.0 Institutional Fields
  qualityScore: number;
  aiConfidence: number;
  aiReasoning: string;
  marketRegime: string;
  riskScore: number;
  autoCloseStatus: "ARMED" | "STANDBY" | "TRIGGERED";

  // 🛡️ Phase 6: Trading Traceability
  entrySource: string;
  decisionPath: string;
  authorizedVotes: Record<string, string>;
  shadowVotes: Record<string, string>;
  coreScore: number;
  finalScore: number;
  exitReason: string | null;

  // Multi-Stage Take Profit
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  runnerActive: boolean;

  meta: {
    exitAttempts?: number;
    requiresManualIntervention?: boolean;
    [key: string]: any;
  };

  archived: boolean;
  archivedAt: Date | null;
}

const TradeSchema = new Schema<ITrade>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  mode: { type: String, enum: ["PAPER", "LIVE"], required: true },
  symbol: { type: String, required: true },
  side: { type: String, enum: ["BUY", "SELL"], required: true },
  quantity: { type: Number, required: true },
  origQty: { type: Number },
  entryPrice: { type: Number, required: true },
  exitPrice: { type: Number, default: null },
  sl: { type: Number, default: null },
  tp: { type: Number, default: null },
  strategy: { type: String, default: null },
  status: {
    type: String,
    enum: [
      "PENDING", 
      "OPEN", 
      "PARTIALLY_FILLED", 
      "CLOSED", 
      "CANCELLED", 
      "PENDING_CLOSE", 
      "CLOSE_FAILED", 
      "MANUAL_INTERVENTION_REQUIRED"
    ],
    default: "OPEN",
  },
  pnl: { type: Number, default: 0 },
  grossPnl: { type: Number, default: 0 },
  feeCost: { type: Number, default: 0 },
  slippageCost: { type: Number, default: 0 },
  netPnl: { type: Number, default: 0 },
  leverage: { type: Number, default: 1 },
  openedAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
  accountType: { type: String, enum: ["SPOT", "FUTURES", "INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50"], default: "FUTURES" },
  
  // V8.0 Institutional Fields
  qualityScore: { type: Number, default: 0 },
  aiConfidence: { type: Number, default: 0 },
  aiReasoning: { type: String, default: "" },
  marketRegime: { type: String, default: "" },
  riskScore: { type: Number, default: 0 },
  autoCloseStatus: { type: String, default: "ARMED" },

  // 🛡️ Phase 6: Trading Traceability
  entrySource: { type: String, default: "INDIAN_MARKET_SCANNER" },
  decisionPath: { type: Schema.Types.Mixed, required: true },
  authorizedVotes: { type: Schema.Types.Mixed, default: {} },
  shadowVotes: { type: Schema.Types.Mixed, default: {} },
  coreScore: { type: Number, default: 85 },
  finalScore: { type: Number, default: 85 },
  exitReason: { type: String, default: null },
  
  // Multi-Stage Take Profit
  tp1: { type: Number },
  tp2: { type: Number },
  tp3: { type: Number },
  runnerActive: { type: Boolean, default: false },

  meta: { type: Schema.Types.Mixed, default: {} },

  archived:   { type: Boolean, default: false, index: true },
  archivedAt: { type: Date, default: null },
});

TradeSchema.index({ userId: 1, symbol: 1, mode: 1, status: 1 });
TradeSchema.index({ userId: 1, status: 1, mode: 1, accountType: 1 });

export const Trade = mongoose.model<ITrade>("Trade", TradeSchema);
