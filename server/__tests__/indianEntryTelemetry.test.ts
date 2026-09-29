import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
process.env.INDIAN_TELEMETRY_PERSIST_IN_TEST = "1";
import mongoose from "mongoose";
import { newState, applyObservation, summarize, observeEntry, buildEntryTelemetryReport } from "../src/services/indianMarket/entryTelemetry.js";
import { IndianEntryTelemetry } from "../src/models/IndianEntryTelemetry.js";
import { Trade } from "../src/models/Trade.js";

const MIN = 60_000;
const T0 = 1_800_000_000_000;

describe("applyObservation (pure)", () => {
  test("records % move at 5/15/30 min and tracks best/worst excursion", () => {
    const s = newState(2.0, T0);
    applyObservation(s, 2.2, T0 + 1 * MIN);   // +10% (excursion only)
    applyObservation(s, 1.8, T0 + 3 * MIN);   // -10%
    applyObservation(s, 2.4, T0 + 5 * MIN);   // +20% at 5m
    applyObservation(s, 2.0, T0 + 15 * MIN);  // 0% at 15m
    applyObservation(s, 1.0, T0 + 30 * MIN);  // -50% at 30m
    expect(s.ret5).toBe(20);
    expect(s.ret15).toBe(0);
    expect(s.ret30).toBe(-50);
    expect(s.mfePct).toBe(20);
    expect(s.maePct).toBe(-50);
  });

  test("a checkpoint is not filled by a much later observation (restart safety)", () => {
    const s = newState(2.0, T0);
    applyObservation(s, 2.6, T0 + 12 * MIN); // first look at 12m: past 5m grace, inside 15m? no, before 15m
    expect(s.ret5).toBeNull();               // must NOT be filed as the 5-minute value
    expect(s.missed.has("ret5")).toBe(true);
    applyObservation(s, 3.0, T0 + 40 * MIN); // way past 15m/30m grace
    expect(s.ret15).toBeNull();
    expect(s.ret30).toBeNull();
  });

  test("ignores non-positive values", () => {
    const s = newState(2.0, T0);
    applyObservation(s, 0, T0 + 5 * MIN);
    applyObservation(s, NaN as any, T0 + 5 * MIN);
    expect(s.observations).toBe(0);
    expect(s.ret5).toBeNull();
  });
});

describe("summarize", () => {
  test("reports per-checkpoint n, mean and favourable share, plus win rate and P&L", () => {
    const rows = [
      { tradeId: "a", strategy: "S", ret5: 10, ret15: 20, ret30: null, mfePct: 25, maePct: -5, netPnl: 100, closed: true },
      { tradeId: "b", strategy: "S", ret5: -10, ret15: null, ret30: null, mfePct: 2, maePct: -20, netPnl: -50, closed: true },
      { tradeId: "c", strategy: "S", ret5: null, ret15: null, ret30: null, mfePct: 0, maePct: 0, closed: false },
    ];
    const [g] = summarize(rows, (r) => r.strategy!);
    expect(g.trades).toBe(3);
    expect(g.closed).toBe(2);
    expect(g.winRatePct).toBe(50);
    expect(g.netPnl).toBe(50);
    expect(g.checkpoints["5m"]).toEqual({ n: 2, meanRetPct: 0, favourablePct: 50 });
    expect(g.checkpoints["15m"].n).toBe(1);
    expect(g.checkpoints["30m"]).toEqual({ n: 0, meanRetPct: null, favourablePct: null });
  });
});

describe("persistence + report", () => {
  const userId = new mongoose.Types.ObjectId();
  const tradeId = new mongoose.Types.ObjectId();
  beforeAll(async () => { await connectIfAvailable(); });
  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await IndianEntryTelemetry.deleteMany({ userId });
      await Trade.deleteMany({ userId });
    }
    await disconnectMongo();
  });

  test("observations persist, checkpoints are write-once, report is scoped and joins P&L", async () => {
    if (skipIfNoMongo()) return;
    const openedAt = new Date(Date.now() - 6 * MIN);
    const doc: any = { _id: tradeId, userId, symbol: "TEST_SPREAD", underlying: "TESTCO", strategy: "BULL_CALL_SPREAD", entryPrice: 2.0, openedAt, authorizedVotes: { regime: "TRENDING_BULL" } };
    observeEntry(doc, 2.4, Date.now()); // 6 min after entry -> 5m checkpoint = +20%
    await new Promise((r) => setTimeout(r, 400));
    let row: any = await IndianEntryTelemetry.findOne({ tradeId: String(tradeId) }).lean();
    expect(row.ret5).toBe(20);
    expect(row.strategy).toBe("BULL_CALL_SPREAD");
    expect(row.regime).toBe("TRENDING_BULL");
    expect(row.mfePct).toBe(20);

    // A checkpoint already stored must not be overwritten.
    await IndianEntryTelemetry.updateOne({ tradeId: String(tradeId) }, { $set: { ret5: 33 } });
    (observeEntry as any)(doc, 2.2, Date.now() + 31_000); // persist window reopened; ret5 stays
    await new Promise((r) => setTimeout(r, 400));
    row = await IndianEntryTelemetry.findOne({ tradeId: String(tradeId) }).lean();
    expect(row.ret5).toBe(33);

    await Trade.create({ _id: tradeId, userId, mode: "PAPER", symbol: "TEST_SPREAD", side: "BUY", quantity: 1, entryPrice: 2, accountType: "INDIAN_NSE", status: "CLOSED", netPnl: 120, decisionPath: {} });
    const rep: any = await buildEntryTelemetryReport(String(userId), 14);
    expect(rep.byStrategy).toHaveLength(1);
    expect(rep.byStrategy[0].netPnl).toBe(120);
    expect(rep.byStrategy[0].winRatePct).toBe(100);

    const other: any = await buildEntryTelemetryReport(String(new mongoose.Types.ObjectId()), 14);
    expect(other.byStrategy).toHaveLength(0); // another account sees nothing
  });
});
