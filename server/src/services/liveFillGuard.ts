/**
 * LIVE fill safety helpers: orphan-fill journal, entry block, ambiguous-order
 * confirmation. A filled exchange order whose DB record could not be written
 * is an unmanaged real-money position; these helpers make that loud, durable
 * and self-blocking instead of silent.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
// Overridable (tests); defaults to server/logs/orphan_live_fills.jsonl.
export const ORPHAN_JOURNAL_PATH = process.env.LIVE_ORPHAN_JOURNAL_PATH || path.join(__dir, "..", "..", "logs", "orphan_live_fills.jsonl");

export interface LiveFill {
  userId: string;
  symbol: string;
  side: string;
  qty: number;
  avgPrice: number;
  orderId?: string | number | null;
  clientOrderId?: string | null;
  accountType?: string;
}

const blocked = new Set<string>();
const key = (userId: string, symbol: string) => `${userId}:${symbol}`;
export const isLiveEntryBlocked = (userId: string, symbol: string) => blocked.has(key(userId, symbol));
export const blockLiveEntry = (userId: string, symbol: string) => { blocked.add(key(userId, symbol)); };
export const listLiveEntryBlocks = (): Array<{ userId: string; symbol: string }> =>
  [...blocked].map((k) => { const i = k.indexOf(":"); return { userId: k.slice(0, i), symbol: k.slice(i + 1) }; });

/**
 * Rebuild the entry blocks from the journal. The in-memory set alone was lost on every restart,
 * silently re-allowing entries on a symbol that still has an unmanaged exchange position. Every
 * orphan line blocks (userId, symbol); a later {"cleared":true} line for the same pair unblocks it.
 */
export function loadBlocksFromJournal(file: string = ORPHAN_JOURNAL_PATH): number {
  try {
    if (!fs.existsSync(file)) return 0;
    const state = new Map<string, boolean>();
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (!r?.userId || !r?.symbol) continue;
        state.set(key(String(r.userId), String(r.symbol)), r.cleared !== true);
      } catch { /* skip a torn line */ }
    }
    for (const [k, isBlocked] of state) { if (isBlocked) blocked.add(k); else blocked.delete(k); }
    return [...state.values()].filter(Boolean).length;
  } catch (e: any) {
    console.error(`[ORPHAN_LIVE_FILL] could not replay journal: ${e?.message}`);
    return 0;
  }
}

/** Call after an operator has reconciled the exchange position with the DB. Journaled, so it survives restarts. */
export const clearLiveEntryBlock = (userId: string, symbol: string, by = "operator") => {
  blocked.delete(key(userId, symbol));
  try {
    fs.mkdirSync(path.dirname(ORPHAN_JOURNAL_PATH), { recursive: true });
    fs.appendFileSync(ORPHAN_JOURNAL_PATH, JSON.stringify({ userId, symbol, cleared: true, by, ts: new Date().toISOString() }) + "\n");
  } catch (e: any) {
    console.error(`[ORPHAN_LIVE_FILL] could not journal block clear: ${e?.message}`);
  }
};
export const _resetLiveEntryBlocksForTest = () => blocked.clear();

// Restore blocks at import time (server boot).
const restoredBlocks = loadBlocksFromJournal();
if (restoredBlocks > 0) console.warn(`[ORPHAN_LIVE_FILL] ${restoredBlocks} LIVE entry block(s) restored from the journal — reconcile the exchange position(s), then clear via POST /trading/live-orphans/clear`);

