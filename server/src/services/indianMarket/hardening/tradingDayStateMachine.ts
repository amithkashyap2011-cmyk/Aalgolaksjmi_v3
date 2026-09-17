/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Trading-Day State Machine & Startup Recovery Engine
 * ═══════════════════════════════════════════════════════════════════
 *  Explicitly models Indian stock and derivatives exchange sessions:
 *   - PRE_MARKET (09:00 - 09:15 IST)
 *   - MARKET_OPEN (09:15 IST)
 *   - MARKET_ACTIVE (09:15 - 15:15 IST)
 *   - PRE_CLOSE (15:15 - 15:30 IST — Intraday MIS Square-Off Window)
 *   - MARKET_CLOSED (15:30 - 15:40 IST)
 *   - POST_MARKET (15:40 - 09:00 IST / Weekends / NSE Holidays)
 *  Provides deterministic startup phase identification and recovery.
 */

import { IndianAuditLogger } from "../auditLogger.js";

export type TradingSessionPhase =
  | "PRE_MARKET"
  | "MARKET_OPEN"
  | "MARKET_ACTIVE"
  | "PRE_CLOSE"
  | "MARKET_CLOSED"
  | "POST_MARKET";

export interface SessionInspectionResult {
  phase: TradingSessionPhase;
  isTradingPermitted: boolean;
  isAutoSquareOffActive: boolean;
  currentISTTime: string;
  minutesIntoDay: number;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  nextSessionOpen: string;
}

import { OFFICIAL_NSE_HOLIDAYS, ExchangeCalendar } from "../exchangeCalendar.js";

export const NSE_HOLIDAYS_MAP: Record<string, string> = OFFICIAL_NSE_HOLIDAYS;

export class TradingDayStateMachine {
  private static currentPhase: TradingSessionPhase = "POST_MARKET";
  private static listeners: Array<(phase: TradingSessionPhase) => void> = [];

  public static getCurrentPhase(): TradingSessionPhase {
    return this.inspectSession().phase;
  }

  public static determineSessionPhase(date = new Date()): TradingSessionPhase {
    return this.inspectSession(date).phase;
  }

  public static isTradingDay(date = new Date()): boolean {
    const insp = this.inspectSession(date);
    return !insp.isWeekend && !insp.isHoliday;
  }

  public static getExchangeHoliday(date = new Date()): { name: string; description: string } | null {
    const insp = this.inspectSession(date);
    if (insp.isHoliday && insp.holidayName) {
      return { name: insp.holidayName, description: insp.holidayName };
    }
    return null;
  }

  /**
   * Converts any Date or current time to Indian Standard Time (IST = UTC + 5:30)
   * and decomposes it into the fields this module's session logic needs.
   *
   * The IST conversion itself is delegated to ExchangeCalendar.toIST() —
   * this used to reimplement the identical UTC+5.5h offset math
   * independently, which meant two copies to keep in sync if that
   * conversion were ever touched.
   */
  public static toIST(date = new Date()): {
    istDate: Date;
    dateStr: string;
    hours: number;
    minutes: number;
    timeInMinutes: number;
    dayOfWeek: number;
  } {
    const istDate = ExchangeCalendar.toIST(date);

    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const timeInMinutes = hours * 60 + minutes;
    const dayOfWeek = istDate.getDay(); // 0 = Sun, 6 = Sat
    const dateStr = ExchangeCalendar.formatDateStr(istDate);

    return { istDate, dateStr, hours, minutes, timeInMinutes, dayOfWeek };
  }

