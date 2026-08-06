import { getIO } from "./socketService.js";
import os from "node:os";

export class UITelemetryService {
  /**
   * Emits a real-time AQEA decision event.
   */
  public static emitDecision(userId: string, symbol: string, decision: any) {
    const io = getIO();
    if (io) {
      io.emit("AQEA_DECISION_STREAM", {
        userId,
        symbol,
        timestamp: new Date(),
        ...decision
      });
    }
  }

  /**
   * Emits a real-time position management event (SL/TP update).
   */
  public static emitPositionManaged(userId: string, symbol: string, action: string, reason: string, value: number) {
    const io = getIO();
    if (io) {
      io.emit("AQEA_MANAGEMENT_EVENT", {
        userId,
        symbol,
        timestamp: new Date(),
        action,
        reason,
        value
      });
    }
  }

  /**
   * Emits Weather Intelligence data.
   */
  public static emitWeatherIntelligence(data: any) {
    const io = getIO();
    if (io) {
      io.emit("WEATHER_INTELLIGENCE", {
        timestamp: new Date(),
        ...data
      });
    }
  }

  /**
   * Emits system-wide health and resource metrics.
   */
  public static emitSystemHealth() {
    const io = getIO();
    if (io) {
      io.emit("SYSTEM_TELEMETRY", {
        timestamp: new Date(),
        cpuUsage: os.loadavg()[0],
        memoryUsage: {
          free: os.freemem(),
          total: os.totalmem(),
          usagePct: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
        },
        uptime: os.uptime()
      });
    }
  }
}
