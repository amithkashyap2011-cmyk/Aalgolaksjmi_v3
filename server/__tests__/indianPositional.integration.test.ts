import fs from "node:fs";
import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
import mongoose from "mongoose";
import { AutoPilotStateMachine } from "../src/services/indianMarket/autoPilotStateMachine.js";
import { Trade } from "../src/models/Trade.js";

const userId = new mongoose.Types.ObjectId();
beforeAll(async () => { await connectIfAvailable(); AutoPilotStateMachine.setMode("AUTO"); });
afterAll(async () => { if (mongoose.connection.readyState === 1) await Trade.deleteMany({ userId }); await disconnectMongo(); });

const mk = (over: any) => Trade.create({
  userId, mode: "PAPER", side: "BUY", quantity: 225, origQty: 225, status: "OPEN", accountType: "INDIAN_NSE",
  productType: "NRML", entryPrice: 18.4, sl: 9.2, tp: 40, symbol: "TCS_BULL_CALL_SPREAD_POS",
  decisionPath: { source: "test-fixture" }, ...over,
});
const tick = async (id: any, ltp: number, symbol = "TCS_BULL_CALL_SPREAD_POS") => {
  const doc: any = await Trade.findById(id);
  return AutoPilotStateMachine.processTick(doc, { symbol, ltp, timestamp: Date.now() }, undefined, true);
};

test("a positional position is held while its exit deadline is in the future", async () => {
  if (skipIfNoMongo()) return;
  const t = await mk({ meta: { positional: true, exitBy: new Date(Date.now() + 5 * 86_400_000).toISOString() } });
  expect((await tick(t._id, 19)).triggered).toBe(false);
});

test("once the deadline passes it is closed with an expiry reason, even mid-range", async () => {
  if (skipIfNoMongo()) return;
  const t = await mk({ meta: { positional: true, exitBy: new Date(Date.now() - 60_000).toISOString() } });
  const r = await tick(t._id, 19);
  expect(r.triggered).toBe(true);
  expect(r.reason).toMatch(/EXPIRY_EXIT/);
});

test("a trade without exitBy is unaffected (intraday path unchanged)", async () => {
  if (skipIfNoMongo()) return;
  const t = await mk({ productType: "MIS", meta: {} });
  expect((await tick(t._id, 19)).triggered).toBe(false);
});

test("the order routes persist the product type and honour the period (source guard)", () => {
  const src = fs.readFileSync(new URL("../src/routes/indianMarket.ts", import.meta.url), "utf8");
  expect(src).toMatch(/productType, \/\/ was never stored/);
  expect(src).toContain('productFor("POSITIONAL", true)');
  expect(src).toContain("positionalAllowed(expiryDate)");
  expect(src).toContain("req.body.stopLoss");          // the AI dialog's field names are no longer ignored
});
