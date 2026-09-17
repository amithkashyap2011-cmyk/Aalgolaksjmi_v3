/**
 * ═══════════════════════════════════════════════════════════════════
 *  STRATEGY LIFECYCLE & CONTROL REST API
 * ═══════════════════════════════════════════════════════════════════
 *  Exposes secure endpoints for Autonomous AI Strategy Research,
 *  Validation, Backtesting, Walk-Forward, Monte Carlo, Paper/Shadow,
 *  and Lifecycle Promotion.
 */

import { Router } from "express";
import { authGuard, type AuthRequest } from "../middleware/auth.js";
import { AutonomousStrategyRegistry, IStrategyRecord } from "../services/agentic/strategy/registry/AutonomousStrategyRegistry.js";
import { StrategyResearchAgent } from "../services/agentic/agents/StrategyResearchAgent.js";
import { StrategyValidator } from "../services/agentic/strategy/validator/StrategyValidator.js";
import { DataQualityGate } from "../services/agentic/strategy/data/DataQualityGate.js";
import { RealisticBacktestEngine } from "../services/agentic/strategy/backtest/RealisticBacktestEngine.js";
import { StrategyValidationSuite } from "../services/agentic/strategy/validation/StrategyValidationSuite.js";
import { StrategyPromotionPipeline } from "../services/agentic/strategy/pipeline/StrategyPromotionPipeline.js";
import { ChampionChallengerManager } from "../services/agentic/strategy/research/ChampionChallengerManager.js";
import { PaperTradingEngine } from "../services/agentic/strategy/shadow/PaperTradingEngine.js";
import { ShadowTradingEngine } from "../services/agentic/strategy/shadow/ShadowTradingEngine.js";

const router = Router();
const researchAgent = new StrategyResearchAgent();

/**
 * 1. GET /registry — List all strategies with versions and statuses
 */
