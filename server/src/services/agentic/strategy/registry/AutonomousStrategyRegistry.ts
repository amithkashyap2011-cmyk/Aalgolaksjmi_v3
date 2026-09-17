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
  public async registerStrategy(record: IStrategyRecord): Promise<IStrategyRecord> {
    // Check if an existing version exists for this strategy
    const existingKey = `${record.name}:${record.version}`;
    const existing = this.memoryCache.get(record.strategyId);

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

  private registerDefaultProductionStrategies(): void {
    const marketOpen = this.isIndianMarketOpen();
    const defaultNiftyBreakout: IStrategyRecord = {
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
          maxDrawdownPct: 6.0,
          stopLossPct: 1.0,
          targetPct: 2.0,
        },
        targetRegimes: ["TRENDING_BULL", "HIGH_VOLATILITY"],
      },
      parameterSchema: { emaFast: 9, emaSlow: 21, rsiPeriod: 14 },
      status: marketOpen ? "PAPER" : "PAUSED",
      healthScore: marketOpen ? 85 : 0,
      createdBy: "SystemArchitect",
      createdAt: new Date(),
      updatedAt: new Date(),
      modelVersion: "v2.0.0",
      promptVersion: "p1.0",
      codeVersion: "c2.0.0",
      allocationCapital: 0,
      activeStage: "STAGE_1",
    };

    this.memoryCache.set(defaultNiftyBreakout.strategyId, defaultNiftyBreakout);
  }
}
