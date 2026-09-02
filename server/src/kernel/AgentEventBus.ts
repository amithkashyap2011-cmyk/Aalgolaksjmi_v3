/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — EVENT BUS
 * ═══════════════════════════════════════════════════════════════════
 * High-performance, typed, versioned event stream.
 */

import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { IKernelEvent, KernelEventType } from "./types.js";

export type KernelEventListener<T = any> = (event: IKernelEvent<T>) => void | Promise<void>;

export class AgentEventBus {
  private static instance: AgentEventBus;
  private emitter = new EventEmitter();
  private recentEvents: IKernelEvent[] = [];
  private readonly maxRetainedEvents = 200;

  private constructor() {
    this.emitter.setMaxListeners(100);
  }

  public static getInstance(): AgentEventBus {
    if (!AgentEventBus.instance) {
      AgentEventBus.instance = new AgentEventBus();
    }
    return AgentEventBus.instance;
  }

  public publish<T = any>(
    type: KernelEventType,
    payload: T,
    metadata: {
      source: string;
      correlationId?: string;
      causationId?: string;
      decisionId?: string;
      executionId?: string;
      symbol?: string;
    }
  ): IKernelEvent<T> {
    const event: IKernelEvent<T> = {
      eventId: `EVT_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      type,
      source: metadata.source,
      timestamp: Date.now(),
      correlationId: metadata.correlationId || `CORR_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      causationId: metadata.causationId,
      decisionId: metadata.decisionId,
      executionId: metadata.executionId,
      symbol: metadata.symbol,
      payload,
      schemaVersion: "3.0.0",
    };

    // Store in circular buffer
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxRetainedEvents) {
      this.recentEvents.length = this.maxRetainedEvents;
    }

    // Emit event-specific and wildcard
    this.emitter.emit(type, event);
    this.emitter.emit("*", event);

    return event;
  }

  public subscribe<T = any>(type: KernelEventType | "*", listener: KernelEventListener<T>): () => void {
    this.emitter.on(type, listener);
    return () => {
      this.emitter.off(type, listener);
    };
  }

  public subscribeOnce<T = any>(type: KernelEventType, listener: KernelEventListener<T>): void {
    this.emitter.once(type, listener);
  }

  public getRecentEvents(filter?: { type?: KernelEventType; symbol?: string; limit?: number }): IKernelEvent[] {
    let list = this.recentEvents;
    if (filter?.type) {
      list = list.filter((e) => e.type === filter.type);
    }
    if (filter?.symbol) {
      list = list.filter((e) => e.symbol === filter.symbol);
    }
    const limit = filter?.limit || 50;
    return list.slice(0, limit);
  }

  public clear(): void {
    this.recentEvents = [];
    this.emitter.removeAllListeners();
  }
}