router.get("/registry", authGuard, async (req: AuthRequest, res) => {
  try {
    const registry = AutonomousStrategyRegistry.getInstance();
    const strategies = registry.getAllStrategies();
    res.json({ success: true, count: strategies.length, strategies });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. GET /strategy/:id — Get detailed strategy definition
 */
router.get("/strategy/:id", authGuard, async (req: AuthRequest, res) => {
  try {
    const registry = AutonomousStrategyRegistry.getInstance();
    const strat = registry.getStrategy(req.params.id);
    if (!strat) {
      res.status(404).json({ success: false, error: "Strategy not found" });
      return;
    }
    res.json({ success: true, strategy: strat });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. POST /research/generate — AI Research Agent generates new candidate strategy
 */
router.post("/research/generate", authGuard, async (req: AuthRequest, res) => {
  try {
    const { underlying = "NIFTY", targetRegime = "TRENDING_BULL" } = req.body;
    const output = researchAgent.generateStrategyHypothesis(underlying, targetRegime);

    const registry = AutonomousStrategyRegistry.getInstance();
    const record: IStrategyRecord = {
      strategyId: `STRAT_${output.dsl.underlying}_${Date.now().toString().slice(-6)}`,
      name: output.dsl.name,
      description: output.dsl.description,
      version: "1.0.0",
      type: "TREND_FOLLOWING",
      instrument: output.dsl.underlying,
      exchange: "NFO",
      timeframe: output.dsl.entry.timeframe,
      marketSegment: output.dsl.marketSegment,
      dsl: output.dsl,
      parameterSchema: output.suggestedParameters,
      status: "RESEARCH",
      healthScore: 85,
      createdBy: "StrategyResearchAgent",
      createdAt: new Date(),
      updatedAt: new Date(),
      modelVersion: "gemini-1.5-pro",
      promptVersion: "p2.0",
      codeVersion: "v2.0.0",
      explanation: output.explanation,
      allocationCapital: 0,
    };

    await registry.registerStrategy(record);

    res.json({ success: true, output, registeredStrategy: record });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4. POST /validate — Validate strategy DSL
 */
router.post("/validate", authGuard, async (req: AuthRequest, res) => {
  try {
    const { dsl } = req.body;
    const result = StrategyValidator.validateStrategy(dsl);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5. POST /backtest — Execute realistic backtest
 */
router.post("/backtest", authGuard, async (req: AuthRequest, res) => {
  try {
    const { dsl, candles, config } = req.body;
    if (!dsl || !candles?.length) {
      res.status(400).json({ success: false, error: "Missing dsl or candles payload." });
      return;
    }

    // Run data quality check first
    const dq = DataQualityGate.validateCandleDataset(dsl.underlying, candles);
    if (!dq.passed) {
      res.status(422).json({
        success: false,
        error: "DATA_QUALITY_GATE_FAILED",
        dataQualityReport: dq,
      });
      return;
    }

    const backtestResult = RealisticBacktestEngine.runBacktest(dsl, candles, config);
    res.json({ success: true, backtestResult, dataQualityReport: dq });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 6. POST /validation-suite — Run exhaustive OOS, Walk-Forward, and Monte Carlo
 */
router.post("/validation-suite", authGuard, async (req: AuthRequest, res) => {
  try {
    const { dsl, candles } = req.body;
    if (!dsl || !candles?.length) {
      res.status(400).json({ success: false, error: "Missing dsl or candles payload." });
      return;
    }

    const comprehensive = StrategyValidationSuite.validateStrategyComprehensively(dsl, candles);
    res.json({ success: true, validation: comprehensive });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 7. POST /promote — Advance strategy lifecycle stage
 */
router.post("/promote", authGuard, async (req: AuthRequest, res) => {
  try {
    const { strategyId, validationResult, liveStats } = req.body;
    if (!strategyId) {
      res.status(400).json({ success: false, error: "strategyId required" });
      return;
    }

    const result = await StrategyPromotionPipeline.promoteStrategy(strategyId, validationResult, liveStats);
    res.json({ success: result.success, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 8. POST /control — Lifecycle controls (pause, resume, rollback, retire)
 */
router.post("/control", authGuard, async (req: AuthRequest, res) => {
  try {
    const { strategyId, action, reason } = req.body;
    const registry = AutonomousStrategyRegistry.getInstance();

    if (action === "pause") {
      const updated = await registry.updateStatus(strategyId, "PAUSED");
      res.json({ success: true, updated });
    } else if (action === "resume") {
      const updated = await registry.updateStatus(strategyId, "LIVE_STAGE_1");
      res.json({ success: true, updated });
    } else if (action === "rollback") {
      const parent = await registry.rollbackStrategy(strategyId);
      res.json({ success: true, parent });
    } else if (action === "retire") {
      const retired = await registry.retireStrategy(strategyId, reason || "Manual retirement");
      res.json({ success: true, retired });
    } else {
      res.status(400).json({ success: false, error: `Invalid action: ${action}` });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 9. POST /challenger/generate & POST /challenger/duel
 */
router.post("/challenger/generate", authGuard, async (req: AuthRequest, res) => {
  try {
    const { championStrategyId } = req.body;
    const registry = AutonomousStrategyRegistry.getInstance();
    const champion = registry.getStrategy(championStrategyId);
    if (!champion) {
      res.status(404).json({ success: false, error: "Champion strategy not found" });
      return;
    }

    const challengerOutput = researchAgent.generateChallenger(champion.dsl);
    res.json({ success: true, challenger: challengerOutput });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/challenger/duel", authGuard, async (req: AuthRequest, res) => {
  try {
    const { championId, challengerId } = req.body;
    const result = await ChampionChallengerManager.promoteChallenger(championId, challengerId);
    res.json({ success: result.success, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 10. Paper & Shadow Telemetry
 */
router.get("/paper/positions", authGuard, async (req: AuthRequest, res) => {
  res.json({
    success: true,
    positions: PaperTradingEngine.getActivePositions(),
    completedTrades: PaperTradingEngine.getCompletedTrades(),
    virtualCapital: PaperTradingEngine.getVirtualCapital(),
  });
});

router.get("/shadow/records", authGuard, async (req: AuthRequest, res) => {
  res.json({
    success: true,
    records: ShadowTradingEngine.getShadowRecords(50),
  });
});

export default router;
