/*
 * ─── In‑memory trading state for PAPER mode ────────────
 *
 * Positions stored in a Map keyed by `${userId}:${symbol}:${mode}` for O(1) lookup.
 * Virtual wallet stored as Map<userId:mode, Map<asset, balance>>.
 *
 * On startup the server hydrates from MongoDB; mutations persist back.
 */

export interface PaperPosition {
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  tradeId: string; // Mongo _id of the Trade doc
}

/* ── positions: keyed by "userId:symbol:mode" ──────── */
const positions = new Map<string, PaperPosition>();

function posKey(userId: string, symbol: string, mode: string) {
  return `${userId}:${symbol}:${mode}`;
}

export function getPosition(userId: string, symbol: string, mode: string): PaperPosition | undefined {
  return positions.get(posKey(userId, symbol, mode));
}

export function setPosition(userId: string, symbol: string, mode: string, pos: PaperPosition): void {
  positions.set(posKey(userId, symbol, mode), pos);
}

export function removePosition(userId: string, symbol: string, mode: string): void {
  positions.delete(posKey(userId, symbol, mode));
}

export function getOpenPositions(userId: string, mode: string): PaperPosition[] {
  const prefix = `${userId}:`;
  const suffix = `:${mode}`;
  const result: PaperPosition[] = [];
  for (const [k, v] of positions) {
    if (k.startsWith(prefix) && k.endsWith(suffix)) result.push(v);
  }
  return result;
}

/* ── virtual wallets: keyed by "userId:mode" ───────── */
const wallets = new Map<string, Map<string, number>>();

function walletKey(userId: string, mode: string) {
  return `${userId}:${mode}`;
}

export function getWallet(userId: string, mode: string): Map<string, number> {
  const k = walletKey(userId, mode);
  let w = wallets.get(k);
  if (!w) {
    w = new Map([["USDT", 5_000]]);
    wallets.set(k, w);
  }
  return w;
}

export function setWalletBalance(userId: string, mode: string, asset: string, amount: number): void {
  getWallet(userId, mode).set(asset, amount);
}
