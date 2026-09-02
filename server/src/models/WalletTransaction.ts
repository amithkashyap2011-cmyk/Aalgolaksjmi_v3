/*
 * ─── WalletTransaction model ──────────────────────────
 *
 * Tracks deposits, withdrawals, and P2P transfers.
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IWalletTransaction extends Document {
  userId: Types.ObjectId;
  type: "DEPOSIT" | "WITHDRAW" | "WITHDRAW_CRYPTO" | "P2P_BUY" | "P2P_SELL" | "ADJUSTMENT";
  method: "UPI" | "P2P" | "CRYPTO" | "SYSTEM" | "DEBUG";
  amount: number;          // in INR or USDT
  currency: string;        // "INR" or "USDT"
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  upiId?: string;          // sender/receiver UPI
  txnRef?: string;         // payment gateway reference
  p2pCounterparty?: string; // other user email for P2P
  p2pPrice?: number;       // INR per USDT for P2P
  note?: string;
  accountType?: "SPOT" | "FUTURES" | "INDIAN_NSE" | "INDIAN_BSE" | "INDIAN_NIFTY50" | "INDIAN_FNO";
  createdAt: Date;
  updatedAt: Date;
}

const WalletTransactionSchema = new Schema<IWalletTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["DEPOSIT", "WITHDRAW", "WITHDRAW_CRYPTO", "P2P_BUY", "P2P_SELL", "ADJUSTMENT"], required: true },
    method: { type: String, enum: ["UPI", "P2P", "CRYPTO", "SYSTEM", "DEBUG"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["PENDING", "COMPLETED", "FAILED", "CANCELLED"], default: "PENDING" },
    upiId: { type: String },
    txnRef: { type: String },
    p2pCounterparty: { type: String },
    p2pPrice: { type: Number },
    note: { type: String },
    accountType: { type: String, enum: ["SPOT", "FUTURES", "INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO"], default: "FUTURES" },
  },
  { timestamps: true },
);

WalletTransactionSchema.index({ userId: 1, type: 1, status: 1, accountType: 1 });
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });

export const WalletTransaction = mongoose.model<IWalletTransaction>(
  "WalletTransaction",
  WalletTransactionSchema,
);
