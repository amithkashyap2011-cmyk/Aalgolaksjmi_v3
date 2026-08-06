/*
 * ─── WalletSnapshot model ──────────────────────────────
 *
 * Point‑in‑time balances per asset, per mode (PAPER / LIVE).
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IWalletSnapshot extends Document {
  userId: Types.ObjectId;
  mode: "PAPER" | "LIVE";
  accountType: "SPOT" | "FUTURES";
  balances: Map<string, number>; // asset -> amount  (e.g. "USDT" -> 1342.53)
  updatedAt: Date;
}

const WalletSnapshotSchema = new Schema<IWalletSnapshot>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mode: { type: String, enum: ["PAPER", "LIVE"], required: true },
    accountType: { type: String, enum: ["SPOT", "FUTURES"], default: "FUTURES" },
    balances: { type: Map, of: Number, default: () => new Map([["USDT", 0]]) },
  },
  { timestamps: { updatedAt: true, createdAt: false } },
);

WalletSnapshotSchema.index({ userId: 1, mode: 1, accountType: 1 }, { unique: true });

export const WalletSnapshot = mongoose.model<IWalletSnapshot>(
  "WalletSnapshot",
  WalletSnapshotSchema,
);
