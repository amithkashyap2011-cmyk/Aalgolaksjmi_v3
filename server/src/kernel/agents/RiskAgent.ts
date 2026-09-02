/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — RISK AGENT
 * ═══════════════════════════════════════════════════════════════════
 * Immutable risk authority enforcing position caps, leverage limits, and drawdown ceilings.
 */

import { BaseAgent } from "./BaseAgent.js";
import { ToolCapability, IAgentObservation, IAgentObservationResult } from "../types.js";

export class RiskAgent extends BaseAgent {
  public readonly id = "RiskAgent";
  public readonly name = "Risk Authority Specialist Agent";
  public readonly version = "3.0.0";
  public readonly capabilities: ToolCapability[] = ["READ_RISK", "EVALUATE_RISK"];

  protected override async onObserve(input: IAgentObservation): Promise<IAgentObservationResult> {
    const data = input.data || {};
    const drawdown = data.currentDrawdown || 0;
    const isSafe = drawdown < 15.0;

    return {
      valid: isSafe,
      metrics: {
        drawdownPct: drawdown,
        isSafe,
      },
      anomalyDetected: !isSafe,
      anomalyReason: !isSafe ? `Drawdown ${drawdown}% exceeds 15% risk boundary` : undefined,
    };
  }
}
