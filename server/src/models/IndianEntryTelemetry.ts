import mongoose, { Schema, type Document, type Types } from "mongoose";

/**
 * Post-entry telemetry for Indian trades: how the position's value moved after
 * entry, independent of the stop/target that ended it. Answers "do these
 * rule-based entries have any edge?" — the final P&L alone can't, because the
 * stops decide the exit. One document per trade; joined to Trade at report time
 * for the final result.
 *
 * Checkpoints only fill while the position is still open, so later checkpoints
 * are right-censored (a trade stopped out at 4 minutes has no 15/30-minute
 * value). Reports must show the count behind each checkpoint.
 */
export interface IIndianEntryTelemetry extends Document {
  tradeId: string;
  userId: Types.ObjectId;
  symbol: string;
  underlying?: string;
  strategy?: string;
  regime?: string;
  entryValue: number;
  entryAt: Date;
  /** % change of position value vs entry at +5 / +15 / +30 min (null until reached). */
  ret5?: number | null;
  ret15?: number | null;
  ret30?: number | null;
  /** Best / worst % excursion seen while open. */
  mfePct: number;
  maePct: number;
  lastValue: number;
  lastAt: Date;
  observations: number;
}

const IndianEntryTelemetrySchema = new Schema<IIndianEntryTelemetry>(
  {
    tradeId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    symbol: { type: String, required: true },
    underlying: { type: String, index: true },
    strategy: { type: String, index: true },
    regime: { type: String },
    entryValue: { type: Number, required: true },
    entryAt: { type: Date, required: true },
    ret5: { type: Number, default: null },
    ret15: { type: Number, default: null },
    ret30: { type: Number, default: null },
    mfePct: { type: Number, default: 0 },
    maePct: { type: Number, default: 0 },
    lastValue: { type: Number, default: 0 },
    lastAt: { type: Date },
    observations: { type: Number, default: 0 },
  },
  { minimize: false }
);

// Bounded: telemetry older than 90 days is dropped.
IndianEntryTelemetrySchema.index({ entryAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const IndianEntryTelemetry =
  mongoose.models?.IndianEntryTelemetry ||
  mongoose.model<IIndianEntryTelemetry>("IndianEntryTelemetry", IndianEntryTelemetrySchema);

export default IndianEntryTelemetry;
