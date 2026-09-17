import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * ─── Regression: grading selection must be maturity-based, not recency-based ──
 *
 * 2026-09-15: the grading query's "recent lane" sorted eligible records by
 * timestamp DESC and took the newest 2000/cycle. At observed generation
 * rates (~275 predictions/min) that lane was entirely composed of records
 * younger than 15 minutes — the earliest horizon this service ever grades —
 * so it did zero productive work every cycle. Confirmed via two read-only
 * production audits ~5 minutes apart: post-fix graded count stayed at 0
 * while the post-fix ungraded count grew (11,832 → 13,316).
 *
 * The fix: select by maturity (timestamp <= now - 15min) within a bounded
 * "active cohort" window (15-90 minutes old — 90 = the longest horizon,
 * 60m, plus cycle-catchup headroom), ascending, so records become eligible
 * the instant they mature and the oldest-in-band go first. A separate,
 * disjoint backlog lane (>90min old) keeps draining historical records
 * without ever being able to starve the active cohort.
 */
import { jest } from "@jest/globals";

// jest.unstable_mockModule does not reliably intercept binanceService for
// this specific consumer (verified directly: registered mocks never ran,
// calls silently fell through to the real module's synthetic-data
// fallback) despite working for other files' binanceService usage
// elsewhere in this suite — root cause not resolved. aiTelemetryService.ts
// exports a NODE_ENV=test-gated injection seam (__setKlinesProviderForTesting)
// for exactly this situation; used here instead of fighting the ESM mock
// resolution further, so these tests exercise real grading logic without
// ever making an actual network call.
let klinesMode: "resolve" | "empty" | "pending" = "resolve";
let klinesValue: any = [{ close: "51000" }];
let pendingResolvers: Array<(v: any) => void> = [];
let klinesCalls: any[][] = [];

function fakeGetKlines(...args: any[]): Promise<any> {
  klinesCalls.push(args);
  if (klinesMode === "pending") {
    return new Promise((resolve) => { pendingResolvers.push(resolve); });
  }
  if (klinesMode === "empty") return Promise.resolve([]);
  return Promise.resolve(klinesValue);
}

import mongoose from "mongoose";

let AIPredictionTelemetry: any, AITelemetryService: any, setKlinesProviderForTesting: any;

const modelName = "CNN_1D_V1";
// Unique per test (not just per file) — guarantees zero cross-test document
// visibility regardless of afterEach cleanup timing, rather than relying on
// delete-by-shared-symbol running to completion before the next test starts.
let symbol = "BTCUSDT_INIT";
let testCounter = 0;

