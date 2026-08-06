/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA — Health Monitoring System
 * ═══════════════════════════════════════════════════════════════════
 */

import os from "node:os";
import mongoose from "mongoose";
import * as binance from "../binanceService.js";
import { PredictorRegistry } from "../aqea/ai/PredictorRegistry.js";

export type HealthStatus = "HEALTHY" | "WARNING" | "CRITICAL";

export interface SystemHealth {
  status: HealthStatus;
  timestamp: Date;
  components: {
    exchange: { status: HealthStatus; latencyMs: number };
    database: { status: HealthStatus };
    models: { status: HealthStatus; availableCount: number };
    resources: { cpuUsage: number; memoryUsage: number };
  };
}

export class HealthMonitor {
  private static lastLatency = 0;

  /**
   * Aggregates health metrics from across the system.
   */
  public static async getSystemHealth(): Promise<SystemHealth> {
    const start = Date.now();
    
    // 1. Exchange Health
    let exchangeStatus: HealthStatus = "HEALTHY";
    try {
      await binance.getTickerPriceSync("BTCUSDT"); // Lightest check
      this.lastLatency = Date.now() - start;
      if (this.lastLatency > 1000) exchangeStatus = "WARNING";
    } catch {
      exchangeStatus = "CRITICAL";
    }

    // 2. Database Health
    const dbStatus: HealthStatus = mongoose.connection.readyState === 1 ? "HEALTHY" : "CRITICAL";

    // 3. AI Model Health
    const modelHealth = PredictorRegistry.getRegistryHealth();
    const available = modelHealth.filter(h => h.available || h.name === "NOT_AVAILABLE").length;
    const total = modelHealth.length;
    const modelStatus: HealthStatus = available === total ? "HEALTHY" : (available > 0 ? "WARNING" : "CRITICAL");

    // 4. Resource Usage
    const memoryUsage = (process.memoryUsage().rss / 1024 / 1024 / 1024); // GB
    const cpuLoad = os.loadavg()[0]; // 1 min load

    const globalStatus: HealthStatus = 
      (exchangeStatus === "CRITICAL" || dbStatus === "CRITICAL") ? "CRITICAL" :
      (exchangeStatus === "WARNING" || modelStatus === "WARNING" || cpuLoad > (os.cpus().length * 0.8)) ? "WARNING" : "HEALTHY";

    return {
      status: globalStatus,
      timestamp: new Date(),
      components: {
        exchange: { status: exchangeStatus, latencyMs: this.lastLatency },
        database: { status: dbStatus },
        models: { status: modelStatus, availableCount: available },
        resources: { 
           cpuUsage: parseFloat(cpuLoad.toFixed(2)), 
           memoryUsage: parseFloat(memoryUsage.toFixed(2)) 
        }
      }
    };
  }
}
