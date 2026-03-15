/*
 * ─── WalletTransaction model ──────────────────────────
 *
 * Tracks deposits, withdrawals, and P2P transfers.
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IWalletTransaction extends Document {
  userId: Types.ObjectId;
  type: "DEPOSIT" | "WITHDRAW" | "P2P_BUY" | "P2P_SELL";
  method: "UPI" | "P2P" | "SYSTEM";
  amount: number;          // in INR or USDT
  currency: string;        // "INR" or "USDT"
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  upiId?: string;          // sender/receiver UPI
  txnRef?: string;         // payment gateway reference
  p2pCounterparty?: string; // other user email for P2P
  p2pPrice?: number;       // INR per USDT for P2P
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WalletTransactionSchema = new Schema<IWalletTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["DEPOSIT", "WITHDRAW", "P2P_BUY", "P2P_SELL"], required: true },
    method: { type: String, enum: ["UPI", "P2P", "SYSTEM"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["PENDING", "COMPLETED", "FAILED", "CANCELLED"], default: "PENDING" },
    upiId: { type: String },
    txnRef: { type: String },
    p2pCounterparty: { type: String },
    p2pPrice: { type: Number },
    note: { type: String },
  },
  { timestamps: true },
);

export const WalletTransaction = mongoose.model<IWalletTransaction>(
  "WalletTransaction",
  WalletTransactionSchema,
);
