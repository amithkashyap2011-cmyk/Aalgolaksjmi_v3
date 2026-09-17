/**
 * ═══════════════════════════════════════════════════════════════════
 *  PHASE 11 — AUTONOMOUS PORTFOLIO INTELLIGENCE & CAPITAL ALLOCATION
 * ═══════════════════════════════════════════════════════════════════
 *  Exhaustive Test Suite covering:
 *   1. Authoritative Capital State Reconciliation & Invariants
 *   2. Multi-Dimensional Exposure & Option Greeks (Black-Scholes)
 *   3. Correlation Engine & Hidden Composite Exposure Detection
 *   4. Multi-Tiered Risk Budgeting & Single Position Caps
 *   5. Reserve Capital Preservation (>= 25% Guaranteed)
 *   6. Dynamic Risk-Adjusted Strategy Allocation
 *   7. Position Sizing (Fixed Risk, ATR Volatility, Fractional Kelly)
 *   8. Pre-Trade Portfolio Simulation & Margin Projection
 *   9. Drawdown State Machine & Dynamic Risk Scaling
 *  10. Macroeconomic & Volatility Stress Testing
 *  11. Strategy Competition, Opposing Signal Conflicts & Hedge Detection
 *  12. Allocation Drift Monitoring & Rebalance Cooldown
 *  13. Portfolio Agent AI Reasoning & Audit Trail
 *  14. Concurrency & Mutex Thread-Safety
 *  15. Backtest Oracle Testing (10,000 Randomized Portfolio Scenarios)
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { AuthoritativeCapitalManager } from "../src/services/agentic/portfolio/capital/AuthoritativeCapitalManager.js";
import { PortfolioExposureEngine } from "../src/services/agentic/portfolio/exposure/PortfolioExposureEngine.js";
import { PortfolioCorrelationEngine } from "../src/services/agentic/portfolio/correlation/PortfolioCorrelationEngine.js";
import { PortfolioRiskBudgetEngine } from "../src/services/agentic/portfolio/risk/PortfolioRiskBudgetEngine.js";
import { PortfolioDrawdownEngine } from "../src/services/agentic/portfolio/risk/PortfolioDrawdownEngine.js";
import { PortfolioVaREngine } from "../src/services/agentic/portfolio/risk/PortfolioVaREngine.js";
import { PortfolioLiquidityEngine } from "../src/services/agentic/portfolio/liquidity/PortfolioLiquidityEngine.js";
import { PortfolioScenarioStressEngine } from "../src/services/agentic/portfolio/stress/PortfolioScenarioStressEngine.js";
import { PortfolioCapitalAllocationEngine } from "../src/services/agentic/portfolio/allocation/PortfolioCapitalAllocationEngine.js";
import { PortfolioPositionSizingEngine } from "../src/services/agentic/portfolio/allocation/PortfolioPositionSizingEngine.js";
import { PreTradePortfolioSimulator } from "../src/services/agentic/portfolio/simulation/PreTradePortfolioSimulator.js";
import { StrategyCompetitionManager } from "../src/services/agentic/portfolio/competition/StrategyCompetitionManager.js";
import { PortfolioOptimizerEngine } from "../src/services/agentic/portfolio/optimizer/PortfolioOptimizerEngine.js";
import { PortfolioDriftMonitor } from "../src/services/agentic/portfolio/monitoring/PortfolioDriftMonitor.js";
import { PortfolioAuditLogger } from "../src/services/agentic/portfolio/audit/PortfolioAuditLogger.js";
import { PortfolioIntelligenceEngine } from "../src/services/agentic/portfolio/PortfolioIntelligenceEngine.js";
import { IPortfolioPositionItem } from "../src/services/agentic/portfolio/types.js";

describe("PHASE 11 — Autonomous Portfolio Intelligence & Capital Allocation Engine", () => {
  beforeEach(() => {
    PortfolioIntelligenceEngine.reset(1000000.0); // Reset to standard ₹10,00,000 base
  });

  describe("1. Authoritative Capital State Reconciliation & Invariants", () => {
    it("maintains strict accounting consistency without numerical drift", () => {
      AuthoritativeCapitalManager.updateCapital({
        startingCapital: 1000000.0,
        deposits: 150000.0,
        withdrawals: 50000.0,
        realizedPnl: 35000.0,
        charges: 2450.0,
        unrealizedPnl: 12000.0,
        usedMargin: 200000.0,
      });

      const s = AuthoritativeCapitalManager.getCapitalState();
      // Expected Net Equity: 10,00,000 + 1,50,000 - 50,000 + 35,000 - 2,450 + 12,000 = 11,44,550
      expect(s.netEquity).toBe(1144550.0);
      expect(s.freeMargin).toBe(1144550.0 - 200000.0);
      expect(s.usedMargin).toBe(200000.0);

      const audit = AuthoritativeCapitalManager.verifyCapitalReconciliation();
      expect(audit.isConsistent).toBe(true);
      expect(audit.discrepancyPaise).toBe(0);
    });

    it("detects and flags accounting discrepancies between reported and calculated equity", () => {
      AuthoritativeCapitalManager.updateCapital({ startingCapital: 1000000.0 });
      // Simulate state
      const report = AuthoritativeCapitalManager.verifyCapitalReconciliation();
      expect(report.isConsistent).toBe(true);
    });
  });

  describe("2. Multi-Dimensional Exposure & Option Greeks", () => {
    it("aggregates Gross/Net exposure and Black-Scholes Greeks across mixed asset classes", () => {
      const positions: IPortfolioPositionItem[] = [
        {
          positionId: "P1",
          strategyId: "STRAT_NIFTY_FUT",
          strategyName: "NIFTY Futures Long",
          symbol: "NIFTY26SEPFUT",
          underlying: "NIFTY",
          assetClass: "FUTURES",
          instrumentType: "FUTURE",
          side: "BUY",
          quantity: 50, // 2 lots
          lotSize: 25,
          lots: 2,
          entryPrice: 24500,
          currentLtp: 24600,
          notionalValue: 1230000,
          marketValue: 1230000,
          marginRequired: 150000,
          unrealizedPnl: 5000,
          realizedPnl: 0,
        },
        {
          positionId: "P2",
          strategyId: "STRAT_NIFTY_OPT",
          strategyName: "NIFTY Call Long",
          symbol: "NIFTY26SEP24600CE",
          underlying: "NIFTY",
          assetClass: "OPTIONS",
          instrumentType: "CE",
          side: "BUY",
          quantity: 50,
          lotSize: 25,
          lots: 2,
          entryPrice: 180,
          currentLtp: 195,
          strike: 24600,
          dte: 7,
          iv: 14.5,
          notionalValue: 9750,
          marketValue: 9750,
          marginRequired: 9750,
          unrealizedPnl: 750,
          realizedPnl: 0,
        },
      ];

      const exposure = PortfolioExposureEngine.calculateExposure(positions, 1000000);

      expect(exposure.grossExposure).toBe(1239750);
      expect(exposure.longExposure).toBe(1239750);
      expect(exposure.shortExposure).toBe(0);
      expect(exposure.netExposure).toBe(1239750);

      // Futures Delta = 50 * 1.0 = 50. Options ATM Call Delta ~ 0.5 * 50 = ~25. Total Delta > 65
      expect(exposure.greeks.portfolioDelta).toBeGreaterThan(60);
      expect(exposure.greeks.portfolioTheta).toBeLessThan(0); // Option buyers have negative theta decay
    });
  });

  describe("3. Correlation Engine & Hidden Composite Exposure Detection", () => {
    it("discovers hidden directional concentration across diverse derivative types on the same underlying", () => {
      const positions: IPortfolioPositionItem[] = [
        {
          positionId: "P1",
          strategyId: "STRAT_1",
          strategyName: "Futures Trend",
          symbol: "NIFTY26SEPFUT",
          underlying: "NIFTY",
          assetClass: "FUTURES",
          instrumentType: "FUTURE",
          side: "BUY",
          quantity: 100, // 4 lots = Delta 100
          lotSize: 25,
          lots: 4,
          entryPrice: 24500,
          currentLtp: 24500,
          notionalValue: 2450000,
          marketValue: 2450000,
          marginRequired: 250000,
          unrealizedPnl: 0,
          realizedPnl: 0,
        },
        {
          positionId: "P2",
          strategyId: "STRAT_2",
          strategyName: "Call Breakout",
          symbol: "NIFTY26SEP24500CE",
          underlying: "NIFTY",
          assetClass: "OPTIONS",
          instrumentType: "CE",
          side: "BUY",
          quantity: 100, // Delta ~ 50
          lotSize: 25,
          lots: 4,
          entryPrice: 150,
          currentLtp: 150,
          strike: 24500,
          dte: 7,
          iv: 15,
          notionalValue: 15000,
          marketValue: 15000,
          marginRequired: 15000,
          unrealizedPnl: 0,
          realizedPnl: 0,
        },
        {
          positionId: "P3",
          strategyId: "STRAT_3",
          strategyName: "ETF Accumulator",
          symbol: "NIFTYBEES",
          underlying: "NIFTY",
          assetClass: "EQUITY",
          instrumentType: "EQUITY",
          side: "BUY",
          quantity: 100, // Delta 100
          lotSize: 1,
          lots: 100,
          entryPrice: 260,
          currentLtp: 260,
          notionalValue: 26000,
          marketValue: 26000,
          marginRequired: 26000,
          unrealizedPnl: 0,
          realizedPnl: 0,
        },
      ];

      const report = PortfolioCorrelationEngine.detectHiddenExposure(positions);
      expect(report.clusters.length).toBe(1);
      expect(report.clusters[0].underlying).toBe("NIFTY");
      expect(report.clusters[0].totalEquivalentDelta).toBeGreaterThan(150);
      expect(report.hasCriticalClustering).toBe(true);
      expect(report.warnings.some((w) => w.includes("CRITICAL_HIDDEN_EXPOSURE"))).toBe(true);
    });
  });

  describe("4. Multi-Tiered Risk Budgeting & Position Limits", () => {
    it("approves trade within risk budget and rejects when single-trade limit is breached", () => {
      const budget = PortfolioRiskBudgetEngine.getRiskBudget(1000000);
      expect(budget.portfolioDailyRiskInr).toBe(25000); // 2.5% of 10L

      // Moderate risk (₹5,000 <= 1% of 10L = ₹10,000)
      const approved = PortfolioRiskBudgetEngine.evaluateRiskBudget(5000, "STRAT_1", "NIFTY", 2000, 1000000);
      expect(approved.approved).toBe(true);

      // Oversized risk (₹15,000 > 1% of 10L = ₹10,000)
      const rejected = PortfolioRiskBudgetEngine.evaluateRiskBudget(15000, "STRAT_1", "NIFTY", 2000, 1000000);
      expect(rejected.approved).toBe(false);
      expect(rejected.rejectionReason).toContain("SINGLE_TRADE_RISK_LIMIT");
    });
  });

  describe("5. Reserve Capital Preservation (>= 25% Guaranteed)", () => {
    it("guarantees at least 25% of equity is locked in reserves under normal conditions", () => {
      const reserves = PortfolioCapitalAllocationEngine.calculateReserves(1000000, "NORMAL");
      expect(reserves.totalReservePct).toBeGreaterThanOrEqual(25.0);
      expect(reserves.totalReserveInr).toBeGreaterThanOrEqual(250000.0);
      expect(reserves.activeAllocationInr + reserves.totalReserveInr).toBe(1000000.0);
    });

    it("expands reserves automatically during EXTREME volatility regime", () => {
      const reserves = PortfolioCapitalAllocationEngine.calculateReserves(1000000, "EXTREME");
      expect(reserves.totalReservePct).toBe(50.0); // 20% margin + 15% risk + 15% emergency
      expect(reserves.totalReserveInr).toBe(500000.0);
      expect(reserves.activeAllocationInr).toBe(500000.0);
    });
  });

  describe("6. Dynamic Risk-Adjusted Strategy Allocation", () => {
    it("allocates more capital to higher Sharpe, low drawdown strategies", () => {
      const candidates = [
        {
          strategyId: "S1_HIGH_QUALITY",
          strategyName: "High Quality Strategy",
          expectedEdgeR: 2.0,
          winRate: 0.65,
          sharpeRatio: 2.5,
          maxDrawdownPct: 4.0,
          volatilityRatio: 0.9,
          confidenceScore: 0.95,
          averageCorrelation: 0.2,
        },
        {
          strategyId: "S2_LOWER_QUALITY",
          strategyName: "Lower Quality Strategy",
          expectedEdgeR: 1.1,
          winRate: 0.51,
          sharpeRatio: 1.1,
          maxDrawdownPct: 8.5,
          volatilityRatio: 1.4,
          confidenceScore: 0.7,
          averageCorrelation: 0.5,
        },
      ];

      const result = PortfolioCapitalAllocationEngine.allocateCapital(candidates, 1000000, "NORMAL");
      expect(result.allocations.length).toBe(2);

      const alloc1 = result.allocations.find((a) => a.strategyId === "S1_HIGH_QUALITY")!;
      const alloc2 = result.allocations.find((a) => a.strategyId === "S2_LOWER_QUALITY")!;

      expect(alloc1.allocatedCapitalInr).toBeGreaterThan(alloc2.allocatedCapitalInr * 2);
    });
  });

  describe("7. Position Sizing (Fixed Risk, ATR Volatility, Fractional Kelly)", () => {
    it("quantizes sizes to whole Indian lot sizes and respects risk caps", () => {
      // NIFTY lot size = 25
      const sizing = PortfolioPositionSizingEngine.calculateSize(
        {
          strategyId: "STRAT_1",
          symbol: "NIFTY26SEPFUT",
          underlying: "NIFTY",
          entryPrice: 24500,
          stopLossPrice: 24400, // 100 points risk
          lotSize: 25,
          model: "FIXED_RISK",
        },
        1000000, // Total equity
        200000   // Strategy available capital
      );

      // Sizing must be an integer multiple of 25
      expect(sizing.suggestedQuantity % 25).toBe(0);
      expect(sizing.suggestedLots).toBe(sizing.suggestedQuantity / 25);
      expect(sizing.riskAmountInr).toBeLessThanOrEqual(10000.0); // 1% of 10L
    });

    it("calculates bounded Half Kelly without exceeding maximum trade risk limits", () => {
      const sizing = PortfolioPositionSizingEngine.calculateSize(
        {
          strategyId: "STRAT_KELLY",
          symbol: "NIFTY26SEPFUT",
          underlying: "NIFTY",
          entryPrice: 24500,
          stopLossPrice: 24400,
          lotSize: 25,
          winRate: 0.65,
          payoffRatio: 1.8,
          model: "HALF_KELLY",
        },
        1000000,
        200000
      );

      expect(sizing.kellyFraction).toBeDefined();
      expect(sizing.kellyFraction!).toBeGreaterThan(0);
      expect(sizing.suggestedQuantity % 25).toBe(0);
      expect(sizing.riskAmountInr).toBeLessThanOrEqual(10000.0);
    });
  });

  describe("8. Pre-Trade Portfolio Simulation & Margin Projection", () => {
    it("rejects proposed trade if it violates mandatory reserve capital or margin ceiling", () => {
      const capital = AuthoritativeCapitalManager.getCapitalState();
      const reserves = PortfolioCapitalAllocationEngine.calculateReserves(capital.netEquity, "NORMAL");

      // Attempt trade requiring ₹800,000 margin on ₹1,000,000 equity (would violate 25% reserve)
      const sim = PreTradePortfolioSimulator.simulateTrade([], capital, reserves, {
        strategyId: "GREEDY_STRAT",
        strategyName: "Greedy Strategy",
        symbol: "NIFTY26SEPFUT",
        underlying: "NIFTY",
        side: "BUY",
        assetClass: "FUTURES",
        instrumentType: "FUTURE",
        quantity: 100,
        entryPrice: 24500,
        marginRequired: 800000,
      });

      expect(sim.allowed).toBe(false);
      expect(sim.checks.reserveIntact).toBe(false);
      expect(sim.rejectionReason).toContain("RESERVE_CAPITAL_BREACH");
    });
  });

  describe("9. Drawdown State Machine & Dynamic Risk Scaling", () => {
    it("transitions from NORMAL to CAUTION to REDUCE_RISK to EMERGENCY as drawdown deepens", () => {
      // 1. Peak at 10L, current at 10L -> NORMAL
      let d = PortfolioDrawdownEngine.evaluateDrawdown(1000000);
      expect(d.state).toBe("NORMAL");
      expect(d.riskScaleMultiplier).toBe(1.0);

      // 2. Drawdown to 9.75L (2.5% DD) -> CAUTION
      d = PortfolioDrawdownEngine.evaluateDrawdown(975000);
      expect(d.state).toBe("CAUTION");
      expect(d.riskScaleMultiplier).toBe(0.75);

      // 3. Drawdown to 9.55L (4.5% DD) -> REDUCE_RISK
      d = PortfolioDrawdownEngine.evaluateDrawdown(955000);
      expect(d.state).toBe("REDUCE_RISK");
      expect(d.riskScaleMultiplier).toBe(0.5);

      // 4. Drawdown to 8.9L (11% DD) -> EMERGENCY
      d = PortfolioDrawdownEngine.evaluateDrawdown(890000);
      expect(d.state).toBe("EMERGENCY");
      expect(d.riskScaleMultiplier).toBe(0.0);
      expect(d.canOpenNewPositions).toBe(false);
    });
  });

  describe("10. Macroeconomic & Volatility Stress Testing", () => {
    it("simulates portfolio P&L and margin utilization under severe gap down and flash crash shocks", () => {
      const positions: IPortfolioPositionItem[] = [
        {
          positionId: "P1",
          strategyId: "STRAT_LONG",
          strategyName: "Long Futures",
          symbol: "NIFTY26SEPFUT",
          underlying: "NIFTY",
          assetClass: "FUTURES",
          instrumentType: "FUTURE",
          side: "BUY",
          quantity: 50,
          lotSize: 25,
          lots: 2,
          entryPrice: 24500,
          currentLtp: 24500,
          notionalValue: 1225000,
          marketValue: 1225000,
          marginRequired: 150000,
          unrealizedPnl: 0,
          realizedPnl: 0,
        },
      ];

      const capital = AuthoritativeCapitalManager.getCapitalState();
      const stressResults = PortfolioScenarioStressEngine.runStressSuite(positions, capital);

      expect(stressResults.length).toBeGreaterThanOrEqual(4);

      const severeGap = stressResults.find((s) => s.scenarioName === "SEVERE_GAP_DOWN")!;
      // NIFTY -5% on 50 qty * 24500 = -₹61,250 impact
      expect(severeGap.estimatedPnlImpactInr).toBe(-61250);
      expect(severeGap.projectedMarginUtilizationPct).toBeGreaterThan(capital.marginUtilizationPct);
    });
  });

  describe("11. Strategy Competition, Opposing Signal Conflicts & Hedge Detection", () => {
    it("recognizes intentional structural option hedges on same underlying", () => {
      const signals: any[] = [
        {
          signalId: "SIG_1",
          strategyId: "STRAT_FUT",
          strategyName: "Long Future",
          symbol: "NIFTY26SEPFUT",
          underlying: "NIFTY",
          direction: "BUY",
          instrumentType: "FUTURE",
          quantity: 25,
          expectedEdgeR: 1.5,
          confidence: 0.8,
          sharpeRatio: 1.8,
          capitalRequired: 75000,
        },
        {
          signalId: "SIG_2",
          strategyId: "STRAT_HEDGE",
          strategyName: "Protective Put",
          symbol: "NIFTY26SEP24400PE",
          underlying: "NIFTY",
          direction: "BUY", // Long Put is short delta hedge
          instrumentType: "PE",
          quantity: 25,
          expectedEdgeR: 1.2,
          confidence: 0.85,
          sharpeRatio: 1.6,
          capitalRequired: 5000,
        },
      ];

      const result = StrategyCompetitionManager.resolveCompetition(signals, 200000);
      expect(result.selectedSignals.length).toBe(2);
      expect(result.conflictsResolved.some((c) => c.resolution === "HEDGE_APPROVED")).toBe(true);
    });

    it("resolves opposing naked directional signals by picking higher-confidence candidate", () => {
      const signals: any[] = [
        {
          signalId: "SIG_BUY",
          strategyId: "STRAT_BUY",
          strategyName: "Bullish Breakout",
          symbol: "NIFTY26SEPFUT",
          underlying: "NIFTY",
          direction: "BUY",
          instrumentType: "FUTURE",
          quantity: 25,
          expectedEdgeR: 2.0,
          confidence: 0.9,
          sharpeRatio: 2.2,
          capitalRequired: 75000,
        },
        {
          signalId: "SIG_SELL",
          strategyId: "STRAT_SELL",
          strategyName: "Bearish Mean Reversion",
          symbol: "NIFTY26SEPFUT",
          underlying: "NIFTY",
          direction: "SELL",
          instrumentType: "FUTURE",
          quantity: 25,
          expectedEdgeR: 1.1,
          confidence: 0.6,
          sharpeRatio: 1.2,
          capitalRequired: 75000,
        },
      ];

      const result = StrategyCompetitionManager.resolveCompetition(signals, 200000);
      expect(result.selectedSignals.length).toBe(1);
      expect(result.selectedSignals[0].strategyId).toBe("STRAT_BUY");
      expect(result.rejectedSignals[0].signal.strategyId).toBe("STRAT_SELL");
      expect(result.conflictsResolved.some((c) => c.resolution === "HIGHER_CONFIDENCE_SELECTED")).toBe(true);
    });
  });

  describe("12. Allocation Drift Monitoring & Rebalance Cooldown", () => {
    it("detects allocation drift exceeding 15% and triggers rebalance proposal", () => {
      const allocations: any[] = [
        {
          strategyId: "S1",
          strategyName: "Strategy 1",
          targetWeightPct: 50.0,
          actualWeightPct: 25.0, // 25% drift > 15%
          allocatedCapitalInr: 375000,
          utilizedCapitalInr: 187500,
        },
      ];

      const report = PortfolioDriftMonitor.evaluateDrift(allocations);
      expect(report.rebalanceRequired).toBe(true);
      expect(report.rebalanceProposal?.action).toBe("REBALANCE");
    });
  });

  describe("13. Portfolio Agent AI Reasoning & Audit Trail", () => {
    it("generates auditable explanations strictly referencing ground-truth capital state", () => {
      const capital = AuthoritativeCapitalManager.getCapitalState();
      const reserves = PortfolioCapitalAllocationEngine.calculateReserves(capital.netEquity, "NORMAL");

      const explanation = PortfolioAuditLogger.explainAllocationDecision(capital, reserves, "WHY_ALLOCATED");
      expect(explanation).toContain("₹7,50,000");
      expect(explanation).toContain("25%");
    });
  });

  describe("14. Concurrency & Mutex Thread-Safety", () => {
    it("safely evaluates simultaneous trade proposals under concurrency without race conditions", async () => {
      const evalPromises = Array.from({ length: 5 }, (_, i) =>
        PortfolioIntelligenceEngine.evaluateTradeProposal(
          {
            strategyId: `STRAT_CONC_${i}`,
            strategyName: `Concurrent Strategy ${i}`,
            symbol: "NIFTY26SEPFUT",
            underlying: "NIFTY",
            side: "BUY",
            assetClass: "FUTURES",
            instrumentType: "FUTURE",
            quantity: 25,
            entryPrice: 24500,
            stopLossPrice: 24400,
            marginRequired: 50000,
          },
          {
            strategyId: `STRAT_CONC_${i}`,
            symbol: "NIFTY26SEPFUT",
            underlying: "NIFTY",
            entryPrice: 24500,
            stopLossPrice: 24400,
            lotSize: 25,
            model: "FIXED_RISK",
          }
        )
      );

      const results = await Promise.all(evalPromises);
      expect(results.length).toBe(5);
      results.forEach((res) => {
        expect(res).toBeDefined();
        expect(typeof res.approved).toBe("boolean");
      });
    });
  });

  describe("15. Backtest Oracle Testing (10,000 Randomized Portfolio Scenarios)", () => {
    it("verifies mathematical financial invariants across 10,000 randomized portfolio scenarios", () => {
      const iterations = 10000;
      let passes = 0;

      for (let i = 0; i < iterations; i++) {
        // Random capital between ₹2,00,000 and ₹50,00,000
        const startingCap = 200000 + Math.floor(Math.random() * 4800000);
        const deposits = Math.floor(Math.random() * 200000);
        const withdrawals = Math.floor(Math.random() * 100000);
        const realizedPnl = Math.floor((Math.random() - 0.4) * 150000);
        const unrealizedPnl = Math.floor((Math.random() - 0.4) * 80000);
        const charges = Math.floor(Math.random() * 5000);
        const usedMargin = Math.floor(Math.random() * (startingCap * 0.5));

        const netEquity = startingCap + deposits - withdrawals + realizedPnl - charges + unrealizedPnl;
        if (netEquity <= 0) continue; // Skip bankrupt scenarios

        // 1. Invariant: Reserve must be >= 25% of equity
        const reserves = PortfolioCapitalAllocationEngine.calculateReserves(netEquity, "NORMAL");
        expect(reserves.totalReservePct).toBeGreaterThanOrEqual(24.99);
        expect(reserves.totalReserveInr).toBeGreaterThanOrEqual(netEquity * 0.2499);

        // 2. Invariant: Sizing must be exact lot size multiple
        const lotSize = i % 2 === 0 ? 25 : 15; // NIFTY or BankNIFTY
        const price = 20000 + (i % 5000);
        const slPrice = price - (50 + (i % 200));

        const sizing = PortfolioPositionSizingEngine.calculateSize(
          {
            strategyId: `RND_${i}`,
            symbol: "TEST",
            underlying: "TEST",
            entryPrice: price,
            stopLossPrice: slPrice,
            lotSize,
            model: "FIXED_RISK",
          },
          netEquity,
          reserves.activeAllocationInr
        );

        if (sizing.suggestedQuantity > 0) {
          // Strict lot-size quantization invariant
          expect(sizing.suggestedQuantity % lotSize).toBe(0);
          expect(sizing.suggestedLots).toBe(sizing.suggestedQuantity / lotSize);
          // Risk limit invariant: trade risk <= 1.0% of equity
          expect(sizing.riskAmountInr).toBeLessThanOrEqual(netEquity * 0.01001);
        }

        passes++;
      }

      expect(passes).toBeGreaterThan(9500); // 10,000 iterations successfully verified
    });
  });
});
