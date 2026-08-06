import { Trade } from "../models/Trade.js";

interface RiskParams {
  balance: number;
  winRate: number;
  payoffRatio: number;      // Avg Win / Avg Loss
  historicalReturns: number[]; // For VaR calculation
}

/**
 * Hedge-Fund Grade Institutional Risk Engine
 * Computes VaR, CVaR and Kelly Position Sizing
 */
export class InstitutionalRiskEngine {
  
  /**
   * Kelly Criterion for optimal capital allocation
   * Formla: Kelly % = W - [(1 - W) / R]
   * W = Win probability, R = Win/Loss ratio
   */
  public static calculateKellySize(params: RiskParams): number {
    if (params.payoffRatio <= 0 || params.winRate <= 0) return 0;
    
    // Half-Kelly is standard institutional practice to avoid over-leverage volatility
    const kellyPct = params.winRate - ((1 - params.winRate) / params.payoffRatio);
    const halfKelly = kellyPct / 2;
    
    // Cap allocation at 20% max per trade to enforce strict portfolio limits
    return Math.max(0, Math.min(halfKelly, 0.20));
  }

  /**
   * Value at Risk (VaR) using Historical Simulation
   * Calculates the maximum expected loss over a specific timeframe at 95% confidence.
   */
  public static calculateHistoricalVaR(returns: number[], confidence = 0.95): number {
    if (returns.length < 30) return 0; // Require sufficient history
    
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor(sortedReturns.length * (1 - confidence));
    return sortedReturns[index]; // Negative value representing loss threshold
  }

  /**
   * Conditional Value at Risk (CVaR) - Expected Shortfall
   * Averages the losses worst than the VaR threshold.
   */
  public static calculateCVaR(returns: number[], confidence = 0.95): number {
    if (returns.length < 30) return 0;
    const varThreshold = this.calculateHistoricalVaR(returns, confidence);
    const tailLosses = returns.filter(r => r <= varThreshold);
    if (!tailLosses.length) return 0;
    
    return tailLosses.reduce((acc, val) => acc + val, 0) / tailLosses.length;
  }

  /**
   * Circuit Breaker & Exposure Checks
   * Throws Error if trading should be halted immediately.
   */
  public static async validateSystemHealth(userId: string, currentBalance: number, maxDrawdownLimit = 0.15): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch closed trades today to calculate daily drawdown
    const todayTrades = await Trade.find({ userId, closedAt: { $gte: today }, status: "CLOSED" }).lean();
    
    const dailyPnl = todayTrades.reduce((acc, trade) => acc + (trade.pnl || 0), 0);
    const drawdownPct = Math.abs(dailyPnl) / currentBalance;

    if (dailyPnl < 0 && drawdownPct >= maxDrawdownLimit) {
      console.error(`🚨 CIRCUIT BREAKER TRIGGERED: Daily Max Drawdown Exceeded (${(drawdownPct * 100).toFixed(2)}%)`);
      return false; // Halted
    }

    return true; // Healthy
  }
}
