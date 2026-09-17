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
    | "PANIC_STOP_TRIGGERED"
    | "AUTOPILOT_MODE_CHANGED"
    | "TARGET_DETECTED"
    | "STOP_DETECTED"
    | "EXIT_INTENT_CREATED"
    | "EXIT_ORDER_SUBMITTED"
    | "EXIT_ORDER_ACKNOWLEDGED"
    | "EXIT_ORDER_REJECTED"
    | "EXIT_PARTIAL_FILL"
    | "EXIT_FILLED"
    | "POSITION_RECONCILED"
    | "BROKER_STATE_CHANGED"
    | "MARKET_DATA_STATE_CHANGED"
    | "PERSISTENCE_STATE_CHANGED"
    | "FINANCIAL_WRITE_FAILED"
    | "DEAD_LETTER_CAPTURED"
    | "POSITION_DISCREPANCY_DETECTED"
    | "RETRY_BLOCKED"
    | "RECONCILIATION_REQUIRED_ON_FAILURE"
    | "STARTUP_SESSION_RECOVERED"
    | (string & {});
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

  public static logEvent(event: { action?: string; eventType?: string; details?: Record<string, any>; reason?: string; [key: string]: any }): AuditEvent {
    return this.log({
      eventType: (event.eventType || event.action || "SYSTEM_EVENT") as any,
      details: event.details || {},
      reason: event.reason,
    });
  }

  public static getRecentEvents(limit = 100): AuditEvent[] {
    return this.events.slice(0, Math.min(limit, this.events.length));
  }

  public static clear(): void {
    this.events = [];
  }
}
