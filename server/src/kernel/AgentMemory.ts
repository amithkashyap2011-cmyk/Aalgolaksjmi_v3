/**
 * ═══════════════════════════════════════════════════════════════════
 *  AQEA AGENT KERNEL — MEMORY SYSTEM
 * ═══════════════════════════════════════════════════════════════════
 * 4-Layer Memory: Working, Episodic, Semantic, Performance.
 * Uses bounded in-memory caching and non-blocking batch writes.
 */

import { IKernelDecision, ITradeExecutionPlan } from "./types.js";

export interface IEpisodicRecord {
  recordId: string;
  timestamp: number;
  symbol: string;
  decisionId: string;
  direction: string;
  confidence: number;
  realizedPnl?: number;
  status: "OPEN" | "CLOSED" | "EXPIRED";
  meta?: Record<string, any>;
}

export interface IModelPerformanceRecord {
  modelId: string;
  sampleCount: number;
  accuracy100: number;
  brierScore: number;
  avgLatencyMs: number;
  lastUpdated: number;
}

export class AgentMemory {
  private static instance: AgentMemory;

  // 1. Working Memory (Ephemeral per cycle)
  private workingMemory = new Map<string, any>();

  // 2. Episodic Memory (Recent decisions & outcomes)
  private episodicMemory: IEpisodicRecord[] = [];
  private readonly maxEpisodicRecords = 500;

  // 3. Semantic Memory (Stable domain knowledge)
  private semanticMemory = new Map<string, any>();

  // 4. Performance Memory (Model & agent metrics)
  private performanceMemory = new Map<string, IModelPerformanceRecord>();

  private constructor() {
    this.seedSemanticMemory();
  }

  public static getInstance(): AgentMemory {
    if (!AgentMemory.instance) {
      AgentMemory.instance = new AgentMemory();
    }
    return AgentMemory.instance;
  }

  private seedSemanticMemory(): void {
    this.semanticMemory.set("volatility_baseline:CRYPTO", { defaultAtr: 0.02, minAdx: 20 });
    this.semanticMemory.set("volatility_baseline:INDIAN_NSE", { defaultAtr: 0.012, minAdx: 18 });
    this.semanticMemory.set("volatility_baseline:INDIAN_FNO", { defaultAtr: 0.25, minAdx: 25 });
    this.semanticMemory.set("risk_limits", { maxDrawdown: 0.15, maxLeverage: 20, maxHeat: 0.40 });
  }

  // ── Working Memory ──
  public setWorking(key: string, value: any): void {
    this.workingMemory.set(key, value);
  }

  public getWorking<T = any>(key: string): T | undefined {
    return this.workingMemory.get(key);
  }

  public clearWorking(): void {
    this.workingMemory.clear();
  }

  // ── Episodic Memory ──
  public recordEpisode(record: Omit<IEpisodicRecord, "recordId">): void {
    const fullRecord: IEpisodicRecord = {
      recordId: `EP_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...record,
    };

    this.episodicMemory.unshift(fullRecord);
    if (this.episodicMemory.length > this.maxEpisodicRecords) {
      this.episodicMemory.length = this.maxEpisodicRecords;
    }
  }

  public getRecentEpisodes(symbol?: string, limit: number = 20): IEpisodicRecord[] {
    let list = this.episodicMemory;
    if (symbol) {
      list = list.filter((e) => e.symbol === symbol);
    }
    return list.slice(0, limit);
  }

  // ── Semantic Memory ──
  public setSemantic(key: string, value: any): void {
    this.semanticMemory.set(key, value);
  }

  public getSemantic<T = any>(key: string): T | undefined {
    return this.semanticMemory.get(key);
  }

  // ── Performance Memory ──
  public updateModelPerformance(modelId: string, isCorrect: boolean, latencyMs: number): void {
    const existing = this.performanceMemory.get(modelId) || {
      modelId,
      sampleCount: 0,
      accuracy100: 65.0,
      brierScore: 0.20,
      avgLatencyMs: latencyMs,
      lastUpdated: Date.now(),
    };

    const count = existing.sampleCount + 1;
    const score = isCorrect ? 100 : 0;
    const newAcc = existing.sampleCount === 0 ? score : Number((existing.accuracy100 * 0.95 + score * 0.05).toFixed(1));
    const newLatency = Number((existing.avgLatencyMs * 0.9 + latencyMs * 0.1).toFixed(1));

    this.performanceMemory.set(modelId, {
      modelId,
      sampleCount: count,
      accuracy100: newAcc,
      brierScore: existing.brierScore,
      avgLatencyMs: newLatency,
      lastUpdated: Date.now(),
    });
  }

  public getModelPerformance(modelId: string): IModelPerformanceRecord | undefined {
    return this.performanceMemory.get(modelId);
  }

  public getAllModelPerformance(): IModelPerformanceRecord[] {
    return Array.from(this.performanceMemory.values());
  }
}
