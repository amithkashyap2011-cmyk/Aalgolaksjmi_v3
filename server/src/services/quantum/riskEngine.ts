/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUANTUM ALPHA ENGINE — Risk Engine
 *  Project LAKSHMI · AALGO-QUANTUM V1.0
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  RiskAssessment,
  RiskFlag,
  PortfolioState,
  IndicatorSet,
  MarketRegime,
} from "./types.js";

export interface RiskEngineConfig {
  kellyFraction: number;           // Optimal: 0.25 (quarter-Kelly)
  maxPositionPct: number;          // Max 5% of portfolio per position
  maxCorrelatedExposure: number;   // Max 15% in correlated assets
  dynamicSL: "ATR" | "VOLATILITY" | "STRUCTURAL";
  dynamicTP: "RR_RATIO" | "FIBONACCI" | "TRAILING";
  trailingSLActivation: number;    // % profit before activating trail (e.g. 1.5%)
  trailingSLDistance: number;      // distance of trail (e.g. 1.0%)
  maxDailyDrawdown: number;        // 3% daily limit
  maxWeeklyDrawdown: number;       // 7% weekly limit
  maxMonthlyDrawdown: number;      // 12% monthly limit
  maxOpenPositions: number;        // Max 10 positions
  volatilityScaling: boolean;
  targetVolatility: number;        // 15% annualized target
}

export class RiskEngine {
  private static instance: RiskEngine;
  private config: RiskEngineConfig;
  private emergencyShutdownActive = false;
  private shutdownReason = "";

  private constructor() {
    // Default institutional risk settings
    this.config = {
      kellyFraction: 0.25,
      maxPositionPct: 0.05,
      maxCorrelatedExposure: 0.15,
      dynamicSL: "ATR",
      dynamicTP: "TRAILING",
      trailingSLActivation: 1.5,
      trailingSLDistance: 1.0,
      maxDailyDrawdown: 3.0,
      maxWeeklyDrawdown: 7.0,
      maxMonthlyDrawdown: 12.0,
      maxOpenPositions: 10,
      volatilityScaling: true,
      targetVolatility: 0.15,
    };
  }

  public static getInstance(): RiskEngine {
    if (!RiskEngine.instance) {
      RiskEngine.instance = new RiskEngine();
    }
    return RiskEngine.instance;
  }

  public getConfig(): RiskEngineConfig {
    return this.config;
  }

  public updateConfig(newConfig: Partial<RiskEngineConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log("[RiskEngine] Config updated:", this.config);
  }

  public isShutdown(): { active: boolean; reason: string } {
    return { active: this.emergencyShutdownActive, reason: this.shutdownReason };
  }

  public resetShutdown(): void {
    this.emergencyShutdownActive = false;
    this.shutdownReason = "";
    console.log("[RiskEngine] Emergency shutdown reset.");
  }

