/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — OPERATIONS AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Specialization: System health monitoring, broker gateway connectivity,
 * database latency, market data stream integrity, and recovery workflows.
 * 
 * Strict Constraint: READ + SAFE OPERATIONAL ACTIONS.
 */

import { BaseAgent } from "./BaseAgent.js";
import { IStructuredAgentDecision, IAgentEvent, IAgentContextSnapshot } from "../types.js";

export class OperationsAgent extends BaseAgent {
  constructor() {
    super("OperationsAgent", "Specialist Systems & Operations Agent", "OPERATIONS_AGENT", "READ_SAFE_OPERATIONS");
  }

  protected async evaluate(event: IAgentEvent, context: IAgentContextSnapshot): Promise<IStructuredAgentDecision> {
    const isBrokerDown = !context.systemHealth.brokerConnected;
    const isFeedStale = !context.systemHealth.marketDataFresh;
    const isDbUnhealthy = !context.systemHealth.databaseHealthy;

    if (isBrokerDown || isFeedStale || isDbUnhealthy) {
      const issues: string[] = [];
      if (isBrokerDown) issues.push("BROKER_DISCONNECTED");
      if (isFeedStale) issues.push("MARKET_DATA_STALE");
      if (isDbUnhealthy) issues.push("DATABASE_UNHEALTHY");

      return {
        decision: "PAUSE",
        confidence: 1.0,
        rationale: `Critical infrastructure alert: ${issues.join(", ")}. Operations agent triggers immediate Auto-Pilot pause.`,
        proposed_quantity: 0,
        risk_assessment: "INFRASTRUCTURE_FAILURE_CRITICAL",
        required_tools: ["pause_autopilot"],
        blockingReason: issues.join(";")
      };
    }

    return {
      decision: "HOLD",
      confidence: 0.98,
      rationale: "All core operations nominal: Broker CONNECTED, Market Data FRESH, Database HEALTHY.",
      proposed_quantity: 0,
      risk_assessment: "OPERATIONAL_METRICS_HEALTHY",
      required_tools: []
    };
  }
}
