import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * Regression 2026-09-29: KOTAKBANK spread re-entered seconds after a stop and
 * was stopped again; ₹0.25–0.37 debit spreads were stopped within 4 minutes.
 */
import mongoose from "mongoose";
import { StrategyEngine } from "../src/services/indianMarket/strategyEngine.js";
import { IndianRiskManager } from "../src/services/indianMarket/riskManager.js";
import { Trade } from "../src/models/Trade.js";

const users: string[] = [];
beforeAll(async () => { await connectIfAvailable(); });
afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    try { await Trade.deleteMany({ userId: { $in: users.map((u) => new mongoose.Types.ObjectId(u)) } }); } catch { /* ignore */ }
  }
  await disconnectMongo();
});
const freshUser = () => { const id = new mongoose.Types.ObjectId().toString(); users.push(id); return id; };

function longCall() {
  const context: any = { underlying: "NIFTY", spotPrice: 24500, bars1m: [], bars5m: [], bars15m: [], regime: "TRENDING_BULL", timestamp: new Date() };
  const strat = StrategyEngine.getStrategy("LONG_CALL")!;
  return strat.constructTrade(strat.generateSignal(context)!, context, 500000, 1.0);
}

test("tiny-premium debit spread is rejected", async () => {
  const t: any = longCall();
  t.legs = [t.legs[0], { ...t.legs[0] }];
  t.position = "LONG"; t.entryPrice = 0.37; t.stopLoss = 0.22;
  const res = await IndianRiskManager.validateTrade(t, 500000, 50000, freshUser(), true);
  expect(res.approved).toBe(false);
  expect(res.rejectionReason).toBe("SPREAD_DEBIT_TOO_SMALL");
});

test("a recent losing same-direction close on the underlying blocks re-entry (any strategy)", async () => {
  if (skipIfNoMongo()) return;
  const user = freshUser();
  await Trade.create({
    userId: new mongoose.Types.ObjectId(user), mode: "PAPER", symbol: "NIFTY26SEP24400CE", underlying: "NIFTY",
    strategy: "SOME_OTHER_STRATEGY", side: "BUY", quantity: 75, entryPrice: 100, leverage: 1,
    accountType: "INDIAN_NIFTY50", market: "INDIA", status: "CLOSED", closedAt: new Date(), netPnl: -500, pnl: -500,
    decisionPath: { source: "test-fixture" },
  });
  const res = await IndianRiskManager.validateTrade(longCall(), 500000, 50000, user, true);
  expect(res.approved).toBe(false);
  expect(res.rejectionReason).toBe("POST_LOSS_COOLDOWN_ACTIVE");
});