function makePrediction(overrides: Record<string, unknown> = {}) {
  return {
    prediction_id: `PRED_TEST_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    model_name: modelName,
    symbol,
    direction: "LONG",
    confidence: 0.8,
    priceAtPrediction: 50000,
    ...overrides,
  };
}

function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 1000);
}

beforeAll(async () => {
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
  ({ AIPredictionTelemetry } = await import("../src/models/AIPredictionTelemetry.js"));
  ({ AITelemetryService, __setKlinesProviderForTesting: setKlinesProviderForTesting } = await import("../src/services/aqea/aiTelemetryService.js"));
  setKlinesProviderForTesting(fakeGetKlines);
});

beforeEach(() => {
  testCounter += 1;
  symbol = `TESTSYM_${testCounter}`;
  klinesMode = "resolve";
  klinesValue = [{ close: "51000" }];
  klinesCalls = [];
  pendingResolvers = [];
});

afterEach(async () => {
  if (AIPredictionTelemetry && mongoose.connection.readyState === 1) {
    await AIPredictionTelemetry.deleteMany({ symbol, model_name: modelName });
  }
});

afterAll(async () => {
  if (setKlinesProviderForTesting) setKlinesProviderForTesting(null);
  await disconnectMongo();
});

describe("AITelemetryService.resolvePendingOutcomes — maturity-based selection", () => {
  test("a prediction younger than 15 minutes is NOT graded", async () => {
    if (skipIfNoMongo()) return;

    const doc = await AIPredictionTelemetry.create(makePrediction({ timestamp: minutesAgo(10) }));
    await AITelemetryService.resolvePendingOutcomes();

    const after = await AIPredictionTelemetry.findById(doc._id);
    expect(after.outcome15m).toBeUndefined();
    expect(klinesCalls.length).toBe(0);
  });

  test("a prediction exactly at 15 minutes is eligible and gets graded", async () => {
    if (skipIfNoMongo()) return;

    // Slightly past 15:00 (15:00:05) so the boundary comparison in
    // resolveRecord's `ageMinutes >= 15` — evaluated a moment after the
    // query itself runs — reliably lands on the "included" side rather
    // than racing the clock.
    const doc = await AIPredictionTelemetry.create(
      makePrediction({ timestamp: new Date(Date.now() - (15 * 60 * 1000 + 5000)) })
    );
    await AITelemetryService.resolvePendingOutcomes();

    const after = await AIPredictionTelemetry.findById(doc._id);
    expect(after.outcome15m).toBe("WIN");
    expect(klinesCalls.length).toBeGreaterThan(0);
  });

  test("a prediction at 14:59 (one second short of maturity) is NOT graded", async () => {
    if (skipIfNoMongo()) return;

    const doc = await AIPredictionTelemetry.create(
      makePrediction({ timestamp: new Date(Date.now() - (15 * 60 * 1000 - 1000)) })
    );
    await AITelemetryService.resolvePendingOutcomes();

    const after = await AIPredictionTelemetry.findById(doc._id);
    expect(after.outcome15m).toBeUndefined();
  });

  test("fresh (too-young) records do not crowd out mature ones in the same cycle", async () => {
    if (skipIfNoMongo()) return;

    // Reproduces the exact starvation shape: many more too-young records
    // than mature ones, submitted in the same cycle.
    const tooYoung = await Promise.all(
      Array.from({ length: 20 }, (_, i) => AIPredictionTelemetry.create(makePrediction({ timestamp: minutesAgo(5 + i * 0.1) })))
    );
    const mature = await AIPredictionTelemetry.create(makePrediction({ timestamp: minutesAgo(20) }));

    await AITelemetryService.resolvePendingOutcomes();

    const matureAfter = await AIPredictionTelemetry.findById(mature._id);
    expect(matureAfter.outcome15m).toBe("WIN");

    const stillUngraded = await AIPredictionTelemetry.countDocuments({
      _id: { $in: tooYoung.map((d: any) => d._id) },
      outcome15m: { $exists: true },
    });
    expect(stillUngraded).toBe(0);
  });

  test("historical backlog (>90 minutes old) still gets graded via the backlog lane", async () => {
    if (skipIfNoMongo()) return;

    const old = await AIPredictionTelemetry.create(makePrediction({ timestamp: minutesAgo(120) }));
    await AITelemetryService.resolvePendingOutcomes();

    const after = await AIPredictionTelemetry.findById(old._id);
    expect(after.outcome15m).toBe("WIN");
  });

  test("active-cohort (fresh) predictions are graded even in the presence of a large historical backlog", async () => {
    if (skipIfNoMongo()) return;

    // A backlog large enough that, under the old newest-first/oldest-first
    // split, would never let a same-cycle fresh record through.
    await Promise.all(
      Array.from({ length: 40 }, (_, i) => AIPredictionTelemetry.create(makePrediction({ timestamp: minutesAgo(200 + i) })))
    );
    const fresh = await AIPredictionTelemetry.create(makePrediction({ timestamp: minutesAgo(20) }));

    await AITelemetryService.resolvePendingOutcomes();

    const freshAfter = await AIPredictionTelemetry.findById(fresh._id);
    expect(freshAfter.outcome15m).toBe("WIN");
  });

  test("already-graded records are never re-graded (idempotent across cycles)", async () => {
    if (skipIfNoMongo()) return;

    const doc = await AIPredictionTelemetry.create(makePrediction({ timestamp: minutesAgo(20) }));
    await AITelemetryService.resolvePendingOutcomes();
    const firstPass = await AIPredictionTelemetry.findById(doc._id);
    expect(firstPass.outcome15m).toBe("WIN");

    klinesValue = [{ close: "999999" }]; // would flip the grade if re-run
    await AITelemetryService.resolvePendingOutcomes();

    const secondPass = await AIPredictionTelemetry.findById(doc._id);
    expect(secondPass.outcome15m).toBe("WIN"); // unchanged — the 15m field guard (`!r.outcome15m`) held
  });

  test("a concurrent/overlapping invocation no-ops instead of doubling the batch", async () => {
    if (skipIfNoMongo()) return;
    klinesMode = "pending";

    const doc = await AIPredictionTelemetry.create(makePrediction({ timestamp: minutesAgo(20) }));

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const firstCall = AITelemetryService.resolvePendingOutcomes();
    // Give the first call time to acquire the mutex and start its DB query
    // before firing the second.
    await new Promise((r) => setTimeout(r, 50));
    const secondCall = AITelemetryService.resolvePendingOutcomes();

    expect(logSpy.mock.calls.some((c: any[]) => String(c[0]).includes("Skipping cycle"))).toBe(true);

    klinesMode = "resolve";
    pendingResolvers.forEach((resolve) => resolve([{ close: "51000" }]));
    await Promise.all([firstCall, secondCall]);
    logSpy.mockRestore();

    const after = await AIPredictionTelemetry.findById(doc._id);
    expect(after.outcome15m).toBe("WIN");
  });

  test("a resolveOutcome failure (no klines) leaves the record ungraded for retry, never silently marked", async () => {
    if (skipIfNoMongo()) return;
    klinesMode = "empty"; // simulates "no klines found"

    const doc = await AIPredictionTelemetry.create(makePrediction({ timestamp: minutesAgo(20) }));
    await AITelemetryService.resolvePendingOutcomes();

    const after = await AIPredictionTelemetry.findById(doc._id);
    expect(after.outcome15m).toBeUndefined();
    expect(after.isCorrect).toBeUndefined();
  });

  /*
   * 2026-09-16: found during overnight monitoring — the active-cohort lane's
   * oldest-first sort is correct for retiring records, but at production
   * volume (~275 predictions/min, far above RECENT_LANE_LIMIT=2000 for a
   * 75-minute-wide band) a record's first-ever grading pass only happened
   * once it aged into the oldest slice, empirically ~83-90 minutes old —
   * confirmed live: records 20-25m old showed 0/1854 outcome15m completion
   * while 65-70m/95-100m old records showed 100% outcome60m completion.
   * The fix adds an additive "fresh lane" selecting records missing
   * outcome15m, newest-matured first. These tests exercise its direct
   * behavior; reproducing the full 2000+-record starvation shape isn't
   * practical in a fast unit test (see the module-level RECENT_LANE_LIMIT),
   * so this focuses on the one real risk the addition introduces: double
   * processing the same record via two overlapping candidate sets.
   */
  test("a record present in both the recent-lane and fresh-lane candidate sets is graded exactly once per cycle", async () => {
    if (skipIfNoMongo()) return;

    // At small N, both the recent lane (ascending, limit 2000) and the
    // fresh lane (descending, missing outcome15m) return this same record —
    // exactly the overlap the dedup in runGradingCycle exists to collapse.
    const doc = await AIPredictionTelemetry.create(makePrediction({ timestamp: minutesAgo(20) }));
    await AITelemetryService.resolvePendingOutcomes();

    const after = await AIPredictionTelemetry.findById(doc._id);
    expect(after.outcome15m).toBe("WIN");
    // One resolveOutcome call for the 15m horizon — not two — proves the
    // fresh-lane dedup against recentRecords is working, not double-firing
    // Binance lookups for a record already covered by the recent lane.
    const fifteenMinuteCalls = klinesCalls.filter((args) => args[3] === undefined && args[4] === 1);
    expect(fifteenMinuteCalls.length).toBe(1);
  });

  test("a mature record missing only outcome15m is graded promptly by the fresh lane", async () => {
    if (skipIfNoMongo()) return;

    const doc = await AIPredictionTelemetry.create(makePrediction({ timestamp: minutesAgo(16) }));
    await AITelemetryService.resolvePendingOutcomes();

    const after = await AIPredictionTelemetry.findById(doc._id);
    expect(after.outcome15m).toBe("WIN");
  });
});
