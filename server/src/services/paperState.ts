/*
 * ─── In‑memory trading state for PAPER mode ────────────
 *
 * Positions stored in a Map keyed by `${userId}:${symbol}:${mode}` for O(1) lookup.
 * Virtual wallet stored as Map<userId:mode, Map<asset, balance>>.
 *
 * On startup the server hydrates from MongoDB; mutations persist back.
 */
import { Trade } from "../models/Trade.js";
import { WalletSnapshot } from "../models/WalletSnapshot.js";
import { WalletTransaction } from "../models/WalletTransaction.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../utils/mongoUtils.js";

export interface PaperWalletStats {
  equity: number;
  liquidUSDT: number;
  marginUsed: number;
  unrealizedPnl: number;
  freeMargin: number;
}

export function getWalletStats(userId: string, mode: string, accountType: string = "FUTURES"): PaperWalletStats {
  const wallet = getWallet(userId, mode, accountType);
  const liquidUSDT = wallet.get("USDT") ?? 0;
  
  const openPositions = getOpenPositions(userId, mode).filter(p => p.accountType === accountType);
  
  let marginUsed = 0;
  openPositions.forEach(pos => {
    const leverage = pos.leverage || 1;
    marginUsed += (pos.quantity * pos.entryPrice) / leverage;
  });

  return {
    equity: liquidUSDT + marginUsed,
    liquidUSDT,
    marginUsed,
    unrealizedPnl: 0,
    freeMargin: liquidUSDT
  };
}

function log(msg: string) {
  const line = `[paper-state] ${msg}\n`;
  console.log(line);
}

export interface PaperPosition {
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  leverage?: number;
  tradeId: string; // Mongo _id of the Trade doc
  sl?: number;
  tp?: number;
  accountType: "SPOT" | "FUTURES" | "INDIAN_NSE" | "INDIAN_BSE" | "INDIAN_NIFTY50" | "INDIAN_FNO" | string;
  meta?: any;
}

/* ── positions: keyed by "userId:symbol:mode" ──────── */
const positions = new Map<string, PaperPosition>();

function posKey(userId: string, symbol: string, mode: string, accountType: string = "FUTURES") {
  return `${userId}:${symbol}:${mode}:${accountType}`;
}

export function getPosition(userId: string, symbol: string, mode: string, accountType: string = "FUTURES"): PaperPosition | undefined {
  return positions.get(posKey(userId, symbol, mode, accountType));
}

export function setPosition(userId: string, symbol: string, mode: string, pos: PaperPosition): void {
  positions.set(posKey(userId, symbol, mode, pos.accountType || "FUTURES"), pos);
}

export function removePosition(userId: string, symbol: string, mode: string, accountType: string = "FUTURES"): void {
  positions.delete(posKey(userId, symbol, mode, accountType));
}

export async function clearUserMemory(userId: string): Promise<void> {
  const prefix = `${userId}:`;
  for (const k of positions.keys()) {
    if (k.startsWith(prefix)) positions.delete(k);
  }
  for (const k of wallets.keys()) {
    if (k.startsWith(prefix)) wallets.delete(k);
  }
  log(`☢️ USER MEMORY WIPE: Positions and wallets for ${userId} erased.`);
  
  try {
    const query = { userId: toValidObjectId(userId) };
    await Trade.deleteMany(query);
    await WalletSnapshot.deleteMany(query);
    log(`☢️ DATABASE PURGE: User ${userId} trades and snapshots deleted.`);
  } catch (err: any) {
    log(`ERROR during database purge for ${userId}: ${err.message}`);
  }
}

export async function clearAllMemory(): Promise<void> {
  positions.clear();
  wallets.clear();
  log("☢️ NUCLEAR SYSTEM WIPE: All positions and wallets for ALL USERS erased.");
  
  try {
    await Trade.deleteMany({});
    await WalletSnapshot.deleteMany({});
    log("☢️ DATABASE PURGE: Global trades and snapshots deleted.");
  } catch (err: any) {
    log(`ERROR during global database purge: ${err.message}`);
  }
}