/** Durable journal + CRITICAL audit/alert + entry block. Never throws. */
export async function journalOrphanFill(fill: LiveFill, error: unknown): Promise<void> {
  const errMsg = (error as any)?.message ?? String(error);
  blockLiveEntry(fill.userId, fill.symbol);
  try {
    fs.mkdirSync(path.dirname(ORPHAN_JOURNAL_PATH), { recursive: true });
    fs.appendFileSync(ORPHAN_JOURNAL_PATH, JSON.stringify({
      userId: fill.userId, symbol: fill.symbol, side: fill.side, qty: fill.qty, avgPrice: fill.avgPrice,
      orderId: fill.orderId ?? null, clientOrderId: fill.clientOrderId ?? null,
      accountType: fill.accountType ?? null, error: errMsg, ts: new Date().toISOString(),
    }) + "\n");
  } catch (e: any) {
    console.error(`[ORPHAN_LIVE_FILL] journal write failed: ${e?.message}`);
  }
  const msg = `ORPHAN LIVE FILL: ${fill.side} ${fill.qty} ${fill.symbol} @ ${fill.avgPrice} (${fill.accountType}) filled on exchange (orderId=${fill.orderId} clientOrderId=${fill.clientOrderId}) but DB record failed: ${errMsg}. Unmanaged position - reconcile manually. New LIVE entries for this symbol are blocked.`;
  console.error(`[ORPHAN_LIVE_FILL] ${msg}`);
  try {
    const { AqeaAuditService } = await import("./aqea/AqeaAudit.js");
    await AqeaAuditService.critical(fill.userId, fill.symbol, "orchestrator", msg, { ...fill, error: errMsg });
  } catch { /* best effort */ }
  try {
    const { safeCreateAlert } = await import("./alertService.js");
    await safeCreateAlert({ userId: fill.userId, severity: "RED", symbol: fill.symbol, title: "ORPHAN LIVE FILL", message: msg });
  } catch { /* best effort */ }
}

/**
 * Retry the DB write of a filled LIVE order. `existsFn` (optional) is checked
 * before each retry so a write that succeeded but timed out is not duplicated.
 * On final failure: journal + block, then rethrow with `orphanHandled=true`.
 */
export async function recordLiveFillWithRetry<T>(
  fill: LiveFill,
  createFn: () => Promise<T>,
  opts: { attempts?: number; backoffMs?: number; existsFn?: () => Promise<T | null | undefined> } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const backoff = opts.backoffMs ?? 250;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      if (i > 0 && opts.existsFn) {
        const found = await opts.existsFn().catch(() => null);
        if (found) return found;
      }
      return await createFn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, backoff * (i + 1)));
    }
  }
  await journalOrphanFill(fill, lastErr);
  const out: any = lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  out.orphanHandled = true;
  throw out;
}

const AMBIGUOUS_RE = /timeout|timed out|etimedout|econnreset|econnaborted|socket hang up|aborted|fetch failed|network|Binance (?:Spot|Futures)[^:]*: ?5\d\d/i;
/** True when an order POST failure leaves it unknown whether the order filled. */
export const isAmbiguousOrderError = (err: any) => AMBIGUOUS_RE.test(String(err?.message ?? err));

/**
 * Place an order; if the placement fails ambiguously (timeout / 5xx / reset),
 * query it by clientOrderId. FILLED / PARTIALLY_FILLED => return the queried
 * order as the result. Definitely-unfilled => rethrow the original error.
 * If the query itself fails the outcome is unknown: block entries and rethrow.
 */
export async function placeWithFillConfirmation(
  fill: Pick<LiveFill, "userId" | "symbol" | "side" | "accountType" | "clientOrderId">,
  place: () => Promise<any>,
  query: () => Promise<any>,
): Promise<any> {
  try {
    return await place();
  } catch (err: any) {
    if (!isAmbiguousOrderError(err)) throw err;
    let q: any;
    try {
      q = await query();
    } catch (qErr: any) {
      // -2013 / "Order does not exist" => never reached the book.
      if (/-2013|does not exist|unknown order/i.test(String(qErr?.message))) throw err;
      await journalOrphanFill({ ...fill, qty: 0, avgPrice: 0 }, new Error(`AMBIGUOUS_ORDER_UNCONFIRMED: ${err?.message}; query failed: ${qErr?.message}`));
      throw err;
    }
    if (q && (q.status === "FILLED" || q.status === "PARTIALLY_FILLED")) {
      console.warn(`[LIVE_ORDER] ${fill.symbol} placement ambiguous (${err?.message}) but exchange reports ${q.status}; treating as filled.`);
      return q;
    }
    throw err;
  }
}
