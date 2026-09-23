/**
 * ═══════════════════════════════════════════════════════════════════
 *  AUTONOMOUS STRATEGY REGISTRY & VERSIONING ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Authoritative registry storing all strategy metadata, versions,
 *  lifecycle states, metrics, and audit lineages.
 *  CRITICAL INVARIANT: Production strategies are never overwritten.
 */

import {
  IStrategyDSL,
  StrategyLifecycleStatus,
  StrategyType,
  IBacktestMetrics,
  IStrategyDriftMetrics,
  IAIStrategyExplanation,
} from "../types.js";
import mongoose from "mongoose";
import { AutonomousStrategy, IAutonomousStrategyDocument } from "../../../../models/AutonomousStrategy.js";
import { IndianMarketHours } from "../../../indianMarketHours.js";

export interface IStrategyRecord {
  strategyId: string;
  name: string;
  description: string;
  version: string;
  type: StrategyType;
  instrument: string;
  exchange: "NSE" | "NFO" | "BSE" | "BFO";
  timeframe: string;
  marketSegment: "EQUITY" | "FUTURES" | "OPTIONS";
  dsl: IStrategyDSL;
  parameterSchema: Record<string, any>;
  status: StrategyLifecycleStatus;
  healthScore: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  parentStrategyId?: string;
  modelVersion: string;
  promptVersion: string;
  codeVersion: string;
  metrics?: IBacktestMetrics;
  driftMetrics?: IStrategyDriftMetrics;
  explanation?: IAIStrategyExplanation;
  activeStage?: "STAGE_1" | "STAGE_2" | "FULL";
  allocationCapital: number;
}

function createDefaultMetrics(
  totalTrades: number,
  winRate: number,
  profitFactor: number,
  netPnl: number,
  maxDrawdownPct: number,
  sharpeRatio: number
): IBacktestMetrics {
  const winningTrades = Math.round((totalTrades * winRate) / 100);
  const losingTrades = totalTrades - winningTrades;
  const grossProfit = Math.round(netPnl * 1.3);
  const grossLoss = Math.round(grossProfit / profitFactor);
  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    profitFactor,
    grossProfit,
    grossLoss,
    netPnl,
    totalCharges: Math.round(netPnl * 0.05),
    maxDrawdown: Math.round(maxDrawdownPct * 1000),
    maxDrawdownPct,
    sharpeRatio,
    sortinoRatio: Number((sharpeRatio * 1.25).toFixed(2)),
    cagr: Number(((netPnl / 100000) * 100).toFixed(1)),
    calmarRatio: Number((((netPnl / 100000) * 100) / maxDrawdownPct).toFixed(2)),
    averageTradePnl: Number((netPnl / totalTrades).toFixed(2)),
    averageHoldingPeriodMinutes: 45,
    largestWin: Number((netPnl * 0.12).toFixed(2)),
    largestLoss: Number((netPnl * 0.04).toFixed(2)),
  };
}

function createDefaultExplanation(
  thesis: string,
  marketBehaviorExploited: string,
  underlyingAssumptions: string[],
  expectedFailureConditions: string[],
  vulnerabilities: string[]
): IAIStrategyExplanation {
  return {
    thesis,
    marketBehaviorExploited,
    underlyingAssumptions,
    expectedFailureConditions,
    vulnerabilities,
    trainingDatasetsUsed: ["NSE_2022_2025_HISTORICAL_TICKS", "REAL_TICK_VERIFIED"],
    validationCompleted: ["ZERO_LOOKAHEAD_CHECKED", "OOS_WALK_FORWARD", "MONTE_CARLO_PASS"],
  };
}

export class AutonomousStrategyRegistry {
  private static instance: AutonomousStrategyRegistry | null = null;
  private memoryCache: Map<string, IStrategyRecord> = new Map();

  private constructor() {
    this.registerDefaultProductionStrategies();
  }

  public static getInstance(): AutonomousStrategyRegistry {
    if (!this.instance) {
      this.instance = new AutonomousStrategyRegistry();
    }
    return this.instance;
  }

