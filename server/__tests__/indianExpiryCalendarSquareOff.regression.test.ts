import { describe, test, expect } from "@jest/globals";
import { ExpiryResolver } from "../src/services/indianMarket/expiryResolver.js";
import { ExchangeCalendar } from "../src/services/indianMarket/exchangeCalendar.js";
import { IntradaySquareOffService } from "../src/services/intradaySquareOff.js";
import { IndianRiskManager } from "../src/services/indianMarket/riskManager.js";

const at = (iso: string) => new Date(iso);

describe("fallback expiry rules (NSE Tuesday expiries)", () => {
  test("NIFTY weekly = Tuesday; holiday-shifted expiry (20 Oct Dussehra) moves to Mon 19th", () => {
    // Fri 2026-10-02 10:00 IST (holiday). Next Tuesday is 2026-10-06.
    const e = ExpiryResolver.getValidExpiries("NIFTY", at("2026-10-02T04:30:00Z"), 3);
    expect(e.map((x) => x.expiry)).toEqual(["2026-10-06", "2026-10-13", "2026-10-19"]);
  });

  test("BANKNIFTY / stocks are monthly only (last Tuesday, holiday shifts back)", () => {
    const e = ExpiryResolver.getValidExpiries("BANKNIFTY", at("2026-10-02T04:30:00Z"), 2);
    // 24 Nov is Guru Nanak Jayanti -> Mon 23 Nov
    expect(e.map((x) => x.expiry)).toEqual(["2026-10-27", "2026-11-23"]);
    expect(e.every((x) => x.isMonthly)).toBe(true);
    expect(ExpiryResolver.getValidExpiries("RELIANCE", at("2026-10-02T04:30:00Z"), 1)[0].expiry).toBe("2026-10-27");
  });

  test("expiry day after 15:30 IST rolls to the next one, based on the reference date", () => {
    // Tue 2026-10-06 16:00 IST
    expect(ExpiryResolver.getValidExpiries("NIFTY", at("2026-10-06T10:30:00Z"), 1)[0].expiry).toBe("2026-10-13");
    // Tue 2026-10-06 11:00 IST - still live
    expect(ExpiryResolver.getValidExpiries("NIFTY", at("2026-10-06T05:30:00Z"), 1)[0].expiry).toBe("2026-10-06");
  });

  test("a holiday-shifted expiry that is already behind today is not offered", () => {
    // Tue 2026-10-20 (holiday): its expiry shifted to Mon 19th, which has passed.
    expect(ExpiryResolver.getValidExpiries("NIFTY", at("2026-10-20T05:00:00Z"), 1)[0].expiry).toBe("2026-10-27");
  });
});

describe("exchange calendar 2026", () => {
  test.each(["2026-03-03", "2026-03-26", "2026-03-31", "2026-04-03", "2026-05-28", "2026-06-26", "2026-09-14", "2026-10-02", "2026-10-20", "2026-11-10", "2026-11-24", "2026-12-25"])(
    "%s is closed",
    (d) => {
      expect(ExchangeCalendar.isHoliday(at(`${d}T06:00:00Z`))).toBe(true);
    },
  );
});

describe("intraday square-off boundary", () => {
  test("lastSquareOffBoundary is the most recent 15:15 IST", () => {
    expect(IntradaySquareOffService.lastSquareOffBoundary(at("2026-10-06T04:30:00Z")).toISOString()).toBe("2026-10-05T09:45:00.000Z");
    expect(IntradaySquareOffService.lastSquareOffBoundary(at("2026-10-06T09:50:00Z")).toISOString()).toBe("2026-10-06T09:45:00.000Z");
  });
});

describe("risk manager guest id", () => {
  test("consecutive-loss pause recorded under the resolved id blocks guest validation", async () => {
    const rm: any = IndianRiskManager;
    const resolved = rm.resolveUserId("guest-user");
    rm.consecutiveLossPauseUntil.set(resolved, Date.now() + 60_000);
    const res = await IndianRiskManager.validateTrade(
      { underlying: "NIFTY", strategy: "X", position: "LONG", entryPrice: 10, quantity: 1, legs: [], risk: { riskAmount: 1 } } as any,
      100000, 100000, "guest-user", true, true,
    );
    rm.consecutiveLossPauseUntil.delete(resolved);
    expect(res.rejectionReason).toBe("CONSECUTIVE_LOSS_PAUSE_ACTIVE");
  });
});
