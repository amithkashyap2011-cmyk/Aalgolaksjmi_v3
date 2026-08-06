import { EnvironmentAuthority } from "../aqea/environmentAuthority.js";

/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Knowledge System
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  TradeMemory,
  MarketEventMemory,
  AgentContext,
} from "./types.js";

export class KnowledgeSystem {
  private static instance: KnowledgeSystem;
  private chromaUrl = EnvironmentAuthority.getServiceUrl("chroma", 8000);
  private inMemoryCache: TradeMemory[] = [];
  private eventHistory: MarketEventMemory[] = [];

  private constructor() {}

  public static getInstance(): KnowledgeSystem {
    if (!KnowledgeSystem.instance) {
      KnowledgeSystem.instance = new KnowledgeSystem();
    }
    return KnowledgeSystem.instance;
  }

  /**
   * Stores a completed trade's indicators and outcomes in the vector memory
   */
  public async storeTradeMemory(memory: TradeMemory): Promise<void> {
    try {
      // 1. Save in memory cache for Phase 1
      this.inMemoryCache.push(memory);
      if (this.inMemoryCache.length > 200) {
        this.inMemoryCache.shift();
      }

      // Generate mock embedding if not provided (Phase 1 CPU proxy)
      if (!memory.embedding) {
        memory.embedding = this.mockGenerateEmbedding(memory.entryContext);
      }

      // 2. Post to ChromaDB REST API (graceful degrade if offline)
      const res = await fetch(`${this.chromaUrl}/api/v1/collections/trade_memories/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [memory.tradeId],
          embeddings: [memory.embedding],
          metadatas: [{
            symbol: memory.symbol,
            action: memory.action,
            outcome: memory.outcome,
            pnlPct: memory.pnlPct,
            regime: memory.regime,
            timestamp: memory.timestamp
          }],
          documents: [JSON.stringify(memory)]
        })
      }).catch(() => null);

      if (res && res.ok) {
        console.log(`[KnowledgeSystem] Successfully stored trade memory ${memory.tradeId} in ChromaDB.`);
      } else {
        console.log(`[KnowledgeSystem] ChromaDB offline. Stored trade memory ${memory.tradeId} in local hot memory.`);
      }
    } catch (err: any) {
      console.warn(`[KnowledgeSystem] Error storing trade memory: ${err.message}`);
    }
  }

  /**
   * Stores an observed market event in vector memory
   */
  public async storeEventMemory(event: MarketEventMemory): Promise<void> {
    try {
      this.eventHistory.push(event);
      if (this.eventHistory.length > 100) {
        this.eventHistory.shift();
      }

      const embedding = event.embedding || Array.from({ length: 30 }, () => Math.random());
      
      const res = await fetch(`${this.chromaUrl}/api/v1/collections/market_events/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [event.eventId],
          embeddings: [embedding],
          metadatas: [{
            type: event.type,
            impact: event.impact,
            timestamp: event.timestamp
          }],
          documents: [event.description]
        })
      }).catch(() => null);

      if (res && res.ok) {
        console.log(`[KnowledgeSystem] Stored event ${event.eventId} in ChromaDB.`);
      }
    } catch (err: any) {
      console.warn(`[KnowledgeSystem] Error storing event: ${err.message}`);
    }
  }

  /**
   * Retrieves similar historical trade setups using cosine similarity on embeddings
   */
  public async retrieveSimilarSetups(
    currentContext: AgentContext,
    limit: number = 3
  ): Promise<TradeMemory[]> {
    try {
      const targetEmbedding = this.mockGenerateEmbedding(currentContext);

      // Try ChromaDB query first
      const res = await fetch(`${this.chromaUrl}/api/v1/collections/trade_memories/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query_embeddings: [targetEmbedding],
          n_results: limit
        })
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json() as any;
        if (data && data.documents && data.documents[0]) {
          return data.documents[0].map((doc: string) => JSON.parse(doc) as TradeMemory);
        }
      }

      // Fallback: local in-memory cosine similarity search
      if (this.inMemoryCache.length === 0) {
        return [];
      }

      const matches = this.inMemoryCache
        .map(mem => {
          const sim = this.cosineSimilarity(targetEmbedding, mem.embedding || []);
          return { mem, sim };
        })
        .sort((a, b) => b.sim - a.sim)
        .slice(0, limit)
        .map(x => x.mem);

      return matches;
    } catch (err: any) {
      console.warn(`[KnowledgeSystem] Error querying similar setups: ${err.message}`);
      return [];
    }
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0.0;
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0.0 || normB === 0.0) return 0.0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Generates a 30-dimensional state embedding from an AgentContext (Phase 1 proxy)
   */
  private mockGenerateEmbedding(ctx: AgentContext): number[] {
    const embedding: number[] = [];
    
    // Fill first 5: normalized returns
    const bars = ctx.bars;
    for (let i = 1; i <= 5; i++) {
      if (bars.length >= i + 1) {
        const prev = bars[bars.length - (i + 1)].close;
        const curr = bars[bars.length - i].close;
        embedding.push(prev > 0 ? (curr - prev) / prev : 0.0);
      } else {
        embedding.push(0.0);
      }
    }

    // Next 3: indicators (RSI, Volatility)
    embedding.push((ctx.indicators.rsi14 ?? 50) / 100);
    embedding.push(ctx.indicators.macdHist ? Math.tanh(ctx.indicators.macdHist) : 0.0);
    embedding.push(ctx.indicators.volumeRatio ? Math.min(1.0, ctx.indicators.volumeRatio / 3) : 0.5);

    // Fill remaining dimensions to hit 30
    while (embedding.length < 30) {
      embedding.push(Math.sin(embedding.length * 0.5) * 0.1);
    }

    return embedding;
  }
}