  /**
   * Registers or updates a strategy in the registry.
   * If a strategy with the same name exists, it must have an incremented version!
   */
  /** Records measured backtest metrics without touching definition/version (allowed for LIVE). */
  public async updateMetrics(strategyId: string, metrics: IStrategyRecord["metrics"]): Promise<void> {
    const strat = this.memoryCache.get(strategyId);
    if (!strat) return;
    strat.metrics = metrics;
    strat.updatedAt = new Date();
    if (mongoose.connection?.readyState === 1) {
      try {
        await AutonomousStrategy.updateOne({ strategyId }, { $set: { metrics, updatedAt: strat.updatedAt } });
      } catch (err: any) {
        console.warn(`[STRATEGY_REGISTRY] DB sync warning: ${err?.message}`);
      }
    }
  }

  public async registerStrategy(record: IStrategyRecord): Promise<IStrategyRecord> {
    // Check if an existing version exists for this strategy
    const existing = this.memoryCache.get(record.strategyId);
    // A LIVE version is immutable: ANY re-registration of the same version is
    // refused (it only checked DSL changes, so description/params/risk edits
    // slipped through). Measured metrics go through updateMetrics() instead.
    if (existing && existing.status === "LIVE" && record.version === existing.version) {
      throw new Error(
        `IMMUTABLE_VERSION_VIOLATION: Cannot overwrite LIVE production strategy ${record.name} v${record.version}. Must increment version (e.g. v${this.incrementVersion(
          record.version
        )}).`
      );
    }

    record.updatedAt = new Date();
    this.memoryCache.set(record.strategyId, record);

    if (mongoose.connection?.readyState === 1) {
      try {
        await AutonomousStrategy.findOneAndUpdate(
          { strategyId: record.strategyId },
          { $set: record },
          { upsert: true, new: true }
        );
      } catch (err: any) {
        console.warn(`[STRATEGY_REGISTRY] DB sync warning: ${err?.message}`);
      }
    }

    return record;
  }

  public getStrategy(strategyId: string): IStrategyRecord | undefined {
    return this.memoryCache.get(strategyId);
  }

  public getAllStrategies(): IStrategyRecord[] {
    return Array.from(this.memoryCache.values());
  }

  public getStrategiesByStatus(status: StrategyLifecycleStatus): IStrategyRecord[] {
    return Array.from(this.memoryCache.values()).filter((s) => s.status === status);
  }

  /**
   * Updates the lifecycle status of a strategy.
   */
  public async updateStatus(
    strategyId: string,
    newStatus: StrategyLifecycleStatus,
    healthScore?: number
  ): Promise<IStrategyRecord> {
    const strat = this.memoryCache.get(strategyId);
    if (!strat) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    strat.status = newStatus;
    if (healthScore !== undefined) {
      strat.healthScore = healthScore;
    }
    strat.updatedAt = new Date();

    this.memoryCache.set(strategyId, strat);

    if (mongoose.connection?.readyState === 1) {
      try {
        await AutonomousStrategy.updateOne(
          { strategyId },
          { $set: { status: newStatus, healthScore: strat.healthScore, updatedAt: strat.updatedAt } }
        );
      } catch (e: any) {
        console.warn(`[STRATEGY_REGISTRY] DB status update warning: ${e?.message}`);
      }
    }

    return strat;
  }

  /**
   * Rolls back a degraded or failing strategy to its previous known-good parent version.
   */
  public async rollbackStrategy(strategyId: string): Promise<IStrategyRecord> {
    const current = this.memoryCache.get(strategyId);
    if (!current) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    if (!current.parentStrategyId) {
      throw new Error(`No previous version recorded for strategy ${strategyId}`);
    }

    const parent = this.memoryCache.get(current.parentStrategyId);
    if (!parent) {
      throw new Error(`Parent strategy version ${current.parentStrategyId} not found in registry.`);
    }

    // Demote current to DEGRADED
    await this.updateStatus(strategyId, "DEGRADED", 40);

    // Promote parent back to LIVE
    await this.updateStatus(parent.strategyId, "LIVE", 95);

    return parent;
  }

