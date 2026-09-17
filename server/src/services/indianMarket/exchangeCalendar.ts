/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — SINGLE AUTHORITATIVE INDIAN EXCHANGE CALENDAR (NSE / BSE)
 * ═══════════════════════════════════════════════════════════════════
 *  Single source of truth for trading sessions, exchange holidays,
 *  special sessions, and market timings.
 *  Prevents fractured holiday definitions across disparate modules.
 */

export const OFFICIAL_NSE_HOLIDAYS: Record<string, string> = {
  // 2025 Holidays
  "2025-01-26": "Republic Day",
  "2025-02-26": "Maha Shivratri",
  "2025-03-14": "Holi",
  "2025-03-31": "Id-Ul-Fitr",
  "2025-04-10": "Mahavir Jayanti",
  "2025-04-14": "Dr. Ambedkar Jayanti",
  "2025-04-18": "Good Friday",
  "2025-05-01": "Maharashtra Day",
  "2025-06-07": "Bakri Id / Eid ul-Adha",
  "2025-07-06": "Muharram",
  "2025-08-15": "Independence Day",
  "2025-08-27": "Ganesh Chaturthi",
  "2025-09-05": "Milad-un-Nabi",
  "2025-10-02": "Mahatma Gandhi Jayanti",
  "2025-10-21": "Dussehra",
  "2025-11-01": "Diwali - Laxmi Pujan",
  "2025-11-05": "Guru Nanak Jayanti",
  "2025-12-25": "Christmas",

  // 2026 Statutory & Recognized Exchange Holidays
  "2026-01-26": "Republic Day",
  "2026-03-03": "Maha Shivratri",
  "2026-03-08": "Maha Shivratri (Observed)",
  "2026-03-20": "Holi",
  "2026-03-25": "Holi (Observed)",
  "2026-04-03": "Good Friday",
  "2026-04-14": "Dr. Ambedkar Jayanti",
  "2026-04-18": "Good Friday (Observed)",
  "2026-05-01": "Maharashtra Day",
  "2026-08-15": "Independence Day",
  "2026-09-04": "Janmashtami",
  "2026-09-14": "Milad-un-Nabi / Id-e-Milad",
  "2026-10-02": "Mahatma Gandhi Jayanti",
  "2026-10-20": "Dussehra",
  "2026-10-24": "Dussehra (Observed)",
  "2026-11-09": "Diwali - Laxmi Pujan",
  "2026-11-10": "Diwali - Balipratipada",
  "2026-11-12": "Diwali (Observed)",
  "2026-11-24": "Guru Nanak Jayanti",
  "2026-11-26": "Guru Nanak Jayanti (Observed)",
  "2026-12-25": "Christmas",

  // 2027 Statutory Holidays
  "2027-01-26": "Republic Day",
  "2027-08-15": "Independence Day",
  "2027-10-02": "Mahatma Gandhi Jayanti",
  "2027-12-25": "Christmas",
};

export interface MarketSessionStatus {
  isOpen: boolean;
  isPreMarket: boolean;
  isPostMarket: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  currentISTTime: string;
  nextSessionOpen: string;
  reason: string;
}

export const MarketSessionStatus = {} as unknown as MarketSessionStatus;

export class ExchangeCalendar {
  /**
   * Converts any UTC date to Indian Standard Time (IST, UTC+5:30)
   */
  public static toIST(date: Date = new Date()): Date {
    const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
    const istOffset = 5.5 * 3600000;
    return new Date(utcTime + istOffset);
  }

