/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA v2.1A — Signal Bus (Event-Driven Architecture)
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Provides a high-speed event bus for real-time market signals.
 * Bridges WebSocket feeds directly to the decision engine,
 * bypassing the 60-second polling loop for critical events.
 */

import { EventEmitter } from "node:events";

export enum SignalType {
  PRICE_TICK = "TICK",
  LIQUIDATION = "LIQUIDATION",
  VOL_SPIKE = "VOL_SPIKE",
  FUNDING_CHANGE = "FUNDING_CHANGE",
  WHALE_TX = "WHALE_TX"
}

export interface SignalEvent {
  type: SignalType;
  symbol: string;
  data: any;
  timestamp: number;
}

export class SignalBus extends EventEmitter {
  private static instance: SignalBus;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  public static getInstance(): SignalBus {
    if (!SignalBus.instance) {
      SignalBus.instance = new SignalBus();
    }
    return SignalBus.instance;
  }

  /**
   * Publishes a signal to the bus.
   */
  public emitSignal(event: SignalEvent): void {
    this.emit(event.type, event);
    this.emit("ANY", event);
  }

  /**
   * Subscribes to a specific signal type.
   */
  public onSignal(type: SignalType | "ANY", handler: (event: SignalEvent) => void): void {
    this.on(type, handler);
  }
}

export const signalBus = SignalBus.getInstance();
