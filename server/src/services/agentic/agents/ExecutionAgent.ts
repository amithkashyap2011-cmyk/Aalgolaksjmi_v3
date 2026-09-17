/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — EXECUTION AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Specialization: Execution method selection (MARKET vs LIMIT), order
 * type determination, execution timing, and order slicing for
 * quantities exceeding exchange freeze limits.
 * 
 * Strict Constraint: PROPOSE EXECUTION. Must operate through the
 * deterministic Order Engine and Policy Engine.
 */

import { BaseAgent } from "./BaseAgent.js";
import { IStructuredAgentDecision, IAgentEvent, IAgentContextSnapshot } from "../types.js";
import { InstrumentMaster } from "../../indianMarket/instrumentMaster.js";

export class ExecutionAgent extends BaseAgent {
  constructor() {
    super("ExecutionAgent", "Specialist Order Execution & Slicing Agent", "EXECUTION_AGENT", "PROPOSE_EXECUTION");
  }

  protected async evaluate(event: IAgentEvent, context: IAgentContextSnapshot): Promise<IStructuredAgentDecision> {
    const symbol = event.symbol || context.marketContext.symbol || "NIFTY";
    const spec = InstrumentMaster.getSpec(symbol);

    const freezeLimit = (spec as any)?.freezeLimit || (symbol.includes("BANKNIFTY") ? 900 : 1800);
    return {
      decision: "HOLD",
      confidence: 0.9,
      rationale: `Execution engine ready for ${symbol}. Max single-order freeze limit: ${freezeLimit} units. Tick size: ${spec?.tickSize || 0.05}.`,
      proposed_quantity: 0,
      risk_assessment: "EXECUTION_ROUTING_NORMAL",
      required_tools: ["get_market_data"]
    };
  }

  /**
   * Slices order quantities exceeding exchange freeze limits into compliant sub-orders.
   * e.g., 3,600 units NIFTY (freeze limit 1,800) -> [1,800, 1,800].
   */
  public sliceOrderQuantity(symbol: string, totalQuantity: number): number[] {
    const spec = InstrumentMaster.getSpec(symbol);
    const freezeLimit = (spec as any)?.freezeLimit || (symbol.includes("BANKNIFTY") ? 900 : 1800);
    const lotSize = spec?.lotSize || 1;

    if (totalQuantity <= freezeLimit) {
      return [totalQuantity];
    }

    const slices: number[] = [];
    let remaining = totalQuantity;

    while (remaining > 0) {
      const slice = Math.min(remaining, freezeLimit);
      // Ensure each slice is an exact multiple of lot size
      const compliantSlice = Math.floor(slice / lotSize) * lotSize;
      if (compliantSlice <= 0) break;
      slices.push(compliantSlice);
      remaining -= compliantSlice;
    }

    return slices;
  }
}
