/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Client-Side Indian Stock Market (NSE / BSE) Hours Guard
 * ═══════════════════════════════════════════════════════════════════
 */

export interface MarketSessionStatus {
  isOpen: boolean;
  isPreMarket: boolean;
  isPostMarket: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  currentISTTime: string;
  reason: string;
  message: string;
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

export function checkIsIndianMarketOpen(dateOverride?: Date): MarketSessionStatus {
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
  let message = "NSE/BSE Indian Stock Market is currently OPEN.";

  if (isWeekend) {
    reason = "WEEKEND_CLOSED";
    message = "NSE/BSE Indian Stock Market is CLOSED today (Weekend). Active hours: Mon-Fri 09:15 AM - 03:30 PM IST.";
  } else if (isHoliday) {
    reason = "NSE_HOLIDAY_CLOSED";
    message = "NSE/BSE Indian Stock Market is CLOSED today (Official Exchange Holiday).";
  } else if (timeInMinutes < preMarketStart) {
    reason = "BEFORE_MARKET_HOURS";
    message = "NSE/BSE Indian Stock Market is currently CLOSED (Pre-market opens at 09:00 AM IST).";
  } else if (isPreMarket) {
    reason = "PRE_MARKET_SESSION";
    message = "NSE/BSE Pre-market session is active (09:00 AM - 09:15 AM IST). Regular trading opens at 09:15 AM IST.";
  } else if (isPostMarket) {
    reason = "AFTER_MARKET_HOURS";
    message = "NSE/BSE Indian Stock Market is currently CLOSED (Market closed at 03:30 PM IST).";
  }

  const currentISTTime = `${dateStr} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} IST`;

  return {
    isOpen,
    isPreMarket,
    isPostMarket,
    isWeekend,
    isHoliday,
    currentISTTime,
    reason,
    message,
  };
}
