/**
 * ═══════════════════════════════════════════════════════════════════
 *  AALGOLAKSHMI AGENTIC AI — MULTI-TIER AGENT MEMORY
 * ═══════════════════════════════════════════════════════════════════
 * Bounded multi-tier memory architecture preventing memory leaks and
 * context bloat.
 * 
 * Tiers:
 *  1. Short-Term: Transient session observations (bounded circular buffer)
 *  2. Trading Context: Active positions, pending orders, and margin
 *  3. Strategy Memory: Strategy observations and scorecard
 *  4. Long-Term Knowledge: Static validated exchange specs & rules
 */

import { IAgentContextSnapshot } from "../types.js";

export class AgentMemory {
  private static instance: AgentMemory;

  // Bounded Circular Buffers
  private shortTermObservations: Array<{ timestamp: number; summary: string }> = [];
  private readonly MAX_SHORT_TERM = 50;

  private strategyObservations: Map<string, { winRate: number; sampleSize: number; notes: string[] }> = new Map();

  // Long-Term Knowledge (Immutable rules)
  private longTermKnowledge: Map<string, any> = new Map();

  private constructor() {
    this.seedLongTermKnowledge();
  }

  public static getInstance(): AgentMemory {
    if (!AgentMemory.instance) {
      AgentMemory.instance = new AgentMemory();
    }
    return AgentMemory.instance;
  }

  private seedLongTermKnowledge(): void {
    this.longTermKnowledge.set("EXCHANGE_RULES", {
      NSE_MARKET_OPEN: "09:15",
      NSE_MARKET_CLOSE: "15:30",
      INTRADAY_SQUARE_OFF_WINDOW: "15:15",
      NIFTY_FREEZE_LIMIT: 1800,
      BANKNIFTY_FREEZE_LIMIT: 900,
      FINNIFTY_FREEZE_LIMIT: 1800,
    });
    this.longTermKnowledge.set("MAX_ALLOWED_CONCURRENT_POSITIONS", 3);
    this.longTermKnowledge.set("CAPITAL_CONCENTRATION_CAP_PERCENT", 40);
  }

  public recordObservation(summary: string): void {
    if (this.shortTermObservations.length >= this.MAX_SHORT_TERM) {
      this.shortTermObservations.shift();
    }
    this.shortTermObservations.push({ timestamp: Date.now(), summary });
  }

  public getRecentObservations(limit: number = 5): Array<{ timestamp: number; summary: string }> {
    return this.shortTermObservations.slice(-limit);
  }

  public recordStrategyObservation(strategyId: string, won: boolean, note?: string): void {
    const current = this.strategyObservations.get(strategyId) || { winRate: 0.5, sampleSize: 0, notes: [] };
    const wins = current.winRate * current.sampleSize + (won ? 1 : 0);
    current.sampleSize++;
    current.winRate = wins / current.sampleSize;
    if (note) {
      if (current.notes.length >= 20) current.notes.shift();
      current.notes.push(note);
    }
    this.strategyObservations.set(strategyId, current);
  }

  public getStrategyScorecard(strategyId: string) {
    return this.strategyObservations.get(strategyId) || { winRate: 0.5, sampleSize: 0, notes: [] };
  }

  public getLongTermRule<T = any>(key: string): T {
    return this.longTermKnowledge.get(key);
  }

  public clearShortTermMemory(): void {
    this.shortTermObservations = [];
  }

  public pruneExpiredObservations(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    this.shortTermObservations = this.shortTermObservations.filter(
      (obs) => now - obs.timestamp < maxAgeMs
    );
  }
}