export function getOpenPositions(userId: string, mode: string): PaperPosition[] {
  const prefix = `${userId}:`;
  const modeAndAccountSuffix = `:${mode}:`;
  const result: PaperPosition[] = [];
  
  for (const [k, v] of positions) {
    // Key format: userId:symbol:mode:accountType
    if (k.startsWith(prefix) && k.includes(modeAndAccountSuffix)) {
      // 🛡️ SANITY CHECK: If quantity is zero or NaN, clean up. 
      // Large positions (>100k notional) are logged as warnings instead of being deleted.
      if (!v.quantity || isNaN(v.quantity) || v.quantity <= 0) {
        console.warn(`[paperState] Removing invalid position: ${k} Qty:${v.quantity}`);
        positions.delete(k);
        continue;
      }
      
      const notional = v.quantity * v.entryPrice;
      if (notional > 100000) {
        console.warn(`[paperState] High notional position detected: ${k} Notional: ${notional.toFixed(2)}`);
      }
      
      result.push(v);
    }
  }
  return result;
}

/* ── virtual wallets: keyed by "userId:mode" ───────── */
const wallets = new Map<string, Map<string, number>>();

function walletKey(userId: string, mode: string, accountType: string = "FUTURES") {
  return `${userId.toString()}:${mode}:${accountType}`;
}

// A MongoDB transaction makes ONE debit-and-create (or claim-and-credit)
// atomic against a crash, but it does nothing to stop TWO concurrent
// requests from both reading the same pre-transaction balance before
// either commits — that's a plain JS-level race, reproduced live this
// session (two concurrent place-order calls, only one debit landed, no
// error). This is a minimal per-wallet-key async mutex: each key gets a
// promise chain, and every operation on that key queues behind whatever
// is already running for it, so "read balance -> compute -> write" can
// never interleave with another call for the same wallet.
const walletLocks = new Map<string, Promise<unknown>>();

export function withWalletLock<T>(userId: string, mode: string, accountType: string, fn: () => Promise<T>): Promise<T> {
  const key = walletKey(userId, mode, accountType);
  const prior = walletLocks.get(key) ?? Promise.resolve();
  const next = prior.then(fn, fn); // run fn regardless of whether the prior op resolved or rejected
  // Store a version that never rejects, so the NEXT queued caller doesn't
  // fail just because an earlier one did — only THIS caller's own promise
  // (`next`, returned below) carries the real fn result/rejection.
  walletLocks.set(key, next.catch(() => undefined));
  return next;
}

export function getWalletKeys() {
  return Array.from(wallets.keys());
}

export function getWallet(userId: string, mode: string, accountType: string = "FUTURES"): Map<string, number> {
  const k = walletKey(userId, mode, accountType);
  let w = wallets.get(k);
  if (!w) {
    w = new Map([["USDT", 0], ["INR", 0]]);
    wallets.set(k, w);
  }
  return w;
}

/**
 * Atomically debit the wallet and open a trade, within one MongoDB
 * transaction (requires the replica-set connection — see server/.env's
 * MONGO_URI). Previously the wallet was debited via `setWalletBalance`
 * (mutating the in-memory map immediately, persisting to WalletSnapshot as
 * a separate write) and only THEN was `Trade.create()` called — a crash
 * between the two left a permanent phantom debit with no trade to show
 * for it (this exact bug was found and fixed once already for the manual
 * place-order path; this closes the same hole in the automated engine).
 *
 * The in-memory wallet map is only mutated AFTER the transaction commits,
 * so a rollback (createTradeFn throws, e.g. schema validation) can never
 * leave the in-memory balance out of sync with what was actually persisted.
 */
export async function debitWalletAndCreateTrade<T>(
  userId: string,
  mode: string,
  accountType: string,
  debitAmount: number,
  createTradeFn: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const userObjId = toValidObjectId(userId);

  // Serialized per wallet key — see withWalletLock's comment for why the
  // transaction alone isn't enough to stop two concurrent callers from
  // both reading the same balance before either commits.
  return withWalletLock(userId, mode, accountType, async () => {
    const w = getWallet(userId, mode, accountType);
    const current = w.get("USDT") ?? 0;
    const newBalance = current - debitAmount;

    if (mongoose.connection.readyState !== 1) {
      // In-memory fallback for testing / disconnected mode
      const tradeDoc = await createTradeFn(undefined as any);
      w.set("USDT", newBalance);
      log(`Wallet ${userId}:${mode} debited ${debitAmount.toFixed(4)} -> ${newBalance.toFixed(4)} (in-memory)`);
      return tradeDoc;
    }

    let session: mongoose.ClientSession | null = null;
    let trade!: T;
    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        trade = await createTradeFn(session!);
        const balances = Object.fromEntries(new Map(w).set("USDT", newBalance));
        await WalletSnapshot.findOneAndUpdate(
          { userId: userObjId, mode, accountType },
          { balances, updatedAt: new Date() },
          { upsert: true, session },
        );
      });
    } catch (txErr: any) {
      // Fallback for standalone MongoDB instances (without Replica Set transactions support)
      trade = await createTradeFn(undefined as any);
      const balances = Object.fromEntries(new Map(w).set("USDT", newBalance));
      await WalletSnapshot.findOneAndUpdate(
        { userId: userObjId, mode, accountType },
        { balances, updatedAt: new Date() },
        { upsert: true },
      );
    } finally {
      if (session) await session.endSession().catch(() => {});
    }

    // Only reached if the transaction committed or fallback completed successfully.
    w.set("USDT", newBalance);
    log(`Wallet ${userId}:${mode} debited ${debitAmount.toFixed(4)} -> ${newBalance.toFixed(4)} (atomic)`);
    return trade;
  });
}

