import { describe, it, expect, afterEach, jest } from "@jest/globals";
import { expiryDayEntryGate, manualSessionGate } from "../src/services/indianMarket/entryGates.js";
import { exitDeadline, positionalAllowed } from "../src/services/indianMarket/positional.js";
import { StrategyEngine } from "../src/services/indianMarket/strategyEngine.js";
import { IndianRiskManager } from "../src/services/indianMarket/riskManager.js";
import { InstrumentMaster, warnStaticLotOnce, _resetStaticLotWarnings } from "../src/services/indianMarket/instrumentMaster.js";

const OLD = { ...process.env };
afterEach(() => { process.env = { ...OLD }; jest.restoreAllMocks(); });

// 2026-10-06 10:30 IST (Tuesday, normal trading day)
const TUE = new Date("2026-10-06T05:00:00Z");

describe("0-DTE entry gate", () => {
  it("blocks an option expiring today (IST)", () => {
    const r = expiryDayEntryGate({ instrument: "CE", expiry: "2026-10-06" }, TUE);
    expect(r.ok).toBe(false);
    expect((r as any).reason).toMatch(/EXPIRY_DAY_ENTRY_BLOCKED/);
  });
  it("blocks via leg trading symbol", () => {
    const r = expiryDayEntryGate({ legs: [{ instrumentType: "PE", tradingSymbol: "NIFTY06OCT2622700PE" }] }, TUE);
    expect(r.ok).toBe(false);
  });
  it("allows next-day expiry, equity, and the env override", () => {
    expect(expiryDayEntryGate({ instrument: "CE", expiry: "2026-10-07" }, TUE).ok).toBe(true);
    expect(expiryDayEntryGate({ symbol: "RELIANCE" }, TUE).ok).toBe(true);
    process.env.INDIA_ALLOW_EXPIRY_DAY_ENTRIES = "true";
    expect(expiryDayEntryGate({ instrument: "CE", expiry: "2026-10-06" }, TUE).ok).toBe(true);
  });
  it("uses the IST date, not UTC (late-evening UTC is already next day IST)", () => {
    expect(expiryDayEntryGate({ instrument: "CE", expiry: "2026-10-07" }, new Date("2026-10-06T20:00:00Z")).ok).toBe(false);
  });
});

describe("manual session gate", () => {
  it("allows during hours, blocks off-hours / weekend / holiday, env override", () => {
    expect(manualSessionGate(TUE).ok).toBe(true);
    expect(manualSessionGate(new Date("2026-10-06T11:00:00Z")).ok).toBe(false);   // 16:30 IST
    expect(manualSessionGate(new Date("2026-10-04T05:00:00Z")).ok).toBe(false);   // Sunday
    expect(manualSessionGate(new Date("2026-10-02T05:00:00Z")).ok).toBe(false);   // Gandhi Jayanti
    process.env.INDIA_ALLOW_OFF_HOURS_MANUAL = "true";
    expect(manualSessionGate(new Date("2026-10-04T05:00:00Z")).ok).toBe(true);
  });
});

describe("calculatePositionSize", () => {
  const strat: any = StrategyEngine.getStrategy("LONG_CALL")!;
  it("returns 0 when one lot's max loss exceeds the cap", () => {
    // cap = 100000*1% = 1000; one lot loses 20*65 = 1300
    expect(strat.calculatePositionSize(100000, 1, 20, 65)).toBe(0);
  });
  it("sizes in whole lots otherwise", () => {
    expect(strat.calculatePositionSize(500000, 1, 20, 65)).toBe(195);
    expect(strat.calculatePositionSize(130000, 1, 20, 65)).toBe(65); // exactly one lot
  });
  it("keeps the degenerate-input behaviour", () => {
    expect(strat.calculatePositionSize(100000, 1, 0, 65)).toBe(65);
  });
});

describe("positional trading-day maths", () => {
  it("skips holidays (20 Oct Dussehra) and weekends", () => {
    // Wed 21 Oct: 1 before = Mon 19 (Tue 20 holiday), 2 before = Fri 16
    expect(exitDeadline("2026-10-21")).toBe("2026-10-16T09:45:00.000Z");
  });
  it("positionalAllowed counts holidays as non-trading", () => {
    // Expiry Tue 6 Oct: 3 trading days before = Wed 30 Sep (Fri 2 Oct is a holiday)
    expect(positionalAllowed("2026-10-06", Date.parse("2026-09-30T06:00:00Z")).ok).toBe(true);
    expect(positionalAllowed("2026-10-06", Date.parse("2026-10-01T06:00:00Z")).ok).toBe(false);
  });
});

describe("maxDailyLoss floor", () => {
  const mk = (amt: number | undefined) => {
    const settings: any = { maxDailyLossAmount: amt, maxConsecutiveLosses: 99, dailyRiskLock: false, save: jest.fn(async () => undefined) };
    jest.spyOn(IndianRiskManager, "getSettings").mockResolvedValue(settings);
    jest.spyOn(IndianRiskManager as any, "getTodayRealizedPnL").mockResolvedValue(0);
    return settings;
  };
  it("a smaller user limit locks the day", async () => {
    const s = mk(5000);
    await IndianRiskManager.recordTradeOutcome("user-small-" + Date.now(), -6000);
    expect(s.dailyRiskLock).toBe(true);
  });
  it("defaults to 25000 when unset", async () => {
    const s = mk(undefined);
    await IndianRiskManager.recordTradeOutcome("user-def-" + Date.now(), -6000);
    expect(s.dailyRiskLock).toBe(false);
    await IndianRiskManager.recordTradeOutcome("user-def2-" + Date.now(), -26000);
    expect(s.dailyRiskLock).toBe(true);
  });
});

describe("static lot fallback warning", () => {
  it("warns once per symbol", () => {
    _resetStaticLotWarnings();
    const w = jest.spyOn(console, "warn").mockImplementation(() => {});
    warnStaticLotOnce("MIDCPNIFTY", 50);
    warnStaticLotOnce("MIDCPNIFTY", 50);
    warnStaticLotOnce("BANKEX", 15);
    expect(w).toHaveBeenCalledTimes(2);
    expect(String(w.mock.calls[0][0])).toMatch(/STATIC_LOT_FALLBACK MIDCPNIFTY/);
  });
  it("getSpec triggers the warning when no live lot exists", () => {
    _resetStaticLotWarnings();
    const w = jest.spyOn(console, "warn").mockImplementation(() => {});
    InstrumentMaster.getSpec("MIDCPNIFTY" as any);
    expect(w).toHaveBeenCalled();
  });
});
