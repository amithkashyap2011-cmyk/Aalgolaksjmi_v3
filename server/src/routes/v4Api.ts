/*
 * ─── AAlgolakshmi V4 Institutional REST Router ───────────────────
 *
 * REST Endpoints:
 * POST /api/v4/meta-decision
 * GET  /api/v4/trade-quality
 * GET  /api/v4/portfolio-risk
 * GET  /api/v4/regime
 * GET  /api/v4/graph
 * GET  /api/v4/macro
 * GET  /api/v4/embeddings
 * GET  /api/v4/similarity
 */

import { Router } from "express";
import { MetaDecisionService } from "../services/v4/metaDecisionService.js";
import { MarketRegimeEngine } from "../services/v4/marketRegimeEngine.js";
import { PortfolioOptimizer } from "../services/v4/portfolioOptimizer.js";
import { GraphIntelligenceEngine } from "../services/v4/graphIntelligenceEngine.js";
import { MacroEngine } from "../services/v4/macroEngine.js";
import { EmbeddingService } from "../services/v4/embeddingService.js";
import { TradeQualityLog } from "../models/TradeQualityLog.js";

const router = Router();

// POST /api/v4/meta-decision
router.post("/meta-decision", async (req, res) => {
  try {
    const input = req.body;
    const result = await MetaDecisionService.makeMetaDecision({
      symbol: input.symbol || "BTCUSDT",
      consensusStrength: input.consensusStrength ?? 88,
      confidenceCalibration: input.confidenceCalibration ?? 85,
      historicalSimilarity: input.historicalSimilarity ?? 80,
      orderFlowScore: input.orderFlowScore ?? 82,
      volatilityScore: input.volatilityScore ?? 75,
      liquidityScore: input.liquidityScore ?? 90,
      correlationScore: input.correlationScore ?? 85,
      activeEquity: input.activeEquity ?? 40000,
      openPositionsNotional: input.openPositionsNotional ?? 4000,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v4/trade-quality
router.get("/trade-quality", async (_req, res) => {
  try {
    const logs = await TradeQualityLog.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v4/portfolio-risk
router.get("/portfolio-risk", (_req, res) => {
  try {
    const risk = PortfolioOptimizer.evaluateSystemicRisk(40000, 4000);
    res.json(risk);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v4/regime
router.get("/regime", (req, res) => {
  try {
    const symbol = (req.query.symbol as string) || "BTCUSDT";
    const regime = MarketRegimeEngine.classifyRegime(symbol);
    res.json(regime);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v4/graph
router.get("/graph", (_req, res) => {
  try {
    const graph = GraphIntelligenceEngine.getDynamicGraph();
    res.json(graph);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v4/macro
router.get("/macro", (_req, res) => {
  try {
    const events = MacroEngine.getActiveMacroEvents();
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v4/embeddings
router.get("/embeddings", (req, res) => {
  try {
    const symbol = (req.query.symbol as string) || "BTCUSDT";
    const emb = EmbeddingService.generateEmbedding(symbol);
    res.json(emb);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import { TradeSimilarityEngine } from "../services/v4/tradeSimilarityEngine.js";
import { ExecutionAIEngine } from "../services/v4/executionAIEngine.js";

// GET /api/v4/similarity
router.get("/similarity", (_req, res) => {
  try {
    const sim = TradeSimilarityEngine.evaluateSimilarity({ adx: 25, rsi: 55, vdi: 0.15, obi: 0.20, volatilityRatio: 1.0 });
    res.json(sim);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v4/similarity/evaluate
router.post("/similarity/evaluate", (req, res) => {
  try {
    const input = req.body || { adx: 25, rsi: 55, vdi: 0.15, obi: 0.20, volatilityRatio: 1.0 };
    const sim = TradeSimilarityEngine.evaluateSimilarity(input);
    res.json(sim);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v4/execution/predict
router.post("/execution/predict", (req, res) => {
  try {
    const input = req.body || { symbol: "BTCUSDT", side: "BUY", quantity: 0.5, requestedPrice: 65000, volatilityRatio: 1.0 };
    const pred = ExecutionAIEngine.predictExecutionQuality(input);
    res.json(pred);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
