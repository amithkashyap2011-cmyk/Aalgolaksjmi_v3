import { getIO } from "./socketService.js";
import os from "node:os";

export interface LiveDecision {
  symbol: string;
  decision: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  buyProbability?: number;
  sellProbability?: number;
  holdProbability?: number;
  threshold?: number;
  riskApproved: boolean;
  reason: string;
  at: number;
}

export class UITelemetryService {
  /**
   * Emits a real-time AQEA decision event.
   */
  /**
   * Latest auto-trader decision per symbol — what the engine actually decided,
   * for UIs that must not show a different model's opinion as "the AI".
   */
  private static latest = new Map<string, LiveDecision>();

  public static getLatestDecisions(): Record<string, LiveDecision> {
    return Object.fromEntries(this.latest);
  }

  private static recordLatest(symbol: string, d: any): void {
    const m = d?.meta ?? {};
    const ef = m.ensembleFusion ?? m.lakshmi?.ensembleFusion ?? m.fusion ?? {};
    const num = (x: any) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
    // The fusion summary line carries the probabilities and the blocking
    // threshold: "ENSEMBLE_FUSION: HOLD | P(BUY)=0.405 P(HOLD)=0.306 P(SELL)=0.289 |
    // ... NO_TRADE_GATE=... (0.405 < 0.567)".
    const fusionLine = Array.isArray(d?.reasons) ? String(d.reasons.find((r: string) => r.startsWith("ENSEMBLE_FUSION")) ?? "") : "";
    const grab = (re: RegExp) => { const x = fusionLine.match(re); return x ? Number(x[1]) : undefined; };
    this.latest.set(symbol, {
      symbol,
      decision: d?.decision ?? "HOLD",
      confidence: num(d?.confidence) ?? 0,
      buyProbability: num(ef.buyProbability ?? m.buyProb) ?? grab(/P\(BUY\)=([0-9.]+)/),
      sellProbability: num(ef.sellProbability ?? m.sellProb) ?? grab(/P\(SELL\)=([0-9.]+)/),
      holdProbability: num(ef.holdProbability ?? m.holdProb) ?? grab(/P\(HOLD\)=([0-9.]+)/),
      threshold: num(ef.adaptiveThreshold) ?? grab(/<\s*([0-9.]+)\)/),
      riskApproved: Boolean(d?.riskApproved),
      reason: Array.isArray(d?.reasons) ? String(d.reasons.find((r: string) => /GATE|HOLD|BLOCK|REJECT|FUSION/.test(r)) ?? d.reasons[0] ?? "") : "",
      at: Date.now(),
    });
  }

  public static emitDecision(userId: string, symbol: string, decision: any) {
    try { this.recordLatest(symbol, decision); } catch { /* telemetry only */ }
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
   * Emits a real-time TRADE_OPENED notification so the UI can show a popup.
   */
  public static emitTradeOpened(params: {
    userId: string;
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    entryPrice: number;
    leverage: number;
    accountType: string;
    sl?: number;
    tp?: number;
    confidence?: number;
    regime?: string;
    mode: string;
    tradeId: string;
  }) {
    const io = getIO();
    if (io) {
      io.emit("TRADE_OPENED", {
        timestamp: new Date(),
        ...params
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
