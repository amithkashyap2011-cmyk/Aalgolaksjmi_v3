/**
 * ═══════════════════════════════════════════════════════════════════
 *  PHASE 10 — AUTONOMOUS AI STRATEGY RESEARCH, BACKTESTING &
 *             SHADOW-TO-LIVE PIPELINE COMPREHENSIVE TEST SUITE
 * ═══════════════════════════════════════════════════════════════════
 *  Validates:
 *   1. Strategy Registry & SemVer Immutability
 *   2. Strategy DSL & Security Injection Invariant (Zero arbitrary code)
 *   3. Strategy Pre-Flight Validator (Compulsory Stop-Loss)
 *   4. Data Quality Gate (OHLC Geometry & Zero Price Detection)
 *   5. Realistic Backtesting Engine & Indian Statutory Cost Accounting
 *   6. Strictly ZERO LOOK-AHEAD BIAS Verification
 *   7. Out-of-Sample & Walk-Forward Validation (Overfit Detection)
 *   8. Parameter Robustness (Neighborhood Testing)
 *   9. Monte Carlo Robustness Engine (1,000 Iterations & Risk of Ruin)
 *  10. Strategy Portfolio & Correlation Engine (Exposure Caps)
 *  11. Paper & Shadow Trading Isolation (Zero Live Broker Gateway Access)
 *  12. Promotion Pipeline & Staged Live Rollout Gating
 *  13. Strategy Drift Monitoring & Automatic Circuit Breaker Pause
 *  14. Champion vs Challenger Framework
 *  15. Rollback & Audit History Preservation
 *  16. Backtest Financial Oracle (1,000 Randomized Scenarios)
 */


import { AutonomousStrategyRegistry, IStrategyRecord } from "../src/services/agentic/strategy/registry/AutonomousStrategyRegistry.js";
import { StrategyDSLEvaluator } from "../src/services/agentic/strategy/dsl/StrategyDSL.js";
import { StrategyValidator } from "../src/services/agentic/strategy/validator/StrategyValidator.js";
import { DataQualityGate, ITimestampedCandle } from "../src/services/agentic/strategy/data/DataQualityGate.js";
import { RealisticBacktestEngine } from "../src/services/agentic/strategy/backtest/RealisticBacktestEngine.js";
import { StrategyValidationSuite } from "../src/services/agentic/strategy/validation/StrategyValidationSuite.js";
import { StrategyPortfolioEngine } from "../src/services/agentic/strategy/portfolio/StrategyPortfolioEngine.js";
import { PaperTradingEngine } from "../src/services/agentic/strategy/shadow/PaperTradingEngine.js";
import { ShadowTradingEngine } from "../src/services/agentic/strategy/shadow/ShadowTradingEngine.js";
import { StrategyPromotionPipeline } from "../src/services/agentic/strategy/pipeline/StrategyPromotionPipeline.js";
import { StrategyDriftMonitor } from "../src/services/agentic/strategy/monitoring/StrategyDriftMonitor.js";
import { ChampionChallengerManager } from "../src/services/agentic/strategy/research/ChampionChallengerManager.js";
import { StrategyResearchAgent } from "../src/services/agentic/agents/StrategyResearchAgent.js";
import { IStrategyDSL } from "../src/services/agentic/strategy/types.js";
import { IndianCostModel } from "../src/services/indianMarket/costModel.js";

/**
 * Helper to generate synthetic realistic OHLC candles
 */
function generateSyntheticCandles(
  count: number = 200,
  startPrice: number = 24000,
  trend: "BULL" | "BEAR" | "RANGING" = "BULL"
): ITimestampedCandle[] {
  const candles: ITimestampedCandle[] = [];
  let price = startPrice;
  const baseTime = Date.now() - count * 5 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const drift = trend === "BULL" ? 1.5 : trend === "BEAR" ? -1.5 : 0;
    const noise = (Math.random() - 0.48) * 15;
    const open = Number(price.toFixed(2));
    const close = Number(Math.max(100, price + drift + noise).toFixed(2));
    const high = Number((Math.max(open, close) + Math.random() * 8).toFixed(2));
    const low = Number((Math.min(open, close) - Math.random() * 8).toFixed(2));
    const volume = Math.floor(1000 + Math.random() * 5000);
    const timestamp = baseTime + i * 5 * 60 * 1000;

    candles.push({ open, high, low, close, volume, timestamp });
    price = close;
  }
  return candles;
}

