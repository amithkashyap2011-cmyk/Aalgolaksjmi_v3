/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — AI Predictor Telemetry Service
 * ═══════════════════════════════════════════════════════════════════
 */

import { AIPredictionTelemetry, ModelAccuracyMetrics } from "../../models/AIPredictionTelemetry.js";
// Namespace import (matches autoTradeEngine.ts's own binanceService usage
// style) rather than a destructured named import.
import * as binanceService from "../binanceService.js";

// 🧪 Test-only seam (2026-09-15): jest.unstable_mockModule reliably
// intercepts binanceService for every other file that imports it in this
// codebase's test suite, but not for this file specifically — verified
// directly while adding the grading-maturity regression tests (the mock
// factory never ran; calls silently fell through to the real
// binanceService, hitting its synthetic-data fallback for made-up test
// symbols and producing meaningless grades). Root cause not fully
// resolved despite trying the two things that differ from working
// examples elsewhere (namespace vs. named import; moduleNameMapper
// coverage for "../foo.js" one level deeper). Rather than leave grading
// untested or let tests silently hit real network calls, tests inject a
// stub directly — a no-op in every real code path since the guard makes
// it inert outside NODE_ENV=test.
type GradingPriceLookup = { prices: Map<string, Map<number, number>>; unavailable: Set<string> };

let klinesProviderOverride: typeof binanceService.getKlines | null = null;
export function __setKlinesProviderForTesting(fn: typeof binanceService.getKlines | null): void {
  if (process.env.NODE_ENV !== "test") return;
  klinesProviderOverride = fn;
}

export class AITelemetryService {
  // 🛡️ Re-entrancy guard (2026-09-15): resolvePendingOutcomes() is invoked
  // from exactly one setInterval today, but nothing previously stopped an
  // overlapping call (a slow cycle bumping into the next scheduled tick, or
  // a manual invocation) from starting a second, fully independent 25-wide
  // batch on top of the first — doubling the effective concurrency cap and
  // doubling the Binance REST burst, exactly the class of issue that
  // already caused one rate-limit incident. A later call while one is in
  // flight now no-ops instead of running concurrently.
  private static isGrading = false;

  /**
   * Resolves outcomes for AI predictions to track their standalone accuracy.
   *
   * Selection is maturity-based, not recency-based — see MIN_MATURITY_MINUTES
   * / ACTIVE_COHORT_CEILING_MINUTES below for why. This replaces a 2026-09-15
   * "recent-first" version that sorted by timestamp DESC and starved itself:
   * at observed generation rates (~275 predictions/min) the newest 2000
   * records span under 8 minutes — all younger than the 15-minute minimum
   * grading age — so that lane did zero productive work every cycle while
   * the true backlog lane (oldest-first, unbounded) was ~2 days from ever
   * reaching today's predictions. Confirmed via two independent read-only
   * audits ~5 minutes apart: post-fix graded count stayed at 0 while the
   * post-fix ungraded count grew (11,832 → 13,316).
   */
  public static async resolvePendingOutcomes(): Promise<void> {
    if (AITelemetryService.isGrading) {
      console.log(`[TELEMETRY] Skipping cycle — a grading pass is already in flight.`);
      return;
    }
    AITelemetryService.isGrading = true;
    try {
      await AITelemetryService.runGradingCycle();
    } finally {
      AITelemetryService.isGrading = false;
    }
  }

