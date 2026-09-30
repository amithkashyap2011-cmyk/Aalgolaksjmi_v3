/**
 * Credential kill switch. One flag per integration (Binance keys, Angel One,
 * INDmoney) persisted in Settings, mirrored here in memory so the request path
 * can check it without a DB read.
 *
 * It is server-wide and conservative: an integration is disabled when ANY
 * Settings document has its flag set, so one owner can always cut access. The
 * stored credentials are untouched — enabling again needs no re-entry.
 *
 * Enforcement points: binanceSignedFetch (every key-carrying Binance call),
 * the Angel One SmartAPI client, and the INDmoney verify route.
 */
export type Integration = "binance" | "angelOne" | "indmoney";

/** Settings field that stores each integration's flag. */
export const GATE_FIELDS: Record<Integration, string> = {
  binance: "binanceKeysDisabled",
  angelOne: "angelOneDisabled",
  indmoney: "indmoneyDisabled",
};

const state: Record<Integration, boolean> = { binance: false, angelOne: false, indmoney: false };

export class CredentialsDisabledError extends Error {
  constructor(public readonly integration: Integration) {
    super(`${integration.toUpperCase()}_CREDENTIALS_DISABLED: turned off in Settings`);
    this.name = "CredentialsDisabledError";
  }
}

export const isDisabled = (i: Integration): boolean => state[i];
export const gateSnapshot = () => ({ ...state });

export function assertEnabled(i: Integration): void {
  if (state[i]) throw new CredentialsDisabledError(i);
}

/** Recompute the in-memory flags from Settings (call at boot and after any settings write). */
export async function refreshGate(): Promise<typeof state> {
  const { Settings } = await import("../models/Settings.js");
  for (const i of Object.keys(GATE_FIELDS) as Integration[]) {
    const hit = await Settings.exists({ [GATE_FIELDS[i]]: true });
    state[i] = !!hit;
  }
  return { ...state };
}

/** Test helper. */
export function setGateForTesting(patch: Partial<typeof state>): void {
  Object.assign(state, { binance: false, angelOne: false, indmoney: false }, patch);
}
