/**
 * INDmoney (INDstocks) API access token — encryption at rest and redaction.
 *
 * Same treatment as the Angel One secrets: sealed with AES-256-GCM before it is
 * stored, never returned to the browser (only an "is set" flag and a masked tail).
 * The token is a bearer credential that lasts 24 hours, so it is held only as
 * long as the user keeps it there; expiry surfaces as a failed verify.
 */
import { isSealed, sealSecret, openSecret } from "./angelOneCredentials.js";

export const INDMONEY_SECRET_FIELDS = ["indmoneyAccessToken"] as const;

export function redactIndmoneySecrets<T extends Record<string, any>>(settings: T): T {
  if (!settings) return settings;
  const out: Record<string, any> = { ...settings };
  for (const f of INDMONEY_SECRET_FIELDS) {
    const has = typeof out[f] === "string" && out[f] !== "";
    out[`${f}Set`] = has;
    if (has) {
      let plain = "";
      try { plain = openSecret(out[f]); } catch { plain = ""; }
      out[`${f}Masked`] = plain.length > 6 ? `••••${plain.slice(-4)}` : "••••";
    }
    delete out[f];
  }
  return out as T;
}

/** `null` clears; blank = unchanged (the client never receives the secret); else sealed. */
export function sealIncomingIndmoneySecrets(update: Record<string, unknown>): void {
  for (const f of INDMONEY_SECRET_FIELDS) {
    if (!(f in update)) continue;
    const v = update[f];
    if (v === null) { update[f] = ""; continue; }
    if (typeof v !== "string" || v.trim() === "") { delete update[f]; continue; }
    update[f] = isSealed(v) ? v : sealSecret(v.trim().replace(/^Bearer\s+/i, ""));
  }
}

export function readIndmoneyToken(settings: Record<string, any> | null | undefined): string {
  return openSecret(settings?.indmoneyAccessToken);
}

const BASE = "https://api.indstocks.com";

/** Read-only check: GET /user/profile with the saved token. Never places orders. */
export async function fetchIndmoneyProfile(token: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${BASE}/user/profile`, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(10_000),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = res.status === 401 || res.status === 403 ? "token rejected or expired (tokens last 24h)" : `HTTP ${res.status}`;
    throw new Error(`INDmoney ${why}`);
  }
  return body?.data ?? body;
}
