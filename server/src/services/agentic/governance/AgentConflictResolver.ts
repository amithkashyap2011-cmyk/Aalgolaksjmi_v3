/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — DETERMINISTIC CONFLICT RESOLVER
 * ═══════════════════════════════════════════════════════════════════
 * Resolves disagreements between multiple specialized agents according to
 * the authoritative safety priority hierarchy:
 * 
 *  LEVEL 0: EMERGENCY_STOP        (Immediate halt of all autonomous trading)
 *  LEVEL 1: HARD_RISK_LIMIT       (Daily loss, max position size, max lots)
 *  LEVEL 2: BROKER_SAFETY         (Broker disconnect, reconciliation failure)
 *  LEVEL 3: POSITION_PROTECTION   (Stop-loss, target hit, trailing SL)
 *  LEVEL 4: PORTFOLIO_RISK        (Sector concentration, portfolio heat veto)
 *  LEVEL 5: POLICY_ENGINE         (Trading hours, lot size multiples, freeze limit)
 *  LEVEL 6: STRATEGY_SIGNAL       (Quantitative entry/exit proposals)
 *  LEVEL 7: AI_OPTIMIZATION       (Order slicing, execution timing)
 * 
 * LAW: Lower numeric levels unconditionally override higher numeric levels.
 * Model confidence (even 99.9%) NEVER shifts an action to a higher priority.
 */

import { ConflictPriorityLevel, IActionProposal, IStructuredAgentDecision } from "../types.js";

export interface IAgentRecommendation {
  sourceRole: "EMERGENCY_STOP" | "RISK_AGENT" | "POSITION_AGENT" | "PORTFOLIO_AGENT" | "STRATEGY_AGENT" | "EXECUTION_AGENT";
  action: "BUY" | "SELL" | "EXIT" | "HOLD" | "VETO" | "EMERGENCY_HALT";
  priority: ConflictPriorityLevel;
  confidence: number;
  reason: string;
}

export interface IResolvedDecision {
  finalAction: "BUY" | "SELL" | "EXIT" | "HOLD" | "REJECT" | "EMERGENCY_HALT";
  winningPriority: ConflictPriorityLevel;
  decidingSource: string;
  rejectionReason?: string;
  wasConflictResolved: boolean;
  allInputs: IAgentRecommendation[];
}

export class AgentConflictResolver {
  private static instance: AgentConflictResolver;

  private constructor() {}

  public static getInstance(): AgentConflictResolver {
    if (!AgentConflictResolver.instance) {
      AgentConflictResolver.instance = new AgentConflictResolver();
    }
    return AgentConflictResolver.instance;
  }

  /**
   * Resolves conflicts between a set of multi-agent recommendations.
   * Lowest numeric priority level strictly wins.
   */
  public resolveConflicts(recommendations: IAgentRecommendation[]): IResolvedDecision {
    if (recommendations.length === 0) {
      return {
        finalAction: "HOLD",
        winningPriority: ConflictPriorityLevel.LEVEL_7_AI_OPTIMIZATION,
        decidingSource: "DEFAULT_FALLBACK",
        wasConflictResolved: false,
        allInputs: []
      };
    }

    // Sort strictly by priority level (ascending numeric value = higher authority)
    const sorted = [...recommendations].sort((a, b) => a.priority - b.priority);
    const highestAuthority = sorted[0];

    // Check if there was actual conflict among participants
    const distinctActions = new Set(recommendations.map(r => r.action));
    const wasConflictResolved = distinctActions.size > 1;

    // Interpret resulting action
    let finalAction: "BUY" | "SELL" | "EXIT" | "HOLD" | "REJECT" | "EMERGENCY_HALT" = "HOLD";
    let rejectionReason: string | undefined;

    if (highestAuthority.action === "EMERGENCY_HALT") {
      finalAction = "EMERGENCY_HALT";
      rejectionReason = highestAuthority.reason;
    } else if (highestAuthority.action === "VETO") {
      finalAction = "REJECT";
      rejectionReason = highestAuthority.reason;
    } else if (highestAuthority.action === "EXIT") {
      finalAction = "EXIT";
    } else if (highestAuthority.action === "BUY" || highestAuthority.action === "SELL") {
      finalAction = highestAuthority.action;
    } else {
      finalAction = "HOLD";
    }

    if (wasConflictResolved) {
      console.log(
        `[CONFLICT_RESOLVER] Resolved conflict: DecidingSource=${highestAuthority.sourceRole} Action=${finalAction} PriorityLevel=${highestAuthority.priority}`
      );
    }

    return {
      finalAction,
      winningPriority: highestAuthority.priority,
      decidingSource: highestAuthority.sourceRole,
      rejectionReason,
      wasConflictResolved,
      allInputs: recommendations
    };
  }

  /**
   * Resolves a standard pairing: Strategy Proposal vs Risk Agent Veto
   */
  public evaluateStrategyAgainstRisk(
    strategyDecision: IStructuredAgentDecision,
    riskVeto: { vetoed: boolean; reason?: string }
  ): { allowed: boolean; effectiveAction: "BUY" | "SELL" | "EXIT" | "HOLD" | "REJECT"; reason: string } {
    const recommendations: IAgentRecommendation[] = [];

    // Strategy recommendation (Level 6)
    recommendations.push({
      sourceRole: "STRATEGY_AGENT",
      action: strategyDecision.decision === "EXIT" ? "EXIT" : strategyDecision.decision === "BUY" ? "BUY" : "HOLD",
      priority: ConflictPriorityLevel.LEVEL_6_STRATEGY_SIGNAL,
      confidence: strategyDecision.confidence,
      reason: strategyDecision.rationale
    });

    // Risk recommendation (Level 1 / 4)
    if (riskVeto.vetoed) {
      recommendations.push({
        sourceRole: "RISK_AGENT",
        action: "VETO",
        priority: ConflictPriorityLevel.LEVEL_1_HARD_RISK_LIMIT,
        confidence: 1.0,
        reason: riskVeto.reason || "Risk agent veto triggered"
      });
    }

    const resolved = this.resolveConflicts(recommendations);
    const effectiveAction: "BUY" | "SELL" | "EXIT" | "HOLD" | "REJECT" =
      resolved.finalAction === "EMERGENCY_HALT" ? "REJECT" : resolved.finalAction;
    return {
      allowed: resolved.finalAction !== "REJECT" && resolved.finalAction !== "EMERGENCY_HALT",
      effectiveAction,
      reason: resolved.rejectionReason || strategyDecision.rationale
    };
  }
}
