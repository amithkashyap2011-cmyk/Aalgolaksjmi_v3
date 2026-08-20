/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Agent Orchestrator
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  QuantumAgent,
  AgentContext,
  AgentSignal,
  QuantumDecision,
  MarketRegime,
  PortfolioState,
  IndicatorSet,
  ExecutionPlan,
  RiskAssessment,
  MoEWeights,
  OHLCV,
} from "./types.js";
import {
  RegimeAgent,
  ForecastingAgent,
  SentimentAgent,
  WhaleAgent,
  OnChainAgent,
  StrategyAgent,
  ExecutionAgent,
  RiskAgent,
  PortfolioAgent,
  EvolutionAgent,
} from "./agents/index.js";
import { ExchangeManager } from "./exchanges/exchangeManager.js";
import { OrderBookIntelligenceEngine } from "./orderBookIntelligence.js";
import { FundingRateEngine } from "./fundingRateEngine.js";
import { LiquidationEngine } from "./liquidationEngine.js";
import { computeSnapshot } from "../indicatorService.js";
import { Trade } from "../../models/Trade.js";
import mongoose from "mongoose";
import { toValidObjectId } from "../../utils/mongoUtils.js";
import crypto from "node:crypto";

export class AgentOrchestrator {
  private static instance: AgentOrchestrator;
  private agents: QuantumAgent[] = [];
  
  private constructor() {
    // Register the 10 agents in sorted priority order
    this.agents = [
      new RegimeAgent(),
      new ForecastingAgent(),
      new SentimentAgent(),
      new WhaleAgent(),
      new OnChainAgent(),
      new StrategyAgent(),
      new ExecutionAgent(),
      new RiskAgent(),
      new PortfolioAgent(),
      new EvolutionAgent(),
    ].sort((a, b) => a.priority - b.priority);
  }

  public static getInstance(): AgentOrchestrator {
    if (!AgentOrchestrator.instance) {
      AgentOrchestrator.instance = new AgentOrchestrator();
    }
    return AgentOrchestrator.instance;
  }

