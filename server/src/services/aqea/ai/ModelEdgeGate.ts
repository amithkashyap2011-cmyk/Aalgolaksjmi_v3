/**
 * ═════════════════════════════════════════════════════════════════════════
 *  AQEA — Model Edge Gate (measured-calibration veto)
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Why this exists (2026-10-01, from graded AIPredictionTelemetry, 25m horizon):
 *   CNN_1D_V1 conf 0.5-0.7 : 55% hit, +8.7bp  (real edge, LONG and SHORT, both halves)
 *   CNN_1D_V1 conf 0.7-0.8 : 45% hit, +2.3bp
 *   CNN_1D_V1 conf >= 0.8  : 28% hit, -18bp   (10/13 symbols negative; ~all LONG)
 *   LNN_CONTINUOUS_V1 (RSI*ADX momentum formula, fixed 0.70-0.95 "confidence"):
 *                            41% hit, -15.6bp  (LONG and SHORT, both halves)
 * The engine trusted the CNN only when confidence >= 0.70 — exactly where it is
 * wrong — and counted the LNN as an authorized voter, so both pushed entries the
 * wrong way. Confidence is not calibrated, so we MEASURE it instead of assuming.
 *
 * Rule: a model's LONG/SHORT call is neutralised to HOLD when, over a recent
 * graded sample, its confidence bucket (0.1 wide) has >= MIN_SAMPLES graded
 * calls AND is not a net winner (hit rate < 50% OR mean signed 25m return <= 0).
 * Buckets without enough evidence fail OPEN (we cannot prove they are bad), so a
 * new/unmeasured model is not silenced. The gate re-opens by itself when the
 * measured numbers recover. Raw predictions are still written to telemetry by
 * BasePredictor BEFORE gating, so a blocked bucket keeps being graded.
 *
 * Disable with AQEA_EDGE_GATE=false. Always open under NODE_ENV=test unless a
 * test calls ModelEdgeGate.seedForTest().
 */

import { AIPredictionTelemetry } from "../../../models/AIPredictionTelemetry.js";
import mongoose from "mongoose";

export const EDGE_GATE_MIN_SAMPLES = 150;
export const EDGE_GATE_SAMPLE_LIMIT = 8000;
const REFRESH_MS = 15 * 60_000;
const BUCKET_WIDTH = 0.1;

export interface EdgeBucket {
  n: number;
  hitRate: number;   // 0..1
  meanBps: number;   // mean signed 25m return in basis points (direction-adjusted)
}

export interface EdgeRow {
  direction: string;
  confidence: number;
  priceAtPrediction: number;
  price25m: number;
}

export function bucketOf(confidence: number): number {
  const c = Math.min(0.999, Math.max(0, confidence));
  return Math.round(Math.floor(c / BUCKET_WIDTH) * BUCKET_WIDTH * 10) / 10;
}

/** Pure: aggregate graded directional calls into per-confidence-bucket edge stats. */
export function computeEdgeBuckets(rows: EdgeRow[]): Map<number, EdgeBucket> {
  const acc = new Map<number, { n: number; hits: number; sumBps: number }>();
  for (const r of rows) {
    if ((r.direction !== "LONG" && r.direction !== "SHORT") || !(r.priceAtPrediction > 0) || !Number.isFinite(r.price25m)) continue;
    const ret = (r.price25m - r.priceAtPrediction) / r.priceAtPrediction;
    const signed = r.direction === "LONG" ? ret : -ret;
    const b = bucketOf(r.confidence);
    const a = acc.get(b) ?? { n: 0, hits: 0, sumBps: 0 };
    a.n++;
    if (signed > 0) a.hits++;
    a.sumBps += signed * 1e4;
    acc.set(b, a);
  }
  const out = new Map<number, EdgeBucket>();
  for (const [b, a] of acc) out.set(b, { n: a.n, hitRate: a.hits / a.n, meanBps: a.sumBps / a.n });
  return out;
}

