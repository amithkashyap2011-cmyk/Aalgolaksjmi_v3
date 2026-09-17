/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — EVENT ROUTER & DEDUPLICATION BUS
 * ═══════════════════════════════════════════════════════════════════
 * Handles asynchronous, event-driven activation of AI agents.
 * 
 * CORE LAWS:
 *  1. AI is NEVER invoked on high-frequency market ticks.
 *  2. Ticks route deterministically to AutoPilot and SL/Target guards.
 *  3. Only significant market, position, risk, or system events trigger AI.
 *  4. Duplicate events within deduplication window are safely dropped.
 */

import { EventEmitter } from "node:events";
import { AgentEventType, IAgentEvent } from "../types.js";

export type EventHandler = (event: IAgentEvent) => Promise<void>;

export class AgentEventRouter {
  private static instance: AgentEventRouter;
  private emitter = new EventEmitter();
  private recentEventKeys: Map<string, number> = new Map();
  private deduplicationWindowMs = 5000; // 5 seconds
  private isProcessing = false;
  private eventQueue: IAgentEvent[] = [];

  private constructor() {
    this.emitter.setMaxListeners(50);
  }

  public static getInstance(): AgentEventRouter {
    if (!AgentEventRouter.instance) {
      AgentEventRouter.instance = new AgentEventRouter();
    }
    return AgentEventRouter.instance;
  }

  /**
   * Dispatches a trading or system event into the AI evaluation path.
   * Deduplicates frequent identical events and enqueues for asynchronous processing.
   */
  public publishEvent(event: IAgentEvent): boolean {
    const dedupKey = `${event.type}:${event.symbol || "GLOBAL"}:${event.source}`;
    const now = Date.now();
    const lastPublished = this.recentEventKeys.get(dedupKey);

    if (lastPublished && (now - lastPublished) < this.deduplicationWindowMs) {
      // Event suppressed as duplicate within window
      return false;
    }

    this.recentEventKeys.set(dedupKey, now);
    this.cleanExpiredDeduplicationKeys(now);

    // Enqueue and process asynchronously without blocking calling thread
    this.eventQueue.push(event);
    setImmediate(() => this.processNextQueueItem());
    return true;
  }

  /**
   * Registers a subscriber for specific event types.
   */
  public subscribe(eventType: AgentEventType | "*", handler: EventHandler): void {
    this.emitter.on(eventType, handler);
  }

  public unsubscribe(eventType: AgentEventType | "*", handler: EventHandler): void {
    this.emitter.off(eventType, handler);
  }

  private async processNextQueueItem(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) return;
    this.isProcessing = true;

    try {
      const event = this.eventQueue.shift();
      if (!event) return;

      // Emit specific event type and wildcard
      this.emitter.emit(event.type, event);
      this.emitter.emit("*", event);
    } catch (err: any) {
      console.error(`[AGENT_EVENT_ROUTER] Error processing event: ${err.message}`);
    } finally {
      this.isProcessing = false;
      if (this.eventQueue.length > 0) {
        setImmediate(() => this.processNextQueueItem());
      }
    }
  }

  private cleanExpiredDeduplicationKeys(now: number): void {
    if (this.recentEventKeys.size > 200) {
      for (const [key, timestamp] of this.recentEventKeys.entries()) {
        if (now - timestamp > this.deduplicationWindowMs) {
          this.recentEventKeys.delete(key);
        }
      }
    }
  }

  public getQueueLength(): number {
    return this.eventQueue.length;
  }

  public clearQueue(): void {
    this.eventQueue = [];
    this.recentEventKeys.clear();
  }
}