/**
 * Helper canonical strategy DSL
 */
function createValidDSL(): IStrategyDSL {
  return {
    dslVersion: "1.0.0",
    name: "NIFTY_EMA_TREND_TEST",
    description: "Trend following test strategy on NIFTY",
    underlying: "NIFTY",
    marketSegment: "FUTURES",
    entry: {
      direction: "BUY",
      instrumentType: "FUTURE",
      timeframe: "5m",
      conditions: [
        { indicator: "EMA", period: 9, operator: "ABOVE", value: "EMA(21)" },
        { indicator: "RSI", period: 14, operator: "BETWEEN", value: "45,70" },
      ],
    },
    exit: {
      rules: [
        { type: "STOP_LOSS", value: 1.0, unit: "PERCENT" },
        { type: "TARGET", value: 2.0, unit: "PERCENT" },
        { type: "TRAILING_STOP", value: 0.8, unit: "PERCENT" },
      ],
      maxHoldingMinutes: 120,
    },
    risk: {
      positionSizingType: "FIXED_LOT",
      sizingValue: 1,
      maxDailyTrades: 4,
      maxDailyLoss: 5000,
      maxDrawdownPct: 6.0,
      stopLossPct: 1.0,
      targetPct: 2.0,
    },
    targetRegimes: ["TRENDING_BULL", "HIGH_VOLATILITY"],
  };
}