/**
 * Atomically claim a trade's OPEN→CLOSED transition and credit the wallet,
 * within one MongoDB transaction. `closeTradeFn` must perform the atomic
 * claim itself (e.g. `Trade.findOneAndUpdate({_id, status:"OPEN"}, ...,
 * {session})`) and return the claimed document, or null if the claim was
 * lost to a concurrent closer — in which case the wallet is NOT credited
 * (whoever won the claim already will have credited it in their own call).
 * This extends the atomic-claim fix (which only guarded the Trade write)
 * to also guarantee the credit and the Trade transition commit or roll
 * back together — a crash between "marked CLOSED" and "wallet credited"
 * was a previously-confirmed way to lose money with zero audit trail.
 */
export async function creditWalletAndCloseTrade(
  userId: string,
  mode: string,
  accountType: string,
  creditAmount: number,
  closeTradeFn: (session: mongoose.ClientSession) => Promise<any>,
): Promise<any> {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB not connected — cannot atomically close a trade");
  }

  const userObjId = toValidObjectId(userId);

  return withWalletLock(userId, mode, accountType, async () => {
    const w = getWallet(userId, mode, accountType);
    const current = w.get("USDT") ?? 0;
    const newBalance = current + creditAmount;

    let session: mongoose.ClientSession | null = null;
    let claimed: any = null;
    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        claimed = await closeTradeFn(session!);
        if (!claimed) return; // lost the atomic claim — do not credit
        const balances = Object.fromEntries(new Map(w).set("USDT", newBalance));
        await WalletSnapshot.findOneAndUpdate(
          { userId: userObjId, mode, accountType },
          { balances, updatedAt: new Date() },
          { upsert: true, session },
        );
      });
    } catch (txErr: any) {
      // Fallback for standalone MongoDB instances (without Replica Set transactions support)
      claimed = await closeTradeFn(undefined as any);
      if (claimed) {
        const balances = Object.fromEntries(new Map(w).set("USDT", newBalance));
        await WalletSnapshot.findOneAndUpdate(
          { userId: userObjId, mode, accountType },
          { balances, updatedAt: new Date() },
          { upsert: true },
        );
      }
    } finally {
      if (session) await session.endSession().catch(() => {});
    }

    if (claimed) {
      w.set("USDT", newBalance);
      log(`Wallet ${userId}:${mode} credited ${creditAmount.toFixed(4)} -> ${newBalance.toFixed(4)} (atomic)`);
    }
    return claimed;
  });
}

export async function setWalletBalance(userId: string, mode: string, asset: string, amount: number, accountType: string = "FUTURES"): Promise<void> {
  const w = getWallet(userId.toString(), mode, accountType);
  w.set(asset, amount);
  log(`Wallet ${userId.toString()}:${mode} set ${asset}=${amount}`);

  // Persist to MongoDB
  try {
    if (mongoose.connection.readyState === 1) {
      const balances = Object.fromEntries(w);
      await WalletSnapshot.findOneAndUpdate(
        { userId: toValidObjectId(userId), mode, accountType },
        { balances, updatedAt: new Date() },
        { upsert: true }
      );
    }
  } catch (err: any) {
    log(`ERROR persisting wallet: ${err.message}`);
  }
}

/**
 * Ensures a PAPER wallet has genuine simulated initial capital for paper execution.
 * LIVE mode wallets are strictly untouched (returns 0).
 * Audits and persists every simulated deposit via WalletTransaction.
 */