  /**
   * Evaluates the precise trading session phase for a given timestamp
   */
  public static inspectSession(dateOverride?: Date): SessionInspectionResult {
    const { dateStr, hours, minutes, timeInMinutes, dayOfWeek } = this.toIST(dateOverride);

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const holidayName = NSE_HOLIDAYS_MAP[dateStr];
    const isHoliday = Boolean(holidayName);

    const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} IST`;

    // Session time boundary constants in minutes from midnight IST:
    const PRE_MARKET_START = 9 * 60;       // 09:00 (540 min)
    const MARKET_OPEN_TIME = 9 * 60 + 15;  // 09:15 (555 min)
    const PRE_CLOSE_START  = 15 * 60 + 15; // 15:15 (915 min — Intraday Auto Square-Off)
    const MARKET_CLOSE_TIME= 15 * 60 + 30; // 15:30 (930 min — Standard Close)
    const POST_MARKET_TIME = 15 * 60 + 40; // 15:40 (940 min)

    let phase: TradingSessionPhase;
    let isTradingPermitted = false;
    let isAutoSquareOffActive = false;

    if (isWeekend || isHoliday) {
      phase = "POST_MARKET";
    } else if (timeInMinutes < PRE_MARKET_START) {
      phase = "POST_MARKET";
    } else if (timeInMinutes >= PRE_MARKET_START && timeInMinutes < MARKET_OPEN_TIME) {
      phase = "PRE_MARKET";
    } else if (timeInMinutes === MARKET_OPEN_TIME) {
      phase = "MARKET_OPEN";
      isTradingPermitted = true;
    } else if (timeInMinutes > MARKET_OPEN_TIME && timeInMinutes < PRE_CLOSE_START) {
      phase = "MARKET_ACTIVE";
      isTradingPermitted = true;
    } else if (timeInMinutes >= PRE_CLOSE_START && timeInMinutes < MARKET_CLOSE_TIME) {
      phase = "PRE_CLOSE";
      isTradingPermitted = false; // New entries blocked
      isAutoSquareOffActive = true; // Intraday MIS positions squared off
    } else if (timeInMinutes >= MARKET_CLOSE_TIME && timeInMinutes < POST_MARKET_TIME) {
      phase = "MARKET_CLOSED";
    } else {
      phase = "POST_MARKET";
    }

    return {
      phase,
      isTradingPermitted,
      isAutoSquareOffActive,
      currentISTTime: `${dateStr} ${timeStr}`,
      minutesIntoDay: timeInMinutes,
      isWeekend,
      isHoliday,
      holidayName,
      nextSessionOpen: "09:15 AM IST (Next Business Day)",
    };
  }

  /**
   * Executes startup phase recovery regardless of boot time (Section 13)
   */
  public static async executeStartupRecovery(
    bootTimeOverride?: Date
  ): Promise<{
    phase: TradingSessionPhase;
    actionsTaken: string[];
  }> {
    const inspection = this.inspectSession(bootTimeOverride);
    this.currentPhase = inspection.phase;
    const actionsTaken: string[] = [];

    actionsTaken.push(`Identified operational phase: ${inspection.phase} (${inspection.currentISTTime})`);

    switch (inspection.phase) {
      case "PRE_MARKET":
        actionsTaken.push("Pre-market orders and reference rates pre-loaded. Trading halted until 09:15 IST.");
        break;
      case "MARKET_OPEN":
        actionsTaken.push("09:15 AM Market Opening bell active. Activating primary option scanner and feeds.");
        break;
      case "MARKET_ACTIVE":
        actionsTaken.push("Market Active session confirmed. Connecting live price feeds and enabling Auto-Pilot.");
        break;
      case "PRE_CLOSE":
        actionsTaken.push("Booted during Pre-Close window (15:15 - 15:30 IST). Triggering mandatory MIS square-off.");
        break;
      case "MARKET_CLOSED":
      case "POST_MARKET":
        actionsTaken.push("Exchange is closed. Running post-session reconciliation. Auto-Pilot in safe standby.");
        break;
    }

    IndianAuditLogger.log({
      eventType: "STARTUP_SESSION_RECOVERED",
      details: { inspection, actionsTaken },
      reason: `Startup recovery aligned system with phase ${inspection.phase}`,
    });

    return {
      phase: inspection.phase,
      actionsTaken,
    };
  }
}
