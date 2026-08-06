/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Live Deployment Manager
 * ═══════════════════════════════════════════════════════════════════
 */

import * as binance from "../binanceService.js";
import { AQEA_CONFIG } from "../aqea/config.js";
import { PredictorRegistry } from "../aqea/ai/PredictorRegistry.js";
import mongoose from "mongoose";
import { AqeaProductionAudit } from "../../models/AqeaProductionAudit.js";

export class DeploymentManager {
  /**
   * Performs a comprehensive startup safety audit.
   */
  public static async verifyProductionReadiness(): Promise<{ ready: boolean; errors: string[] }> {
    const errors: string[] = [];
    console.info("[DEPLOYMENT_MANAGER] Initiating Production Readiness Audit...");

    // 1. Environment Validation
    if (!process.env.JWT_SECRET) errors.push("CRITICAL: JWT_SECRET not configured.");
    if (!process.env.MONGODB_URI) errors.push("CRITICAL: MONGODB_URI not configured.");

    // 2. Database Connectivity
    if (mongoose.connection.readyState !== 1) {
       errors.push("CRITICAL: MongoDB connection not established.");
    }

    // 3. Exchange Connectivity & Latency
    try {
      const start = Date.now();
      const info = await binance.getExchangeInfo(); // Ping/Info check
      const latency = Date.now() - start;
      if (!info || info.length === 0) errors.push("CRITICAL: Binance API connectivity failure.");
      if (latency > 500) console.warn(`[DEPLOYMENT_MANAGER] WARNING: High initial API latency: ${latency}ms`);
    } catch (err: any) {
      errors.push(`CRITICAL: Exchange handshake failed: ${err.message}`);
    }

    // 4. Feature Flag Validation
    if (AQEA_CONFIG.SHADOW_MODE && process.env.NODE_ENV === "production") {
       console.warn("[DEPLOYMENT_MANAGER] WARNING: System running in SHADOW MODE in production.");
    }

    // 5. Model Availability
    if (AQEA_CONFIG.AI_ENABLED) {
       const health = PredictorRegistry.getRegistryHealth();
       const unavailable = health.filter(h => !h.available && h.name !== "NOT_AVAILABLE");
       if (unavailable.length > 0) {
          errors.push(`WARNING: AI Models offline: ${unavailable.map(m => m.name).join(", ")}`);
       }
    }

    const isReady = errors.filter(e => e.startsWith("CRITICAL")).length === 0;

    // Log the audit result
    await AqeaProductionAudit.create({
      level: isReady ? "INFO" : "CRITICAL",
      event: "STARTUP_AUDIT",
      message: isReady ? "System passed production readiness audit." : "Production audit failed.",
      data: { errors, config: AQEA_CONFIG }
    });

    return { ready: isReady, errors };
  }
}
