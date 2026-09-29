import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * Regression 2026-09-30: Trade.meta is a Mixed field; the exit state machine
 * mutated meta.trailingStage / highestLtp / triggerStatus without markModified,
 * so Mongoose never saved them. The peak reset on every reload and trailing
 * exits lost their TRAILING_STOP label. Uses a REAL Trade document round-trip
 * (the in-memory mock docs in the other autopilot tests can't see this bug).
 */
import mongoose from "mongoose";
import { AutoPilotStateMachine } from "../src/services/indianMarket/autoPilotStateMachine.js";
import { Trade } from "../src/models/Trade.js";

const userId = new mongoose.Types.ObjectId();
const SYMBOL = "NIFTY26SEP24500CE_METATEST";

beforeAll(async () => { await connectIfAvailable(); });
afterAll(async () => {
  AutoPilotStateMachine.setMode("AUTO");
  if (mongoose.connection.readyState === 1) await Trade.deleteMany({ userId });
  await disconnectMongo();
});

const tick = (doc: any, ltp: number) =>
  AutoPilotStateMachine.processTick(doc, { symbol: SYMBOL, ltp, timestamp: Date.now() }, undefined, true);

test("trailing stage, peak and manual-trigger status survive a reload from Mongo", async () => {
  if (skipIfNoMongo()) return;
  AutoPilotStateMachine.setMode("AUTO");
  const created = await Trade.create({
    userId, mode: "PAPER", symbol: SYMBOL, side: "BUY", quantity: 150, origQty: 150,
    entryPrice: 100, sl: 72, tp: 200, status: "OPEN", accountType: "INDIAN_NSE",
    meta: {}, decisionPath: { source: "test-fixture" },
  });

  // Tick up to +26% (breakeven shift), then a pullback that triggers nothing.
  let doc: any = await Trade.findById(created._id);
  await tick(doc, 126);
  doc = await Trade.findById(created._id);           // fresh instance, as the next tick would load
  await tick(doc, 120);

  let stored: any = await Trade.findById(created._id).lean();
  expect(stored.sl).toBe(102);                        // top-level field (always persisted)
  expect(stored.meta.trailingStage).toBe("BREAKEVEN_SHIFT"); // was lost before the fix
  expect(stored.meta.highestLtp).toBe(126);                  // peak must not reset to entry

  // Manual mode holds the stop trigger for the operator; its meta write must persist too.
  AutoPilotStateMachine.setMode("MANUAL");
  doc = await Trade.findById(created._id);
  const res = await tick(doc, 101);                   // 101 <= trailed SL 102
  expect(res.reason).toBe("MANUAL_MODE_TRIGGER_HELD_FOR_OPERATOR");
  stored = await Trade.findById(created._id).lean();
  expect(stored.meta.triggerStatus).toBe("HIT");
  expect(stored.meta.trailingStage).toBe("BREAKEVEN_SHIFT"); // still there
});
