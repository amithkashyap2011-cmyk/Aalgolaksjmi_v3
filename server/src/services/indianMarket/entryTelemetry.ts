/**
 * ═══════════════════════════════════════════════════════════════════
 *  Indian post-entry telemetry
 * ═══════════════════════════════════════════════════════════════════
 * Observes each open Indian position's live value (fed by the auto-pilot exit
 * monitor) and records how it moved after entry: % change at +5/+15/+30 min and
 * the best/worst excursion. That measures whether the rule-based entries carry
 * any directional edge, separately from the stops/targets that decide the exit.
 *
 * Observation is fire-and-forget and must never affect trading: every failure
 * is swallowed. Persistence is off under NODE_ENV=test unless
 * INDIAN_TELEMETRY_PERSIST_IN_TEST=1.
 */
import mongoose from "mongoose";
import { IndianEntryTelemetry } from "../../models/IndianEntryTelemetry.js";
import { Trade } from "../../models/Trade.js";

export const CHECKPOINT_MINUTES = [5, 15, 30] as const;
type CheckpointKey = "ret5" | "ret15" | "ret30";
const CP_KEY: Record<number, CheckpointKey> = { 5: "ret5", 15: "ret15", 30: "ret30" };
/** A checkpoint is only recorded if observed within this many minutes of it (a
 *  post-restart observation at 40 min must not be filed as the 5-minute value). */
const CHECKPOINT_GRACE_MIN = 3;
const PERSIST_EVERY_MS = 30_000;

export interface ObservationState {
  entryValue: number;
  entryAtMs: number;
  ret5: number | null;
  ret15: number | null;
  ret30: number | null;
  mfePct: number;
  maePct: number;
  lastValue: number;
  observations: number;
  lastPersistMs: number;
  /** Checkpoints newly reached since the last persist. */
  pendingCheckpoints: Partial<Record<CheckpointKey, number>>;
  /** Checkpoints passed without a timely observation — never filled later. */
  missed: Set<CheckpointKey>;
}

export function newState(entryValue: number, entryAtMs: number): ObservationState {
  return {
    entryValue, entryAtMs, ret5: null, ret15: null, ret30: null, mfePct: 0, maePct: 0,
    lastValue: entryValue, observations: 0, lastPersistMs: 0, pendingCheckpoints: {}, missed: new Set(),
  };
}

/** Pure update: fold one (value, time) observation into the state. */
export function applyObservation(s: ObservationState, value: number, nowMs: number): ObservationState {
  if (!(value > 0) || !(s.entryValue > 0)) return s;
  const retPct = ((value - s.entryValue) / s.entryValue) * 100;
  s.lastValue = value;
  s.observations++;
  const rounded = Number(retPct.toFixed(3));
  s.mfePct = Math.max(s.mfePct, rounded);
  s.maePct = Math.min(s.maePct, rounded);
  const elapsedMin = (nowMs - s.entryAtMs) / 60_000;
  for (const cp of CHECKPOINT_MINUTES) {
    const key = CP_KEY[cp];
    if (s[key] !== null || s.missed.has(key) || elapsedMin < cp) continue;
    if (elapsedMin <= cp + CHECKPOINT_GRACE_MIN) {
      const r = Number(retPct.toFixed(3));
      s[key] = r;
      s.pendingCheckpoints[key] = r;
    } else {
      s.missed.add(key);
    }
  }
  return s;
}

function persistenceEnabled(): boolean {
  return process.env.NODE_ENV !== "test" || process.env.INDIAN_TELEMETRY_PERSIST_IN_TEST === "1";
}

const states = new Map<string, ObservationState>();
const STATE_TTL_MS = 3 * 60 * 60_000;

async function persist(tradeDoc: any, tradeId: string, s: ObservationState, nowMs: number): Promise<void> {
  if (!persistenceEnabled() || mongoose.connection.readyState !== 1) return;
  const pending = s.pendingCheckpoints;
  s.pendingCheckpoints = {};
  s.lastPersistMs = nowMs;
  try {
    await IndianEntryTelemetry.updateOne(
      { tradeId },
      {
        $setOnInsert: {
          userId: tradeDoc.userId,
          symbol: tradeDoc.symbol,
          underlying: tradeDoc.underlying,
          strategy: tradeDoc.strategy,
          regime: tradeDoc.authorizedVotes?.regime,
          entryValue: s.entryValue,
          entryAt: new Date(s.entryAtMs),
          ret5: null, ret15: null, ret30: null,
        },
        $max: { mfePct: Number(s.mfePct.toFixed(3)) },
        $min: { maePct: Number(s.maePct.toFixed(3)) },
        $set: { lastValue: s.lastValue, lastAt: new Date(nowMs), observations: s.observations },
      },
      { upsert: true }
    );
    // Set each checkpoint only if still empty, so a restart can't overwrite it.
    for (const [key, val] of Object.entries(pending)) {
      await IndianEntryTelemetry.updateOne({ tradeId, [key]: null }, { $set: { [key]: val } });
    }
  } catch {
    // Telemetry must never disturb trading; put checkpoints back to retry.
    s.pendingCheckpoints = { ...pending, ...s.pendingCheckpoints };
  }
}

/**
 * Called by the exit monitor on every valid tick for an open position.
 * `value` is the position's live value in the same units as `entryPrice`.
 */
