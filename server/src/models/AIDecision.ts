/*
 * ─── AI Reasoning Timeline model (V8.0) ────────────────
 *
 * Stores every AI decision for historical transparency.
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IAIDecision extends Document {
  userId: Types.ObjectId;
  symbol: string;
  decision: "BUY" | "SELL" | "HOLD" | "EXIT";
  reason: string;
  confidence: number;
  qualityScore: number;
  regime: string;
  timestamp: Date;
}

const AIDecisionSchema = new Schema<IAIDecision>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  symbol: { type: String, required: true, index: true },
  decision: { type: String, enum: ["BUY", "SELL", "HOLD", "EXIT"], required: true },
  reason: { type: String, default: "" },
  confidence: { type: Number, default: 0 },
  qualityScore: { type: Number, default: 0 },
  regime: { type: String, default: "" },
  timestamp: { type: Date, default: Date.now },
});

export const AIDecision = mongoose.model<IAIDecision>("AIDecision", AIDecisionSchema);
