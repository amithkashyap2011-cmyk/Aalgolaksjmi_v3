import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from "./helpers/mongoTestHelper.js";
/*
 * Regression: the PAPER SL/TP monitor must claim OPEN → CLOSED atomically (2026-09-27).
 *
 * closePaperPosition removed the position, credited the wallet, then updated
 * the Trade by id with no status:"OPEN" guard. The auto-trade engine's own
 * exit path can close the same trade concurrently, so both paths could
 * credit margin + PnL for one trade (phantom PAPER balance). It also never
 * stored grossPnl / feeCost / netPnl.
 */
import { jest } from "@jest/globals";

const prices = new Map<string, number>();
jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getTickerPriceSync: (symbol: string) => prices.get(symbol) ?? null,
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
}));
jest.unstable_mockModule("../src/services/autoTradeEngine.js", () => ({
  handleExit: jest.fn(),
}));
jest.unstable_mockModule("../src/services/socketService.js", () => ({
  emitAlert: jest.fn(),
}));

import mongoose from "mongoose";

let paper: any, Trade: any, runMonitorCycle: any;

const USER = new mongoose.Types.ObjectId().toString();
const SYMBOL = "ADAUSDT";
const ENTRY = 0.2585;
const QTY = 400;
const SL = 0.25333;

beforeAll(async () => {
  const connected = await connectIfAvailable();
  if (!connected || mongoose.connection.readyState !== 1) return;
  paper = await import("../src/services/paperState.js");
  ({ Trade } = await import("../src/models/Trade.js"));
  ({ runMonitorCycle } = await import("../src/services/manualSLTPMonitor.js"));
});

afterAll(async () => {
  if (Trade && mongoose.connection.readyState === 1) {
    try { await Trade.deleteMany({ userId: USER }); } catch { /* ignore */ }
  }
  await disconnectMongo();
});

beforeEach(() => {
  prices.clear();
  paper?.removePosition(USER, SYMBOL, "PAPER", "FUTURES");
});

async function openFuturesLong() {
  const trade = await Trade.create({
    userId: USER, mode: "PAPER", symbol: SYMBOL, side: "BUY", quantity: QTY, entryPrice: ENTRY,
    accountType: "FUTURES", market: "CRYPTO", status: "OPEN", leverage: 4, sl: SL,
    decisionPath: { source: "test-fixture" },
  });
  paper.setPosition(USER, SYMBOL, "PAPER", {
    userId: USER, symbol: SYMBOL, side: "BUY", quantity: QTY, entryPrice: ENTRY, leverage: 4,
    tradeId: trade._id.toString(), accountType: "FUTURES", sl: SL, meta: {},
  });
  await paper.setWalletBalance(USER, "PAPER", "USDT", 100, "FUTURES");
  return trade;
}

describe("ManualSLTPMonitor — PAPER stop-loss close", () => {
  test("closes once, credits margin + net PnL, and records the fee breakdown", async () => {
    if (skipIfNoMongo()) return;
    const trade = await openFuturesLong();
    prices.set(SYMBOL, 0.2528);

    await runMonitorCycle();

    const after = await Trade.findById(trade._id).lean();
    expect(after.status).toBe("CLOSED");
    expect(after.exitReason).toBe("STOP_LOSS_HIT");
    expect(after.feeCost).toBeGreaterThan(0);
    expect(after.netPnl).toBeCloseTo(after.grossPnl - after.feeCost, 10);
    expect(after.pnl).toBeCloseTo(after.netPnl, 10);

    const margin = (ENTRY * QTY) / 4;
    expect(paper.getWallet(USER, "PAPER", "FUTURES").get("USDT")).toBeCloseTo(100 + margin + after.netPnl, 6);
    expect(paper.getPosition(USER, SYMBOL, "PAPER", "FUTURES")).toBeFalsy();
  });

  test("does not credit the wallet when another exit path already closed the trade", async () => {
    if (skipIfNoMongo()) return;
    const trade = await openFuturesLong();
    // The engine's exit won the race: trade is CLOSED but the in-memory position lingers.
    await Trade.updateOne({ _id: trade._id }, { $set: { status: "CLOSED", exitReason: "ENGINE_EXIT", pnl: -1 } });
    prices.set(SYMBOL, 0.2528);

    await runMonitorCycle();

    const after = await Trade.findById(trade._id).lean();
    expect(after.exitReason).toBe("ENGINE_EXIT");
    expect(after.pnl).toBe(-1);
    expect(paper.getWallet(USER, "PAPER", "FUTURES").get("USDT")).toBe(100);
    expect(paper.getPosition(USER, SYMBOL, "PAPER", "FUTURES")).toBeFalsy();
  });
});
