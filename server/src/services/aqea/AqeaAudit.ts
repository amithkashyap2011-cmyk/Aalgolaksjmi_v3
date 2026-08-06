/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Structured Audit Logging Service
 * ═══════════════════════════════════════════════════════════════════
 */

import { AqeaAudit } from "../../models/AqeaAudit.js";
import mongoose from "mongoose";

export class AqeaAuditService {
  public static async log(
    userId: string,
    symbol: string,
    component: "riskEngine" | "exitEngine" | "regimeEngine" | "multiTfEngine" | "orchestrator",
    level: "INFO" | "WARNING" | "CRITICAL" | "ERROR",
    message: string,
    data: any = {}
  ): Promise<void> {
    try {
      console.log(`[AQEA][${level}][${component}] ${symbol}: ${message}`);
      
      if (mongoose.connection?.readyState === 1) {
        // v2.8 Fix: Handle "SYSTEM" or other non-ObjectId strings gracefully
        let validUserId: mongoose.Types.ObjectId;
        try {
          validUserId = new mongoose.Types.ObjectId(userId);
        } catch {
          // Fallback to a zero-filled ObjectId for system-level audits if userId is invalid
          validUserId = new mongoose.Types.ObjectId("000000000000000000000000");
        }

        await AqeaAudit.create({
          userId: validUserId,
          symbol,
          component,
          level,
          message,
          data
        });
      }
    } catch (err) {
      console.error("[AQEA_AUDIT_ERROR]", err);
    }
  }

  public static info(userId: string, symbol: string, component: any, message: string, data?: any) {
    return this.log(userId, symbol, component, "INFO", message, data);
  }

  public static warn(userId: string, symbol: string, component: any, message: string, data?: any) {
    return this.log(userId, symbol, component, "WARNING", message, data);
  }

  public static critical(userId: string, symbol: string, component: any, message: string, data?: any) {
    return this.log(userId, symbol, component, "CRITICAL", message, data);
  }

  public static error(userId: string, symbol: string, component: any, message: string, data?: any) {
    return this.log(userId, symbol, component, "ERROR", message, data);
  }
}
