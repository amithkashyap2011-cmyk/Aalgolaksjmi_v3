/**
 * Angel One SmartAPI credentials — encryption at rest and redaction.
 *
 * These lived in plaintext in the Settings document (API key, PIN and TOTP
 * secret — together, full account access) and GET /settings/get returned them
 * to the browser. Secrets are now sealed with the same AES-256-GCM used for
 * Binance keys, stored as a tagged string so the Settings schema stays String,
 * and never sent back to the client — only "is set" flags and a masked key.
 */
import { encrypt, decrypt } from "../../lib/crypto.js";

const PREFIX = "enc:v1:";

/** Fields that are secret and must never leave the server in the clear. */
export const ANGEL_SECRET_FIELDS = ["angelOneApiKey", "angelOnePin", "angelOneTotpSecret"] as const;

export function isSealed(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function sealSecret(plain: string): string {
  const e = encrypt(plain);
  return `${PREFIX}${e.iv}:${e.authTag}:${e.ciphertext}`;
}

/** Decrypts a sealed value; returns legacy plaintext unchanged. */
export function openSecret(stored: unknown): string {
  if (typeof stored !== "string" || stored === "") return "";
  if (!isSealed(stored)) return stored; // legacy plaintext (pre-migration)
  const [iv, authTag, ciphertext] = stored.slice(PREFIX.length).split(":");
  return decrypt({ iv, authTag, ciphertext });
}

/**
 * Copy of a Settings document that is safe to send to the client: secret
 * values removed, replaced by `<field>Set` booleans (+ a masked API key).
 */
export function redactAngelSecrets<T extends Record<string, any>>(settings: T): T {
  if (!settings) return settings;
  const out: Record<string, any> = { ...settings };
  for (const f of ANGEL_SECRET_FIELDS) {
    const has = typeof out[f] === "string" && out[f] !== "";
    out[`${f}Set`] = has;
    if (f === "angelOneApiKey" && has) {
      let plain = "";
      try { plain = openSecret(out[f]); } catch { plain = ""; }
      out.angelOneApiKeyMasked = plain.length > 4 ? `••••${plain.slice(-4)}` : "••••";
    }
    delete out[f];
  }
  return out as T;
}

/**
 * Normalises secret fields in an incoming settings update: `null` clears the
 * secret; a blank value means "unchanged" (the client no longer receives the
 * secret, so it can't echo it back); anything else is sealed before storage.
 */
export function sealIncomingAngelSecrets(update: Record<string, unknown>): void {
  for (const f of ANGEL_SECRET_FIELDS) {
    if (!(f in update)) continue;
    const v = update[f];
    if (v === null) {
      update[f] = "";
      continue;
    }
    if (typeof v !== "string" || v.trim() === "") {
      delete update[f];
      continue;
    }
    update[f] = isSealed(v) ? v : sealSecret(v.trim());
  }
}

/** Decrypted credentials for server-side use (the SmartAPI client). */
export function readAngelOneCredentials(settings: Record<string, any> | null | undefined) {
  return {
    apiKey: openSecret(settings?.angelOneApiKey),
    clientCode: String(settings?.angelOneClientCode ?? ""),
    pin: openSecret(settings?.angelOnePin),
    totpSecret: openSecret(settings?.angelOneTotpSecret),
    disabled: !!settings?.angelOneDisabled,
  };
}