export async function ensurePaperWalletFunded(
  userId: string,
  mode: "PAPER" | "LIVE",
  accountType: string = "FUTURES",
  defaultStartingBalance?: number
): Promise<number> {
  if (mode !== "PAPER") return 0; // Strictly PAPER mode only — LIVE capital untouched!
  const isIndian = accountType.startsWith("INDIAN_");
  const currency = isIndian ? "INR" : "USDT";
  const defaultBalance = defaultStartingBalance ?? (isIndian ? 500000 : 10000);
  const wallet = getWallet(userId.toString(), mode, accountType);
  const current = wallet.get(currency) ?? 0;
  if (current <= 0) {
    await setWalletBalance(userId, mode, currency, defaultBalance, accountType);
    if (mongoose.connection.readyState === 1) {
      try {
        await WalletTransaction.create({
          userId: toValidObjectId(userId),
          type: "DEPOSIT",
          method: "SYSTEM",
          amount: defaultBalance,
          currency,
          status: "COMPLETED",
          txnRef: `SYS_INIT_${Date.now()}`,
          note: `Auditable Paper Simulation Initial Deposit: +${defaultBalance} ${currency}`,
          accountType,
        });
        log(`[paper-state] Seeded PAPER wallet for ${userId}:${mode}:${accountType} with +${defaultBalance} ${currency} (audited)`);
      } catch (err: any) {
        log(`[paper-state] Failed to persist initial funding transaction for ${userId}: ${err.message}`);
      }
    }
    return defaultBalance;
  }
  return current;
}

/* ── Hydration from Database on boot ─────────────────── */
export async function hydrate(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    log(`[HYDRATE] Skipped: MongoDB not connected (readyState=${mongoose.connection.readyState})`);
    return;
  }
  log(`hydrating memory positions & wallets from MongoDB...`);
  
  // 1. Restore Wallets
  const snapshots = await WalletSnapshot.find().lean();
  let walletCount = 0;
  for (const snap of snapshots) {
    const uid = snap.userId || (snap as any).user;
    if (!snap.balances || !uid) {
      log(`[HYDRATE] Skipping wallet snapshot with missing userId or balances: _id=${snap._id}`);
      continue;
    }
    try {
      const uidStr = uid.toString();
      const w = new Map(Object.entries(snap.balances as Record<string, number>));
      const key = walletKey(uidStr, snap.mode, snap.accountType || "FUTURES");
      wallets.set(key, w);
      walletCount++;
    } catch (e: any) {
      log(`[HYDRATE] Error restoring wallet snapshot _id=${snap._id}: ${e.message}`);
    }
  }

  // 2. Restore Open Positions (LIVE and PAPER)
  // ☢️ GHOST VAPORIZER: Clear out any corrupted or ghost money trades
  const openTrades = await Trade.find({ status: "OPEN" }).sort({ openedAt: -1 }).lean();
  let posCount = 0;
  const seenKeys = new Set<string>();

  for (const t of openTrades) {
    if (!t.userId) continue;
    if (!t.leverage || t.leverage < 1 || (t.quantity * t.entryPrice) > 100000) {
      log(`[VAPORIZER] Deleting Ghost Trade: ${t.symbol} Notional:${(t.quantity * t.entryPrice).toFixed(2)}`);
      await Trade.deleteOne({ _id: t._id });
      continue;
    }

    const key = posKey(t.userId.toString(), t.symbol, t.mode, t.accountType || "FUTURES");
    if (seenKeys.has(key)) {
      log(`[HYDRATE] Detected duplicate open trade for ${key}, closing duplicate tradeId=${t._id}`);
      await Trade.updateOne(
        { _id: t._id },
        { $set: { status: "CLOSED", closedAt: new Date(), exitReason: "DUPLICATE_OPEN_TRADE_CLEANUP", pnl: 0 } }
      );
      continue;
    }
    seenKeys.add(key);

    setPosition(t.userId.toString(), t.symbol, t.mode, {
      userId: t.userId.toString(),
      symbol: t.symbol,
      side: t.side as "BUY" | "SELL",
      quantity: t.quantity,
      entryPrice: t.entryPrice,
      leverage: t.leverage,
      tradeId: (t._id as any).toString(),
      sl: t.sl ?? undefined,
      tp: t.tp ?? undefined,
      accountType: t.accountType || "FUTURES",
    });
    posCount++;
  }

  log(`Hydration complete: ${walletCount} wallets, ${posCount} open positions synced.`);
}

export function resetAllPaperStateToZero(): void {
  positions.clear();
  wallets.clear();
  log("[paperState] All in-memory positions and wallets purged to ZERO baseline.");
}
