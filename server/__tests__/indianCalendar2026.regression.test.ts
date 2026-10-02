import { describe, it, expect } from "@jest/globals";
import { ExchangeCalendar } from "../src/services/indianMarket/exchangeCalendar.js";

const at = (d: string) => new Date(`${d}T05:00:00.000Z`); // 10:30 IST

describe("NSE 2026 holiday calendar", () => {
  it.each(["2026-11-10", "2026-11-24", "2026-10-20", "2026-10-02", "2026-09-14", "2026-12-25"])("%s is a holiday", (d) => {
    expect(ExchangeCalendar.isHoliday(at(d))).toBe(true);
  });

  // These were invented '(Observed)' entries that would have blocked real trading days.
  it.each(["2026-11-09", "2026-11-12", "2026-11-26"])("%s is a normal trading day", (d) => {
    expect(ExchangeCalendar.isHoliday(at(d))).toBe(false);
  });
});
