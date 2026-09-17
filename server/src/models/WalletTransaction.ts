/*
 * ─── WalletTransaction model ──────────────────────────
 *
 * Tracks deposits, withdrawals, and P2P transfers.
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";
import { CapitalSource } from "./WalletSnapshot.js";

export interface IWalletTransaction extends Document {
  userId: Types.ObjectId;
  type: "DEPOSIT" | "WITHDRAW" | "WITHDRAW_CRYPTO" | "P2P_BUY" | "P2P_SELL" | "ADJUSTMENT";
  method: "UPI" | "P2P" | "CRYPTO" | "SYSTEM" | "DEBUG";
  capitalSource?: CapitalSource;
  amount: number;          // in INR or USDT
  currency: string;        // "INR" or "USDT"
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  upiId?: string;          // sender/receiver UPI
  txnRef?: string;         // payment gateway reference
  p2pCounterparty?: string; // other user email for P2P
  p2pPrice?: number;       // INR per USDT for P2P
  note?: string;
  accountType?: "SPOT" | "FUTURES" | "INDIAN_NSE" | "INDIAN_BSE" | "INDIAN_NIFTY50" | "INDIAN_FNO" | "INDIAN_EQUITY";
  createdAt: Date;
  updatedAt: Date;
}

const WalletTransactionSchema = new Schema<IWalletTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["DEPOSIT", "WITHDRAW", "WITHDRAW_CRYPTO", "P2P_BUY", "P2P_SELL", "ADJUSTMENT"], required: true },
    method: { type: String, enum: ["UPI", "P2P", "CRYPTO", "SYSTEM", "DEBUG"], required: true },
    capitalSource: {
      type: String,
      enum: ["LIVE_BROKER", "PAPER_INITIALIZATION", "DEPOSIT", "TRANSFER", "REALIZED_PNL", "FUNDING", "OTHER"],
      default: "OTHER",
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["PENDING", "COMPLETED", "FAILED", "CANCELLED"], default: "PENDING" },
    upiId: { type: String },
    txnRef: { type: String },
    p2pCounterparty: { type: String },
    p2pPrice: { type: Number },
    note: { type: String },
    accountType: { type: String, enum: ["SPOT", "FUTURES", "INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO", "INDIAN_EQUITY"], default: "FUTURES" },
  },
  { timestamps: true },
);

WalletTransactionSchema.index({ userId: 1, type: 1, status: 1, accountType: 1 });
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
WalletTransactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
WalletTransactionSchema.index({ accountType: 1, type: 1, createdAt: -1 });
// Dedup guard for transactions that carry an external/idempotency reference.
// A compound *sparse* index would still index rows with a null txnRef (since
// userId/accountType are always present), so two ref-less writes for the same
// user+account collided on (userId, accountType, null). A partial index scoped
// to documents that actually have a txnRef avoids that while preserving dedup.
WalletTransactionSchema.index(
  { userId: 1, accountType: 1, txnRef: 1 },
  { unique: true, partialFilterExpression: { txnRef: { $type: "string" } } },
);

// 🛡️ FINANCIAL INTEGRITY: Strict Append-Only Protection (Requirement 21)
if (typeof (WalletTransactionSchema as any)?.pre === "function") {
  WalletTransactionSchema.pre(["deleteOne", "deleteMany", "findOneAndDelete"], function (next) {
    const filter = this.getFilter() || {};
    // Block explicit deletion of COMPLETED (settled) ledger rows in any
    // environment. A blanket production guard was also rejecting the
    // user-scoped deletes an account reset issues, leaving stale rows behind.
    if (filter.status === "COMPLETED") {
      return next(new Error("[FINANCIAL_AUDIT_VIOLATION] Completed wallet transactions cannot be deleted. Financial ledger is strictly append-only."));
    }
    next();
  });
}

export const WalletTransaction = mongoose.model<IWalletTransaction>(
  "WalletTransaction",
  WalletTransactionSchema,
);
