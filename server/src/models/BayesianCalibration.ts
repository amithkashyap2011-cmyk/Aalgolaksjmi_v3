import mongoose, { Schema, type Document } from "mongoose";

/**
 * Persisted aggregate counts for the calibrated Bayesian win-probability model
 * (server/src/services/aqea/bayesianPredictor.ts). Stored as a SINGLE document
 * (keyed by `key: "GLOBAL"`) holding:
 *   - global WIN/LOSS totals (used for the empirical prior),
 *   - per-(dimension,bin) WIN/LOSS counts (used for empirical likelihood ratios),
 *   - per-calibration-bin WIN/LOSS counts (histogram-binning calibration layer).
 *
 * The engine loads this once into memory and write-throughs (debounced) on
 * recordOutcome(). Nested count maps use Mixed so we can extend the binning
 * scheme without a migration.
 */

export interface IBinCount {
  win: number;
  loss: number;
}

export interface IBayesianCalibration extends Document {
  key: string;
  globalWin: number;
  globalLoss: number;
  // dimension -> array of {win, loss}, one entry per bin.
  dimensions: Record<string, IBinCount[]>;
  // calibration histogram bins (~10), one {win, loss} per bin.
  calibration: IBinCount[];
}

const BayesianCalibrationSchema = new Schema<IBayesianCalibration>(
  {
    key: { type: String, required: true, unique: true, default: "GLOBAL" },
    globalWin: { type: Number, default: 0 },
    globalLoss: { type: Number, default: 0 },
    dimensions: { type: Schema.Types.Mixed, default: {} },
    calibration: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, minimize: false }
);

export const BayesianCalibration =
  mongoose.models.BayesianCalibration ||
  mongoose.model<IBayesianCalibration>("BayesianCalibration", BayesianCalibrationSchema);

export default BayesianCalibration;