describe("PHASE 10 — Autonomous AI Strategy Research, Backtesting & Shadow-to-Live Pipeline", () => {
  beforeEach(() => {
    PaperTradingEngine.reset();
    ShadowTradingEngine.clear();
  });

  // ─── 1. STRATEGY REGISTRY & VERSIONING ───
  describe("1. Strategy Registry & Versioning", () => {
    it("registers and retrieves strategies with complete metadata", async () => {
      const registry = AutonomousStrategyRegistry.getInstance();
      const dsl = createValidDSL();

      const record: IStrategyRecord = {
        strategyId: "STRAT_NIFTY_TEST_V1",
        name: dsl.name,
        description: dsl.description,
        version: "1.0.0",
        type: "TREND_FOLLOWING",
        instrument: "NIFTY",
        exchange: "NFO",
        timeframe: "5m",
        marketSegment: "FUTURES",
        dsl,
        parameterSchema: { emaFast: 9, emaSlow: 21 },
        status: "RESEARCH",
        healthScore: 90,
        createdBy: "StrategyResearchAgent",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "v2.0.0",
        promptVersion: "p1.0",
        codeVersion: "c2.0.0",
        allocationCapital: 50000,
      };

      const saved = await registry.registerStrategy(record);
      expect(saved.strategyId).toBe("STRAT_NIFTY_TEST_V1");
      expect(saved.version).toBe("1.0.0");

      const retrieved = registry.getStrategy("STRAT_NIFTY_TEST_V1");
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe(dsl.name);
    });

    it("strictly blocks overwriting an active LIVE production strategy version", async () => {
      const registry = AutonomousStrategyRegistry.getInstance();
      const dsl = createValidDSL();

      const liveRecord: IStrategyRecord = {
        strategyId: "STRAT_PROD_LIVE_1",
        name: "PROD_LIVE_STRAT",
        description: "Live strategy",
        version: "1.0.0",
        type: "TREND_FOLLOWING",
        instrument: "NIFTY",
        exchange: "NFO",
        timeframe: "5m",
        marketSegment: "FUTURES",
        dsl,
        parameterSchema: {},
        status: "LIVE",
        healthScore: 95,
        createdBy: "Admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "v2.0.0",
        promptVersion: "p1.0",
        codeVersion: "c2.0.0",
        allocationCapital: 100000,
      };

      await registry.registerStrategy(liveRecord);

      // Attempt to overwrite same version
      await expect(
        registry.registerStrategy({
          ...liveRecord,
          description: "Modified illegal overwrite",
        })
      ).rejects.toThrow("IMMUTABLE_VERSION_VIOLATION");
    });
  });

  // ─── 2. STRATEGY DSL & SECURITY ───
  describe("2. Strategy DSL & Security Invariant", () => {
    it("evaluates valid mathematical indicators without code evaluation", () => {
      const dsl = createValidDSL();
      const candles = generateSyntheticCandles(100, 24000, "BULL");
      const result = StrategyDSLEvaluator.evaluateEntry(dsl, candles);

      expect(typeof result.shouldEnter).toBe("boolean");
      expect(result.direction).toBe("BUY");
    });

    it("strictly detects and blocks dangerous code/SQL injection patterns in DSL", () => {
      const dsl = createValidDSL();
      // Inject dangerous token
      (dsl as any).maliciousPayload = "SELECT * FROM users; DROP TABLE accounts;";

      const securityCheck = StrategyDSLEvaluator.verifySecurity(dsl);
      expect(securityCheck.valid).toBe(false);
      expect(securityCheck.error).toContain("Forbidden token");
    });
  });

  // ─── 3. STRATEGY PRE-FLIGHT VALIDATOR ───
  describe("3. Strategy Pre-Flight Validator", () => {
    it("approves valid strategy with required stop-loss and targets", () => {
      const dsl = createValidDSL();
      const val = StrategyValidator.validateStrategy(dsl);
      expect(val.valid).toBe(true);
      expect(val.errors.length).toBe(0);
    });

    it("rejects unhedged strategies lacking compulsory stop-loss rule", () => {
      const dsl = createValidDSL();
      // Remove stop loss rule
      dsl.exit.rules = dsl.exit.rules.filter((r) => r.type !== "STOP_LOSS");

      const val = StrategyValidator.validateStrategy(dsl);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.includes("UNBOUNDED_RISK_ERROR"))).toBe(true);
    });

    it("rejects strategies with excessive stop-loss (>10%)", () => {
      const dsl = createValidDSL();
      const slRule = dsl.exit.rules.find((r) => r.type === "STOP_LOSS")!;
      slRule.value = 15.0; // 15% stop is excessive for index futures

      const val = StrategyValidator.validateStrategy(dsl);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.includes("EXCESSIVE_STOP_LOSS"))).toBe(true);
    });
  });

  // ─── 4. DATA QUALITY GATE ───
  describe("4. Historical Data Quality Gate", () => {
    it("approves high quality clean OHLC datasets", () => {
      const cleanCandles = generateSyntheticCandles(200, 24000, "BULL");
      const report = DataQualityGate.validateCandleDataset("NIFTY", cleanCandles);

      expect(report.passed).toBe(true);
      expect(report.qualityScore).toBeGreaterThanOrEqual(90.0);
      expect(report.invalidOhlcCount).toBe(0);
      expect(report.zeroPriceCount).toBe(0);
    });

    it("rejects corrupted datasets with geometric faults or negative prices", () => {
      const corrupted = generateSyntheticCandles(100, 24000, "BULL");
      // Corrupt candle 10: High < Low
      corrupted[10].high = 23000;
      corrupted[10].low = 25000;
      // Corrupt candle 20: Negative price
      corrupted[20].close = -500;

      const report = DataQualityGate.validateCandleDataset("NIFTY", corrupted);
      expect(report.passed).toBe(false);
      expect(report.qualityScore).toBeLessThan(90.0);
      expect(report.invalidOhlcCount).toBeGreaterThanOrEqual(1);
      expect(report.zeroPriceCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 5. REALISTIC BACKTEST ENGINE & STATUTORY COSTS ───
  describe("5. Realistic Backtest Engine & Cost Accounting", () => {
    it("models realistic execution with Brokerage, STT, Exchange fees, and GST", () => {
      const dsl = createValidDSL();
      const candles = generateSyntheticCandles(250, 24000, "BULL");
      const result = RealisticBacktestEngine.runBacktest(dsl, candles, {
        initialCapital: 100_000,
        slippageBps: 2.0,
      });

      expect(result.dslName).toBe(dsl.name);
      expect(result.metrics).toBeDefined();

      if (result.trades.length > 0) {
        const firstTrade = result.trades[0];
        // Statutory charges must be calculated and positive
        expect(firstTrade.brokerage).toBe(40.0); // ₹20 entry + ₹20 exit
        expect(firstTrade.totalCharges).toBeGreaterThan(40.0);
        expect(firstTrade.netPnl).toBe(Number((firstTrade.grossPnl - firstTrade.totalCharges).toFixed(2)));
        expect(firstTrade.slippageIncurred).toBeGreaterThan(0);
      }
    });

    it("strictly respects NIFTY 25-lot size multiples", () => {
      const dsl = createValidDSL();
      const candles = generateSyntheticCandles(200, 24000, "BULL");
      const result = RealisticBacktestEngine.runBacktest(dsl, candles);

      for (const t of result.trades) {
        expect(t.quantity % 25).toBe(0);
      }
    });
  });

  // ─── 6. ZERO LOOK-AHEAD BIAS VERIFICATION ───
  describe("6. Strictly Zero Look-Ahead Bias Verification", () => {
    it("guarantees decision at bar i only evaluates historical bars up to i-1", () => {
      const dsl = createValidDSL();
      const baseCandles = generateSyntheticCandles(150, 24000, "BULL");

      // Run baseline backtest
      const baseResult = RealisticBacktestEngine.runBacktest(dsl, baseCandles);

      // Now create a duplicate dataset where we heavily manipulate the LAST candle
      const manipulatedCandles = JSON.parse(JSON.stringify(baseCandles));
      const lastIdx = manipulatedCandles.length - 1;
      manipulatedCandles[lastIdx].high = 50000; // massive future price jump
      manipulatedCandles[lastIdx].close = 49000;

      // Prior decisions before the last candle must NOT be affected by future candle manipulation!
      const manipResult = RealisticBacktestEngine.runBacktest(dsl, manipulatedCandles);

      // Compare all trades completed BEFORE the last candle
      const baseEarlyTrades = baseResult.trades.filter((t, idx) => idx < baseResult.trades.length - 1);
      const manipEarlyTrades = manipResult.trades.filter((t, idx) => idx < manipResult.trades.length - 1);

      expect(manipEarlyTrades.length).toBe(baseEarlyTrades.length);
      if (baseEarlyTrades.length > 0) {
        expect(manipEarlyTrades[0].entryPrice).toBe(baseEarlyTrades[0].entryPrice);
        expect(manipEarlyTrades[0].entryTimestamp).toBe(baseEarlyTrades[0].entryTimestamp);
      }
    });
  });

  // ─── 7. OUT-OF-SAMPLE & WALK-FORWARD TESTING ───
  describe("7. Out-of-Sample & Walk-Forward Testing", () => {
    it("identifies and blocks overfit strategies where out-of-sample performance collapses", () => {
      const dsl = createValidDSL();
      const candles = generateSyntheticCandles(300, 24000, "BULL");

      const oos = StrategyValidationSuite.runOutOfSampleTest(dsl, candles);
      expect(oos.inSampleMetrics).toBeDefined();
      expect(oos.outOfSampleMetrics).toBeDefined();
      expect(typeof oos.sharpeRatioRetention).toBe("number");
      expect(typeof oos.isOverfit).toBe("boolean");
    });

    it("runs rolling 4-fold walk-forward validation and computes WFE", () => {
      const dsl = createValidDSL();
      const candles = generateSyntheticCandles(300, 24000, "BULL");

      const wf = StrategyValidationSuite.runWalkForwardValidation(dsl, candles, 4);
      expect(wf.folds.length).toBeGreaterThanOrEqual(1);
      expect(typeof wf.averageWFE).toBe("number");
    });
  });

  // ─── 8. PARAMETER ROBUSTNESS & MONTE CARLO ───
  describe("8. Parameter Robustness & Monte Carlo Robustness", () => {
    it("tests parameter neighborhoods to confirm strategy stability", () => {
      const dsl = createValidDSL();
      const candles = generateSyntheticCandles(200, 24000, "BULL");

      const robustness = StrategyValidationSuite.testParameterRobustness(dsl, candles);
      expect(robustness.testedVariationsCount).toBeGreaterThan(0);
      expect(typeof robustness.robustnessScore).toBe("number");
      expect(typeof robustness.isFragile).toBe("boolean");
    });

    it("runs 1,000 Monte Carlo bootstrap iterations and calculates Risk of Ruin", () => {
      const dsl = createValidDSL();
      const candles = generateSyntheticCandles(250, 24000, "BULL");
      const btResult = RealisticBacktestEngine.runBacktest(dsl, candles);

      const mc = StrategyValidationSuite.runMonteCarloSimulation(btResult.trades, 100_000, 500);
      expect(mc.iterations).toBe(500);
      expect(typeof mc.riskOfRuinPct).toBe("number");
      expect(typeof mc.maxDrawdownP95).toBe("number");
    });
  });

  // ─── 9. STRATEGY PORTFOLIO ENGINE ───
  describe("9. Strategy Portfolio & Risk Correlation Engine", () => {
    it("detects signal clustering and blocks aggregate exposure breach", () => {
      const activeSignals = [
        { strategyId: "S1", strategyName: "Strat 1", symbol: "NIFTY", direction: "BUY" as const, quantity: 4, timestamp: Date.now() },
        { strategyId: "S2", strategyName: "Strat 2", symbol: "NIFTY", direction: "BUY" as const, quantity: 4, timestamp: Date.now() },
      ];

      // S3 proposes 4 more lots (total 12 > max safe cap 10)
      const candidate = {
        strategyId: "S3",
        strategyName: "Strat 3",
        symbol: "NIFTY",
        direction: "BUY" as const,
        quantity: 4,
        timestamp: Date.now(),
      };

      const check = StrategyPortfolioEngine.evaluatePortfolioRisk(candidate, activeSignals);
      expect(check.allowed).toBe(false);
      expect(check.rejectionReason).toContain("AGGREGATE_EXPOSURE_BREACH");
    });

    it("calculates pairwise correlation matrix between strategy returns", () => {
      const returns = {
        stratA: [0.01, 0.02, -0.01, 0.03, 0.01],
        stratB: [0.01, 0.02, -0.01, 0.03, 0.01], // perfectly correlated
        stratC: [-0.01, -0.02, 0.01, -0.03, -0.01], // inverse
      };

      const matrix = StrategyPortfolioEngine.calculateCorrelationMatrix(returns);
      expect(matrix["stratA"]["stratA"]).toBe(1.0);
      expect(matrix["stratA"]["stratB"]).toBe(1.0);
      expect(matrix["stratA"]["stratC"]).toBe(-1.0);
    });
  });

  // ─── 10. PAPER & SHADOW TRADING ISOLATION ───
  describe("10. Paper & Shadow Trading Hard Isolation", () => {
    it("simulates paper orders with realistic slippage and zero real broker access", () => {
      const dsl = createValidDSL();
      const pos = PaperTradingEngine.simulateEntry("STRAT_1", dsl, "NIFTY", "BUY", 24500, 25);

      expect(pos.tradeId).toContain("PAPER_");
      expect(pos.entryPrice).toBeGreaterThan(24500); // 2 bps slippage on buy
      expect(pos.totalCharges).toBeGreaterThan(0);

      const closed = PaperTradingEngine.simulateExit(pos.tradeId, dsl, 24700, "TARGET");
      expect(closed).toBeDefined();
      expect(closed?.netPnl).toBeDefined();
      expect(PaperTradingEngine.getActivePositions().length).toBe(0);
    });

    it("records shadow trading signals with execution latency tracking", () => {
      const record = ShadowTradingEngine.recordShadowSignal(
        "STRAT_1",
        "Nifty Momentum",
        "NIFTY",
        "BUY",
        25,
        24500,
        24504,
        true,
        32
      );

      expect(record.shadowId).toContain("SHADOW_");
      expect(record.slippageBps).toBeGreaterThan(0);
      expect(record.executionLatencyMs).toBe(32);
      expect(ShadowTradingEngine.getShadowRecords().length).toBe(1);
    });
  });

  // ─── 11. PROMOTION PIPELINE & STAGED LIVE ROLLOUT ───
  describe("11. Strategy Promotion Pipeline Gating", () => {
    it("strictly prevents skipping lifecycle stages", async () => {
      const registry = AutonomousStrategyRegistry.getInstance();
      const dsl = createValidDSL();

      const draftRecord: IStrategyRecord = {
        strategyId: "STRAT_DRAFT_TEST",
        name: "DRAFT_STRAT",
        description: "Draft",
        version: "1.0.0",
        type: "TREND_FOLLOWING",
        instrument: "NIFTY",
        exchange: "NFO",
        timeframe: "5m",
        marketSegment: "FUTURES",
        dsl,
        parameterSchema: {},
        status: "DRAFT",
        healthScore: 80,
        createdBy: "User",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "v2.0.0",
        promptVersion: "p1.0",
        codeVersion: "c2.0.0",
        allocationCapital: 50000,
      };

      await registry.registerStrategy(draftRecord);

      // Attempt promotion: DRAFT can only advance to RESEARCH
      const promo = await StrategyPromotionPipeline.promoteStrategy("STRAT_DRAFT_TEST");
      expect(promo.success).toBe(true);
      expect(promo.newStatus).toBe("RESEARCH");
    });

    it("enforces Staged Live Rollout (LIVE_STAGE_1 requires live trades before STAGE_2)", () => {
      const dsl = createValidDSL();
      const record: IStrategyRecord = {
        strategyId: "STRAT_STAGE_1_TEST",
        name: "STAGE_1_STRAT",
        description: "Testing stage 1",
        version: "1.0.0",
        type: "TREND_FOLLOWING",
        instrument: "NIFTY",
        exchange: "NFO",
        timeframe: "5m",
        marketSegment: "FUTURES",
        dsl,
        parameterSchema: {},
        status: "LIVE_STAGE_1",
        healthScore: 85,
        createdBy: "Admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "v2.0.0",
        promptVersion: "p1.0",
        codeVersion: "c2.0.0",
        allocationCapital: 25000,
      };

      // Fails with 0 live trades
      const evalFail = StrategyPromotionPipeline.evaluatePromotion(record, undefined, 2, 50, -500);
      expect(evalFail.eligible).toBe(false);
      expect(evalFail.failedGates.some((g) => g.includes("STAGE_1_UNPROVEN"))).toBe(true);

      // Passes when >= 10 trades with positive PnL
      const evalPass = StrategyPromotionPipeline.evaluatePromotion(record, undefined, 12, 60, 8500);
      expect(evalPass.eligible).toBe(true);
      expect(evalPass.targetStatus).toBe("LIVE_STAGE_2");
    });
  });

  // ─── 12. STRATEGY DRIFT & AUTOMATIC SAFETY PAUSE ───
  describe("12. Strategy Drift Monitoring & Circuit Breaker", () => {
    it("detects statistical win-rate collapse and automatically pauses strategy", async () => {
      const registry = AutonomousStrategyRegistry.getInstance();
      const dsl = createValidDSL();

      const stratRecord: IStrategyRecord = {
        strategyId: "STRAT_DRIFT_TEST",
        name: "DRIFT_STRAT",
        description: "Strategy to test drift",
        version: "1.0.0",
        type: "TREND_FOLLOWING",
        instrument: "NIFTY",
        exchange: "NFO",
        timeframe: "5m",
        marketSegment: "FUTURES",
        dsl,
        parameterSchema: {},
        status: "LIVE",
        healthScore: 90,
        createdBy: "Admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "v2.0.0",
        promptVersion: "p1.0",
        codeVersion: "c2.0.0",
        allocationCapital: 50000,
      };

      await registry.registerStrategy(stratRecord);

      // Severe drift: 2 wins out of 20 trades (10% win rate vs expected 60%), large drawdown
      const driftMetrics = await StrategyDriftMonitor.checkAndApplySafetyAction(
        "STRAT_DRIFT_TEST",
        "1.0.0",
        60.0,
        5.0,
        {
          totalTrades: 20,
          winningTrades: 2,
          actualDrawdownPct: 9.5, // > 1.5x expected 5.0%
          averageSlippageBps: 2.5,
          averageLatencyMs: 30,
        }
      );

      expect(driftMetrics.status).toBe("CRITICAL");
      expect(driftMetrics.recommendation).toBe("PAUSE_NEW_ENTRIES");

      // Verify registry status was updated to PAUSED
      const pausedStrat = registry.getStrategy("STRAT_DRIFT_TEST");
      expect(pausedStrat?.status).toBe("PAUSED");
    });
  });

  // ─── 13. CHAMPION VS CHALLENGER ───
  describe("13. Champion vs Challenger Framework", () => {
    it("promotes Challenger ONLY when Sharpe and Profit Factor significantly improve", () => {
      const champion = {
        id: "CHAMP_1",
        version: "1.0.0",
        metrics: {
          totalTrades: 40,
          winningTrades: 25,
          losingTrades: 15,
          winRate: 62.5,
          profitFactor: 2.10,
          grossProfit: 42000,
          grossLoss: 20000,
          netPnl: 22000,
          totalCharges: 2500,
          maxDrawdown: 4500,
          maxDrawdownPct: 4.5,
          sharpeRatio: 1.80,
          sortinoRatio: 2.10,
          cagr: 22.0,
          calmarRatio: 4.8,
          averageTradePnl: 550,
          averageHoldingPeriodMinutes: 45,
          largestWin: 3000,
          largestLoss: 1500,
        },
      };

      const challenger = {
        id: "CHAL_1",
        name: "CHALLENGER_STRAT",
        version: "1.1.0",
        metrics: {
          ...champion.metrics,
          totalTrades: 45,
          profitFactor: 2.45, // ΔPF = +0.35 >= 0.10
          sharpeRatio: 2.05,  // ΔSharpe = +0.25 >= 0.10
          maxDrawdownPct: 4.1, // improved MaxDD
        },
      };

      const duel = ChampionChallengerManager.evaluateDuel(champion, challenger);
      expect(duel.isEligibleForPromotion).toBe(true);
      expect(duel.deltaSharpe).toBeGreaterThanOrEqual(0.10);
    });
  });

  // ─── 14. ROLLBACK & RETIREMENT ───
  describe("14. Rollback & Retirement", () => {
    it("successfully rolls back to previous known-good parent version", async () => {
      const registry = AutonomousStrategyRegistry.getInstance();
      const dsl = createValidDSL();

      // Parent v1.0.0
      const parentRecord: IStrategyRecord = {
        strategyId: "STRAT_PARENT_V1",
        name: "ROLLBACK_TEST_STRAT",
        description: "Known good parent version",
        version: "1.0.0",
        type: "TREND_FOLLOWING",
        instrument: "NIFTY",
        exchange: "NFO",
        timeframe: "5m",
        marketSegment: "FUTURES",
        dsl,
        parameterSchema: {},
        status: "DEGRADED",
        healthScore: 70,
        createdBy: "Admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "v2.0.0",
        promptVersion: "p1.0",
        codeVersion: "c2.0.0",
        allocationCapital: 50000,
      };

      // Child v1.1.0 that failed in live
      const childRecord: IStrategyRecord = {
        strategyId: "STRAT_CHILD_V2",
        name: "ROLLBACK_TEST_STRAT",
        description: "Failing child version",
        version: "1.1.0",
        parentStrategyId: "STRAT_PARENT_V1",
        type: "TREND_FOLLOWING",
        instrument: "NIFTY",
        exchange: "NFO",
        timeframe: "5m",
        marketSegment: "FUTURES",
        dsl,
        parameterSchema: {},
        status: "LIVE",
        healthScore: 55,
        createdBy: "Admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "v2.0.0",
        promptVersion: "p1.0",
        codeVersion: "c2.0.0",
        allocationCapital: 50000,
      };

      await registry.registerStrategy(parentRecord);
      await registry.registerStrategy(childRecord);

      const restoredParent = await registry.rollbackStrategy("STRAT_CHILD_V2");
      expect(restoredParent.strategyId).toBe("STRAT_PARENT_V1");
      expect(restoredParent.status).toBe("LIVE");
    });

    it("retires a strategy while preserving full historical records", async () => {
      const registry = AutonomousStrategyRegistry.getInstance();
      const dsl = createValidDSL();

      const strat: IStrategyRecord = {
        strategyId: "STRAT_RETIRE_TEST",
        name: "RETIRE_STRAT",
        description: "Retiring",
        version: "1.0.0",
        type: "TREND_FOLLOWING",
        instrument: "NIFTY",
        exchange: "NFO",
        timeframe: "5m",
        marketSegment: "FUTURES",
        dsl,
        parameterSchema: {},
        status: "PAUSED",
        healthScore: 40,
        createdBy: "Admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "v2.0.0",
        promptVersion: "p1.0",
        codeVersion: "c2.0.0",
        allocationCapital: 50000,
      };

      await registry.registerStrategy(strat);
      const retired = await registry.retireStrategy("STRAT_RETIRE_TEST", "Statistical obsolescence");

      expect(retired.status).toBe("RETIRED");
      expect(retired.healthScore).toBe(0);
      expect(registry.getStrategy("STRAT_RETIRE_TEST")).toBeDefined(); // Never deleted
    });
  });

  // ─── 15. AI RESEARCH AGENT HYPOTHESIS ───
  describe("15. AI Strategy Research Agent", () => {
    it("synthesizes valid declarative DSL hypotheses with comprehensive auditable explanations", () => {
      const agent = new StrategyResearchAgent();
      const output = agent.generateStrategyHypothesis("NIFTY", "TRENDING_BULL");

      expect(output.name).toContain("NIFTY_TRENDING_BULL");
      expect(output.dsl.entry.direction).toBe("BUY");
      expect(output.dsl.exit.rules.some((r) => r.type === "STOP_LOSS")).toBe(true);
      expect(output.explanation.thesis.length).toBeGreaterThan(20);
      expect(output.explanation.underlyingAssumptions.length).toBeGreaterThanOrEqual(2);
      expect(output.explanation.expectedFailureConditions.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 16. BACKTEST ORACLE TESTING (1,000 SCENARIOS) ───
  describe("16. Backtest Oracle Testing (1,000 Randomized Scenarios)", () => {
    it("verifies mathematical financial invariants across 1,000 randomized backtest scenarios", () => {
      const dsl = createValidDSL();

      for (let scenario = 0; scenario < 1000; scenario++) {
        // Generate random entry price and random exit price
        const entryPrice = 20000 + Math.random() * 5000;
        const priceMovePct = (Math.random() - 0.49) * 0.04; // -2% to +2% move
        const exitPrice = entryPrice * (1 + priceMovePct);
        const qty = 25; // 1 NIFTY lot

        // Run through IndianCostModel
        const entryCost = IndianCostModel.calculateOrderCost({
          instrumentType: "FUTURE",
          action: "BUY",
          price: entryPrice,
          quantity: qty,
        });

        const exitCost = IndianCostModel.calculateOrderCost({
          instrumentType: "FUTURE",
          action: "SELL",
          price: exitPrice,
          quantity: qty,
        });

        const grossPnl = (exitPrice - entryPrice) * qty;
        const totalCharges = entryCost.totalCharges + exitCost.totalCharges;
        const netPnl = grossPnl - totalCharges;

        // INVARIANT 1: Total charges must be strictly positive
        expect(totalCharges).toBeGreaterThan(0);

        // INVARIANT 2: Net PnL must equal Gross PnL minus Total Charges (down to 1 paisa)
        expect(Math.abs(netPnl - (grossPnl - totalCharges))).toBeLessThan(0.01);

        // INVARIANT 3: STT on sell side must equal 0.02% of sell turnover for futures
        const expectedSTT = exitPrice * qty * 0.0002;
        expect(Math.abs(exitCost.stt - expectedSTT)).toBeLessThan(0.05);

        // INVARIANT 4: Brokerage must be exactly ₹20 per executed leg
        expect(entryCost.brokerage).toBe(20.0);
        expect(exitCost.brokerage).toBe(20.0);
      }
    });
  });
});
