/*
 * ─── Alert model ───────────────────────────────────────
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IAlert extends Document {
  userId: Types.ObjectId;
  severity: "GREEN" | "AMBER" | "RED";
  symbol: string;
  title: string;
  message: string;
  createdAt: Date;
}

const AlertSchema = new Schema<IAlert>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    severity: { type: String, enum: ["GREEN", "AMBER", "RED"], required: true },
    symbol: { type: String, default: "" },
    title: { type: String, required: true },
    message: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Alert = mongoose.model<IAlert>("Alert", AlertSchema);