  /**
   * Main orchestrator execution loop
   */
  public async run(
    symbol: string,
    exchangeName: string,
    userId: string,
    mode: "PAPER" | "LIVE"
  ): Promise<QuantumDecision> {
    const exchangeManager = ExchangeManager.getInstance();
    const adapter = exchangeManager.getAdapter(exchangeName);

    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeName}`);
    }

    // 1. Fetch Market Data from Exchange
    const bars = await adapter.getKlines(symbol, "5m", 200);
    const orderBook = await adapter.getOrderBook(symbol, 20);
    const fundingRate = await adapter.getFundingRate(symbol).catch(() => ({
      symbol,
      fundingRate: 0.0001,
      fundingTime: Date.now(),
      markPrice: bars[bars.length - 1].close,
      indexPrice: bars[bars.length - 1].close,
      nextFundingTime: Date.now() + 28800000,
    }));
    const openInterest = await adapter.getOpenInterest(symbol).catch(() => ({
      symbol,
      openInterest: 0,
      openInterestValue: 0,
      timestamp: Date.now(),
    }));
    const recentLiquidations = await adapter.getLiquidations(symbol, 50).catch(() => []);

    const currentPrice = bars[bars.length - 1].close;

    // 2. Compute Indicators
    const legacyBars = bars.map((b: OHLCV) => ({
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));
    const indSnapshot = computeSnapshot(legacyBars);
    
    // Map to IndicatorSet
    const indicators: IndicatorSet = {
      ema9: indSnapshot.ema9,
      ema21: indSnapshot.ema21,
      ema50: indSnapshot.ema55, // mapped ema55 to ema50 placeholder
      ema200: indSnapshot.sma200 ?? null,
      sma20: indSnapshot.sma200 ?? null,
      sma50: indSnapshot.ema55 ?? null,
      rsi14: indSnapshot.rsi14,
      macdLine: indSnapshot.macd?.macd ?? null,
      macdSignal: indSnapshot.macd?.signal ?? null,
      macdHist: indSnapshot.macd?.histogram ?? null,
      atr14: indSnapshot.atr14,
      bbUpper: indSnapshot.bollinger?.upper ?? null,
      bbMiddle: indSnapshot.bollinger?.middle ?? null,
      bbLower: indSnapshot.bollinger?.lower ?? null,
      stdDev20: indSnapshot.stdDev20,
      vwap: null,
      obv: null,
      adx14: indSnapshot.adx14,
      volumeRatio: 1.0,
      hurstExponent: 0.5,
      close: currentPrice,
    };

    // Calculate volume ratio
    if (bars.length >= 21) {
      const lastVol = bars[bars.length - 1].volume;
      const avgVol = bars.slice(bars.length - 21, bars.length - 1).reduce((acc: number, b: OHLCV) => acc + b.volume, 0) / 20;
      indicators.volumeRatio = avgVol > 0 ? lastVol / avgVol : 1.0;
    }

    // 3. Evaluate Core Intelligence Engines
    const obIntel = OrderBookIntelligenceEngine.getInstance().analyze(orderBook);
    const fundingAnalysis = FundingRateEngine.getInstance().analyze(fundingRate, openInterest);
    const liquidationIntel = LiquidationEngine.getInstance().analyze(symbol, currentPrice, recentLiquidations);

    // Determine initial market regime
    let regime: MarketRegime = "SIDEWAYS";
    const volRatio = indicators.stdDev20 && currentPrice ? indicators.stdDev20 / currentPrice : 0.01;
    
    if (indicators.adx14 && indicators.adx14 > 25) {
      if (indicators.ema9 && indicators.ema21 && indicators.ema9 > indicators.ema21) {
        regime = indicators.adx14 > 35 ? "STRONG_BULL" : "BULL";
      } else {
        regime = indicators.adx14 > 35 ? "STRONG_BEAR" : "BEAR";
      }
    } else if (volRatio > 0.02) {
      regime = "HIGH_VOLATILITY";
    } else if (volRatio < 0.008) {
      regime = "LOW_VOLATILITY";
    }

    // 4. Construct Portfolio State
    const accountBalance = await adapter.getAccountBalance().catch(() => ({
      totalBalance: 0,
      availableBalance: 0,
      unrealizedPnl: 0,
      assets: {},
    }));

    // Fetch user closed trades for daily/weekly/monthly PnL
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const userObjId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : new mongoose.Types.ObjectId("000000000000000000000000");
    const userTrades = await Trade.find({ userId: userObjId, mode }).lean().catch(() => []);
    const dailyPnl = userTrades
      .filter((t: any) => t.openedAt && new Date(t.openedAt) >= todayStart)
      .reduce((acc: number, t: any) => acc + (t.pnl ?? 0), 0);

    const portfolioState: PortfolioState = {
      totalEquity: accountBalance.totalBalance,
      availableBalance: accountBalance.availableBalance,
      unrealizedPnl: accountBalance.unrealizedPnl,
      positions: [], // will map from adapter in live, default empty for now
      dailyPnl,
      weeklyPnl: dailyPnl, // simplify for Phase 1
      monthlyPnl: dailyPnl,
      maxDrawdownToday: 0,
      maxDrawdownWeek: 0,
      maxDrawdownMonth: 0,
      correlationMatrix: {},
    };

    const ctx: AgentContext = {
      symbol,
      exchange: exchangeName,
      userId,
      bars,
      currentPrice,
      regime,
      indicators,
      orderBook,
      fundingRate,
      openInterest,
      recentLiquidations,
      portfolioState,
      timestamp: Date.now(),
    };

    // 5. Gather Agent Signals
    const agentSignals: AgentSignal[] = [];
    let vetoTriggered = false;
    let vetoReason = "";

    for (const agent of this.agents) {
      try {
        const signal = await agent.evaluate(ctx);
        agentSignals.push(signal);

        // Check for veto locks
        if (agent.canVeto() && signal.direction === "NEUTRAL" && signal.strength === -1.0) {
          vetoTriggered = true;
          vetoReason = `Veto triggered by ${agent.name}: ${JSON.stringify(signal.metadata)}`;
        }
      } catch (err: any) {
        console.error(`Error in agent ${agent.name}:`, err.message);
      }
    }

    // 6. Apply MoE Weighting and Fusion
    const moeWeights = this.computeMoEWeights(regime);
    let finalAction: "LONG" | "SHORT" | "CLOSE" | "SCALE_IN" | "PARTIAL_EXIT" | "HOLD" = "HOLD";
    let confidence = 0.0;
    let longConfidenceTotal = 0;
    let shortConfidenceTotal = 0;

    agentSignals.forEach(sig => {
      const weight = moeWeights.weights[sig.agentName] ?? 0.05;
      if (sig.direction === "LONG") {
        longConfidenceTotal += sig.confidence * weight;
      } else if (sig.direction === "SHORT") {
        shortConfidenceTotal += sig.confidence * weight;
      }
    });

    if (vetoTriggered) {
      finalAction = "HOLD";
      confidence = 1.0;
    } else {
      const threshold = 0.28;
      if (longConfidenceTotal > threshold && longConfidenceTotal > shortConfidenceTotal) {
        finalAction = "LONG";
        confidence = longConfidenceTotal;
      } else if (shortConfidenceTotal > threshold && shortConfidenceTotal > longConfidenceTotal) {
        finalAction = "SHORT";
        confidence = shortConfidenceTotal;
      } else {
        finalAction = "HOLD";
        confidence = Math.max(0.1, 1 - (longConfidenceTotal + shortConfidenceTotal));
      }
    }

    // 7. Execution and Risk Assessment extraction
    // Risk Agent metadata
    const riskSignal = agentSignals.find(s => s.agentName === "RiskAgent");
    const riskAssessment = (riskSignal?.metadata?.riskAssessment as RiskAssessment) || {
      approved: !vetoTriggered,
      reason: vetoTriggered ? vetoReason : "Pre-trade risk approved",
      kellyFraction: 0.25,
      recommendedSizePct: 0.025,
      maxPositionSize: portfolioState.totalEquity * 0.05,
      valueAtRisk95: 0,
      conditionalVaR95: 0,
      dynamicSLPct: 2.0,
      dynamicTPPct: 4.0,
      volatilityScaledSize: portfolioState.totalEquity * 0.05,
      emergencyShutdownActive: false,
      correlatedExposurePct: 0,
      trailingSLConfig: null,
      riskFlags: [],
    };

    // Execution Agent metadata
    const execSignal = agentSignals.find(s => s.agentName === "ExecutionAgent");
    const executionPlan = (execSignal?.metadata?.executionPlan as ExecutionPlan) || null;

    if (executionPlan && finalAction !== "HOLD") {
      executionPlan.side = finalAction === "LONG" ? "BUY" : "SELL";
      // Calculate order quantity
      const orderValue = portfolioState.totalEquity * riskAssessment.recommendedSizePct;
      executionPlan.totalQuantity = orderValue / currentPrice;
    }

    // Audit trail decision hash
    const decisionReason = vetoTriggered 
      ? `VETO: ${vetoReason}`
      : `Consensus action: ${finalAction} with confidence ${(confidence * 100).toFixed(1)}%. Long prob: ${longConfidenceTotal.toFixed(2)}, Short: ${shortConfidenceTotal.toFixed(2)}`;
    
    const decisionHashInput = JSON.stringify({
      symbol,
      exchangeName,
      timestamp: Date.now(),
      finalAction,
      confidence,
      agentSignals,
    });
    const decisionHash = crypto.createHash("sha256").update(decisionHashInput).digest("hex");

    return {
      symbol,
      exchange: exchangeName,
      timestamp: Date.now(),
      action: finalAction,
      confidence,
      regime,
      forecasts: [], // filled by ForecastingAgent internally in metadata
      executionPlan: finalAction === "HOLD" ? null : executionPlan,
      riskAssessment,
      agentSignals,
      moeWeights,
      orderBookIntel: obIntel,
      fundingAnalysis,
      liquidationIntel,
      decisionReason,
      decisionHash,
    };
  }

  private computeMoEWeights(regime: MarketRegime): MoEWeights {
    const weights: Record<string, number> = {
      RegimeAgent: 0.1,
      ForecastingAgent: 0.15,
      SentimentAgent: 0.1,
      WhaleAgent: 0.1,
      OnChainAgent: 0.05,
      StrategyAgent: 0.15,
      ExecutionAgent: 0.05,
      RiskAgent: 0.15,
      PortfolioAgent: 0.1,
      EvolutionAgent: 0.05,
    };

    if (regime === "STRONG_BULL" || regime === "STRONG_BEAR") {
      weights.ForecastingAgent = 0.25;
      weights.StrategyAgent = 0.20;
      weights.RegimeAgent = 0.10;
      weights.RiskAgent = 0.10;
    } else if (regime === "SIDEWAYS" || regime === "LOW_VOLATILITY") {
      weights.StrategyAgent = 0.25; // legacy strategies like GAYATRI dominate range bounds
      weights.SentimentAgent = 0.15;
      weights.ForecastingAgent = 0.10;
    } else if (regime === "HIGH_VOLATILITY" || regime === "CORRELATION_SHOCK") {
      weights.RiskAgent = 0.25; // risk gates take paramount weight
      weights.RegimeAgent = 0.20;
      weights.StrategyAgent = 0.10;
      weights.ForecastingAgent = 0.05;
    }

    return {
      regime,
      weights,
      lastUpdated: Date.now(),
      performanceBasis: "REGIME_SPECIFIC",
    };
  }
}
