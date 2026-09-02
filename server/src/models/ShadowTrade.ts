import mongoose, { Schema, Document } from "mongoose";

export interface IShadowTrade extends Document {
  shadowTradeId: string;
  symbol: string;
  side: "BUY" | "SELL";
  requestedQty: number;
  filledQty: number;
  remainingQty: number;
  requestedPrice: number;
  executedPrice: number;
  slippagePct: number;
  spreadPct: number;
  marketImpactPct: number;
  latencyMs: {
    inference: number;
    risk: number;
    execution: number;
    exchange: number;
    confirmation: number;
    total: number;
  };
  executionQualityScore: number;
  exchangeType: "BINANCE_TESTNET" | "BYBIT_TESTNET" | "OKX_DEMO";
  createdAt: Date;
}

const ShadowTradeSchema: Schema = new Schema({
  shadowTradeId: { type: String, required: true, unique: true },
  symbol: { type: String, required: true, index: true },
  side: { type: String, enum: ["BUY", "SELL"], required: true },
  requestedQty: { type: Number, required: true },
  filledQty: { type: Number, required: true },
  remainingQty: { type: Number, required: true },
  requestedPrice: { type: Number, required: true },
  executedPrice: { type: Number, required: true },
  slippagePct: { type: Number, required: true },
  spreadPct: { type: Number, required: true },
  marketImpactPct: { type: Number, default: 0.01 },
  latencyMs: {
    inference: { type: Number, default: 15 },
    risk: { type: Number, default: 5 },
    execution: { type: Number, default: 8 },
    exchange: { type: Number, default: 12 },
    confirmation: { type: Number, default: 4 },
    total: { type: Number, default: 44 },
  },
  executionQualityScore: { type: Number, default: 94 },
  exchangeType: { type: String, enum: ["BINANCE_TESTNET", "BYBIT_TESTNET", "OKX_DEMO"], default: "BINANCE_TESTNET" },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const ShadowTrade = mongoose.models.ShadowTrade || mongoose.model<IShadowTrade>("ShadowTrade", ShadowTradeSchema);
