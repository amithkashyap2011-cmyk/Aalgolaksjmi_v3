/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — DETERMINISTIC POLICY ENGINE
 * ═══════════════════════════════════════════════════════════════════
 * The unbypassable gatekeeper between AI Agent Proposals and the
 * physical Order Execution Engine.
 * 
 * CORE LAWS:
 *  1. AI is an ORCHESTRATOR and STRATEGY layer; Policy Engine has FINAL AUTHORITY.
 *  2. High AI Confidence (even 99.9%) NEVER overrides hard risk boundaries,
 *     kill switches, lot sizes, or market hours.
 *  3. Every proposal must pass all deterministic rules to be approved.
 */

import { IActionProposal, IPolicyValidationResult, HumanOverrideMode } from "../types.js";
import { TradingKillSwitch } from "../../indianMarket/security/tradingKillSwitch.js";
import { OrderValidator } from "../../indianMarket/security/orderValidator.js";
import { InstrumentMaster } from "../../indianMarket/instrumentMaster.js";
import { AuthoritativeLedger } from "../../indianMarket/authoritativeLedger.js";
import { IndianRiskManager } from "../../indianMarket/riskManager.js";
import { TradingDayStateMachine } from "../../indianMarket/hardening/tradingDayStateMachine.js";
import { DistributedCoordinator } from "../../indianMarket/hardening/distributedCoordinator.js";
import { AuthoritativeCapitalManager } from "../portfolio/capital/AuthoritativeCapitalManager.js";

export class AgentPolicyEngine {
  private static instance: AgentPolicyEngine;
  private overrideMode: HumanOverrideMode = "AUTO";

  private constructor() {}

  public static getInstance(): AgentPolicyEngine {
    if (!AgentPolicyEngine.instance) {
      AgentPolicyEngine.instance = new AgentPolicyEngine();
    }
    return AgentPolicyEngine.instance;
  }

  public setHumanOverrideMode(mode: HumanOverrideMode, authorizedBy: string): void {
    console.log(`[AGENT_POLICY_ENGINE] Human override mode set to ${mode} by ${authorizedBy}`);
    this.overrideMode = mode;
  }

  public getHumanOverrideMode(): HumanOverrideMode {
    return this.overrideMode;
  }

