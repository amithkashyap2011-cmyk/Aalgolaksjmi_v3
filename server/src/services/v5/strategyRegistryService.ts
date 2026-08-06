/*
 * ─── Strategy Registry Service ───────────────────────────────
 *
 * Manages the registry for all 10 core quantitative strategies:
 * 1. Trend Following
 * 2. Mean Reversion
 * 3. Breakout
 * 4. Scalping
 * 5. Swing Trading
 * 6. Momentum
 * 7. Volatility Expansion
 * 8. Range Trading
 * 9. Statistical Arbitrage
 * 10. AI Hybrid Strategy
 */

import { StrategyRegistry } from "../../models/StrategyRegistry.js";

export const V5_STRATEGIES = [
  { strategyId: "STRAT_TREND_FOLLOWING", strategyName: "Trend Following", category: "TREND", description: "EMA 9/21 cross, ADX trend strength, ATR trailing stop" },
  { strategyId: "STRAT_MEAN_REVERSION", strategyName: "Mean Reversion", category: "MEAN_REVERSION", description: "RSI divergence, Bollinger Band squeeze, VWAP Z-score" },
  { strategyId: "STRAT_BREAKOUT", strategyName: "Breakout", category: "BREAKOUT", description: "Donchian channel breakout, volume expansion, ATR breakout" },
  { strategyId: "STRAT_SCALPING", strategyName: "Scalping", category: "MICROSTRUCTURE", description: "Order book delta imbalance, spread capture, micro-liquidity" },
  { strategyId: "STRAT_SWING_TRADING", strategyName: "Swing Trading", category: "SWING", description: "Multi-timeframe trend alignment, key support/resistance levels" },
  { strategyId: "STRAT_MOMENTUM", strategyName: "Momentum", category: "MOMENTUM", description: "Rate of Change (ROC), ADX momentum, volume confirmation" },
  { strategyId: "STRAT_VOLATILITY_EXPANSION", strategyName: "Volatility Expansion", category: "VOLATILITY", description: "ATR expansion, historical volatility jump, IV spike" },
  { strategyId: "STRAT_RANGE_TRADING", strategyName: "Range Trading", category: "RANGE", description: "Support/Resistance boundaries, stochastic oscillator" },
  { strategyId: "STRAT_STATISTICAL_ARBITRAGE", strategyName: "Statistical Arbitrage", category: "ARBITRAGE", description: "Cross-asset correlation, cointegration spread, mean reversion" },
  { strategyId: "STRAT_AI_HYBRID", strategyName: "AI Hybrid Strategy", category: "AI_ENSEMBLE", description: "Dynamic Meta-Ensemble multi-model consensus" },
];

export class StrategyRegistryService {
  public static async ensureRegistryInitialized(): Promise<any[]> {
    const list = [];
    for (const s of V5_STRATEGIES) {
      let doc = await StrategyRegistry.findOne({ strategyId: s.strategyId });
      if (!doc) {
        doc = await StrategyRegistry.create({
          strategyId: s.strategyId,
          strategyName: s.strategyName,
          category: s.category,
          description: s.description,
          healthScore: 85,
          currentState: "ACTIVE",
        });
      }
      list.push(doc);
    }
    return list;
  }
}
