/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Stock Market (NSE / BSE) Trading Session Guard
 * ═══════════════════════════════════════════════════════════════════
 */

export interface MarketSessionStatus {
  isOpen: boolean;
  isPreMarket: boolean;
  isPostMarket: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  currentISTTime: string;
  nextSessionOpen: string;
  reason: string;
}

const NSE_HOLIDAYS_2026 = new Set<string>([
  "2026-01-26", // Republic Day
  "2026-03-08", // Maha Shivratri
  "2026-03-25", // Holi
  "2026-04-14", // Ambedkar Jayanti
  "2026-04-18", // Good Friday
  "2026-05-01", // Maharashtra Day
  "2026-08-15", // Independence Day
  "2026-10-02", // Gandhi Jayanti
  "2026-10-24", // Dussehra
  "2026-11-12", // Diwali-Laxmi Pujan
  "2026-11-26", // Guru Nanak Jayanti
  "2026-12-25", // Christmas
]);

export class IndianMarketHours {
  public static isHoliday(date: Date): boolean {
    const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
    const istOffset = 5.5 * 3600000;
    const istDate = new Date(utcTime + istOffset);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, "0");
    const dd = String(istDate.getDate()).padStart(2, "0");
    return NSE_HOLIDAYS_2026.has(`${yyyy}-${mm}-${dd}`);
  }

  public static getSessionStatus(dateOverride?: Date): MarketSessionStatus {
    const date = dateOverride || new Date();

    // Convert to IST (UTC + 5:30)
    const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
    const istOffset = 5.5 * 3600000;
    const istDate = new Date(utcTime + istOffset);

    const day = istDate.getDay();
    const isWeekend = day === 0 || day === 6;

    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, "0");
    const dd = String(istDate.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const isHoliday = NSE_HOLIDAYS_2026.has(dateStr);

    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    const preMarketStart = 9 * 60;       // 09:00 AM IST
    const preMarketEnd   = 9 * 60 + 15;  // 09:15 AM IST
    const marketStart    = 9 * 60 + 15;  // 09:15 AM IST
    const marketEnd      = 15 * 60 + 30; // 03:30 PM IST

    const isPreMarket  = !isWeekend && !isHoliday && timeInMinutes >= preMarketStart && timeInMinutes < preMarketEnd;
    const isOpen       = !isWeekend && !isHoliday && timeInMinutes >= marketStart && timeInMinutes <= marketEnd;
    const isPostMarket = !isWeekend && !isHoliday && timeInMinutes > marketEnd;

    let reason = "MARKET_OPEN";
    if (isWeekend) reason = "WEEKEND_CLOSED";
    else if (isHoliday) reason = "NSE_HOLIDAY_CLOSED";
    else if (timeInMinutes < preMarketStart) reason = "BEFORE_MARKET_HOURS";
    else if (isPreMarket) reason = "PRE_MARKET_SESSION";
    else if (isPostMarket) reason = "AFTER_MARKET_HOURS";

    const currentISTTime = `${dateStr} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} IST`;

    return {
      isOpen,
      isPreMarket,
      isPostMarket,
      isWeekend,
      isHoliday,
      currentISTTime,
      nextSessionOpen: "09:15 AM IST (Next Trading Day)",
      reason,
    };
  }
}
