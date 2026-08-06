/*
 * ─── AAlgolakshmi V5.1 Institutional REST Router ───────────────────
 *
 * REST Endpoints:
 * GET  /api/v5_1/research
 * POST /api/v5_1/research/experiment
 * GET  /api/v5_1/benchmarks
 * POST /api/v5_1/monte-carlo
 * POST /api/v5_1/allocation
 * GET  /api/v5_1/leaderboards
 * GET  /api/v5_1/reports
 */

import { Router } from "express";
import { ResearchEngineService } from "../services/v5_1/researchEngineService.js";
import { BenchmarkEngine } from "../services/v5_1/benchmarkEngine.js";
import { MonteCarloEngine } from "../services/v5_1/monteCarloEngine.js";
import { CapitalAllocationOptimizer } from "../services/v5_1/capitalAllocationOptimizer.js";
import { ResearchExperiment } from "../models/ResearchExperiment.js";

const router = Router();

// GET /api/v5_1/research
router.get("/research", async (_req, res) => {
  try {
    const experiments = await ResearchExperiment.find().sort({ createdAt: -1 }).lean();
    res.json(experiments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v5_1/research/experiment
router.post("/research/experiment", async (req, res) => {
  try {
    const doc = await ResearchEngineService.logExperiment(req.body);
    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v5_1/benchmarks
router.get("/benchmarks", (_req, res) => {
  try {
    const benchmarks = BenchmarkEngine.getBenchmarkComparison();
    res.json(benchmarks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v5_1/monte-carlo
router.post("/monte-carlo", (req, res) => {
  try {
    const iterations = req.body.iterations || 1000;
    const sim = MonteCarloEngine.runSimulation([], iterations);
    res.json(sim);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v5_1/allocation
router.post("/allocation", (req, res) => {
  try {
    const strategies = req.body.strategies || [
      { strategyId: "STRAT_TREND_FOLLOWING", strategyName: "Trend Following", expectedEdgeR: 0.94, healthScore: 90, sharpeRatio: 2.15, maxDrawdownPct: 3.5, volatilityRatio: 1.0 },
      { strategyId: "STRAT_MEAN_REVERSION", strategyName: "Mean Reversion", expectedEdgeR: 0.82, healthScore: 85, sharpeRatio: 1.85, maxDrawdownPct: 4.0, volatilityRatio: 1.1 },
      { strategyId: "STRAT_BREAKOUT", strategyName: "Breakout", expectedEdgeR: 0.78, healthScore: 80, sharpeRatio: 1.70, maxDrawdownPct: 4.8, volatilityRatio: 1.2 },
    ];
    const totalCapital = req.body.totalCapital || 10000;
    const alloc = CapitalAllocationOptimizer.calculateDynamicAllocation(strategies, totalCapital);
    res.json(alloc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v5_1/leaderboards
router.get("/leaderboards", (_req, res) => {
  try {
    const benchmarks = BenchmarkEngine.getBenchmarkComparison();
    res.json(benchmarks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v5_1/reports
router.get("/reports", (_req, res) => {
  try {
    res.json({ title: "Institutional V5.1 Research Report", status: "GENERATED", date: new Date() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