  public static formatDateStr(istDate: Date): string {
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, "0");
    const dd = String(istDate.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  public static isHoliday(date: Date = new Date()): boolean {
    const ist = this.toIST(date);
    const dateStr = this.formatDateStr(ist);
    return Boolean(OFFICIAL_NSE_HOLIDAYS[dateStr]);
  }

  public static getHolidayName(date: Date = new Date()): string | null {
    const ist = this.toIST(date);
    const dateStr = this.formatDateStr(ist);
    return OFFICIAL_NSE_HOLIDAYS[dateStr] || null;
  }

  public static isWeekend(date: Date = new Date()): boolean {
    const ist = this.toIST(date);
    const day = ist.getDay();
    return day === 0 || day === 6;
  }

  /**
   * Evaluates complete session status according to NSE regulations.
   * Market is strictly OPEN only on non-holiday weekdays between 09:15 and 15:30 IST.
   */
  public static getSessionStatus(dateOverride?: Date): MarketSessionStatus {
    const now = dateOverride || new Date();
    const ist = this.toIST(now);

    const day = ist.getDay();
    const isWeekend = day === 0 || day === 6;
    const dateStr = this.formatDateStr(ist);
    const holidayName = OFFICIAL_NSE_HOLIDAYS[dateStr];
    const isHoliday = Boolean(holidayName);

    const hours = ist.getHours();
    const minutes = ist.getMinutes();
    const seconds = ist.getSeconds();
    const currentMinutes = hours * 60 + minutes;

    const PRE_MARKET_OPEN = 9 * 60; // 09:00 IST
    const MARKET_OPEN = 9 * 60 + 15; // 09:15 IST
    const MARKET_CLOSE = 15 * 60 + 30; // 15:30 IST
    const POST_MARKET_CLOSE = 16 * 60; // 16:00 IST

    const currentISTTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} IST`;

    if (isWeekend) {
      const daysUntilMonday = day === 0 ? 1 : 2;
      return {
        isOpen: false,
        isPreMarket: false,
        isPostMarket: false,
        isWeekend: true,
        isHoliday: false,
        currentISTTime,
        nextSessionOpen: `${daysUntilMonday === 1 ? "Tomorrow" : "Monday"} at 09:15 IST`,
        reason: `Market closed: Weekend (${day === 0 ? "Sunday" : "Saturday"})`,
      };
    }

    if (isHoliday) {
      return {
        isOpen: false,
        isPreMarket: false,
        isPostMarket: false,
        isWeekend: false,
        isHoliday: true,
        holidayName,
        currentISTTime,
        nextSessionOpen: "Next trading day at 09:15 IST",
        reason: `Market closed: Exchange Holiday (${holidayName})`,
      };
    }

    if (currentMinutes >= PRE_MARKET_OPEN && currentMinutes < MARKET_OPEN) {
      return {
        isOpen: false,
        isPreMarket: true,
        isPostMarket: false,
        isWeekend: false,
        isHoliday: false,
        currentISTTime,
        nextSessionOpen: "Today at 09:15 IST",
        reason: "Pre-market order collection session (09:00 - 09:15 IST)",
      };
    }

    if (currentMinutes >= MARKET_OPEN && currentMinutes < MARKET_CLOSE) {
      return {
        isOpen: true,
        isPreMarket: false,
        isPostMarket: false,
        isWeekend: false,
        isHoliday: false,
        currentISTTime,
        nextSessionOpen: "Open now",
        reason: "Regular trading session active (09:15 - 15:30 IST)",
      };
    }

    if (currentMinutes >= MARKET_CLOSE && currentMinutes < POST_MARKET_CLOSE) {
      return {
        isOpen: false,
        isPreMarket: false,
        isPostMarket: true,
        isWeekend: false,
        isHoliday: false,
        currentISTTime,
        nextSessionOpen: "Tomorrow at 09:15 IST",
        reason: "Post-market closing session (15:30 - 16:00 IST)",
      };
    }

    const nextOpen = currentMinutes < PRE_MARKET_OPEN ? "Today at 09:15 IST" : "Tomorrow at 09:15 IST";
    return {
      isOpen: false,
      isPreMarket: false,
      isPostMarket: false,
      isWeekend: false,
      isHoliday: false,
      currentISTTime,
      nextSessionOpen: nextOpen,
      reason: currentMinutes < PRE_MARKET_OPEN ? "Pre-market not started yet" : "Market closed for the day",
    };
  }
}