  private static async runGradingCycle(): Promise<void> {
    const now = Date.now();

    // A record can be authoritatively selected as "mature" the instant its
    // OWN timestamp field (set once, at write time, in BasePredictor.ts —
    // the same field every per-horizon age check below already trusts) is
    // at least MIN_MATURITY_MINUTES old: that's the earliest of the four
    // horizons (15/25/30/60m) this service ever grades, so nothing younger
    // than that can produce any update at all. Selecting anything younger
    // is pure wasted work — worse, it's what caused the starvation bug.
    const MIN_MATURITY_MINUTES = 15;

    // A record still missing outcome60m after ACTIVE_COHORT_CEILING_MINUTES
    // has already had every one of its horizons (last: 60m) become mature —
    // if it's still ungraded at that age, it isn't "currently maturing"
    // data any more, it's backlog that fell behind for some other reason
    // (was part of the original 656k stall, a transient resolveOutcome
    // failure, etc). 60 (the longest horizon) + 30 minutes of cycle-catchup
    // headroom is the natural boundary derived from the grading schedule
    // itself, not an arbitrary window.
    const ACTIVE_COHORT_CEILING_MINUTES = 90;

    const maturityFloor = new Date(now - MIN_MATURITY_MINUTES * 60 * 1000);
    const activeCohortFloor = new Date(now - ACTIVE_COHORT_CEILING_MINUTES * 60 * 1000);
    const eligibilityFloor = new Date(now - 72 * 60 * 60 * 1000);

    // LANE A — mature + recent: the active cohort, still working through
    // its normal 15/25/30/60m lifecycle. Ascending order means the oldest
    // members of this band — the ones most overdue for their next horizon
    // — go first each cycle, so nothing in this band waits indefinitely.
    const RECENT_LANE_LIMIT = 2000;
    // LANE B — mature + old: the true historical backlog, disjoint from
    // Lane A by construction (no $nin exclusion needed), still draining.
    const BACKLOG_LANE_LIMIT = 1000;

    const recentRecords = await AIPredictionTelemetry.find({
      timestamp: { $gt: activeCohortFloor, $lte: maturityFloor },
      outcome60m: { $exists: false }
    })
      .sort({ timestamp: 1 })
      .limit(RECENT_LANE_LIMIT);
    const backlogRecords = await AIPredictionTelemetry.find({
      timestamp: { $gte: eligibilityFloor, $lte: activeCohortFloor },
      outcome60m: { $exists: false }
    })
      .sort({ timestamp: 1 })
      .limit(BACKLOG_LANE_LIMIT);

    // LANE A0 — freshly-matured, first-touch: found 2026-09-16 during
    // overnight monitoring. Lane A's oldest-first sort is correct for
    // *retiring* records (bounding backlog growth), but at observed volume
    // the 15-90m band holds far more than RECENT_LANE_LIMIT can cover in
    // one pass, so a record's first-ever visit only happens once it ages
    // into the oldest slice — empirically ~83-90m old — at which point all
    // four horizons get graded in one batch instead of each one near its
    // own maturity. Confirmed via direct query: records 20-25m old (well
    // past the 15m threshold) showed 0.0% outcome15m completion (0/1854)
    // while 65-70m and 95-100m old records showed 100% outcome60m
    // completion — nothing is lost, but the 15/25/30m horizons (which
    // drive isCorrect/gradingVersion:2, the near-real-time model-accuracy
    // signal) were arriving ~70 minutes late. This lane is purely additive
    // — it doesn't touch Lane A/B's limits, sort order, or the CONCURRENCY
    // cap — and targets exactly the gap: records missing outcome15m,
    // newest-matured first, so a record gets its first grading pass within
    // one cycle of turning 15 minutes old instead of ~70 minutes later.
    // 2026-09-16 follow-up #1: verified live after deploy — the fresh lane
    // was correctly selecting (newest-first, confirmed via direct query:
    // the 800 returned spanned only 15.0-18.7m old), but 800/cycle was
    // itself undersized, so it was bumped to 1600.
    //
    // 2026-09-16 follow-up #2 (this one): 1600 was a bad call — it pushed
    // total per-cycle volume from the proven-safe 3000 (2000 recent + 1000
    // backlog, stable for hours) to 4600. REST_TIMEOUT_MS is 2500ms
    // (binanceService.ts) and a record needing all 4 horizons makes up to
    // 4 *sequential* resolveOutcome calls inside one resolveRecord() — at
    // CONCURRENCY=25 that's a worst case of (4600/25)*4*2.5s ≈ 30 minutes,
    // which is exactly what happened: grading stalled for 30+ minutes
    // straight (confirmed: log file gained zero new "[TELEMETRY] Found"
    // lines, "Skipping cycle — already in flight" fired repeatedly, and
    // resolveOutcome's own error counter didn't move either — the mutex
    // was never released because the cycle itself never finished). Every
    // horizon grade, not just the fresh lane, was blocked system-wide by
    // this the entire time. 500 keeps total volume at 3500 — a modest 17%
    // increase over the 3000 baseline that ran reliably all night, instead
    // of the 53% jump that caused the stall. Confirm any future increase
    // here against an ACTUAL completed next cycle in the logs, not just
    // that the query itself returns fast in isolation (mongosh only tests
    // the query, not the Binance-call-bound processing loop after it).
    const FRESH_LANE_LIMIT = 500;
    const freshRecords = await AIPredictionTelemetry.find({
      timestamp: { $gt: activeCohortFloor, $lte: maturityFloor },
      outcome15m: { $exists: false }
    })
      .sort({ timestamp: -1 })
      .limit(FRESH_LANE_LIMIT);

    const recentIds = new Set(recentRecords.map((r) => String(r._id)));
    const freshOnly = freshRecords.filter((r) => !recentIds.has(String(r._id)));
    // Fresh lane first: its whole purpose is time-sensitive (grading a
    // record within a cycle or two of maturing), while recentRecords'
    // oldest-first retirement work has more slack — a record that's 5
    // minutes late leaving the 15-90m band just spends 5 extra minutes in
    // Lane B's backlog queue instead, which is a much smaller cost than a
    // record's first grading pass arriving late again.
    const records = [...freshOnly, ...recentRecords, ...backlogRecords];

    const priceLookup = await AITelemetryService.prefetchGradingPrices(records, now);

    console.log(`[TELEMETRY] Found ${records.length} pending records for resolution (${recentRecords.length} recent-lane [mature, <${ACTIVE_COHORT_CEILING_MINUTES}m old], ${freshOnly.length} fresh-lane [first-touch, newest-matured first], ${backlogRecords.length} backlog-lane [>=${ACTIVE_COHORT_CEILING_MINUTES}m old]).`);

    // 🛡️ Concurrency cap (2026-09-15): grading previously fired every
    // record's Promise.all entry at once — with the 200-record limit that
    // was at most ~800 concurrent Binance REST calls; raising the limit to
    // 3000 for the throughput fix above turned that into ~12,000 concurrent
    // calls per cycle, which combined with the live trading engine's own
    // Binance usage tripped Binance's IP rate limiter (HTTP 429) and put
    // LIVE market data on the synthetic-fallback circuit breaker for 5
    // minutes — a real production impact, found the same day this was
    // raised. CONCURRENCY caps how many records are in flight at once;
    // grading throughput is still governed by the lane limits above, just
    // spread out instead of bursted.
    const CONCURRENCY = 25;

    const resolveRecord = async (r: (typeof records)[number]) => {
      if (!r.priceAtPrediction) return;

      const ageMinutes = (now - r.timestamp.getTime()) / 60000;
      const updates: any = {};

      if (ageMinutes >= 15 && !r.outcome15m) {
        const out = await this.resolveOutcome(r.symbol, r.timestamp, 15, r.priceAtPrediction, r.direction, priceLookup);
        if (out) {
            updates.price15m = out.price;
            updates.outcome15m = out.status;
        }
      }

      // isCorrect is graded HERE, at 25 minutes — the horizon the CNN is
      // actually trained on (FORWARD_HORIZON=5 x 5m bars in train_cnn.py).
      // NEUTRAL (move within the ±fee-floor band on a LONG/SHORT call) is
      // excluded from the accuracy sample, not counted as a miss: the model
      // wasn't wrong, the market just didn't move enough to grade it.
      if (ageMinutes >= 25 && !r.outcome25m) {
        const out = await this.resolveOutcome(r.symbol, r.timestamp, 25, r.priceAtPrediction, r.direction, priceLookup);
        if (out) {
            updates.price25m = out.price;
            updates.outcome25m = out.status;
            if (out.status !== "NEUTRAL") {
              updates.isCorrect = (out.status === "WIN");
              updates.gradingVersion = 2;
            }
        }
      }

      if (ageMinutes >= 30 && !r.outcome30m) {
        const out = await this.resolveOutcome(r.symbol, r.timestamp, 30, r.priceAtPrediction, r.direction, priceLookup);
        if (out) {
            updates.price30m = out.price;
            updates.outcome30m = out.status;
        }
      }

      // 30m/60m outcomes are kept as informational checkpoints only —
      // grading a 25-minute prediction at 60 minutes (as the old code did,
      // with NEUTRAL counted as a loss) made HOLD near-unwinnable and
      // produced impossible readings like 0.0% rolling accuracy.
      if (ageMinutes >= 60 && !r.outcome60m) {
        const out = await this.resolveOutcome(r.symbol, r.timestamp, 60, r.priceAtPrediction, r.direction, priceLookup);
        if (out) {
            updates.price60m = out.price;
            updates.outcome60m = out.status;
        }
      }

      if (Object.keys(updates).length > 0) {
        if (process.env.DEBUG_TRACES === "true") {
          console.log(`[TELEMETRY] Updating record ${r.prediction_id}: ${JSON.stringify(updates)}`);
        }
        await AIPredictionTelemetry.updateOne({ _id: r._id }, { $set: updates });
      }
    };

    for (let i = 0; i < records.length; i += CONCURRENCY) {
      const chunk = records.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(resolveRecord));
    }
  }

  /**
   * One bulk 1-minute kline fetch per symbol per grading cycle instead of one
   * REST call per record per horizon. Grading needed the close at 15/25/30/60
   * minutes after each prediction, fetched one candle at a time: ~800 records
   * x up to 4 horizons = ~2,400 klines calls in a burst, which tripped
   * Binance's 429 limit every 10-15 minutes (2026-09-25) and suspended Spot
   * REST for the live engine too. Pages of up to 1,000 candles cover each
   * symbol's needed range (bounded to 12 pages ~ 8 days).
   */
  private static async prefetchGradingPrices(records: any[], now: number): Promise<GradingPriceLookup> {
    const HORIZONS: Array<[number, string]> = [[15, "outcome15m"], [25, "outcome25m"], [30, "outcome30m"], [60, "outcome60m"]];
    const ranges = new Map<string, { lo: number; hi: number }>();
    for (const r of records) {
      if (!r?.priceAtPrediction || !r.timestamp) continue;
      const t0 = new Date(r.timestamp).getTime();
      for (const [h, field] of HORIZONS) {
        if ((now - t0) / 60_000 < h || r[field]) continue;
        const m = Math.ceil((t0 + h * 60_000) / 60_000) * 60_000;
        const cur = ranges.get(r.symbol);
        ranges.set(r.symbol, cur ? { lo: Math.min(cur.lo, m), hi: Math.max(cur.hi, m) } : { lo: m, hi: m });
      }
    }
    const lookup: GradingPriceLookup = { prices: new Map(), unavailable: new Set() };
    const klinesFn = klinesProviderOverride ?? binanceService.getKlines;
    for (const [symbol, { lo, hi }] of ranges) {
      const map = new Map<number, number>();
      let start = lo;
      try {
        for (let page = 0; page < 12 && start <= hi; page++) {
          const kl = await klinesFn(symbol, "1m", start, hi + 60_000, 1000);
          if (!kl || kl.length === 0) break;
          // Only candles inside the requested range count: while REST is
          // suspended getKlines can serve cached candles from elsewhere.
          for (const k of kl) {
            const ot = Number(k.openTime);
            if (ot >= lo && ot <= hi) map.set(ot, parseFloat(k.close));
          }
          const last = Number(kl[kl.length - 1].openTime);
          if (!(last >= start)) break;
          start = last + 60_000;
        }
      } catch { /* treated as unavailable below */ }
      if (map.size === 0) lookup.unavailable.add(symbol);
      else lookup.prices.set(symbol, map);
    }
    return lookup;
  }

  private static async resolveOutcome(symbol: string, timestamp: Date, offset: number, entry: number, decision: "LONG" | "SHORT" | "HOLD", lookup?: GradingPriceLookup): Promise<any> {
    try {
      const targetTime = timestamp.getTime() + offset * 60 * 1000;
      let price: number | undefined;
      if (lookup) {
        // Prefetch failed for this symbol (e.g. REST rate-limited): skip it this
        // cycle rather than retry with one request per record.
        if (lookup.unavailable.has(symbol)) return null;
        price = lookup.prices.get(symbol)?.get(Math.ceil(targetTime / 60_000) * 60_000);
      }
      if (price === undefined) {
        const klinesFn = klinesProviderOverride ?? binanceService.getKlines;
        const klines = await klinesFn(symbol, "1m", targetTime, undefined, 1);
        if (!klines || klines.length === 0) {
            console.warn(`[TELEMETRY] No klines found for ${symbol} at ${new Date(targetTime).toISOString()}`);
            return null;
        }
        price = parseFloat(klines[0].close);
      }
      const ret = (price / entry) - 1;
      
      let status: "WIN" | "LOSS" | "NEUTRAL" = "NEUTRAL";
      if (decision === "LONG") status = ret > 0.001 ? "WIN" : (ret < -0.001 ? "LOSS" : "NEUTRAL");
      else if (decision === "SHORT") status = ret < -0.001 ? "WIN" : (ret > 0.001 ? "LOSS" : "NEUTRAL");
      else if (decision === "HOLD") status = Math.abs(ret) <= 0.001 ? "WIN" : "LOSS";

      return { price, return: ret, status };
    } catch (e: any) { 
        console.error(`[TELEMETRY] resolveOutcome error: ${e.message}`);
        return null; 
    }
  }

  public static async updateRollingAccuracies(): Promise<void> {
    const models = ["CNN_1D_V1", "PPO_EXECUTION_V1", "TRANSFORMER_MICRO_V1", "MAMBA_V1"];
    
    for (const model of models) {
      // Only v2-graded records: mixing legacy 60m gradings (NEUTRAL=loss,
      // wrong horizon) into the same window would make the number
      // meaningless. Windows start small after the cutover and fill up as
      // new predictions resolve.
      const records = await AIPredictionTelemetry.find({
        model_name: model,
        isCorrect: { $exists: true },
        gradingVersion: 2
      })
      .sort({ timestamp: -1 })
      .limit(500)
      .lean();

      if (records.length === 0) continue;

      const acc50 = this.calcAcc(records.slice(0, 50));
      const acc100 = this.calcAcc(records.slice(0, 100));
      const acc500 = this.calcAcc(records);

      await ModelAccuracyMetrics.create({
        model_name: model,
        timestamp: new Date(),
        rolling50_accuracy: acc50,
        rolling100_accuracy: acc100,
        rolling500_accuracy: acc500
      });
    }
  }

  private static calcAcc(records: any[]): number {
    if (records.length === 0) return 0;
    const correct = records.filter(r => r.isCorrect).length;
    return (correct / records.length) * 100;
  }

  public static async getModelAccuracy(modelName: string): Promise<any> {
    const fallback = { rolling50_accuracy: 50, rolling100_accuracy: 50, rolling500_accuracy: 50 };
    try {
      const q = ModelAccuracyMetrics.findOne({ model_name: modelName });
      if (typeof (q as any).sort !== "function") return fallback;
      const latest = await (q as any).sort({ timestamp: -1 }).lean();
      return latest || fallback;
    } catch {
      return fallback;
    }
  }
}
