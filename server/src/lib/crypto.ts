/*
 * ─── AES‑256‑GCM encryption for Binance API keys ──────
 */
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? "";
  if (hex.length !== 64) throw new Error("ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  return Buffer.from(hex, "hex");
}

export interface Encrypted {
  ciphertext: string; // base64
  iv: string;         // base64
  authTag: string;    // base64
}

export function encrypt(plaintext: string): Encrypted {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decrypt(data: Encrypted): string {
  const decipher = crypto.createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(data.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(data.authTag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(data.ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
