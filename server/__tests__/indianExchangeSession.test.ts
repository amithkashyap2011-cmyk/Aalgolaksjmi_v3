import { describe, it, expect } from "@jest/globals";
import { ExchangeCalendar } from "../src/services/indianMarket/exchangeCalendar.js";

describe("ExchangeCalendar Session & Holiday Invariants", () => {
  it("marks Sunday as closed weekend with WEEKEND status badge and detailed alert", () => {
    // 2026-09-20 is Sunday
    const sundayDate = new Date("2026-09-20T12:00:00+05:30");
    const status = ExchangeCalendar.getSessionStatus(sundayDate);

    expect(status.isOpen).toBe(false);
    expect(status.isWeekend).toBe(true);
    expect(status.isHoliday).toBe(false);
    expect(status.statusBadge).toBe("WEEKEND");
    expect(status.alertMessage).toContain("NSE & BSE Indian Exchanges are CLOSED today for the Weekend (Sunday)");
    expect(status.alertMessage).toContain("frozen at Friday's close");
    expect(status.nextSessionOpen).toContain("Tomorrow at 09:15 IST");
  });

  it("marks Saturday as closed weekend with WEEKEND status badge", () => {
    // 2026-09-19 is Saturday
    const saturdayDate = new Date("2026-09-19T14:00:00+05:30");
    const status = ExchangeCalendar.getSessionStatus(saturdayDate);

    expect(status.isOpen).toBe(false);
    expect(status.isWeekend).toBe(true);
    expect(status.statusBadge).toBe("WEEKEND");
    expect(status.alertMessage).toContain("Saturday");
    expect(status.nextSessionOpen).toContain("Monday at 09:15 IST");
  });

  it("marks recognized NSE holiday as closed with EXCHANGE HOLIDAY badge and name", () => {
    // 2026-10-02 is Mahatma Gandhi Jayanti (Friday)
    const holidayDate = new Date("2026-10-02T11:00:00+05:30");
    const status = ExchangeCalendar.getSessionStatus(holidayDate);

    expect(status.isOpen).toBe(false);
    expect(status.isHoliday).toBe(true);
    expect(status.statusBadge).toBe("EXCHANGE HOLIDAY");
    expect(status.reason).toContain("Mahatma Gandhi Jayanti");
    expect(status.alertMessage).toContain("Mahatma Gandhi Jayanti");
    expect(status.alertMessage).toContain("frozen at the previous close");
  });

  it("marks regular trading hours as LIVE session", () => {
    // 2026-09-21 is Monday at 10:30 AM IST
    const tradingHours = new Date("2026-09-21T10:30:00+05:30");
    const status = ExchangeCalendar.getSessionStatus(tradingHours);

    expect(status.isOpen).toBe(true);
    expect(status.isWeekend).toBe(false);
    expect(status.isHoliday).toBe(false);
    expect(status.statusBadge).toBe("LIVE");
    expect(status.nextSessionOpen).toBe("Open now");
  });

  it("marks pre-market hours (09:00 - 09:15 IST) as PRE-OPEN session", () => {
    // 2026-09-21 is Monday at 09:07 AM IST
    const preMarket = new Date("2026-09-21T09:07:00+05:30");
    const status = ExchangeCalendar.getSessionStatus(preMarket);

    expect(status.isOpen).toBe(false);
    expect(status.isPreMarket).toBe(true);
    expect(status.statusBadge).toBe("PRE-OPEN");
  });

  it("marks post-market hours (15:30 - 16:00 IST) as POST-MARKET session", () => {
    // 2026-09-21 is Monday at 15:45 IST
    const postMarket = new Date("2026-09-21T15:45:00+05:30");
    const status = ExchangeCalendar.getSessionStatus(postMarket);

    expect(status.isOpen).toBe(false);
    expect(status.isPostMarket).toBe(true);
    expect(status.statusBadge).toBe("POST-MARKET");
  });

  it("marks after-hours on weekday as MARKET CLOSED session", () => {
    // 2026-09-21 is Monday at 18:00 IST
    const afterHours = new Date("2026-09-21T18:00:00+05:30");
    const status = ExchangeCalendar.getSessionStatus(afterHours);

    expect(status.isOpen).toBe(false);
    expect(status.statusBadge).toBe("MARKET CLOSED");
    expect(status.nextSessionOpen).toContain("Tomorrow at 09:15 IST");
  });
});