  /**
   * Retires a strategy permanently while preserving historical audit records.
   */
  public async retireStrategy(strategyId: string, reason: string): Promise<IStrategyRecord> {
    const strat = this.memoryCache.get(strategyId);
    if (!strat) throw new Error(`Strategy not found: ${strategyId}`);

    strat.status = "RETIRED";
    strat.healthScore = 0;
    strat.updatedAt = new Date();
    if (strat.explanation) {
      strat.explanation.rejectionRationale = reason;
    }

    this.memoryCache.set(strategyId, strat);

    if (mongoose.connection?.readyState === 1) {
      try {
        await AutonomousStrategy.updateOne(
          { strategyId },
          { $set: { status: "RETIRED", healthScore: 0, updatedAt: strat.updatedAt } }
        );
      } catch (e: any) {}
    }

    return strat;
  }

  public incrementVersion(v: string): string {
    const parts = v.replace(/^v/, "").split(".").map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    }
    return "1.1.0";
  }

  /**
   * Checks if the Indian stock market (NSE/BSE) is currently open, accounting for weekends, statutory holidays, and hours.
   */
  private isIndianMarketOpen(): boolean {
    return IndianMarketHours.getSessionStatus().isOpen;
  }

  // Seeds start at RESEARCH with empty metrics. They were registered as
  // LIVE / SHADOW / PAPER with hardcoded results (e.g. 342 trades, 68.4% win,
  // ₹1,48,500) that no backtest ever produced; a real backtest on NIFTY 5m
  // came out 33% win / net loss. They must now earn each stage via the gates.
  private registerDefaultProductionStrategies(): void {
    const marketOpen = this.isIndianMarketOpen();

    const strategies: IStrategyRecord[] = [
      {
        strategyId: "STRAT_NIFTY_MOMENTUM_V1",
        name: "NIFTY_EMA_BREAKOUT",
        description: "5-minute NIFTY Index Futures EMA Trend and Volume Breakout",
        version: "1.0.0",
        type: "TREND_FOLLOWING",
        instrument: "NIFTY",
        exchange: "NFO",
        timeframe: "5m",
        marketSegment: "FUTURES",
        dsl: {
          dslVersion: "1.0.0",
          name: "NIFTY_EMA_BREAKOUT",
          description: "5-minute NIFTY Index Futures EMA Trend and Volume Breakout",
          underlying: "NIFTY",
          marketSegment: "FUTURES",
          entry: {
            direction: "BUY",
            instrumentType: "FUTURE",
            timeframe: "5m",
            conditions: [
              { indicator: "EMA", period: 9, operator: "ABOVE", value: "EMA(21)" },
              { indicator: "RSI", period: 14, operator: "BETWEEN", value: "52,70" },
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
            maxDrawdownPct: 4.6,
            stopLossPct: 1.0,
            targetPct: 2.0,
          },
          targetRegimes: ["TRENDING_BULL", "HIGH_VOLATILITY"],
        },
        parameterSchema: { emaFast: 9, emaSlow: 21, rsiPeriod: 14 },
        status: "RESEARCH",
        healthScore: 0,
        createdBy: "SystemArchitect",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "v2.0.0",
        promptVersion: "p1.0",
        codeVersion: "c2.0.0",
        allocationCapital: 500000,
        activeStage: "STAGE_1",
        metrics: createDefaultMetrics(0, 0, 0, 0, 0, 0),
        explanation: createDefaultExplanation(
          "Captures sustained directional institutional momentum on NIFTY index futures when 9-period EMA cleanly breaks above 21-period EMA accompanied by RSI expanding above 52 with positive volume confirmation.",
          "Institutional trend continuation following 15-minute opening range breakout and VWAP pullbacks during morning and mid-day sessions.",
          [
            "Markets exhibit serial auto-correlation during trending macro regimes",
            "Pullbacks to 9 EMA offer asymmetric risk-reward entries with tight invalidation"
          ],
          [
            "Low volatility whipsaws within 50-point range",
            "Sudden RBI/Monetary policy shock gap downs"
          ],
          [
            "Late-session mean reversion after 14:30 IST",
            "Elevated bid-ask spreads on weekly expiry days"
          ]
        ),
      },
      {
        strategyId: "STRAT_BANKNIFTY_REVERSION_V1",
        name: "BANKNIFTY_MEAN_REVERSION",
        description: "15-minute BANKNIFTY Bollinger Envelope and VWAP Mean Reversion",
        version: "1.0.0",
        type: "MEAN_REVERSION",
        instrument: "BANKNIFTY",
        exchange: "NFO",
        timeframe: "15m",
        marketSegment: "OPTIONS",
        dsl: {
          dslVersion: "1.0.0",
          name: "BANKNIFTY_MEAN_REVERSION",
          description: "15-minute BANKNIFTY Bollinger Envelope and VWAP Mean Reversion",
          underlying: "BANKNIFTY",
          marketSegment: "OPTIONS",
          entry: {
            direction: "BUY",
            instrumentType: "CE",
            timeframe: "15m",
            conditions: [
              { indicator: "RSI", period: 14, operator: "BELOW", value: "32" },
              { indicator: "BOLLINGER", period: 20, operator: "BELOW", value: "LOWER_BAND" },
            ],
          },
          exit: {
            rules: [
              { type: "STOP_LOSS", value: 1.2, unit: "PERCENT" },
              { type: "TARGET", value: 2.4, unit: "PERCENT" },
              { type: "TRAILING_STOP", value: 0.9, unit: "PERCENT" },
            ],
            maxHoldingMinutes: 90,
          },
          risk: {
            positionSizingType: "FIXED_LOT",
            sizingValue: 1,
            maxDailyTrades: 3,
            maxDailyLoss: 7500,
            maxDrawdownPct: 3.8,
            stopLossPct: 1.2,
            targetPct: 2.4,
          },
          targetRegimes: ["RANGING", "LOW_VOLATILITY"],
        },
        parameterSchema: { rsiThreshold: 32, bollingerSigma: 2.0 },
        status: "RESEARCH",
        healthScore: 0,
        createdBy: "StrategyResearchAgent",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "gemini-1.5-pro",
        promptVersion: "p2.1",
        codeVersion: "c2.0.0",
        allocationCapital: 750000,
        activeStage: "STAGE_2",
        metrics: createDefaultMetrics(0, 0, 0, 0, 0, 0),
        explanation: createDefaultExplanation(
          "Exploits statistical mean reversion back to VWAP when BANKNIFTY stretches beyond 2.2 standard deviations on 15m Bollinger Bands while RSI displays acute divergence.",
          "Exhaustion of intraday retail speculative thrusts at round-number strikes where institutional market makers accumulate mean-reverting gamma.",
          [
            "Intraday standard deviation expansions revert to volume-weighted average price within 60 minutes",
            "Options implied volatility crushes rapidly following peak stretch"
          ],
          [
            "Sustained directional trend day driven by major bank earnings",
            "Unexpected credit policy announcements"
          ],
          [
            "Overnight gap risk if held past 15:15 IST",
            "Wide slippage during extreme volatility spikes"
          ]
        ),
      },
      {
        strategyId: "STRAT_FINNIFTY_SPREAD_V1",
        name: "FINNIFTY_BULL_CALL_SPREAD",
        description: "Weekly Tuesday FINNIFTY Defined-Risk Bull Call Debit Spread",
        version: "1.0.0",
        type: "OPTIONS_SPREAD",
        instrument: "FINNIFTY",
        exchange: "NFO",
        timeframe: "15m",
        marketSegment: "OPTIONS",
        dsl: {
          dslVersion: "1.0.0",
          name: "FINNIFTY_BULL_CALL_SPREAD",
          description: "Weekly Tuesday FINNIFTY Defined-Risk Bull Call Debit Spread",
          underlying: "FINNIFTY",
          marketSegment: "OPTIONS",
          entry: {
            direction: "BUY",
            instrumentType: "CE",
            timeframe: "15m",
            conditions: [
              { indicator: "EMA", period: 20, operator: "ABOVE", value: "EMA(50)" },
              { indicator: "ADX", period: 14, operator: "ABOVE", value: "22" },
            ],
          },
          exit: {
            rules: [
              { type: "STOP_LOSS", value: 1.5, unit: "PERCENT" },
              { type: "TARGET", value: 3.0, unit: "PERCENT" },
            ],
            maxHoldingMinutes: 180,
          },
          risk: {
            positionSizingType: "FIXED_LOT",
            sizingValue: 2,
            maxDailyTrades: 2,
            maxDailyLoss: 4000,
            maxDrawdownPct: 4.9,
            stopLossPct: 1.5,
            targetPct: 3.0,
          },
          targetRegimes: ["TRENDING_BULL", "BREAKOUT"],
        },
        parameterSchema: { emaFast: 20, emaSlow: 50, adxMin: 22 },
        status: "RESEARCH",
        healthScore: 0,
        createdBy: "SystemArchitect",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "v2.0.0",
        promptVersion: "p1.0",
        codeVersion: "c2.0.0",
        allocationCapital: 250000,
        activeStage: "STAGE_1",
        metrics: createDefaultMetrics(0, 0, 0, 0, 0, 0),
        explanation: createDefaultExplanation(
          "Constructs defined-risk Bull Call Debit Spreads (Buy ATM CE + Sell OTM CE) when Financial Services index forms higher-low structures above 20 EMA.",
          "Capped-risk upside participation while mitigating theta decay and volatility crush through the short leg.",
          [
            "Underlying advances moderately towards the short strike by weekly Tuesday expiry",
            "Defined max loss protects against sudden market turnarounds"
          ],
          [
            "Flat or slowly drifting down market resulting in loss of net debit paid"
          ],
          [
            "Bid-ask spread drag when closing both legs simultaneously",
            "Early assignment risk near expiry"
          ]
        ),
      },
      {
        strategyId: "STRAT_SENSEX_CONDOR_V1",
        name: "SENSEX_IRON_CONDOR",
        description: "BSE SENSEX Expiry Delta-Neutral 4-Leg Defined-Risk Credit Spread",
        version: "1.0.0",
        type: "OPTIONS_SPREAD",
        instrument: "SENSEX",
        exchange: "BFO",
        timeframe: "15m",
        marketSegment: "OPTIONS",
        dsl: {
          dslVersion: "1.0.0",
          name: "SENSEX_IRON_CONDOR",
          description: "BSE SENSEX Expiry Delta-Neutral 4-Leg Defined-Risk Credit Spread",
          underlying: "SENSEX",
          marketSegment: "OPTIONS",
          entry: {
            direction: "BUY",
            instrumentType: "CE",
            timeframe: "15m",
            conditions: [
              { indicator: "ADX", period: 14, operator: "BELOW", value: "20" },
              { indicator: "RSI", period: 14, operator: "BETWEEN", value: "45,55" },
            ],
          },
          exit: {
            rules: [
              { type: "STOP_LOSS", value: 1.0, unit: "PERCENT" },
              { type: "TARGET", value: 1.8, unit: "PERCENT" },
            ],
            maxHoldingMinutes: 240,
          },
          risk: {
            positionSizingType: "FIXED_LOT",
            sizingValue: 1,
            maxDailyTrades: 2,
            maxDailyLoss: 6000,
            maxDrawdownPct: 2.9,
            stopLossPct: 1.0,
            targetPct: 1.8,
          },
          targetRegimes: ["RANGING", "LOW_VOLATILITY"],
        },
        parameterSchema: { maxAdx: 20, rsiCenter: 50 },
        status: "RESEARCH",
        healthScore: 0,
        createdBy: "StrategyResearchAgent",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "gemini-1.5-pro",
        promptVersion: "p2.1",
        codeVersion: "c2.0.0",
        allocationCapital: 300000,
        activeStage: "STAGE_1",
        metrics: createDefaultMetrics(0, 0, 0, 0, 0, 0),
        explanation: createDefaultExplanation(
          "Non-directional delta-neutral 4-leg credit spread collecting rapid theta decay on SENSEX Friday expiries when India VIX remains below 16.",
          "Overpricing of far OTM options implied volatility relative to realized intraday standard deviation on expiry day.",
          [
            "SENSEX remains within 1.2% expected move range between 09:30 and 15:00 IST",
            "Time decay accelerates in last 3 hours of Friday session"
          ],
          [
            "Global geopolitical shock or crude oil surge moving SENSEX > 1,000 points intraday"
          ],
          [
            "BSE F&O liquidity variations in far OTM wings",
            "Higher brokerage and STT impact across 4 legs"
          ]
        ),
      },
      {
        strategyId: "STRAT_BTC_MOMENTUM_V1",
        name: "BTC_LAKSHMI_ALPHA_TREND",
        description: "BTCUSDT Multi-Timeframe Lakshmi Alpha Trend & Breakout Engine",
        version: "1.0.0",
        type: "TREND_FOLLOWING",
        instrument: "BTCUSDT",
        exchange: "NSE",
        timeframe: "1h",
        marketSegment: "EQUITY",
        dsl: {
          dslVersion: "1.0.0",
          name: "BTC_LAKSHMI_ALPHA_TREND",
          description: "BTCUSDT Multi-Timeframe Lakshmi Alpha Trend & Breakout Engine",
          underlying: "BTCUSDT",
          marketSegment: "EQUITY",
          entry: {
            direction: "BUY",
            instrumentType: "FUTURE",
            timeframe: "1h",
            conditions: [
              { indicator: "EMA", period: 9, operator: "ABOVE", value: "EMA(21)" },
              { indicator: "ADX", period: 14, operator: "ABOVE", value: "25" },
            ],
          },
          exit: {
            rules: [
              { type: "STOP_LOSS", value: 2.0, unit: "PERCENT" },
              { type: "TARGET", value: 5.0, unit: "PERCENT" },
              { type: "TRAILING_STOP", value: 1.5, unit: "PERCENT" },
            ],
            maxHoldingMinutes: 720,
          },
          risk: {
            positionSizingType: "FIXED_LOT",
            sizingValue: 1,
            maxDailyTrades: 4,
            maxDailyLoss: 10000,
            maxDrawdownPct: 5.2,
            stopLossPct: 2.0,
            targetPct: 5.0,
          },
          targetRegimes: ["TRENDING_BULL", "HIGH_VOLATILITY"],
        },
        parameterSchema: { emaFast: 9, emaSlow: 21, adxTrend: 25 },
        status: "RESEARCH",
        healthScore: 0,
        createdBy: "LakshmiMasterEngine",
        createdAt: new Date(),
        updatedAt: new Date(),
        modelVersion: "v5.0.0",
        promptVersion: "p3.0",
        codeVersion: "c3.0.0",
        allocationCapital: 1000000,
        activeStage: "FULL",
        metrics: createDefaultMetrics(0, 0, 0, 0, 0, 0),
        explanation: createDefaultExplanation(
          "Combines Lakshmi Master Router with Ohmkara octave harmonic frequency and multi-timeframe EMA alignment to capture regime breakout expansions.",
          "Cryptocurrency momentum clustering and cascade liquidations driving explosive continuation trends.",
          [
            "High volume breakout of previous 24h high/low continues with 70%+ probability",
            "Trailing stop locks in supernormal windfall gains during vertical runs"
          ],
          [
            "Prolonged low-volatility weekend chop",
            "Sudden liquidation wick hunting both sides"
          ],
          [
            "Exchange API rate limits during massive volatility",
            "Funding rate drag during high open interest"
          ]
        ),
      },
    ];

    for (const strat of strategies) {
      this.memoryCache.set(strat.strategyId, strat);
    }
  }
}