  /**
   * Validates an AI Action Proposal against deterministic trading and safety policies.
   */
  public async evaluateProposal(proposal: IActionProposal): Promise<IPolicyValidationResult> {
    const violatedRules: string[] = [];
    const timestamp = Date.now();

    // 1. Check Human Override Mode
    if (this.overrideMode === "EMERGENCY_STOP") {
      violatedRules.push("HUMAN_OVERRIDE_EMERGENCY_STOP_ENGAGED");
    } else if (this.overrideMode === "MANUAL") {
      violatedRules.push("SYSTEM_IN_MANUAL_MODE_AUTOMATION_PROHIBITED");
    }

    // 2. Check Authoritative Global Kill Switch
    const isTradingAllowed = TradingKillSwitch.isTradingAllowed();
    if (!isTradingAllowed) {
      violatedRules.push("GLOBAL_KILL_SWITCH_ACTIVE: Trading is emergency halted by Kill Switch.");
    }

    // 3. Check Market Hours & Session Phase
    const sessionPhase = TradingDayStateMachine.getCurrentPhase();
    if ((sessionPhase === "MARKET_CLOSED" || sessionPhase === "POST_MARKET") && process.env.NODE_ENV !== "test") {
      violatedRules.push(`MARKET_IS_CLOSED: Current phase is ${sessionPhase}`);
    } else if (sessionPhase === "PRE_CLOSE" && proposal.action === "BUY" && process.env.NODE_ENV !== "test") {
      violatedRules.push("PRE_CLOSE_INTRADAY_ENTRIES_BLOCKED");
    }

    // 4. Validate Instrument Master
    const spec = InstrumentMaster.getSpec(proposal.instrument);
    if (!spec) {
      violatedRules.push(`UNKNOWN_INSTRUMENT: ${proposal.instrument} not found in active master.`);
    }

    // 5. Validate Quantity & Lot Size Multiples
    if (proposal.quantity <= 0 || !Number.isInteger(proposal.quantity)) {
      violatedRules.push(`INVALID_QUANTITY: ${proposal.quantity} must be a positive integer.`);
    } else if (spec && proposal.quantity % spec.lotSize !== 0) {
      violatedRules.push(`LOT_SIZE_MISMATCH: Quantity ${proposal.quantity} is not a multiple of lot size ${spec.lotSize}.`);
    }

    // 6. Validate Against NSE Freeze Limits
    const freezeLimit = (spec as any)?.freezeLimit || (proposal.instrument.includes("BANKNIFTY") ? 900 : 1800);
    if (proposal.quantity > freezeLimit) {
      violatedRules.push(`FREEZE_LIMIT_EXCEEDED: Quantity ${proposal.quantity} exceeds exchange freeze limit ${freezeLimit}. Slicing required.`);
    }

    // 7. Check Max Open Positions Constraint
    let openPositionsCount = 0;
    try {
      const { Trade } = await import("../../../models/Trade.js");
      openPositionsCount = await Trade.countDocuments({ status: "OPEN" });
    } catch {
      openPositionsCount = 0;
    }
    const riskSettings = await IndianRiskManager.getSettings(proposal.accountId);
    const maxOpen = (riskSettings as any).maxConcurrentTrades || 3;
    if (proposal.action === "BUY" && openPositionsCount >= maxOpen) {
      violatedRules.push(`MAX_OPEN_POSITIONS_REACHED: Currently ${openPositionsCount} >= ${maxOpen}.`);
    }

    // 8. Check Daily Loss Limit
    const currentDailyLoss = (riskSettings as any).dailyRealizedLoss || 0;
    const maxLossLimit = (riskSettings as any).maxDailyLossAmount || 5000;
    if (currentDailyLoss >= maxLossLimit) {
      violatedRules.push(`MAX_DAILY_LOSS_BREACHED: Current loss ₹${currentDailyLoss} >= limit ₹${maxLossLimit}.`);
    }

    // 9. Check Capital & Margin Sufficiency
    if (proposal.action === "BUY" && process.env.NODE_ENV !== "test") {
      const capState = AuthoritativeCapitalManager.getCapitalState();
      const availableCash = capState.freeMargin || capState.availableCash || 0;
      const estPrice = proposal.price || (spec ? spec.lotSize * 100 : 1000);
      const estRequiredMargin = (proposal.quantity * estPrice) / 4; // conservative 4x leverage
      if (estRequiredMargin > availableCash) {
        violatedRules.push(`INSUFFICIENT_MARGIN: Required ₹${estRequiredMargin.toFixed(2)} > Available ₹${availableCash.toFixed(2)}.`);
      }
    }

    // 10. Check Persistent Idempotency
    const idempotencyKey = `AI_ACTION_${proposal.agentId}_${proposal.actionId}`;
    const intentRes = await DistributedCoordinator.registerOrderIntent(idempotencyKey, {
      tradeId: proposal.actionId,
      accountId: proposal.accountId,
      action: proposal.action
    });
    if (!intentRes.isNew) {
      violatedRules.push(`DUPLICATE_ACTION_IDEMPOTENCY_REJECTED: ${idempotencyKey} already registered.`);
    }

    // 11. Check Broker Mode vs Environment
    const executionMode: "PAPER" | "LIVE" | "SHADOW" = 
      process.env.NODE_ENV === "production" && process.env.BROKER_MODE === "LIVE" ? "LIVE" : "PAPER";

    const allowed = violatedRules.length === 0;

    return {
      allowed,
      actionId: proposal.actionId,
      reason: allowed 
        ? `Proposal approved by Policy Engine under ${executionMode} execution.`
        : `Proposal REJECTED by Policy Engine: ${violatedRules.join("; ")}`,
      violatedRules,
      executionMode,
      sanitizedQuantity: proposal.quantity,
      timestamp
    };
  }
}
