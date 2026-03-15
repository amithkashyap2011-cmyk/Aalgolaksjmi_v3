/*
 * ─── ApiKeys model ─────────────────────────────────────
 *
 * Encrypted Binance API key + secret, per user.
 */
import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IApiKeys extends Document {
  userId: Types.ObjectId;
  encryptedKey: string;   // AES‑256‑GCM encrypted
  encryptedSecret: string;
  iv: string;             // IV for key
  authTag: string;        // authTag for key
  ivSecret: string;       // IV for secret
  authTagSecret: string;  // authTag for secret
  lastTestedAt: Date | null;
}

const ApiKeysSchema = new Schema<IApiKeys>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  encryptedKey: { type: String, required: true },
  encryptedSecret: { type: String, required: true },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
  ivSecret: { type: String, default: "" },
  authTagSecret: { type: String, default: "" },
  lastTestedAt: { type: Date, default: null },
});

export const ApiKeys = mongoose.model<IApiKeys>("ApiKeys", ApiKeysSchema);
