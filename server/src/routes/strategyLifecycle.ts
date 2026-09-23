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
import { DataQualityGate, type ITimestampedCandle } from "../services/agentic/strategy/data/DataQualityGate.js";
import { RealisticBacktestEngine } from "../services/agentic/strategy/backtest/RealisticBacktestEngine.js";
import { StrategyValidationSuite } from "../services/agentic/strategy/validation/StrategyValidationSuite.js";
import { StrategyPromotionPipeline } from "../services/agentic/strategy/pipeline/StrategyPromotionPipeline.js";
import { ChampionChallengerManager } from "../services/agentic/strategy/research/ChampionChallengerManager.js";
import { PaperTradingEngine } from "../services/agentic/strategy/shadow/PaperTradingEngine.js";
import { ShadowTradingEngine } from "../services/agentic/strategy/shadow/ShadowTradingEngine.js";

const router = Router();
const researchAgent = new StrategyResearchAgent();

/**
 * Deterministic, realistic high-fidelity chronological candle generator for Indian/crypto underlyings
 */
/**
 * Real historical candles for a strategy's underlying: Angel One for Indian
 * indices/stocks, Binance for crypto. This used to fabricate a sine-wave
 * series around hardcoded 2024 prices (NIFTY 24,500), so every "backtest" and
 * robustness run — and the registry metrics it overwrote — measured noise.
 * Throws rather than falling back to synthetic data.
 */
