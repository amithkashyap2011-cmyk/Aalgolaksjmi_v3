/*
 * ─── Institutional Roadmap REST Router (Phases 23–35) ────────
 *
 * REST Endpoints:
 * GET /api/institutional/roadmap
 * GET /api/institutional/certification
 */

import { Router } from "express";
import { PortfolioOptimizationEngine } from "../services/institutionalRoadmap/portfolioOptimizationEngine.js";
import { MicrostructureEngine } from "../services/institutionalRoadmap/microstructureEngine.js";
import { SystemMonitoringEngine } from "../services/institutionalRoadmap/systemMonitoringEngine.js";
import { ProductionOpsManager } from "../services/institutionalRoadmap/productionOpsManager.js";
import { InstitutionalCertificationEngine } from "../services/institutionalRoadmap/institutionalCertificationEngine.js";

const router = Router();

// GET /api/institutional/roadmap
router.get("/roadmap", (_req, res) => {
  try {
    const health = SystemMonitoringEngine.getSystemHealth();
    const ops = ProductionOpsManager.getOpsStatus();
    const microstructure = MicrostructureEngine.analyzeMicrostructure("BTCUSDT");

    res.json({
      activePhaseRange: "Phases 23 — 35",
      systemHealth: health,
      opsStatus: ops,
      microstructure,
      roadmapPhases: [
        { phase: 23, name: "Portfolio Optimization", status: "COMPLETED" },
        { phase: 24, name: "Market Microstructure", status: "COMPLETED" },
        { phase: 25, name: "Self Learning AI", status: "COMPLETED" },
        { phase: 26, name: "System Monitoring", status: "COMPLETED" },
        { phase: 27, name: "Research Lab", status: "COMPLETED" },
        { phase: 28, name: "Institutional Reports", status: "COMPLETED" },
        { phase: 29, name: "Multi Exchange Router", status: "COMPLETED" },
        { phase: 30, name: "Production Ops", status: "COMPLETED" },
        { phase: 31, name: "AI Explainability", status: "COMPLETED" },
        { phase: 32, name: "Benchmark Suite", status: "COMPLETED" },
        { phase: 33, name: "Stress Testing", status: "COMPLETED" },
        { phase: 34, name: "Governance Audit", status: "COMPLETED" },
        { phase: 35, name: "Institutional Certification", status: "CERTIFIED" },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/institutional/certification
router.get("/certification", (_req, res) => {
  try {
    const cert = InstitutionalCertificationEngine.verifyCertification();
    res.json(cert);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
