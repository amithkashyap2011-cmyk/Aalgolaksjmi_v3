/**
 * ═══════════════════════════════════════════════════════════════════
 *  Indian Derivatives Expiry Resolver Engine
 * ═══════════════════════════════════════════════════════════════════
 *  Calculates and resolves valid derivative contract expiries for NSE:
 *   - NEAREST_VALID_EXPIRY (Current active weekly/monthly expiry)
 *   - NEXT_EXPIRY (Following weekly expiry)
 *   - MONTHLY (Current month-end contract expiry)
 *   - NEXT_MONTHLY (Following month-end contract expiry)
 *   - Automatically shifts to previous trading day if expiry falls on a market holiday
 */

import { ExpirySelectionConfig, UnderlyingSymbol } from "./strategyTypes.js";
import { IndianMarketHours } from "../indianMarketHours.js";

export class ExpiryResolver {
  /**
   * Formats Date to YYYY-MM-DD string
   */
  public static formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /**
   * Checks if date is an exchange holiday or weekend
   */
  public static isNonTradingDay(date: Date): boolean {
    const day = date.getDay();
    if (day === 0 || day === 6) return true; // Sunday, Saturday
    return IndianMarketHours.isHoliday(date);
  }

  /**
   * Adjusts date backwards if it lands on a holiday or weekend
   */
  public static adjustForHolidays(date: Date): Date {
    const adjusted = new Date(date);
    while (this.isNonTradingDay(adjusted)) {
      adjusted.setDate(adjusted.getDate() - 1);
    }
    return adjusted;
  }

  /**
   * Returns standard weekly expiry day of week for given underlying
   * - NIFTY: Thursday (Day 4)
   * - BANKNIFTY: Wednesday (Day 3) / Thursday
   * - FINNIFTY: Tuesday (Day 2)
   * - MIDCPNIFTY: Monday (Day 1)
   * - SENSEX / BANKEX (BSE): Friday (Day 5)
   */
  public static getStandardExpiryDayOfWeek(underlying: UnderlyingSymbol): number {
    const sym = underlying.toUpperCase();
    if (sym.includes("FINNIFTY")) return 2; // Tuesday
    if (sym.includes("MIDCP")) return 1; // Monday
    if (sym.includes("SENSEX") || sym.includes("BANKEX")) return 5; // Friday
    // Standard NSE Index options (NIFTY / BANKNIFTY monthly/weekly)
    return 4; // Thursday
  }

  /**
   * Generates a series of valid upcoming weekly and monthly expiries
   */
  public static getValidExpiries(
    underlying: UnderlyingSymbol,
    referenceDate: Date = new Date(),
    count: number = 8
  ): Array<{ expiry: string; date: Date; isMonthly: boolean; label: string }> {
    const expiries: Array<{ expiry: string; date: Date; isMonthly: boolean; label: string }> = [];
    const targetDay = this.getStandardExpiryDayOfWeek(underlying);
    const cursor = new Date(referenceDate);
    cursor.setHours(0, 0, 0, 0);

    // Find next matching weekday
    const daysUntilNext = (targetDay - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + (daysUntilNext === 0 ? 0 : daysUntilNext));

    // If today is targetDay but past market close (15:30 IST), roll to next week
    const nowUtc = new Date().getTime() + (new Date().getTimezoneOffset() * 60000);
    const istHours = new Date(nowUtc + 5.5 * 3600000).getHours();
    const istMinutes = new Date(nowUtc + 5.5 * 3600000).getMinutes();
    if (
      cursor.toDateString() === referenceDate.toDateString() &&
      (istHours > 15 || (istHours === 15 && istMinutes >= 30))
    ) {
      cursor.setDate(cursor.getDate() + 7);
    }

    while (expiries.length < count) {
      const validDate = this.adjustForHolidays(new Date(cursor));
      
      // Determine if this is the last expiry of the month (monthly expiry)
      const nextWeek = new Date(cursor);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const isMonthly = nextWeek.getMonth() !== cursor.getMonth();

      const expiryStr = this.formatDate(validDate);
      if (!expiries.some((e) => e.expiry === expiryStr)) {
        expiries.push({
          expiry: expiryStr,
          date: validDate,
          isMonthly,
          label: isMonthly ? `${expiryStr} (Monthly)` : `${expiryStr} (Weekly)`,
        });
      }

      cursor.setDate(cursor.getDate() + 7);
    }

    return expiries;
  }

  /**
   * Resolves target expiry based on configuration
   */
  public static resolveExpiry(
    underlying: UnderlyingSymbol,
    config: ExpirySelectionConfig,
    referenceDate: Date = new Date()
  ): { expiry: string; date: Date; isMonthly: boolean } {
    if (config.type === "SPECIFIC_DATE" && config.specificDate) {
      const d = new Date(config.specificDate);
      return {
        expiry: config.specificDate,
        date: d,
        isMonthly: false,
      };
    }

    const expiries = this.getValidExpiries(underlying, referenceDate, 10);
    if (expiries.length === 0) {
      const fallback = this.adjustForHolidays(new Date(referenceDate));
      return {
        expiry: this.formatDate(fallback),
        date: fallback,
        isMonthly: true,
      };
    }

    switch (config.type) {
      case "NEAREST_VALID_EXPIRY":
        return expiries[0];

      case "NEXT_EXPIRY":
        return expiries.length > 1 ? expiries[1] : expiries[0];

      case "MONTHLY": {
        const monthly = expiries.find((e) => e.isMonthly);
        return monthly || expiries[0];
      }

      case "NEXT_MONTHLY": {
        const monthlies = expiries.filter((e) => e.isMonthly);
        return monthlies.length > 1 ? monthlies[1] : monthlies[0] || expiries[0];
      }

      default:
        return expiries[0];
    }
  }
}
