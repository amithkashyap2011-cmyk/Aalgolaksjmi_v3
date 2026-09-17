import { ExchangeCalendar, MarketSessionStatus, OFFICIAL_NSE_HOLIDAYS } from "./indianMarket/exchangeCalendar.js";

export { MarketSessionStatus };

export class IndianMarketHours {
  public static isHoliday(date: Date = new Date()): boolean {
    return ExchangeCalendar.isHoliday(date);
  }

  public static getSessionStatus(dateOverride?: Date): MarketSessionStatus {
    return ExchangeCalendar.getSessionStatus(dateOverride);
  }
}

