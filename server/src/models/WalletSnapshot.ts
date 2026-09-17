/*
 * ─── WalletSnapshot model ──────────────────────────────
 *
 * Point‑in‑time balances per asset, per mode (PAPER / LIVE).
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export type CapitalSource =
  | "LIVE_BROKER"
  | "PAPER_INITIALIZATION"
  | "DEPOSIT"
  | "TRANSFER"
  | "REALIZED_PNL"
  | "FUNDING"
  | "OTHER";

export interface IWalletSnapshot extends Document {
  userId: Types.ObjectId;
  mode: "PAPER" | "LIVE";
  accountType: "SPOT" | "FUTURES" | "INDIAN_NSE" | "INDIAN_BSE" | "INDIAN_NIFTY50" | "INDIAN_FNO" | "INDIAN_EQUITY";
  balances: Map<string, number>; // asset -> amount  (e.g. "USDT" -> 1342.53)
  capitalSource?: CapitalSource;
  provenanceNote?: string;
  updatedAt: Date;
}

const WalletSnapshotSchema = new Schema<IWalletSnapshot>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mode: { type: String, enum: ["PAPER", "LIVE"], required: true },
    accountType: {
      type: String,
      enum: ["SPOT", "FUTURES", "INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO", "INDIAN_EQUITY"],
      default: "FUTURES",
    },
    balances: { type: Map, of: Number, default: () => new Map([["USDT", 0], ["INR", 0]]) },
    capitalSource: {
      type: String,
      enum: ["LIVE_BROKER", "PAPER_INITIALIZATION", "DEPOSIT", "TRANSFER", "REALIZED_PNL", "FUNDING", "OTHER"],
      default: "OTHER",
    },
    provenanceNote: { type: String },
  },
  { timestamps: { updatedAt: true, createdAt: false } },
);

WalletSnapshotSchema.index({ userId: 1, mode: 1, accountType: 1 }, { unique: true });

export const WalletSnapshot = mongoose.model<IWalletSnapshot>(
  "WalletSnapshot",
  WalletSnapshotSchema,
);