/** Pure: is a call at this confidence allowed, given the measured buckets? */
export function decideEdge(
  buckets: Map<number, EdgeBucket> | undefined,
  confidence: number,
  minSamples = EDGE_GATE_MIN_SAMPLES,
): { allowed: boolean; reason?: string; bucket?: EdgeBucket } {
  if (!buckets) return { allowed: true };
  const b = buckets.get(bucketOf(confidence));
  if (!b || b.n < minSamples) return { allowed: true, bucket: b };
  if (b.hitRate < 0.5 || b.meanBps <= 0) {
    return {
      allowed: false,
      bucket: b,
      reason: `EDGE_GATE: conf bucket ${bucketOf(confidence).toFixed(1)} measured hit=${(b.hitRate * 100).toFixed(0)}% mean=${b.meanBps.toFixed(1)}bp over n=${b.n}`,
    };
  }
  return { allowed: true, bucket: b };
}

interface CacheEntry { at: number; buckets: Map<number, EdgeBucket> | undefined; inflight?: Promise<void> }

export class ModelEdgeGate {
  private static cache = new Map<string, CacheEntry>();
  private static lastWarn = 0;

  private static enabled(): boolean {
    return process.env.AQEA_EDGE_GATE !== "false";
  }

  /** Test hook: pin measured buckets for a model so the gate is exercised offline. */
  static seedForTest(model: string, rows: EdgeRow[] | null): void {
    if (rows === null) { this.cache.delete(model); return; }
    this.cache.set(model, { at: Date.now() + 365 * 86_400_000, buckets: computeEdgeBuckets(rows) });
  }

  static clear(): void { this.cache.clear(); }

  private static async refresh(model: string): Promise<void> {
    try {
      const rows = await AIPredictionTelemetry.find(
        {
          model_name: model,
          price25m: { $exists: true },
          isFallback: { $ne: true },
          direction: { $in: ["LONG", "SHORT"] },
        },
        { direction: 1, confidence: 1, priceAtPrediction: 1, price25m: 1 },
      ).sort({ timestamp: -1 }).limit(EDGE_GATE_SAMPLE_LIMIT).lean();
      this.cache.set(model, { at: Date.now(), buckets: computeEdgeBuckets(rows as unknown as EdgeRow[]) });
    } catch (err: any) {
      // Fail open, but retry on the next TTL instead of hammering Mongo.
      this.cache.set(model, { at: Date.now(), buckets: this.cache.get(model)?.buckets });
      const now = Date.now();
      if (now - this.lastWarn > 60_000) {
        this.lastWarn = now;
        console.warn(`[EDGE_GATE] refresh failed for ${model} (failing open): ${err?.message || err}`);
      }
    }
  }

  /**
   * Check a model's call. Never throws and never blocks on a slow DB longer than
   * the first-ever load: stale buckets are served while a refresh runs.
   */
  static async check(model: string, confidence: number, direction: string): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.enabled() || (direction !== "LONG" && direction !== "SHORT")) return { allowed: true };
    if (process.env.NODE_ENV === "test" && !this.cache.has(model)) return { allowed: true };
    if (mongoose.connection.readyState !== 1 && !this.cache.has(model)) return { allowed: true };

    let entry = this.cache.get(model);
    const stale = !entry || Date.now() - entry.at > REFRESH_MS;
    if (stale) {
      if (!entry?.inflight) {
        const p = this.refresh(model).finally(() => {
          const e = this.cache.get(model);
          if (e) delete e.inflight;
        });
        if (!entry) {
          this.cache.set(model, { at: 0, buckets: undefined, inflight: p });
          await p;
        } else {
          entry.inflight = p;
        }
      } else if (!entry.buckets) {
        await entry.inflight;
      }
      entry = this.cache.get(model);
    }
    const d = decideEdge(entry?.buckets, confidence);
    return d.allowed ? { allowed: true } : { allowed: false, reason: d.reason };
  }
}
