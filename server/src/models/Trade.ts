/*
 * ─── Trade model ───────────────────────────────────────
 *
 * Every order (PAPER or LIVE).  Status lifecycle:
 *   PENDING → OPEN → CLOSED | CANCELLED
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export type TradeStatus = "PENDING" | "OPEN" | "CLOSED" | "CANCELLED";

export interface ITrade extends Document {
  userId: Types.ObjectId;
  mode: "PAPER" | "LIVE";
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  sl: number | null;
  tp: number | null;
  strategy: string | null;
  status: TradeStatus;
  pnl: number;
  openedAt: Date;
  closedAt: Date | null;
  meta: Record<string, unknown>;
}

const TradeSchema = new Schema<ITrade>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  mode: { type: String, enum: ["PAPER", "LIVE"], required: true },
  symbol: { type: String, required: true },
  side: { type: String, enum: ["BUY", "SELL"], required: true },
  quantity: { type: Number, required: true },
  entryPrice: { type: Number, required: true },
  exitPrice: { type: Number, default: null },
  sl: { type: Number, default: null },
  tp: { type: Number, default: null },
  strategy: { type: String, default: null },
  status: {
    type: String,
    enum: ["PENDING", "OPEN", "CLOSED", "CANCELLED"],
    default: "OPEN",
  },
  pnl: { type: Number, default: 0 },
  openedAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
  meta: { type: Schema.Types.Mixed, default: {} },
});

TradeSchema.index({ userId: 1, symbol: 1, mode: 1, status: 1 });

export const Trade = mongoose.model<ITrade>("Trade", TradeSchema);
