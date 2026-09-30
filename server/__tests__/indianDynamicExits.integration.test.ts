import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import mongoose from "mongoose";
import { AutoPilotStateMachine } from "../src/services/indianMarket/autoPilotStateMachine.js";
import { Trade } from "../src/models/Trade.js";

const userId = new mongoose.Types.ObjectId();
beforeAll(async () => { await connectIfAvailable(); AutoPilotStateMachine.setMode("AUTO"); });
afterAll(async () => { if (mongoose.connection.readyState === 1) await Trade.deleteMany({ userId }); await disconnectMongo(); });

const mk = (over: any) => Trade.create({
  userId, mode: "PAPER", side: "BUY", quantity: 2, origQty: 2, status: "OPEN", accountType: "INDIAN_NSE",
  meta: {}, decisionPath: { source: "test-fixture" }, ...over,
});
const tick = async (id: any, symbol: string, ltp: number) => {
  const doc: any = await Trade.findById(id);         // fresh load each tick, as the monitor does
  const res = await AutoPilotStateMachine.processTick(doc, { symbol, ltp, timestamp: Date.now() }, undefined, true);
  return { res, stored: (await Trade.findById(id).lean()) as any };
};

test("a stock's stop trails up in R steps and persists across reloads", async () => {
  if (skipIfNoMongo()) return;
  const t = await mk({ symbol: "KOTAKBANKDYN", entryPrice: 414.9, sl: 407.43, tp: 429.84 });
  let s = (await tick(t._id, "KOTAKBANKDYN", 420.6)).stored;            // +5.7 = 0.76R
  expect(s.meta.trailingStage).toBe("STOCK_BREAKEVEN");
  expect(s.sl).toBeCloseTo(415.65, 1);
  s = (await tick(t._id, "KOTAKBANKDYN", 424.5)).stored;                // +9.6 = 1.29R
  expect(s.meta.trailingStage).toBe("STOCK_LOCK_0_5R");
  expect(s.sl).toBeCloseTo(418.64, 1);
  const r = await tick(t._id, "KOTAKBANKDYN", 418.0);                   // pulls back through the locked stop
  expect(r.res.triggered).toBe(true);
  expect(r.res.reason).toMatch(/STOP_LOSS_TRIGGERED \(TRAILING_STOP/);
});

test("reaching the target extends it instead of selling, and the stop locks half the gain", async () => {
  if (skipIfNoMongo()) return;
  const t = await mk({ symbol: "TARGETDYN", entryPrice: 100, sl: 95, tp: 110 });
  const r = await tick(t._id, "TARGETDYN", 110.2);                      // touches the target
  expect(r.res.triggered).toBe(false);
  expect(r.stored.tp).toBe(115);                                        // +50% of the original 10
  expect(r.stored.meta.tpExtensions).toBe(1);
  expect(r.stored.sl).toBeGreaterThanOrEqual(105.1);                    // half of the +10.2 gain
  const back = await tick(t._id, "TARGETDYN", 105);                     // reversal exits in profit
  expect(back.res.triggered).toBe(true);
});

test("dynamic profit can be turned off per trade and the old exit-at-target holds", async () => {
  if (skipIfNoMongo()) return;
  const t = await mk({ symbol: "PLAINTP", entryPrice: 100, sl: 95, tp: 110, meta: { dynamicProfit: false } });
  const r = await tick(t._id, "PLAINTP", 110.5);
  expect(r.res.triggered).toBe(true);
  expect(r.res.reason).toMatch(/TARGET_TRIGGERED/);
});

test("options keep the premium-% tiers and are not given stock tiers", async () => {
  if (skipIfNoMongo()) return;
  const t = await mk({ symbol: "NIFTY06OCT2622700CE", instrumentType: "CE", entryPrice: 100, sl: 60, tp: 180 });
  const s = (await tick(t._id, "NIFTY06OCT2622700CE", 112)).stored;      // +12%: below every option tier
  expect(s.meta.trailingStage ?? "NONE").toBe("NONE");
  expect(s.sl).toBe(60);
});
