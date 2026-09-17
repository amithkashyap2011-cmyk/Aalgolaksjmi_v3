import mongoose from "mongoose";
import { systemManager, SystemState } from "./systemManager.js";
import * as binanceService from "./binanceService.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EnvironmentAuthority } from "./aqea/environmentAuthority.js";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

export class RecoveryManager {
  private static instance: RecoveryManager;
  private checkInterval: NodeJS.Timeout | null = null;

  // A single dropped Binance ping (3s timeout, no retry) is almost always a
  // transient network blip, not an outage. Flipping READY→RECOVERING on that
  // one failure trips the index.ts circuit breaker and halts all non-GET trade
  // execution. Require N *consecutive* ping failures before declaring
  // RECOVERING, and reset the counter on any success, so one blip can't stop
  // trading.
  private binanceFailCount = 0;
  private static readonly BINANCE_FAIL_THRESHOLD = 3;

  private constructor() {
    this.startHealthCheck();
  }

  public static getInstance(): RecoveryManager {
    if (!RecoveryManager.instance) {
      RecoveryManager.instance = new RecoveryManager();
    }
    return RecoveryManager.instance;
  }

  private startHealthCheck() {
    this.checkInterval = setInterval(async () => {
      const mongoOk = await this.checkMongo();
      const binanceOk = await this.checkBinance();
      const quantOk = await this.checkQuant();
      
      if (systemManager.getState() === SystemState.RECOVERING) {
         if (mongoOk && binanceOk && quantOk) {
            console.log("[RecoveryManager] All dependencies restored. Transitioning to READY.");
            systemManager.setState(SystemState.READY);
         }
      }
    }, 10000); // Check every 10 seconds
  }

  private logRecoveryTrigger(reason: string) {
    const line = `[${new Date().toISOString()}] [RECOVERY_TRIGGER] Reason: ${reason}\n`;
    try {
      fs.appendFileSync(path.join(__moduleDir, "..", "..", "auto_trade.log"), line);
    } catch {}
  }

  private async checkMongo(): Promise<boolean> {
    if (mongoose.connection.readyState !== 1) {
      console.error("[RecoveryManager] MongoDB Disconnected!");
      if (systemManager.getState() === SystemState.READY) {
        const reason = "MongoDB connection disconnected (state !== 1)";
        this.logRecoveryTrigger(reason);
        systemManager.setState(SystemState.RECOVERING);
      }
      
      try {
        // Attempt to reconnect if not already connecting
        if (mongoose.connection.readyState === 0) {
            const MONGO_URI = EnvironmentAuthority.getMongoUri();
            await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
            console.log("[RecoveryManager] MongoDB Reconnected successfully.");
            return true;
        }
      } catch (e) {
        console.error("[RecoveryManager] MongoDB Reconnection failed.");
      }
      return false;
    }
    return true;
  }

  private async checkBinance(): Promise<boolean> {
    if (binanceService.isRestBanned()) {
      // Do not enter RECOVERING state if Binance REST is banned — WebSocket / Paper is functioning
      this.binanceFailCount = 0;
      return true;
    }
    try {
      const ping = await binanceService.pingBinance();
      if (!ping.ok) throw new Error(ping.banned ? "Binance REST Banned" : "Binance Ping Failed");
      // Any success clears the streak so an isolated earlier blip is forgotten.
      this.binanceFailCount = 0;
      return true;
    } catch (e: any) {
      if (binanceService.isRestBanned()) {
        this.binanceFailCount = 0;
        return true;
      }
      this.binanceFailCount++;
      console.error(
        `[RecoveryManager] Binance ping failed (${this.binanceFailCount}/${RecoveryManager.BINANCE_FAIL_THRESHOLD} consecutive): ${e.message || e}`
      );
      // Only declare RECOVERING after N consecutive failures — one transient
      // dropped ping must not halt trade execution.
      if (
        this.binanceFailCount >= RecoveryManager.BINANCE_FAIL_THRESHOLD &&
        systemManager.getState() === SystemState.READY
      ) {
        const reason = `Binance API Unreachable: ${this.binanceFailCount} consecutive ping failures — ${e.message || e}`;
        console.error("[RecoveryManager] Binance API Unreachable!");
        this.logRecoveryTrigger(reason);
        systemManager.setState(SystemState.RECOVERING);
      }
      // Still return false so recovery-state exit (which requires all deps OK)
      // isn't falsely satisfied by a failing Binance check.
      return false;
    }
  }

  private async checkQuant(): Promise<boolean> {
    const quant = systemManager.getService("quant_engine");
    if (!quant) {
      if (systemManager.getState() === SystemState.READY) {
        const reason = "Quant Engine Registry Lost (no registered service)";
        console.error(`[RecoveryManager] ${reason}`);
        this.logRecoveryTrigger(reason);
        systemManager.setState(SystemState.RECOVERING);
      }
      return false;
    }

    try {
      const res = await fetch(`${quant.url}/health`, { signal: AbortSignal.timeout(1000) });
      if (!res.ok) {
        throw new Error(`Quant health check returned status ${res.status}`);
      }
      return true;
    } catch (e: any) {
      const reason = `Quant Engine Unreachable at ${quant.url} - ${e.message || e}`;
      console.error(`[RecoveryManager] ${reason}`);
      if (systemManager.getState() === SystemState.READY) {
        this.logRecoveryTrigger(reason);
        systemManager.setState(SystemState.RECOVERING);
      }
      return false;
    }
  }

  public async triggerManualRecovery() {
    console.log("[RecoveryManager] Manual recovery triggered.");
    systemManager.setState(SystemState.RECOVERING);
    // Logic to reset connections, clear caches, etc.
  }

  public logRecovery(event: string) {
    const line = `[${new Date().toISOString()}] [RECOVERY] ${event}\n`;
    try {
      fs.appendFileSync(path.join(__moduleDir, "..", "..", "auto_trade.log"), line);
      fs.appendFileSync(path.join(__moduleDir, "..", "..", "RECOVERY_MANAGER_REPORT.md"), line);
    } catch {}
  }
}

export const recoveryManager = RecoveryManager.getInstance();
