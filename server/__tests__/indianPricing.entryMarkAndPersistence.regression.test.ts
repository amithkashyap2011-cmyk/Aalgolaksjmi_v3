/*
 * Regression: Indian option pricing consistency (2026-09-23).
 *
 * - Entries were priced with Black-Scholes at a flat 15% IV while the exit
 *   monitor marked against the generated chain (14.2% + skew), so every trade
 *   opened 6-12% above or below its own mark before spot moved.
 * - Simulated spot lived only in memory; each restart snapped it back to the
 *   hardcoded baseline and open trades saw fake jumps (INFY put +143% 8s after
 *   a reboot).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { StrategyEngine } from "../src/services/indianMarket/strategyEngine.js";
import {
  MOCK_LIVE_INDIAN_TIKERS,
  resolveLivePriceForIndianTrade,
  persistSimulatedTickers,
  restoreSimulatedTickers,
} from "../src/services/indianMarket/indianPricing.js";

describe("entry premium matches the exit monitor's mark", () => {
  test.each([
    ["INFY", "INFY"],
    ["RELIANCE", "RELIANCE"],
    ["HDFCBANK", "HDFCBANK"],
    ["NIFTY", "NIFTY50"],
  ])("%s single-leg option opens at exactly its mark", (underlying, tickerKey) => {
    const spot = MOCK_LIVE_INDIAN_TIKERS[tickerKey].ltp;
    const strat = StrategyEngine.getStrategy("VWAP_REVERSION" as any)!;
    const ctx: any = {
      underlying, spotPrice: spot, futuresPrice: spot * 1.002,
      bars1m: [], bars5m: [], bars15m: [], regime: "RANGING", timestamp: new Date(),
      indicators: { rsi14: 50, adx14: 15, open: spot, high: spot * 1.01, low: spot * 0.99 },
    };
    const trade = strat.constructTrade(strat.generateSignal(ctx)!, ctx, 500000, 1);
    const leg = trade.legs[0];

    const monitorMark = resolveLivePriceForIndianTrade({
      symbol: leg.tradingSymbol, underlying: trade.underlying, instrumentType: leg.instrumentType, legs: trade.legs,
    });

    expect(leg.entryPrice).toBeGreaterThan(0);
    expect(monitorMark).toBeCloseTo(leg.entryPrice, 6);
  });
});

describe("simulated ticker persistence", () => {
  const file = path.join(os.tmpdir(), `indian_sim_tickers_${process.pid}.json`);
  let snapshot: string;

  beforeEach(() => {
    snapshot = JSON.stringify(MOCK_LIVE_INDIAN_TIKERS);
  });
  afterEach(() => {
    const orig = JSON.parse(snapshot);
    for (const [k, v] of Object.entries(orig)) Object.assign(MOCK_LIVE_INDIAN_TIKERS[k], v);
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  });

  test("a same-day restart restores drifted prices instead of the baseline", () => {
    MOCK_LIVE_INDIAN_TIKERS.INFY.ltp = 1838.55;
    MOCK_LIVE_INDIAN_TIKERS.INFY.high = 1840;
    persistSimulatedTickers(file);

    MOCK_LIVE_INDIAN_TIKERS.INFY.ltp = 1823.4; // what a fresh boot would hold
    MOCK_LIVE_INDIAN_TIKERS.INFY.high = 1832;
    expect(restoreSimulatedTickers(file)).toBeGreaterThan(0);

    expect(MOCK_LIVE_INDIAN_TIKERS.INFY.ltp).toBe(1838.55);
    expect(MOCK_LIVE_INDIAN_TIKERS.INFY.high).toBe(1840);
  });

  test("a save from an earlier day opens the session at that last close", () => {
    MOCK_LIVE_INDIAN_TIKERS.TCS.ltp = 4250.1;
    persistSimulatedTickers(file);
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    saved.date = "2000-01-01";
    fs.writeFileSync(file, JSON.stringify(saved));

    MOCK_LIVE_INDIAN_TIKERS.TCS.ltp = 4212.8;
    restoreSimulatedTickers(file);

    const tcs = MOCK_LIVE_INDIAN_TIKERS.TCS;
    expect(tcs.ltp).toBe(4250.1);
    expect([tcs.open, tcs.high, tcs.low]).toEqual([4250.1, 4250.1, 4250.1]);
  });

  test("a missing or corrupt file keeps the current prices", () => {
    fs.writeFileSync(file, "{not json");
    const before = MOCK_LIVE_INDIAN_TIKERS.SBIN.ltp;
    expect(restoreSimulatedTickers(file)).toBe(0);
    expect(MOCK_LIVE_INDIAN_TIKERS.SBIN.ltp).toBe(before);
  });
});