  /**
   * Assesses risk for a proposed order
   */
  public evaluateOrder(
    symbol: string,
    side: "BUY" | "SELL",
    proposedSize: number, // in quote currency, e.g. USDT
    indicators: IndicatorSet,
    regime: MarketRegime,
    portfolioState: PortfolioState,
    cascadeRiskScore: number = 0,
    spectralAbsorptionRatio: number = 0
  ): RiskAssessment {
    const flags: RiskFlag[] = [];
    let approved = true;
    let reason = "Order approved by Risk Engine";

    // 1. Check if emergency shutdown is active
    if (this.emergencyShutdownActive) {
      return this.rejectAssessment(`Emergency shutdown active: ${this.shutdownReason}`);
    }

    // 2. Check portfolio drawdown limits
    if (portfolioState.dailyPnl < -portfolioState.totalEquity * (this.config.maxDailyDrawdown / 100)) {
      this.triggerEmergencyShutdown(`Daily drawdown limit exceeded: ${portfolioState.dailyPnl.toFixed(2)} USDT`);
      return this.rejectAssessment("Emergency shutdown triggered due to daily drawdown limit");
    }

    if (portfolioState.weeklyPnl < -portfolioState.totalEquity * (this.config.maxWeeklyDrawdown / 100)) {
      approved = false;
      reason = "Weekly drawdown limit exceeded. Entries paused.";
      flags.push({ type: "CRITICAL", code: "WEEKLY_DD_LIMIT", message: reason });
    }

    if (portfolioState.monthlyPnl < -portfolioState.totalEquity * (this.config.maxMonthlyDrawdown / 100)) {
      this.triggerEmergencyShutdown(`Monthly drawdown limit exceeded: ${portfolioState.monthlyPnl.toFixed(2)} USDT`);
      return this.rejectAssessment("Emergency shutdown triggered due to monthly drawdown limit");
    }

    // 3. Check max open positions
    if (portfolioState.positions.length >= this.config.maxOpenPositions) {
      approved = false;
      reason = `Max open positions reached (${this.config.maxOpenPositions})`;
      flags.push({ type: "WARNING", code: "MAX_POSITIONS", message: reason });
    }

    // 4. Check if position already exists to avoid double exposure or exceed max size
    const existingPosition = portfolioState.positions.find(p => p.symbol === symbol);
    const existingSize = existingPosition ? existingPosition.size * existingPosition.currentPrice : 0;
    const totalSize = existingSize + proposedSize;

    // 5. Max position percent check (quote currency, e.g., USDT)
    const maxPositionSize = portfolioState.totalEquity * this.config.maxPositionPct;
    if (totalSize > maxPositionSize) {
      approved = false;
      reason = `Proposed size exceeds max position limit of ${(this.config.maxPositionPct * 100).toFixed(1)}% of equity`;
      flags.push({ type: "CRITICAL", code: "SIZE_LIMIT_EXCEEDED", message: reason });
    }

    // 6. Check correlation exposure
    let correlatedExposurePct = 0;
    portfolioState.positions.forEach(p => {
      const corr = portfolioState.correlationMatrix[symbol]?.[p.symbol] ?? 0;
      if (corr > 0.70) { // Highly correlated
        correlatedExposurePct += (p.size * p.currentPrice) / portfolioState.totalEquity;
      }
    });
    
    correlatedExposurePct += proposedSize / portfolioState.totalEquity;
    if (correlatedExposurePct > this.config.maxCorrelatedExposure) {
      approved = false;
      reason = `Proposed size exceeds max correlated exposure limit of ${(this.config.maxCorrelatedExposure * 100).toFixed(1)}%`;
      flags.push({ type: "WARNING", code: "CORRELATION_LIMIT", message: reason });
    }

    // 7. Liquidation Cascade Block
    if (cascadeRiskScore > 75) {
      approved = false;
      reason = `Liquidation cascade risk is extremely high (${cascadeRiskScore.toFixed(0)}/100). Entry blocked.`;
      flags.push({ type: "CRITICAL", code: "LIQ_CASCADE_SHIELD", message: reason });
    }

    // 8. Spectral Absorption Shield Block (from Saraswati/spectral regime)
    if (spectralAbsorptionRatio > 0.70) {
      approved = false;
      reason = `Spectral Absorption Shield fired (AR: ${spectralAbsorptionRatio.toFixed(2)} > 0.70). Entry blocked.`;
      flags.push({ type: "CRITICAL", code: "SPECTRAL_SHIELD", message: reason });
    }

    // 9. Position sizing calculations (Kelly, Volatility Scaling)
    const winRate = 0.58; // Benchmark win rate for calculations
    const winLossRatio = 1.8; // 1.8:1 target Reward/Risk
    const kellyPct = (winRate * (winLossRatio + 1) - 1) / winLossRatio; // standard Kelly formula
    const recommendedSizePct = Math.min(
      this.config.maxPositionPct,
      kellyPct * this.config.kellyFraction
    );

    // Volatility Scaling sizing
    let volatilityScaledSize = maxPositionSize;
    if (this.config.volatilityScaling && indicators.atr14 && indicators.close) {
      const vol = indicators.atr14 / indicators.close;
      // targetVol (e.g. 15% annualized, converted to daily then 5m/hourly scales)
      // Basic scaling: smaller positions in high-volatility regimes
      const scaleMultiplier = Math.max(0.2, Math.min(1.2, this.config.targetVolatility / (vol * 15)));
      volatilityScaledSize = maxPositionSize * scaleMultiplier;
    }

    // 10. Dynamic Stop Loss and Take Profit Percentages
    let dynamicSLPct = 2.0; // default 2%
    let dynamicTPPct = 4.0; // default 4%

    if (indicators.atr14 && indicators.close) {
      const atrMultiplier = 2.0; // 2x ATR for SL
      dynamicSLPct = (indicators.atr14 * atrMultiplier / indicators.close) * 100;
      dynamicTPPct = dynamicSLPct * 2.0; // 2:1 RR target
    }

    // Volatility regime adjustments
    if (regime === "HIGH_VOLATILITY") {
      dynamicSLPct *= 1.5; // wider stops in high volatility
      dynamicTPPct *= 1.5;
    }

    // Trailing Stop config
    const trailingSLConfig = this.config.dynamicTP === "TRAILING" ? {
      activationPct: this.config.trailingSLActivation,
      trailDistancePct: this.config.trailingSLDistance,
      stepSizePct: 0.1,
    } : null;

    // Check if any warnings/critical flags should override final status
    if (flags.some(f => f.type === "CRITICAL")) {
      approved = false;
    }

    return {
      approved,
      reason,
      kellyFraction: this.config.kellyFraction,
      recommendedSizePct,
      maxPositionSize,
      valueAtRisk95: proposedSize * 0.05, // estimated 5% VaR
      conditionalVaR95: proposedSize * 0.07, // CVaR estimation
      dynamicSLPct,
      dynamicTPPct,
      volatilityScaledSize,
      emergencyShutdownActive: this.emergencyShutdownActive,
      correlatedExposurePct,
      trailingSLConfig,
      riskFlags: flags,
    };
  }

  public triggerEmergencyShutdown(reason: string): void {
    this.emergencyShutdownActive = true;
    this.shutdownReason = reason;
    console.warn(`[RiskEngine] 🚨 EMERGENCY SHUTDOWN TRIGGERED: ${reason}`);
    // Emit alert (in production, trigger SMS/Telegram or API calls to close positions)
  }

  private rejectAssessment(reason: string): RiskAssessment {
    return {
      approved: false,
      reason,
      kellyFraction: this.config.kellyFraction,
      recommendedSizePct: 0,
      maxPositionSize: 0,
      valueAtRisk95: 0,
      conditionalVaR95: 0,
      dynamicSLPct: 0,
      dynamicTPPct: 0,
      volatilityScaledSize: 0,
      emergencyShutdownActive: true,
      correlatedExposurePct: 0,
      trailingSLConfig: null,
      riskFlags: [{ type: "CRITICAL", code: "SHUTDOWN_BLOCKED", message: reason }],
    };
  }
}