const ANGEL_INTERVAL: Record<string, { name: string; minutes: number }> = {
  "1m": { name: "ONE_MINUTE", minutes: 1 }, "5m": { name: "FIVE_MINUTE", minutes: 5 },
  "15m": { name: "FIFTEEN_MINUTE", minutes: 15 }, "30m": { name: "THIRTY_MINUTE", minutes: 30 },
  "1h": { name: "ONE_HOUR", minutes: 60 }, "1d": { name: "ONE_DAY", minutes: 375 },
};
async function fetchRealCandles(underlying: string, timeframe = "5m", count = 300): Promise<ITimestampedCandle[]> {
  const sym = String(underlying || "").toUpperCase();
  const { ANGEL_INSTRUMENTS } = await import("../services/indianMarket/angelOne/instrumentTokens.js");
  const angelKey = sym === "NIFTY" ? "NIFTY50" : sym;
  const inst = (ANGEL_INSTRUMENTS as any)[angelKey];
  if (inst) {
    const { smartApi } = await import("../services/indianMarket/angelOne/smartApiClient.js");
    const iv = ANGEL_INTERVAL[timeframe] ?? ANGEL_INTERVAL["5m"];
    // ~375 trading minutes/day; pad for weekends/holidays.
    const days = Math.min(iv.name === "ONE_DAY" ? count * 1.6 : Math.ceil((count * iv.minutes) / 375) * 1.6 + 4, iv.name === "ONE_MINUTE" ? 30 : 2000);
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400_000);
    const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
    const rows = await smartApi.getCandles({ exchange: inst.exchange, symboltoken: inst.token, interval: iv.name, fromdate: ist(from), todate: ist(to) });
    const candles = (rows || []).map((r: any[]) => ({
      timestamp: new Date(r[0]).getTime(), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) || 0,
    }));
    if (candles.length < 60) throw new Error(`Only ${candles.length} real ${timeframe} candles from Angel One for ${sym}`);
    return candles.slice(-count);
  }
  const pair = sym.endsWith("USDT") ? sym : `${sym}USDT`;
  const { getKlines } = await import("../services/binanceService.js");
  const klines = await getKlines(pair, timeframe, undefined, undefined, Math.min(count, 1000));
  const candles = klines.map((k: any) => ({
    timestamp: Number(k.openTime), open: parseFloat(k.open), high: parseFloat(k.high), low: parseFloat(k.low), close: parseFloat(k.close), volume: parseFloat(k.volume) || 0,
  }));
  if (candles.length < 60) throw new Error(`Only ${candles.length} real ${timeframe} candles from Binance for ${pair}`);
  return candles;
}

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
      healthScore: 0, // untested until a real backtest runs
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
    let { dsl, candles, config, strategyId } = req.body;
    const registry = AutonomousStrategyRegistry.getInstance();

    if (!dsl && strategyId) {
      const rec = registry.getStrategy(strategyId);
      if (rec) dsl = rec.dsl;
    }

    if (!dsl) {
      res.status(400).json({ success: false, error: "Missing dsl or strategyId." });
      return;
    }

    // Real exchange candles when none are supplied (never synthetic).
    if (!candles || !candles.length) {
      try {
        candles = await fetchRealCandles(dsl.underlying, dsl.entry?.timeframe || dsl.timeframe, 300);
      } catch (e: any) {
        res.status(503).json({ success: false, error: `REAL_DATA_UNAVAILABLE: ${e?.message || e}` });
        return;
      }
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

    // Sync metrics back to strategy in registry if strategyId provided
    if (strategyId) {
      const strat = registry.getStrategy(strategyId);
      if (strat) {
        await registry.updateMetrics(strategyId, backtestResult.metrics);
      }
    }

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
    let { dsl, candles, strategyId } = req.body;
    const registry = AutonomousStrategyRegistry.getInstance();

    if (!dsl && strategyId) {
      const rec = registry.getStrategy(strategyId);
      if (rec) dsl = rec.dsl;
    }

    if (!dsl) {
      res.status(400).json({ success: false, error: "Missing dsl or strategyId." });
      return;
    }

    if (!candles || !candles.length) {
      try {
        candles = await fetchRealCandles(dsl.underlying, dsl.entry?.timeframe || dsl.timeframe, 300);
      } catch (e: any) {
        res.status(503).json({ success: false, error: `REAL_DATA_UNAVAILABLE: ${e?.message || e}` });
        return;
      }
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
    const { strategyId, reason } = req.body;
    const action = String(req.body.action || "").toLowerCase();
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
      res.status(400).json({ success: false, error: `Invalid action: ${req.body.action}` });
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
    const championStrategyId = req.body.championStrategyId || req.body.championId;
    const registry = AutonomousStrategyRegistry.getInstance();
    const champion = registry.getStrategy(championStrategyId);
    if (!champion) {
      res.status(404).json({ success: false, error: "Champion strategy not found" });
      return;
    }

    const challengerOutput = researchAgent.generateChallenger(champion.dsl);

    // Auto-register the challenger in registry with derived superior metrics
    const challengerRecord: IStrategyRecord = {
      strategyId: challengerOutput.hypothesisId,
      name: challengerOutput.name,
      description: challengerOutput.explanation?.thesis || challengerOutput.dsl.description,
      version: registry.incrementVersion(champion.version),
      type: champion.type,
      instrument: champion.instrument,
      exchange: champion.exchange,
      timeframe: champion.timeframe,
      marketSegment: champion.marketSegment,
      dsl: challengerOutput.dsl,
      parameterSchema: challengerOutput.suggestedParameters || {},
      status: "RESEARCH",
      healthScore: 0,
      createdBy: "ChallengerSynthesizer",
      createdAt: new Date(),
      updatedAt: new Date(),
      parentStrategyId: champion.strategyId,
      modelVersion: champion.modelVersion,
      promptVersion: champion.promptVersion,
      codeVersion: champion.codeVersion,
      explanation: challengerOutput.explanation,
      allocationCapital: 0,
      // Real metrics: backtest challenger (and champion) on the SAME real
      // candles below. It used to copy the champion's metrics with fixed
      // bonuses (+0.16 Sharpe, +2.2% win, ×1.15 P&L, ≥30 trades), so every
      // challenger "beat" its champion by construction.
      metrics: undefined,
    };

    let candles;
    try {
      candles = await fetchRealCandles(champion.dsl.underlying, champion.dsl.entry?.timeframe || champion.timeframe, 300);
    } catch (e: any) {
      res.status(503).json({ success: false, error: `REAL_DATA_UNAVAILABLE: ${e?.message || e}` });
      return;
    }
    challengerRecord.metrics = RealisticBacktestEngine.runBacktest(challengerRecord.dsl, candles).metrics;
    await registry.updateMetrics(champion.strategyId, RealisticBacktestEngine.runBacktest(champion.dsl, candles).metrics);

    await registry.registerStrategy(challengerRecord);

    res.json({ success: true, challenger: challengerOutput, registeredStrategy: challengerRecord });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/challenger/duel", authGuard, async (req: AuthRequest, res) => {
  try {
    const championId = req.body.championId || req.body.championStrategyId;
    const challengerId = req.body.challengerId || req.body.challengerHypothesisId;
    if (!championId || !challengerId) {
      res.status(400).json({ success: false, error: "championId and challengerId required" });
      return;
    }
    // Re-test both on the same fresh real candles so the comparison is
    // apples-to-apples (stored metrics may come from different windows).
    const registry = AutonomousStrategyRegistry.getInstance();
    const champ = registry.getStrategy(championId);
    const chal = registry.getStrategy(challengerId);
    if (champ && chal) {
      try {
        const candles = await fetchRealCandles(champ.dsl.underlying, champ.dsl.entry?.timeframe || champ.timeframe, 300);
        await registry.updateMetrics(championId, RealisticBacktestEngine.runBacktest(champ.dsl, candles).metrics);
        await registry.updateMetrics(challengerId, RealisticBacktestEngine.runBacktest(chal.dsl, candles).metrics);
      } catch (e: any) {
        res.status(503).json({ success: false, error: `REAL_DATA_UNAVAILABLE: ${e?.message || e}` });
        return;
      }
    }
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
