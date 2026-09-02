/**
 * ═══════════════════════════════════════════════════════════════════
 *  Indian Multi-Leg Strategy Trade Group Mongoose Model
 * ═══════════════════════════════════════════════════════════════════
 */

import mongoose, { Schema, Document } from "mongoose";

export interface IIndianTradeLeg {
  legId: string;
  action: "BUY" | "SELL";
  instrumentType: "CE" | "PE" | "FUTURE" | "EQUITY";
  strike: number;
  expiry: string;
  tradingSymbol: string;
  token: string;
  quantity: number;
  lotSize: number;
  entryPrice: number;
  exitPrice?: number;
  status: string;
  pnl: number;
  brokerOrderId?: string;
}

export interface IIndianTradeGroup extends Document {
  tradeGroupId: string;
  strategyInstanceId: string;
  userId: mongoose.Types.ObjectId;
  mode: "BACKTEST" | "PAPER" | "LIVE";
  underlying: string;
  strategy: string;
  position: "LONG" | "SHORT" | "NEUTRAL";
  status: "OPEN" | "CLOSED" | "CANCELLED" | "PARTIALLY_FILLED" | "FAILED";
  legs: IIndianTradeLeg[];
  entryPrice: number;
  exitPrice?: number;
  netPnl: number;
  grossPnl: number;
  totalCharges: number;
  maxRisk: number;
  maxProfit: number;
  openedAt: Date;
  closedAt?: Date;
  exitReason?: string;
  tradeScore: number;
  entryReason: string[];
}

const IndianTradeGroupSchema = new Schema<IIndianTradeGroup>({
  tradeGroupId: { type: String, required: true, unique: true, index: true },
  strategyInstanceId: { type: String, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  mode: { type: String, enum: ["BACKTEST", "PAPER", "LIVE"], default: "PAPER" },
  underlying: { type: String, required: true, index: true },
  strategy: { type: String, required: true, index: true },
  position: { type: String, enum: ["LONG", "SHORT", "NEUTRAL"], default: "LONG" },
  status: {
    type: String,
    enum: ["OPEN", "CLOSED", "CANCELLED", "PARTIALLY_FILLED", "FAILED"],
    default: "OPEN",
    index: true,
  },
  legs: [
    {
      legId: { type: String, required: true },
      action: { type: String, enum: ["BUY", "SELL"], required: true },
      instrumentType: { type: String, enum: ["CE", "PE", "FUTURE", "EQUITY"], required: true },
      strike: { type: Number, default: 0 },
      expiry: { type: String, required: true },
      tradingSymbol: { type: String, required: true },
      token: { type: String, default: "" },
      quantity: { type: Number, required: true },
      lotSize: { type: Number, required: true },
      entryPrice: { type: Number, required: true },
      exitPrice: { type: Number },
      status: { type: String, default: "OPEN" },
      pnl: { type: Number, default: 0 },
      brokerOrderId: { type: String },
    },
  ],
  entryPrice: { type: Number, required: true },
  exitPrice: { type: Number },
  netPnl: { type: Number, default: 0 },
  grossPnl: { type: Number, default: 0 },
  totalCharges: { type: Number, default: 0 },
  maxRisk: { type: Number, default: 0 },
  maxProfit: { type: Number, default: 0 },
  openedAt: { type: Date, default: Date.now },
  closedAt: { type: Date },
  exitReason: { type: String },
  tradeScore: { type: Number, default: 80 },
  entryReason: { type: [String], default: [] },
});

export const IndianTradeGroup = mongoose.model<IIndianTradeGroup>(
  "IndianTradeGroup",
  IndianTradeGroupSchema
);
