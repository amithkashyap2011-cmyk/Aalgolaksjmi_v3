/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Indian Market Intraday (MIS) Auto Square-Off Daemon
 * ═══════════════════════════════════════════════════════════════════
 *  Monitors IST clock every 30 seconds. At 3:15 PM IST (Mon–Fri),
 *  automatically closes all open Intraday (MIS) positions on NSE & BSE.
 */

import * as paper from "./paperState.js";
import { log } from "../utils/logger.js";

export class IntradaySquareOffService {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Starts the 3:15 PM IST Auto Square-off monitor
   */
  public static startDaemon() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[INTRADAY_SQUARE_OFF] Starting 3:15 PM IST Auto Square-off Monitor Daemon...");

    this.timer = setInterval(() => {
      this.checkAndSquareOff();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stops the daemon
   */
  public static stopDaemon() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  /**
   * Checks current IST time and triggers square-off at 15:15 IST (3:15 PM)
   */
  public static checkAndSquareOff() {
    const now = new Date();
    // Convert to IST (UTC +5:30)
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    const day = istTime.getUTCDay();
    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();

    // Only run Mon-Fri (1-5) between 15:15 and 15:29 IST
    const isTradingDay = day >= 1 && day <= 5;
    const isSquareOffTime = hours === 15 && minutes >= 15 && minutes < 30;

    if (isTradingDay && isSquareOffTime) {
      this.executeGlobalSquareOff();
    }
  }

  /**
   * Executes auto square-off on all open MIS positions
   */
  public static executeGlobalSquareOff(): number {
    console.log("[INTRADAY_SQUARE_OFF] ⏰ 3:15 PM IST REACHED — Executing Mandatory MIS Auto Square-off!");
    let count = 0;

    // Scan all open paper positions across Indian account types
    const indianAccountTypes = ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50"];
    
    for (const acctType of indianAccountTypes) {
      const openPos = paper.getOpenPositions("guest-user", "PAPER").filter(p => p.accountType === acctType);
      
      for (const pos of openPos) {
        if ((pos as any).productType === "MIS" || !(pos as any).productType) {
          log(`[INTRADAY_AUTO_CLOSE] Closing MIS Position ${pos.symbol} (${pos.quantity} shares @ ₹${pos.entryPrice})`);
          
          // Credit margin back and remove position O(1)
          const wallet = paper.getWallet("guest-user", "PAPER", acctType);
          const currentInr = wallet.get("INR") ?? 500000;
          const leverage = (pos as any).leverage || 5;
          const marginToReturn = (pos.quantity * pos.entryPrice) / leverage;
          wallet.set("INR", currentInr + marginToReturn);

          paper.removePosition("guest-user", pos.symbol, "PAPER", acctType);
          count++;
        }
      }
    }

    if (count > 0) {
      console.log(`[INTRADAY_SQUARE_OFF] ✅ Successfully auto-squared off ${count} intraday positions.`);
    }

    return count;
  }
}
