/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Dynamic Indian Expiry Resolver & NSE/BSE Calendar
 * ═══════════════════════════════════════════════════════════════════
 */

import { ExpirySelectionType } from "./types.js";

export class ExpiryResolver {
  // Official NSE Trading Holidays (Format: YYYY-MM-DD)
  private static HOLIDAYS = new Set([
    "2026-01-26", // Republic Day
    "2026-03-03", // Mahashivratri
    "2026-03-20", // Holi
    "2026-04-03", // Good Friday
    "2026-04-14", // Dr. Ambedkar Jayanti
    "2026-05-01", // Maharashtra Day
    "2026-08-15", // Independence Day
    "2026-09-04", // Janmashtami
    "2026-10-02", // Mahatma Gandhi Jayanti
    "2026-10-20", // Dussehra
    "2026-11-09", // Diwali Laxmi Pujan
    "2026-11-10", // Diwali Balipratipada
    "2026-11-24", // Gurunanak Jayanti
    "2026-12-25", // Christmas
  ]);

  /**
   * Resolves valid expiry date string based on underlying and selection rule
   */
  public static resolveExpiry(underlying: string, type: ExpirySelectionType = "NEAREST_VALID_EXPIRY", refDate: Date = new Date()): {
    expiryDate: string; // YYYY-MM-DD
    expiryFormatted: string; // e.g. 26AUG or 03SEP
    isMonthly: boolean;
    daysToExpiry: number;
  } {
    const isSensex = underlying.toUpperCase().includes("SENSEX") || underlying.toUpperCase().includes("BSE");
    const isFinnifty = underlying.toUpperCase().includes("FINNIFTY");
    const isBanknifty = underlying.toUpperCase().includes("BANKNIFTY");

    // Standard NSE Index Expiry Days:
    // NIFTY: Thursday (4)
    // SENSEX: Friday (5)
    // FINNIFTY: Tuesday (2)
    // BANKNIFTY: Monthly last Thursday (4) or Weekly Wednesday (3)
    let targetDayOfWeek = 4; // Thursday default
    if (isSensex) targetDayOfWeek = 5;
    else if (isFinnifty) targetDayOfWeek = 2;
    else if (isBanknifty) targetDayOfWeek = 4;

    const candidateDates = this.generateUpcomingExpiryDates(targetDayOfWeek, refDate, 8);

    let selectedDate: Date;
    let isMonthly = false;

    if (type === "MONTHLY" || type === "NEXT_MONTHLY") {
      const monthlyExpiries = candidateDates.filter(d => this.isLastExpiryOfMonth(d, targetDayOfWeek));
      if (type === "NEXT_MONTHLY" && monthlyExpiries.length > 1) {
        selectedDate = monthlyExpiries[1];
      } else {
        selectedDate = monthlyExpiries[0] || candidateDates[candidateDates.length - 1];
      }
      isMonthly = true;
    } else if (type === "NEXT_EXPIRY" && candidateDates.length > 1) {
      selectedDate = candidateDates[1];
      isMonthly = this.isLastExpiryOfMonth(selectedDate, targetDayOfWeek);
    } else {
      selectedDate = candidateDates[0];
      isMonthly = this.isLastExpiryOfMonth(selectedDate, targetDayOfWeek);
    }

    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const dd = String(selectedDate.getDate()).padStart(2, "0");
    const expiryDate = `${yyyy}-${mm}-${dd}`;

    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const yy = String(yyyy).slice(-2);
    const monthStr = months[selectedDate.getMonth()];
    const expiryFormatted = isMonthly ? `${yy}${monthStr}` : `${yy}${monthStr}${dd}`;

    const diffMs = selectedDate.getTime() - refDate.getTime();
    const daysToExpiry = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    return {
      expiryDate,
      expiryFormatted,
      isMonthly,
      daysToExpiry
    };
  }

  private static generateUpcomingExpiryDates(targetDayOfWeek: number, startDate: Date, count: number): Date[] {
    const dates: Date[] = [];
    let current = new Date(startDate.getTime());
    current.setHours(15, 30, 0, 0);

    for (let i = 0; i < 90 && dates.length < count; i++) {
      if (current.getDay() === targetDayOfWeek) {
        let validDate = new Date(current.getTime());
        // Handle holiday shift (if Thursday is holiday, shift to Wednesday)
        while (this.isHoliday(validDate) || validDate.getDay() === 0 || validDate.getDay() === 6) {
          validDate.setDate(validDate.getDate() - 1);
        }
        if (validDate >= startDate) {
          dates.push(validDate);
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  private static isLastExpiryOfMonth(date: Date, targetDayOfWeek: number): boolean {
    const nextWeek = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
    return nextWeek.getMonth() !== date.getMonth();
  }

  public static isHoliday(date: Date): boolean {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return this.HOLIDAYS.has(`${yyyy}-${mm}-${dd}`);
  }
}
