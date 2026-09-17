/**
 * ═══════════════════════════════════════════════════════════════════
 *  CENTRAL PORTFOLIO INTELLIGENCE ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *  Authoritative orchestrator coordinating all 12 portfolio sub-engines:
 *   1. Authoritative Capital Manager
 *   2. Exposure & Greeks Engine
 *   3. Correlation & Hidden Exposure Engine
 *   4. Risk Budget Engine
 *   5. Drawdown & Dynamic Scaling Engine
 *   6. Value-at-Risk (VaR) Engine
 *   7. Liquidity & Execution Capacity Engine
 *   8. Scenario & Stress Test Engine
 *   9. Capital Allocation & Reserve Engine
 *  10. Position Sizing Engine
 *  11. Pre-Trade Portfolio Simulator
 *  12. Strategy Competition Manager
 *
 *  Provides the Unified Decision Pipeline:
 *  Strategy Signal -> Position Sizing -> Portfolio Simulation -> Exposure ->
 *  Correlation -> Risk Budget -> Capital Allocation -> Policy Engine -> Execution
 */

import {
  IAuthoritativeCapitalState,
  IPortfolioPositionItem,
  IPortfolioExposure,
  IReserveCapital,
  IStrategyAllocation,
  IPositionSizingRequest,
  IPositionSizingResult,
  IPreTradeSimulationResult,
  IStressScenarioResult,
  IVaRResult,
  PortfolioDrawdownState,
  VolatilityRegime,
  IPortfolioProposal,
  AssetClass,
  TradeDirection,
} from "./types.js";
import { AuthoritativeCapitalManager, roundTo2 } from "./capital/AuthoritativeCapitalManager.js";
import { PortfolioExposureEngine } from "./exposure/PortfolioExposureEngine.js";
import { PortfolioCorrelationEngine } from "./correlation/PortfolioCorrelationEngine.js";
import { PortfolioRiskBudgetEngine } from "./risk/PortfolioRiskBudgetEngine.js";
import { PortfolioDrawdownEngine } from "./risk/PortfolioDrawdownEngine.js";
import { PortfolioVaREngine } from "./risk/PortfolioVaREngine.js";
import { PortfolioLiquidityEngine, ILiquidityMarketData } from "./liquidity/PortfolioLiquidityEngine.js";
import { PortfolioScenarioStressEngine } from "./stress/PortfolioScenarioStressEngine.js";
import { PortfolioCapitalAllocationEngine, IStrategyCandidateMetric } from "./allocation/PortfolioCapitalAllocationEngine.js";
import { PortfolioPositionSizingEngine } from "./allocation/PortfolioPositionSizingEngine.js";
import { PreTradePortfolioSimulator, IProposedTradeSimulationInput } from "./simulation/PreTradePortfolioSimulator.js";
import { StrategyCompetitionManager, ICandidateSignal } from "./competition/StrategyCompetitionManager.js";
import { PortfolioOptimizerEngine } from "./optimizer/PortfolioOptimizerEngine.js";
import { PortfolioDriftMonitor, IPortfolioDriftReport } from "./monitoring/PortfolioDriftMonitor.js";
import { PortfolioAuditLogger } from "./audit/PortfolioAuditLogger.js";
import { Trade } from "../../../models/Trade.js";
import { User } from "../../../models/User.js";
import { WalletSnapshot } from "../../../models/WalletSnapshot.js";
import * as paper from "../../paperState.js";
import { toValidObjectId } from "../../../utils/mongoUtils.js";
import mongoose from "mongoose";

export interface IPortfolioFullSnapshot {
  capital: IAuthoritativeCapitalState;
  reserves: IReserveCapital;
  exposure: IPortfolioExposure;
  allocations: IStrategyAllocation[];
  drawdownState: PortfolioDrawdownState;
  drawdownMetrics: any;
  volatilityRegime: VolatilityRegime;
  riskBudget: any;
  stressResults: IStressScenarioResult[];
  var95: IVaRResult;
  driftReport: IPortfolioDriftReport;
  hiddenClusters: any;
  timestamp: string;
}

export interface ITradeEvaluationPipelineResult {
  approved: boolean;
  sizing: IPositionSizingResult;
  simulation: IPreTradeSimulationResult;
  rejectionReason?: string;
  warnings: string[];
}

