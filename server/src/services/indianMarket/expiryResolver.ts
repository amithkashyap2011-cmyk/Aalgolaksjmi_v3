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
import { ExchangeCalendar } from "./exchangeCalendar.js";
import { optionContracts, expiryCloseTime } from "./angelOne/optionContracts.js";

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
   * Expiry weekday for the rule-based fallback (used only when the real
   * scrip-master contracts are not loaded). NSE moved index/stock derivative
   * expiries to Tuesday in 2025; BSE (SENSEX/BANKEX) expires on Thursday.
   */
  public static getStandardExpiryDayOfWeek(underlying: UnderlyingSymbol): number {
    const sym = underlying.toUpperCase();
    if (sym.includes("SENSEX") || sym.includes("BANKEX")) return 4; // Thursday (BSE)
    return 2; // Tuesday (NSE)
  }

  /** Only NIFTY and SENSEX list weekly expiries; everything else is monthly (last expiry weekday of the month). */
  public static hasWeeklyExpiry(underlying: UnderlyingSymbol): boolean {
    const sym = underlying.toUpperCase();
    if (sym.includes("BANK") || sym.includes("FIN") || sym.includes("MIDCP")) return false;
    return sym.includes("NIFTY") || sym.includes("SENSEX");
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
    const weekly = this.hasWeeklyExpiry(underlying);

    // "Today" and the clock are taken in IST from the reference date (not the
    // server's local zone and not the wall clock), so results are stable on a
    // UTC host and for back-dated reference dates.
    const ist = ExchangeCalendar.toIST(referenceDate);
    const today = new Date(ist.getFullYear(), ist.getMonth(), ist.getDate());
    const afterClose = ist.getHours() * 60 + ist.getMinutes() >= 15 * 60 + 30;
    const cursor = new Date(today);
    cursor.setDate(cursor.getDate() + ((targetDay - cursor.getDay() + 7) % 7));

    let guard = 0;
    while (expiries.length < count && guard++ < 400) {
      const validDate = this.adjustForHolidays(new Date(cursor));
      const nextWeek = new Date(cursor);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const isMonthly = nextWeek.getMonth() !== cursor.getMonth();

      // An expiry that has already settled (earlier day, or today after 15:30,
      // including a holiday-shifted date that lands before today) is not live.
      const settled = validDate.getTime() < today.getTime() || (validDate.getTime() === today.getTime() && afterClose);
      const expiryStr = this.formatDate(validDate);
      if (!settled && (weekly || isMonthly) && !expiries.some((e) => e.expiry === expiryStr)) {
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

    // Real exchange expiries (Angel One scrip master) when loaded — the rule
    // based calendar below assumed Thursday weeklies for everything, while
    // NIFTY weeklies are Tuesdays and BANKNIFTY/FINNIFTY/stocks are monthly.
    const real = optionContracts.getExpiries(underlying, referenceDate);
    if (real.length > 0) {
      const toResult = (e: string) => ({ expiry: e, date: expiryCloseTime(e), isMonthly: optionContracts.isMonthlyExpiry(underlying, e, referenceDate) });
      const monthlies = real.filter((e) => optionContracts.isMonthlyExpiry(underlying, e, referenceDate));
      switch (config.type) {
        case "NEXT_EXPIRY": return toResult(real[1] ?? real[0]);
        case "MONTHLY": return toResult(monthlies[0] ?? real[0]);
        case "NEXT_MONTHLY": return toResult(monthlies[1] ?? monthlies[0] ?? real[0]);
        default: return toResult(real[0]);
      }
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
