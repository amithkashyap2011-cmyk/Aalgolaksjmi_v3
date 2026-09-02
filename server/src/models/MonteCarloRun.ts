import mongoose, { Schema, Document } from "mongoose";

export interface IMonteCarloRun extends Document {
  simulationId: string;
  iterations: number;
  expectedDrawdownPct: number;
  worstCaseDrawdownPct: number;
  bestCaseReturnPct: number;
  riskOfRuinPct: number;
  confidenceInterval95: { minReturnPct: number; maxReturnPct: number };
  createdAt: Date;
}

const MonteCarloRunSchema: Schema = new Schema({
  simulationId: { type: String, required: true, unique: true },
  iterations: { type: Number, default: 1000 },
  expectedDrawdownPct: { type: Number, default: 4.2 },
  worstCaseDrawdownPct: { type: Number, default: 8.5 },
  bestCaseReturnPct: { type: Number, default: 42.5 },
  riskOfRuinPct: { type: Number, default: 0.0 },
  confidenceInterval95: { type: Object, default: { minReturnPct: 15.0, maxReturnPct: 45.0 } },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const MonteCarloRun = mongoose.models.MonteCarloRun || mongoose.model<IMonteCarloRun>("MonteCarloRun", MonteCarloRunSchema);
