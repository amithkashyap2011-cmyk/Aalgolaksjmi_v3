import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * Regression: Indian entry guards must survive restarts (2026-09-23).
 *
 * - The duplicate fingerprint and strategy cooldown lived only in memory, so
 *   five tsx-watch reloads in 80s opened four INFY VWAP_REVERSION puts — one
 *   per boot. Mongo's open/recent trades now block the entry too.
 * - validateTrade reserved the cooldown on approval even when the order was
 *   then never placed; releaseReservation undoes it.
 */
import mongoose from "mongoose";
import { StrategyEngine } from "../src/services/indianMarket/strategyEngine.js";
import { IndianRiskManager } from "../src/services/indianMarket/riskManager.js";
import { MarketEvaluationContext } from "../src/services/indianMarket/strategyTypes.js";
import { Trade } from "../src/models/Trade.js";

const createdUsers: string[] = [];

beforeAll(async () => {
  await connectIfAvailable();
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    try {
      await Trade.deleteMany({ userId: { $in: createdUsers.map((u) => new mongoose.Types.ObjectId(u)) } });
    } catch { /* ignore */ }
  }
  await disconnectMongo();
});

function freshUser(): string {
  const id = new mongoose.Types.ObjectId().toString();
  createdUsers.push(id);
  return id;
}

function buildNiftyLongCall() {
  const context: MarketEvaluationContext = {
    underlying: "NIFTY",
    spotPrice: 24500,
    bars1m: [],
    bars5m: [],
    bars15m: [],
    regime: "TRENDING_BULL",
    timestamp: new Date(),
  };
  const strat = StrategyEngine.getStrategy("LONG_CALL")!;
  return strat.constructTrade(strat.generateSignal(context)!, context, 500000, 1.0);
}

async function recordTrade(userId: string, status: "OPEN" | "CLOSED", ageMinutes = 0) {
  await Trade.create({
    ...(ageMinutes > 0 ? { _id: mongoose.Types.ObjectId.createFromTime(Math.floor((Date.now() - ageMinutes * 60_000) / 1000)) } : {}),
    userId: new mongoose.Types.ObjectId(userId),
    mode: "PAPER",
    symbol: "NIFTY26SEP24500CE",
    underlying: "NIFTY",
    strategy: "LONG_CALL",
    side: "BUY",
    quantity: 75,
    entryPrice: 120,
    leverage: 1,
    accountType: "INDIAN_NIFTY50",
    market: "INDIA",
    status,
    decisionPath: { source: "test-fixture" },
  });
}

describe("IndianRiskManager — persisted entry guards", () => {
  test("an OPEN same-strategy trade in Mongo blocks entry even with empty in-memory state", async () => {
    if (skipIfNoMongo()) return;
    const user = freshUser();
    await recordTrade(user, "OPEN");

    const res = await IndianRiskManager.validateTrade(buildNiftyLongCall(), 500000, 50000, user, true);

    expect(res.approved).toBe(false);
    expect(res.rejectionReason).toBe("DUPLICATE_OPEN_POSITION");
  });

  test("a same-strategy entry within the cooldown blocks entry after a restart", async () => {
    if (skipIfNoMongo()) return;
    const user = freshUser();
    await recordTrade(user, "CLOSED", 2);

    const res = await IndianRiskManager.validateTrade(buildNiftyLongCall(), 500000, 50000, user, true);

    expect(res.approved).toBe(false);
    expect(res.rejectionReason).toBe("STRATEGY_COOLDOWN_ACTIVE");
  });

  test("a same-strategy trade older than the cooldown does not block", async () => {
    if (skipIfNoMongo()) return;
    const user = freshUser();
    await recordTrade(user, "CLOSED", 30);

    const res = await IndianRiskManager.validateTrade(buildNiftyLongCall(), 500000, 50000, user, true);

    expect(res.approved).toBe(true);
  });
});

describe("IndianRiskManager — reservation release", () => {
  test("releasing an approved-but-unplaced trade frees the strategy for the next attempt", async () => {
    if (skipIfNoMongo()) return;
    const user = freshUser();
    const first = buildNiftyLongCall();
    expect((await IndianRiskManager.validateTrade(first, 500000, 50000, user, true)).approved).toBe(true);

    IndianRiskManager.releaseReservation(first);

    const retry = await IndianRiskManager.validateTrade(buildNiftyLongCall(), 500000, 50000, user, true);
    expect(retry.approved).toBe(true);
  });

  test("without a release, an immediate identical entry is still blocked", async () => {
    if (skipIfNoMongo()) return;
    const user = freshUser();
    const first = buildNiftyLongCall();
    expect((await IndianRiskManager.validateTrade(first, 500000, 50000, user, true)).approved).toBe(true);
    IndianRiskManager.confirmReservation(first);

    const again = await IndianRiskManager.validateTrade(first, 500000, 50000, user, true);
    expect(again.approved).toBe(false);
    expect(again.rejectionReason).toBe("DUPLICATE_TRADE_PREVENTED");
  });
});
