import mongoose, { Schema, type Document } from "mongoose";

/**
 * One realized-outcome record for AdaptiveBayesianGate's empirical base rate
 * (server/src/services/aqea/bayesian/AdaptiveBayesianGate.ts). The gate keeps
 * the most recent 1000 in memory; persisting them lets the calibration survive
 * restarts instead of reverting to the strict analytical prior for 25 closes.
 * A 30-day TTL bounds the collection.
 */
export interface IBayesianGateRecord extends Document {
  regime: string;
  realizedOutcome: "WIN" | "LOSS";
  priorOdds: number;
  posteriorProbability: number;
  timestamp: number;
  createdAt: Date;
}

const BayesianGateRecordSchema = new Schema<IBayesianGateRecord>(
  {
    regime: { type: String, required: true },
    realizedOutcome: { type: String, enum: ["WIN", "LOSS"], required: true },
    priorOdds: { type: Number, default: 0.5 },
    posteriorProbability: { type: Number, default: 0.5 },
    timestamp: { type: Number, required: true, index: true },
    createdAt: { type: Date, default: Date.now, expires: 30 * 24 * 3600 },
  },
  { minimize: false }
);

export const BayesianGateRecord =
  mongoose.models?.BayesianGateRecord ||
  mongoose.model<IBayesianGateRecord>("BayesianGateRecord", BayesianGateRecordSchema);

export default BayesianGateRecord;
