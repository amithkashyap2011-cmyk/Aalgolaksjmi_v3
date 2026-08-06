import mongoose, { Schema, Document } from "mongoose";

export interface IMacroEventLog extends Document {
  eventName: string;
  category: "FED" | "RBI" | "INFLATION" | "GDP" | "ON_CHAIN" | "NEWS";
  impactScore: number;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  eventTimestamp: Date;
}

const MacroEventLogSchema: Schema = new Schema({
  eventName: { type: String, required: true, index: true },
  category: { type: String, enum: ["FED", "RBI", "INFLATION", "GDP", "ON_CHAIN", "NEWS"], required: true },
  impactScore: { type: Number, default: 0.5 },
  sentiment: { type: String, enum: ["BULLISH", "BEARISH", "NEUTRAL"], default: "NEUTRAL" },
  eventTimestamp: { type: Date, default: Date.now, index: true },
});

export const MacroEventLog = mongoose.models.MacroEventLog || mongoose.model<IMacroEventLog>("MacroEventLog", MacroEventLogSchema);