export class PortfolioIntelligenceEngine {
  private static activePositions: IPortfolioPositionItem[] = [];
  private static strategyAllocations: Map<string, IStrategyAllocation> = new Map();
  private static volatilityRegime: VolatilityRegime = "NORMAL";
  private static emergencyHalt: boolean = false;
  private static dailyLossInr: number = 0;
  private static dailyReturnsHistory: number[] = [];

  // Simple concurrency mutex for trade evaluations
  private static evaluationLock: Promise<void> = Promise.resolve();

  /**
   * Serializes access to this class's static state (AuthoritativeCapitalManager,
   * PortfolioDrawdownEngine's peak-equity baseline, PortfolioDriftMonitor's
   * cooldown, activePositions, etc.) across EVERY public entry point that
   * reads or mutates it.
   *
   * BUGFIX: evaluateTradeProposal used to acquire this lock itself, but
   * getSynchronizedPortfolioSnapshot() (backing the dashboard's /snapshot and
   * /exposure routes) called syncFromAuthoritativeLedger() directly with no
   * lock at all, and getPortfolioSnapshot() (backing /allocations, /rebalance,
   * /explain, and PortfolioAgent) mutated PortfolioDrawdownEngine/
   * PortfolioDriftMonitor's static state via evaluateDrawdown()/evaluateDrift()
   * with no lock either. A dashboard poll for one user could interleave with
   * an in-flight locked evaluation for a different user and read or write a
   * mix of both users' capital/drawdown state. Routing every entry point
   * through the same withLock() closes all of these, not just the one
   * evaluateTradeProposal path that was fixed first.
   */
  private static async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let releaseLock: () => void;
    const currentLock = this.evaluationLock;
    this.evaluationLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    await currentLock;
    try {
      return await fn();
    } finally {
      releaseLock!();
    }
  }

  /**
   * Unified Pre-Trade Evaluation Gatekeeper Pipeline.
   * Evaluates a strategy signal through all portfolio risk and capital checks.
   *
   * `syncUser`, when given, re-syncs AuthoritativeCapitalManager (and the
   * PortfolioDrawdownEngine peak-equity baseline it resets alongside) from
   * that user's real wallet/positions BEFORE evaluation, under the SAME lock
   * acquisition as the evaluation itself. Callers used to call
   * syncFromAuthoritativeLedger() separately beforehand, but that ran
   * outside this lock — with multiple Indian-market users evaluated on
   * overlapping 60s cycles, one user's sync (an async DB call) could
   * interleave with another's, so a trade could be evaluated against a
   * DIFFERENT user's capital/drawdown state than the one it was actually
   * proposed for. Folding the sync into the same critical section closes
   * that race.
   */
  public static async evaluateTradeProposal(
    proposed: IProposedTradeSimulationInput,
    sizingReq: IPositionSizingRequest,
    marketData?: ILiquidityMarketData,
    syncUser?: { userId?: string; mode?: "PAPER" | "LIVE" }
  ): Promise<ITradeEvaluationPipelineResult> {
    return this.withLock(async () => {
      if (syncUser) {
        await this.syncFromAuthoritativeLedger(syncUser.userId, syncUser.mode ?? "PAPER");
      }
      const warnings: string[] = [];

      // 1. Emergency Halt Check
      if (this.emergencyHalt) {
        return {
          approved: false,
          sizing: {
            suggestedQuantity: 0,
            suggestedLots: 0,
            capitalRequiredInr: 0,
            riskAmountInr: 0,
            sizingModelUsed: sizingReq.model,
            cappedBy: "RISK_BUDGET",
            rationale: "PORTFOLIO_EMERGENCY_HALT_ACTIVE",
          },
          simulation: null as any,
          rejectionReason: "PORTFOLIO_EMERGENCY_HALT_ACTIVE: All autonomous execution halted.",
          warnings: ["EMERGENCY_HALT_ACTIVE"],
        };
      }

      // 2. Authoritative Capital & Reserves
      const capital = AuthoritativeCapitalManager.getCapitalState();
      const reserves = PortfolioCapitalAllocationEngine.calculateReserves(capital.netEquity, this.volatilityRegime);

      // 3. Drawdown Engine Check
      const ddMetrics = PortfolioDrawdownEngine.evaluateDrawdown(capital.netEquity);
      if (!ddMetrics.canOpenNewPositions) {
        return {
          approved: false,
          sizing: {
            suggestedQuantity: 0,
            suggestedLots: 0,
            capitalRequiredInr: 0,
            riskAmountInr: 0,
            sizingModelUsed: sizingReq.model,
            cappedBy: "RISK_BUDGET",
            rationale: `DRAWDOWN_STATE_${ddMetrics.state}`,
          },
          simulation: null as any,
          rejectionReason: `PORTFOLIO_DRAWDOWN_LIMIT: Portfolio in ${ddMetrics.state} state (${ddMetrics.currentDrawdownPct}% DD). New entries blocked.`,
          warnings: ddMetrics.warnings,
        };
      }

      // 4. Strategy Capital & Position Sizing
      const existingAlloc = this.strategyAllocations.get(proposed.strategyId);
      const strategyAvailableCapital = existingAlloc
        ? existingAlloc.availableCapitalInr
        : roundTo2(reserves.activeAllocationInr * 0.2); // Default 20% if new

      const sizing = PortfolioPositionSizingEngine.calculateSize(
        sizingReq,
        capital.netEquity,
        strategyAvailableCapital
      );

      if (sizing.suggestedQuantity <= 0) {
        return {
          approved: false,
          sizing,
          simulation: null as any,
          rejectionReason: `SIZING_REJECTED: Available capital or risk budget resulted in 0 lots. (${sizing.cappedBy})`,
          warnings: [sizing.rationale],
        };
      }

      // 5. Liquidity & Execution Capacity Check
      if (marketData) {
        const liqAssessment = PortfolioLiquidityEngine.assessLiquidity(sizing.suggestedQuantity, marketData);
        if (!liqAssessment.approved) {
          return {
            approved: false,
            sizing,
            simulation: null as any,
            rejectionReason: liqAssessment.rejectionReason,
            warnings: liqAssessment.warnings,
          };
        }
        if (liqAssessment.maxPermittedQuantity < sizing.suggestedQuantity) {
          sizing.suggestedQuantity = liqAssessment.maxPermittedQuantity;
          sizing.suggestedLots = Math.floor(liqAssessment.maxPermittedQuantity / sizingReq.lotSize);
          warnings.push(...liqAssessment.warnings);
        }
      }

      // 6. Pre-Trade Portfolio Simulation
      const simInput: IProposedTradeSimulationInput = {
        ...proposed,
        quantity: sizing.suggestedQuantity,
        marginRequired: sizing.capitalRequiredInr,
      };

      const simulation = PreTradePortfolioSimulator.simulateTrade(
        this.activePositions,
        capital,
        reserves,
        simInput
      );

      if (!simulation.allowed) {
        PortfolioAuditLogger.logDecision({
          event: "TRADE_REJECTED",
          portfolioStateSnapshot: capital,
          marketRegime: this.volatilityRegime,
          drawdownState: ddMetrics.state,
          allocationsBefore: {},
          allocationsAfter: {},
          decidingAgent: "PORTFOLIO_INTELLIGENCE_ENGINE",
          policyVersion: "1.0.0",
          approved: false,
          rationale: simulation.rejectionReason || "SIMULATION_FAILED",
        });

        return {
          approved: false,
          sizing,
          simulation,
          rejectionReason: simulation.rejectionReason,
          warnings: simulation.warnings,
        };
      }

      // 7. Risk Budget Evaluation
      const riskCheck = PortfolioRiskBudgetEngine.evaluateRiskBudget(
        sizing.riskAmountInr,
        proposed.strategyId,
        proposed.underlying,
        this.dailyLossInr,
        capital.netEquity
      );

      if (!riskCheck.approved) {
        return {
          approved: false,
          sizing,
          simulation,
          rejectionReason: riskCheck.rejectionReason,
          warnings,
        };
      }

      warnings.push(...simulation.warnings);

      // Audit approved decision
      PortfolioAuditLogger.logDecision({
        event: "TRADE_APPROVED",
        portfolioStateSnapshot: capital,
        marketRegime: this.volatilityRegime,
        drawdownState: ddMetrics.state,
        allocationsBefore: {},
        allocationsAfter: {},
        decidingAgent: "PORTFOLIO_INTELLIGENCE_ENGINE",
        policyVersion: "1.0.0",
        approved: true,
        rationale: `Approved ${sizing.suggestedLots} lots on ${proposed.symbol}.`,
      });

      return {
        approved: true,
        sizing,
        simulation,
        warnings,
      };
    });
  }

  /**
   * Retrieves complete, real-time snapshot of the portfolio state.
   *
   * BUGFIX: this used to be a synchronous method that mutated
   * PortfolioDrawdownEngine's static peak-equity baseline (via
   * evaluateDrawdown) and PortfolioDriftMonitor's static cooldown timestamp
   * (via evaluateDrift) with no lock, so a dashboard poll (/allocations,
   * /rebalance, /explain) could interleave with an in-flight locked
   * evaluateTradeProposal for a different user and corrupt the shared state.
   * Now async and lock-protected like every other entry point.
   */
  public static async getPortfolioSnapshot(): Promise<IPortfolioFullSnapshot> {
    return this.withLock(async () => this.getPortfolioSnapshotUnlocked());
  }

  /**
   * Core snapshot logic, callable only from within withLock() — used
   * directly (already-locked) by getSynchronizedPortfolioSnapshot() to avoid
   * a nested/reentrant lock acquisition that would deadlock.
   */
  private static getPortfolioSnapshotUnlocked(): IPortfolioFullSnapshot {
    const capital = AuthoritativeCapitalManager.getCapitalState();
    const reserves = PortfolioCapitalAllocationEngine.calculateReserves(capital.netEquity, this.volatilityRegime);
    const exposure = PortfolioExposureEngine.calculateExposure(this.activePositions, capital.netEquity);
    const ddMetrics = PortfolioDrawdownEngine.evaluateDrawdown(capital.netEquity);
    const riskBudget = PortfolioRiskBudgetEngine.getRiskBudget(capital.netEquity);
    const stressResults = PortfolioScenarioStressEngine.runStressSuite(this.activePositions, capital);
    const var95 = PortfolioVaREngine.calculateVaR(this.dailyReturnsHistory, capital.netEquity, 0.95);
    const allocations = Array.from(this.strategyAllocations.values());
    const driftReport = PortfolioDriftMonitor.evaluateDrift(allocations);
    const hiddenClusters = PortfolioCorrelationEngine.detectHiddenExposure(this.activePositions);

    return {
      capital,
      reserves,
      exposure,
      allocations,
      drawdownState: ddMetrics.state,
      drawdownMetrics: ddMetrics,
      volatilityRegime: this.volatilityRegime,
      riskBudget,
      stressResults,
      var95,
      driftReport,
      hiddenClusters,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Updates active positions list and recalculates capital/margin commitments.
   */
  public static syncActivePositions(positions: IPortfolioPositionItem[]): void {
    this.activePositions = [...positions];
    const totalUsedMargin = positions.reduce((sum, p) => sum + (p.marginRequired || 0), 0);
    const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);

    AuthoritativeCapitalManager.updateCapital({
      usedMargin: totalUsedMargin,
      unrealizedPnl: totalUnrealizedPnl,
    });
  }

  /**
   * Dynamically synchronizes portfolio capital and active positions from the authoritative
   * database/wallet state for the given user, instead of using static hardcoded numbers.
   */
  public static async syncFromAuthoritativeLedger(userId?: string, mode: "PAPER" | "LIVE" = "PAPER"): Promise<void> {
    try {
      let targetUserId = userId;
      if (!targetUserId || targetUserId === "guest-user" || targetUserId === "undefined") {
        if (mongoose.connection?.readyState === 1) {
          const primaryUser = await User.findOne({}).lean();
          if (primaryUser) targetUserId = primaryUser._id.toString();
        }
      }
      if (!targetUserId) targetUserId = "000000000000000000000000";

      const indianAccountTypes = ["INDIAN_NSE", "INDIAN_BSE", "INDIAN_NIFTY50", "INDIAN_FNO", "INDIAN_EQUITY"];
      let openTrades: any[] = [];
      let closedTrades: any[] = [];

      if (mongoose.connection?.readyState === 1) {
        const userObjId = toValidObjectId(targetUserId);
        const userQuery = userObjId ? { $or: [{ userId: userObjId }, { userId: targetUserId }] } : {};

        [openTrades, closedTrades] = await Promise.all([
          Trade.find({
            ...userQuery,
            status: { $in: ["OPEN", "TARGET_TRIGGERED", "STOP_TRIGGERED", "EXIT_PENDING"] },
            accountType: { $in: indianAccountTypes },
          }).lean(),
          Trade.find({
            ...userQuery,
            status: "CLOSED",
            accountType: { $in: indianAccountTypes },
          }).lean(),
        ]);
      }

      // Map open trades to active positions
      const mappedPositions: IPortfolioPositionItem[] = openTrades.map((t: any) => {
        const symbol = String(t.symbol || "NIFTY");
        const underlying = symbol.includes("BANKNIFTY")
          ? "BANKNIFTY"
          : symbol.includes("NIFTY")
          ? "NIFTY"
          : "EQUITY";
        const instrumentType: "EQUITY" | "FUTURE" | "CE" | "PE" = symbol.includes("CE")
          ? "CE"
          : symbol.includes("PE")
          ? "PE"
          : (t.accountType?.includes("FNO") || t.accountType?.includes("NIFTY"))
          ? "FUTURE"
          : "EQUITY";
        const assetClass: AssetClass = (instrumentType === "CE" || instrumentType === "PE")
          ? "OPTIONS"
          : (instrumentType === "FUTURE" ? "FUTURES" : "EQUITY");
        const currentLtp = t.currentPrice || t.entryPrice || 0;
        const notional = (t.quantity || 0) * currentLtp;
        const marginRequired = notional / (t.leverage || 1);
        const unrealizedPnl = t.pnl || 0;
        const lotSize = underlying === "NIFTY" ? 25 : underlying === "BANKNIFTY" ? 15 : 1;
        const lots = Math.max(1, Math.round((t.quantity || lotSize) / lotSize));

        return {
          positionId: t._id.toString(),
          strategyId: t.strategyId || "DEFAULT",
          strategyName: t.strategyName || t.strategyId || "Intraday Trend Strategy",
          agentId: t.agentId || "DEFAULT",
          symbol,
          underlying,
          assetClass,
          instrumentType,
          side: (t.side === "SELL" ? "SELL" : "BUY") as TradeDirection,
          quantity: t.quantity || 0,
          lotSize,
          lots,
          entryPrice: t.entryPrice || 0,
          currentLtp,
          notionalValue: notional,
          marketValue: notional,
          marginRequired,
          unrealizedPnl,
          realizedPnl: 0,
          greeks: {
            delta: (t.side === "BUY" ? 1 : -1) * (t.quantity || 0),
            gamma: 0,
            theta: 0,
            vega: 0,
          },
        };
      });

      this.activePositions = mappedPositions;

      // Calculate real available cash across Indian accounts
      let availableCash = 0;
      if (mode === "PAPER") {
        for (const acc of indianAccountTypes) {
          const bal = paper.getWallet(targetUserId, mode, acc as any).get("INR") ?? 0;
          availableCash += bal;
        }
        if (availableCash === 0 && mongoose.connection?.readyState === 1) {
          const userObjId = toValidObjectId(targetUserId);
          const snaps = await WalletSnapshot.find({
            ...(userObjId ? { $or: [{ userId: userObjId }, { userId: targetUserId }] } : {}),
            mode: "PAPER",
            accountType: { $in: indianAccountTypes },
          }).lean();
          for (const s of snaps) {
            availableCash += Number((s.balances as any)?.INR || 0);
          }
        }
      }

      const totalUsedMargin = mappedPositions.reduce((sum, p) => sum + p.marginRequired, 0);
      const totalUnrealizedPnl = mappedPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
      const totalRealizedPnl = closedTrades.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0);

      const netEquity = roundTo2(availableCash + totalUsedMargin + totalUnrealizedPnl);
      const freeMargin = roundTo2(Math.max(0, netEquity - totalUsedMargin));
      const startingCapital = roundTo2(availableCash + totalUsedMargin - totalRealizedPnl - totalUnrealizedPnl);

      AuthoritativeCapitalManager.updateCapital({
        startingCapital: Math.max(0, startingCapital),
        availableCash: roundTo2(availableCash),
        usedMargin: roundTo2(totalUsedMargin),
        freeMargin,
        netEquity,
        realizedPnl: roundTo2(totalRealizedPnl),
        unrealizedPnl: roundTo2(totalUnrealizedPnl),
      });

      PortfolioDrawdownEngine.resetBaseline(netEquity);
    } catch (err: any) {
      console.warn("[PortfolioIntelligenceEngine] syncFromAuthoritativeLedger warning:", err.message);
    }
  }

  /**
   * Lock-protected sync + capital read, for callers (indianMarketAutoTrader's
   * autoExecuteBestTrade) that need a fresh capital figure to size a trade
   * proposal BEFORE calling evaluateTradeProposal (which does its own,
   * separately-locked authoritative re-sync at gate time). Without the lock
   * here, this read could race the same way the dashboard snapshot routes
   * used to: interleaving with another user's concurrent sync and returning
   * a number that belongs to neither user consistently.
   */
  public static async syncAndGetCapital(userId?: string, mode: "PAPER" | "LIVE" = "PAPER"): Promise<number> {
    return this.withLock(async () => {
      await this.syncFromAuthoritativeLedger(userId, mode);
      const capitalState = AuthoritativeCapitalManager.getCapitalState();
      return capitalState.netEquity || capitalState.availableCash || 0;
    });
  }

  /**
   * Returns a real-time portfolio snapshot synchronized with the user's actual wallet & open positions.
   *
   * BUGFIX: used to call syncFromAuthoritativeLedger() and getPortfolioSnapshot()
   * as two separate unlocked calls — sync+read wasn't atomic, so another
   * user's concurrent evaluation or dashboard poll could sync in between and
   * this would read a snapshot of the WRONG user's freshly-synced state.
   * Both now happen inside one lock acquisition.
   */
  public static async getSynchronizedPortfolioSnapshot(userId?: string, mode: "PAPER" | "LIVE" = "PAPER"): Promise<IPortfolioFullSnapshot> {
    return this.withLock(async () => {
      await this.syncFromAuthoritativeLedger(userId, mode);
      return this.getPortfolioSnapshotUnlocked();
    });
  }

  /**
   * Initializes or updates strategy allocations.
   */
  public static setStrategyAllocations(allocations: IStrategyAllocation[]): void {
    this.strategyAllocations.clear();
    for (const a of allocations) {
      this.strategyAllocations.set(a.strategyId, a);
    }
  }

  /**
   * Sets market volatility regime.
   */
  public static setVolatilityRegime(regime: VolatilityRegime): void {
    this.volatilityRegime = regime;
  }

  /**
   * Emergency portfolio halt controls.
   */
  public static triggerEmergencyHalt(reason: string): void {
    this.emergencyHalt = true;
    PortfolioAuditLogger.logDecision({
      event: "EMERGENCY_HALT_TRIGGERED",
      portfolioStateSnapshot: AuthoritativeCapitalManager.getCapitalState(),
      marketRegime: this.volatilityRegime,
      drawdownState: "EMERGENCY",
      allocationsBefore: {},
      allocationsAfter: {},
      decidingAgent: "OPERATOR_OR_CIRCUIT_BREAKER",
      policyVersion: "1.0.0",
      approved: false,
      rationale: reason,
    });
  }

  public static resetEmergencyHalt(): void {
    this.emergencyHalt = false;
  }

  public static isEmergencyHalted(): boolean {
    return this.emergencyHalt;
  }

  /**
   * Resets entire engine state (for test suites).
   */
  public static reset(initialCapital = 0.0): void {
    AuthoritativeCapitalManager.reset(initialCapital);
    PortfolioDrawdownEngine.resetBaseline(initialCapital);
    PortfolioDriftMonitor.reset();
    PortfolioAuditLogger.clear();
    this.activePositions = [];
    this.strategyAllocations.clear();
    this.volatilityRegime = "NORMAL";
    this.emergencyHalt = false;
    this.dailyLossInr = 0;
    this.dailyReturnsHistory = [];
  }
}
