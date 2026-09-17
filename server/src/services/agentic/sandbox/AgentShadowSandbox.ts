/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — SHADOW SANDBOX & STRATEGY EVALUATION
 * ═══════════════════════════════════════════════════════════════════
 * Allows AI agents to observe live market ticks, generate prospective
 * trade proposals, and record shadow performance WITHOUT sending real
 * or paper orders to any execution broker.
 */

import { IActionProposal, IShadowComparisonRecord } from "../types.js";
import { resolveLivePriceForIndianTrade } from "../../indianMarket/indianPricing.js";

export class AgentShadowSandbox {
  private static instance: AgentShadowSandbox;
  private shadowRecords: IShadowComparisonRecord[] = [];
  private readonly MAX_RECORDS = 500;

  private constructor() {}

  public static getInstance(): AgentShadowSandbox {
    if (!AgentShadowSandbox.instance) {
      AgentShadowSandbox.instance = new AgentShadowSandbox();
    }
    return AgentShadowSandbox.instance;
  }

  /**
   * Records a prospective AI proposal in shadow mode alongside baseline strategy action.
   */
  public recordShadowDecision(
    proposal: IActionProposal,
    baselineSignal: string = "HOLD",
    baselineAction: string = "NO_ACTION"
  ): IShadowComparisonRecord {
    const entryPrice = proposal.price || resolveLivePriceForIndianTrade({ symbol: proposal.instrument } as any);

    const record: IShadowComparisonRecord = {
      shadowId: `SHADOW_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      symbol: proposal.instrument,
      aiProposal: proposal,
      deterministicBaseline: {
        signal: baselineSignal,
        actionTaken: baselineAction
      },
      actualMarketOutcome: {
        priceAfter1m: entryPrice * 1.002, // Initial mock tracking
        priceAfter5m: entryPrice * 1.005,
        simulatedPnL: (proposal.quantity * entryPrice * 0.005)
      }
    };

    if (this.shadowRecords.length >= this.MAX_RECORDS) {
      this.shadowRecords.shift();
    }
    this.shadowRecords.push(record);
    return record;
  }

  public getShadowPerformanceSummary(): {
    totalShadowDecisions: number;
    simulatedTotalPnL: number;
    winRate: number;
  } {
    let winCount = 0;
    let totalPnL = 0;

    for (const record of this.shadowRecords) {
      const pnl = record.actualMarketOutcome?.simulatedPnL || 0;
      totalPnL += pnl;
      if (pnl > 0) winCount++;
    }

    return {
      totalShadowDecisions: this.shadowRecords.length,
      simulatedTotalPnL: Number(totalPnL.toFixed(2)),
      winRate: this.shadowRecords.length > 0 ? Number((winCount / this.shadowRecords.length).toFixed(2)) : 0
    };
  }

  public getRecentShadowRecords(limit: number = 20): IShadowComparisonRecord[] {
    return this.shadowRecords.slice(-limit);
  }

  public clear(): void {
    this.shadowRecords = [];
  }
}
