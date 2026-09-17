import mongoose, { Schema, Document } from "mongoose";
import {
  IAuthoritativeCapitalState,
  IPortfolioExposure,
  IStrategyAllocation,
  IReserveCapital,
  PortfolioDrawdownState,
  VolatilityRegime,
  IStressScenarioResult,
} from "../services/agentic/portfolio/types.js";

export interface IAutonomousPortfolioStateDocument extends Document {
  snapshotId: string;
  capitalState: IAuthoritativeCapitalState;
  exposure: IPortfolioExposure;
  allocations: IStrategyAllocation[];
  reserves: IReserveCapital;
  drawdownState: PortfolioDrawdownState;
  volatilityRegime: VolatilityRegime;
  stressResults: IStressScenarioResult[];
  createdAt: Date;
}

const AutonomousPortfolioStateSchema: Schema = new Schema(
  {
    snapshotId: { type: String, required: true, unique: true, index: true },
    capitalState: { type: Schema.Types.Mixed, required: true },
    exposure: { type: Schema.Types.Mixed, required: true },
    allocations: { type: Array, default: [] },
    reserves: { type: Schema.Types.Mixed, required: true },
    drawdownState: {
      type: String,
      enum: ["NORMAL", "CAUTION", "REDUCE_RISK", "STOP_NEW_ENTRIES", "EMERGENCY"],
      default: "NORMAL",
    },
    volatilityRegime: {
      type: String,
      enum: ["LOW", "NORMAL", "HIGH", "EXTREME"],
      default: "NORMAL",
    },
    stressResults: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

export const AutonomousPortfolioState =
  mongoose.models.AutonomousPortfolioState ||
  mongoose.model<IAutonomousPortfolioStateDocument>(
    "AutonomousPortfolioState",
    AutonomousPortfolioStateSchema
  );