export function observeEntry(tradeDoc: any, value: number, nowMs: number = Date.now()): void {
  try {
    const entry = Number(tradeDoc?.entryPrice);
    const openedAt = tradeDoc?.openedAt ? new Date(tradeDoc.openedAt).getTime() : NaN;
    if (!(entry > 0) || !Number.isFinite(openedAt)) return;
    const tradeId = tradeDoc._id ? String(tradeDoc._id) : tradeDoc.tradeId;
    if (!tradeId) return;

    let s = states.get(tradeId);
    if (!s) {
      s = newState(entry, openedAt);
      states.set(tradeId, s);
      if (states.size > 500) {
        for (const [k, v] of states) if (nowMs - v.entryAtMs > STATE_TTL_MS) states.delete(k);
      }
    }
    applyObservation(s, value, nowMs);
    const hasNewCheckpoint = Object.keys(s.pendingCheckpoints).length > 0;
    if (hasNewCheckpoint || nowMs - s.lastPersistMs >= PERSIST_EVERY_MS) {
      void persist(tradeDoc, tradeId, s, nowMs);
    }
  } catch {
    /* never affect trading */
  }
}

/** Drop in-memory state once a position is closed (persisted data stays). */
export function forgetEntry(tradeId: string): void {
  states.delete(tradeId);
}

// ─── Reporting ────────────────────────────────────────────────────────────────

export interface TelemetryRow {
  tradeId: string;
  strategy?: string;
  ret5?: number | null;
  ret15?: number | null;
  ret30?: number | null;
  mfePct: number;
  maePct: number;
  /** From the joined Trade (closed only). */
  netPnl?: number;
  closed?: boolean;
}

export interface CheckpointSummary { n: number; meanRetPct: number | null; favourablePct: number | null }
export interface GroupSummary {
  key: string;
  trades: number;
  closed: number;
  winRatePct: number | null;
  netPnl: number;
  avgMfePct: number;
  avgMaePct: number;
  checkpoints: Record<"5m" | "15m" | "30m", CheckpointSummary>;
}

function cpSummary(vals: number[]): CheckpointSummary {
  if (vals.length === 0) return { n: 0, meanRetPct: null, favourablePct: null };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return {
    n: vals.length,
    meanRetPct: Number(mean.toFixed(2)),
    favourablePct: Number(((100 * vals.filter((v) => v > 0).length) / vals.length).toFixed(1)),
  };
}

export function summarize(rows: TelemetryRow[], keyOf: (r: TelemetryRow) => string): GroupSummary[] {
  const groups = new Map<string, TelemetryRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  return [...groups.entries()]
    .map(([key, rs]) => {
      const closed = rs.filter((r) => r.closed);
      const wins = closed.filter((r) => (r.netPnl ?? 0) > 0).length;
      return {
        key,
        trades: rs.length,
        closed: closed.length,
        winRatePct: closed.length ? Number(((100 * wins) / closed.length).toFixed(1)) : null,
        netPnl: Number(closed.reduce((a, r) => a + (r.netPnl ?? 0), 0).toFixed(2)),
        avgMfePct: Number((rs.reduce((a, r) => a + r.mfePct, 0) / rs.length).toFixed(2)),
        avgMaePct: Number((rs.reduce((a, r) => a + r.maePct, 0) / rs.length).toFixed(2)),
        checkpoints: {
          "5m": cpSummary(rs.map((r) => r.ret5).filter(num)),
          "15m": cpSummary(rs.map((r) => r.ret15).filter(num)),
          "30m": cpSummary(rs.map((r) => r.ret30).filter(num)),
        },
      };
    })
    .sort((a, b) => b.trades - a.trades);
}

/** Per-user report over the last `days` days, grouped by strategy plus an ALL row. */
export async function buildEntryTelemetryReport(userId: string, days = 14) {
  if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(userId)) {
    return { days, note: "database unavailable or invalid user", overall: null, byStrategy: [] as GroupSummary[] };
  }
  const uid = new mongoose.Types.ObjectId(userId);
  const since = new Date(Date.now() - days * 86_400_000);
  const docs: any[] = await IndianEntryTelemetry.find({ userId: uid, entryAt: { $gte: since } }).lean();
  const ids = docs.map((d) => d.tradeId).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const trades: any[] = ids.length
    ? await Trade.find({ userId: uid, _id: { $in: ids } }, { netPnl: 1, status: 1 }).lean()
    : [];
  const byId = new Map(trades.map((t) => [String(t._id), t]));
  const rows: TelemetryRow[] = docs.map((d) => {
    const t = byId.get(d.tradeId);
    return {
      tradeId: d.tradeId,
      strategy: d.strategy,
      ret5: d.ret5, ret15: d.ret15, ret30: d.ret30,
      mfePct: d.mfePct ?? 0,
      maePct: d.maePct ?? 0,
      netPnl: t?.netPnl,
      closed: t?.status === "CLOSED",
    };
  });
  return {
    days,
    note:
      "Checkpoints only fill while a position is still open, so 15m/30m counts (n) are smaller than 5m — " +
      "trades stopped out early are missing from them. 'favourablePct' = share of observations with value above entry.",
    overall: summarize(rows, () => "ALL")[0] ?? null,
    byStrategy: summarize(rows, (r) => r.strategy || "UNKNOWN"),
  };
}
