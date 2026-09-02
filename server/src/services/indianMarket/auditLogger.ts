/**
 * ═══════════════════════════════════════════════════════════════════
 *  Indian Derivatives Audit Logger & Explainability Service
 * ═══════════════════════════════════════════════════════════════════
 */

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType:
    | "SIGNAL_RECEIVED"
    | "SIGNAL_REJECTED"
    | "RISK_APPROVED"
    | "RISK_REJECTED"
    | "ORDER_CREATED"
    | "ORDER_SENT"
    | "ORDER_FILLED"
    | "ORDER_FAILED"
    | "SL_MODIFIED"
    | "TARGET_HIT"
    | "POSITION_CLOSED"
    | "DAILY_RISK_LOCK"
    | "PANIC_STOP_TRIGGERED";
  underlying?: string;
  strategy?: string;
  instrument?: string;
  strike?: number;
  direction?: string;
  details: Record<string, any>;
  reason?: string;
}

export class IndianAuditLogger {
  private static events: AuditEvent[] = [];
  private static MAX_EVENTS = 500;

  public static log(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
    const fullEvent: AuditEvent = {
      id: `EVT_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };

    this.events.unshift(fullEvent);
    if (this.events.length > this.MAX_EVENTS) {
      this.events.pop();
    }

    if (process.env.NODE_ENV !== "test") {
      const reasonSuffix = fullEvent.reason ? ` - ${fullEvent.reason}` : "";
      console.log(
        `📜 [INDIAN_AUDIT] [${fullEvent.eventType}] ${fullEvent.underlying || ""} ${fullEvent.strategy || ""}${reasonSuffix}`
      );
    }

    return fullEvent;
  }

  public static getRecentEvents(limit = 100): AuditEvent[] {
    return this.events.slice(0, Math.min(limit, this.events.length));
  }

  public static clear(): void {
    this.events = [];
  }
}
