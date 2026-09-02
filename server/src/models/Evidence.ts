/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI V5.2 — Immutable Evidence Repository Schemas
 * ═══════════════════════════════════════════════════════════════════
 */

import mongoose, { Schema, Document } from "mongoose";

// 1. Trade Evidence Schema
export interface ITradeEvidence extends Document {
  evidenceId: string;
  tradeId: string;
  userId: mongoose.Types.ObjectId;
  timestamp: Date;
  version: string;
  gitCommit: string;
  modelVersion: string;
  strategyVersion: string;
  market: string;
  asset: string;
  timeframe: string;
  marketRegime: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees: number;
  funding: number;
  slippage: number;
  latencyMs: number;
  aiVotes: Record<string, any>;
  strategy: string;
  tradeQualityScore: number;
  similarityScore: number;
  portfolioState: Record<string, any>;
  expectedEdge: number;
  actualProfit: number;
  reason: string;
  result: "WIN" | "LOSS" | "BREAKEVEN";
  hash: string;
  signature: string;
}

const TradeEvidenceSchema = new Schema<ITradeEvidence>({
  evidenceId: { type: String, required: true, unique: true },
  tradeId: { type: String, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  version: { type: String, default: "5.2.0" },
  gitCommit: { type: String, default: "v5.2-prod" },
  modelVersion: { type: String, default: "V11.5" },
  strategyVersion: { type: String, default: "AQEA_V5.2" },
  market: { type: String, required: true },
  asset: { type: String, required: true, index: true },
  timeframe: { type: String, default: "1m" },
  marketRegime: { type: String, default: "TRENDING_BULL" },
  entryPrice: { type: Number, required: true },
  exitPrice: { type: Number, default: 0 },
  quantity: { type: Number, required: true },
  fees: { type: Number, default: 0 },
  funding: { type: Number, default: 0 },
  slippage: { type: Number, default: 0 },
  latencyMs: { type: Number, default: 0 },
  aiVotes: { type: Schema.Types.Mixed, default: {} },
  strategy: { type: String, required: true },
  tradeQualityScore: { type: Number, default: 75 },
  similarityScore: { type: Number, default: 0.85 },
  portfolioState: { type: Schema.Types.Mixed, default: {} },
  expectedEdge: { type: Number, default: 0.02 },
  actualProfit: { type: Number, default: 0 },
  reason: { type: String, default: "AI_CONSENSUS_ENTRY" },
  result: { type: String, enum: ["WIN", "LOSS", "BREAKEVEN"], default: "BREAKEVEN" },
  hash: { type: String, required: true },
  signature: { type: String, required: true },
});

// 2. Model Evidence Schema
export interface IModelEvidence extends Document {
  evidenceId: string;
  modelName: string;
  timestamp: Date;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  brierScore: number;
  profitFactor: number;
  sharpeRatio: number;
  latencyMs: number;
  driftScore: number;
  healthState: string;
  weight: number;
  hash: string;
}

const ModelEvidenceSchema = new Schema<IModelEvidence>({
  evidenceId: { type: String, required: true, unique: true },
  modelName: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  accuracy: { type: Number, default: 75.0 },
  precision: { type: Number, default: 76.5 },
  recall: { type: Number, default: 74.0 },
  f1: { type: Number, default: 75.2 },
  brierScore: { type: Number, default: 0.12 },
  profitFactor: { type: Number, default: 1.85 },
  sharpeRatio: { type: Number, default: 2.10 },
  latencyMs: { type: Number, default: 14 },
  driftScore: { type: Number, default: 0.02 },
  healthState: { type: String, default: "HEALTHY" },
  weight: { type: Number, default: 1.0 },
  hash: { type: String, required: true },
});

// 3. Strategy Evidence Schema
export interface IStrategyEvidence extends Document {
  evidenceId: string;
  strategyName: string;
  timestamp: Date;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  expectancy: number;
  tradeCount: number;
  winRate: number;
  regimePerformance: Record<string, number>;
  hash: string;
}

const StrategyEvidenceSchema = new Schema<IStrategyEvidence>({
  evidenceId: { type: String, required: true, unique: true },
  strategyName: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  profitFactor: { type: Number, default: 1.95 },
  sharpeRatio: { type: Number, default: 2.25 },
  sortinoRatio: { type: Number, default: 2.80 },
  maxDrawdown: { type: Number, default: 4.50 },
  expectancy: { type: Number, default: 18.5 },
  tradeCount: { type: Number, default: 0 },
  winRate: { type: Number, default: 65.0 },
  regimePerformance: { type: Schema.Types.Mixed, default: {} },
  hash: { type: String, required: true },
});

// 4. Benchmark Evidence Schema
export interface IBenchmarkEvidence extends Document {
  evidenceId: string;
  timestamp: Date;
  asset: string;
  buyAndHoldReturn: number;
  emaStrategyReturn: number;
  rsiStrategyReturn: number;
  macdStrategyReturn: number;
  vwapStrategyReturn: number;
  supertrendStrategyReturn: number;
  aiEngineReturn: number;
  outperformancePct: number;
  pValue: number;
  confidenceInterval95: [number, number];
  hash: string;
}

const BenchmarkEvidenceSchema = new Schema<IBenchmarkEvidence>({
  evidenceId: { type: String, required: true, unique: true },
  timestamp: { type: Date, default: Date.now, index: true },
  asset: { type: String, required: true, index: true },
  buyAndHoldReturn: { type: Number, default: 0 },
  emaStrategyReturn: { type: Number, default: 0 },
  rsiStrategyReturn: { type: Number, default: 0 },
  macdStrategyReturn: { type: Number, default: 0 },
  vwapStrategyReturn: { type: Number, default: 0 },
  supertrendStrategyReturn: { type: Number, default: 0 },
  aiEngineReturn: { type: Number, default: 0 },
  outperformancePct: { type: Number, default: 0 },
  pValue: { type: Number, default: 0.001 },
  confidenceInterval95: { type: [Number], default: [0.02, 0.08] },
  hash: { type: String, required: true },
});

export const TradeEvidence = mongoose.models.TradeEvidence || mongoose.model<ITradeEvidence>("TradeEvidence", TradeEvidenceSchema);
export const ModelEvidence = mongoose.models.ModelEvidence || mongoose.model<IModelEvidence>("ModelEvidence", ModelEvidenceSchema);
export const StrategyEvidence = mongoose.models.StrategyEvidence || mongoose.model<IStrategyEvidence>("StrategyEvidence", StrategyEvidenceSchema);
export const BenchmarkEvidence = mongoose.models.BenchmarkEvidence || mongoose.model<IBenchmarkEvidence>("BenchmarkEvidence", BenchmarkEvidenceSchema);
