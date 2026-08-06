import mongoose, { Schema, Document } from "mongoose";

export interface IAutonomousExperiment extends Document {
  experimentId: string;
  hypothesisId: string;
  experimentType: "BAYESIAN_OPT" | "GRID_SEARCH" | "WALK_FORWARD" | "MONTE_CARLO";
  candidateProfitFactor: number;
  candidateSharpe: number;
  deltaProfitFactor: number;
  deltaSharpe: number;
  statisticallySignificant: boolean;
  decision: "PROCEED_TO_HUMAN_APPROVAL" | "REJECTED";
  executedAt: Date;
}

const AutonomousExperimentSchema: Schema = new Schema({
  experimentId: { type: String, required: true, unique: true, index: true },
  hypothesisId: { type: String, required: true, index: true },
  experimentType: { type: String, enum: ["BAYESIAN_OPT", "GRID_SEARCH", "WALK_FORWARD", "MONTE_CARLO"], default: "WALK_FORWARD" },
  candidateProfitFactor: { type: Number, required: true },
  candidateSharpe: { type: Number, required: true },
  deltaProfitFactor: { type: Number, required: true },
  deltaSharpe: { type: Number, required: true },
  statisticallySignificant: { type: Boolean, required: true },
  decision: { type: String, enum: ["PROCEED_TO_HUMAN_APPROVAL", "REJECTED"], required: true },
  executedAt: { type: Date, default: Date.now, index: true },
});

export const AutonomousExperiment = mongoose.models.AutonomousExperiment || mongoose.model<IAutonomousExperiment>("AutonomousExperiment", AutonomousExperimentSchema);
