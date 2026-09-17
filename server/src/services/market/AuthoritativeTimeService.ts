/*
 * ─── Single Authoritative Time & Market Calendar Service ──────
 *
 * Provides unified, authoritative time and exchange session resolution:
 * - UTC, IST, Binance, and Angel One time synchronization
 * - System clock drift monitoring & threshold alerts
 * - NSE / BSE statutory calendar & holiday resolution
 * - Crypto 24/7 continuous session authority
 */
import { ExchangeCalendar } from "../indianMarket/exchangeCalendar.js";

export interface TimeStatus {
  utcTimestamp: number;
  utcString: string;
  istString: string;
  clockDriftMs: number;
  driftStatus: "SYNCHRONIZED" | "DRIFT_DETECTED" | "CRITICAL_DESYNC";
  indianSession: {
    isOpen: boolean;
    phase: string;
    isHoliday: boolean;
    holidayName: string | null;
  };
  cryptoSession: {
    isOpen: boolean;
    phase: "CONTINUOUS_24_7";
  };
}

export class AuthoritativeTimeService {
  private static clockOffsetMs = 0;
  private static lastSyncTimestamp = 0;
  private static readonly MAX_ALLOWED_DRIFT_MS = 1000; // 1 second

  /**
   * Sets synchronized server time offset from a trusted source (e.g. Binance API or NTP).
   */
  public static updateClockOffset(offsetMs: number): void {
    this.clockOffsetMs = offsetMs;
    this.lastSyncTimestamp = Date.now();
  }

  public static getClockDriftMs(): number {
    return Math.abs(this.clockOffsetMs);
  }

  /**
   * Returns authoritative UTC timestamp accounting for synchronized network offset.
   */
  public static getNowUtc(): number {
    return Date.now() + this.clockOffsetMs;
  }

  public static getNowDate(): Date {
    return new Date(this.getNowUtc());
  }

  /**
   * Converts UTC date to formatted IST string (UTC+05:30).
   */
  public static getIstString(date?: Date): string {
    const d = date || this.getNowDate();
    const utc = d.getTime();
    const istOffset = 5.5 * 3600 * 1000;
    const istDate = new Date(utc + istOffset);

    const pad = (n: number) => n.toString().padStart(2, "0");
    const y = istDate.getUTCFullYear();
    const m = pad(istDate.getUTCMonth() + 1);
    const day = pad(istDate.getUTCDate());
    const h = pad(istDate.getUTCHours());
    const min = pad(istDate.getUTCMinutes());
    const s = pad(istDate.getUTCSeconds());

    return `${y}-${m}-${day} ${h}:${min}:${s} IST`;
  }

  /**
   * Authoritative session check for Indian Market.
   */
  public static getIndianSessionStatus(date?: Date) {
    const d = date || this.getNowDate();
    return ExchangeCalendar.getSessionStatus(d);
  }

  /**
   * Derives a human-readable phase string from MarketSessionStatus flags.
   */
  private static derivePhase(session: {
    isOpen: boolean;
    isPreMarket: boolean;
    isPostMarket: boolean;
    isWeekend: boolean;
    isHoliday: boolean;
  }): string {
    if (session.isOpen) return "REGULAR_TRADING";
    if (session.isPreMarket) return "PRE_MARKET";
    if (session.isPostMarket) return "POST_MARKET";
    if (session.isHoliday) return "HOLIDAY";
    if (session.isWeekend) return "WEEKEND";
    return "CLOSED";
  }

  /**
   * Full unified operational time status report.
   */
  public static getTimeStatus(): TimeStatus {
    const nowUtc = this.getNowUtc();
    const nowDate = new Date(nowUtc);
    const driftMs = this.getClockDriftMs();
    const indianSession = this.getIndianSessionStatus(nowDate);

    let driftStatus: TimeStatus["driftStatus"] = "SYNCHRONIZED";
    if (driftMs > 3000) {
      driftStatus = "CRITICAL_DESYNC";
    } else if (driftMs > this.MAX_ALLOWED_DRIFT_MS) {
      driftStatus = "DRIFT_DETECTED";
    }

    return {
      utcTimestamp: nowUtc,
      utcString: nowDate.toISOString(),
      istString: this.getIstString(nowDate),
      clockDriftMs: driftMs,
      driftStatus,
      indianSession: {
        isOpen: indianSession.isOpen,
        phase: this.derivePhase(indianSession),
        isHoliday: indianSession.isHoliday,
        holidayName: indianSession.holidayName || null,
      },
      cryptoSession: {
        isOpen: true,
        phase: "CONTINUOUS_24_7",
      },
    };
  }
}
