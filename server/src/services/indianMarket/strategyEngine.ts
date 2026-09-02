/**
 * ═══════════════════════════════════════════════════════════════════
 *  Modular Strategy Engine & Registry for Indian Derivatives
 * ═══════════════════════════════════════════════════════════════════
 */

import { BaseStrategy } from "./strategies/baseStrategy.js";
import {
  LongCallStrategy,
  LongPutStrategy,
  LongFutureStrategy,
  ShortFutureStrategy,
} from "./strategies/directionalStrategies.js";
import {
  OpeningRangeBreakoutStrategy,
  SupportResistanceBreakoutStrategy,
  HighLowBreakoutStrategy,
  VolumeBreakoutStrategy,
  ATRBreakoutStrategy,
} from "./strategies/breakoutStrategies.js";
import {
  EMATrendStrategy,
  EMACrossoverStrategy,
  VWAPTrendStrategy,
  SupertrendStrategy,
  MACDTrendStrategy,
  ADXTrendStrategy,
} from "./strategies/trendStrategies.js";
import {
  RSIMomentumStrategy,
  MACDMomentumStrategy,
  PriceMomentumStrategy,
  VolumeMomentumStrategy,
  BreakoutMomentumStrategy,
} from "./strategies/momentumStrategies.js";
import {
  RSIReversalStrategy,
  VWAPReversionStrategy,
  BollingerReversionStrategy,
  SupportResistanceReversalStrategy,
} from "./strategies/meanReversionStrategies.js";
import {
  BullCallSpreadStrategy,
  BearPutSpreadStrategy,
  LongStraddleStrategy,
  ShortStraddleStrategy,
  IronCondorStrategy,
  LongStrangleStrategy,
  ShortStrangleStrategy,
} from "./strategies/optionsSpreads.js";
import {
  MarketEvaluationContext,
  SignalModel,
  StrategyCategory,
  StrategyId,
  StructuredTrade,
} from "./strategyTypes.js";

export class StrategyEngine {
  private static registry = new Map<StrategyId, BaseStrategy>();

  static {
    this.registerDefaults();
  }

  /**
   * Registers all 25+ strategy implementations
   */
  public static registerDefaults(): void {
    const strategies: BaseStrategy[] = [
      // Directional
      new LongCallStrategy(),
      new LongPutStrategy(),
      new LongFutureStrategy(),
      new ShortFutureStrategy(),
      // Breakout
      new OpeningRangeBreakoutStrategy(),
      new SupportResistanceBreakoutStrategy(),
      new HighLowBreakoutStrategy(),
      new VolumeBreakoutStrategy(),
      new ATRBreakoutStrategy(),
      // Trend
      new EMATrendStrategy(),
      new EMACrossoverStrategy(),
      new VWAPTrendStrategy(),
      new SupertrendStrategy(),
      new MACDTrendStrategy(),
      new ADXTrendStrategy(),
      // Momentum
      new RSIMomentumStrategy(),
      new MACDMomentumStrategy(),
      new PriceMomentumStrategy(),
      new VolumeMomentumStrategy(),
      new BreakoutMomentumStrategy(),
      // Mean Reversion
      new RSIReversalStrategy(),
      new VWAPReversionStrategy(),
      new BollingerReversionStrategy(),
      new SupportResistanceReversalStrategy(),
      // Options Spreads
      new BullCallSpreadStrategy(),
      new BearPutSpreadStrategy(),
      new LongStraddleStrategy(),
      new ShortStraddleStrategy(),
      new IronCondorStrategy(),
      new LongStrangleStrategy(),
      new ShortStrangleStrategy(),
    ];

    for (const strat of strategies) {
      this.registry.set(strat.id, strat);
    }
  }

  public static getStrategy(id: StrategyId): BaseStrategy | undefined {
    return this.registry.get(id);
  }

  public static getAllStrategies(): BaseStrategy[] {
    return Array.from(this.registry.values());
  }

  public static getStrategiesByCategory(cat: StrategyCategory): BaseStrategy[] {
    return Array.from(this.registry.values()).filter((s) => s.category === cat);
  }

  public static setStrategyEnabled(id: StrategyId, enabled: boolean): boolean {
    const strat = this.registry.get(id);
    if (strat) {
      strat.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Evaluates all enabled strategies against live market context and returns top signal
   */
  public static evaluateAll(
    context: MarketEvaluationContext
  ): Array<{ strategy: BaseStrategy; signal: SignalModel }> {
    const signals: Array<{ strategy: BaseStrategy; signal: SignalModel }> = [];

    for (const strat of this.registry.values()) {
      if (!strat.enabled) continue;
      try {
        const signal = strat.generateSignal(context);
        if (signal && strat.validateEntry(signal, context)) {
          signals.push({ strategy: strat, signal });
        }
      } catch (err: any) {
        console.warn(`[STRATEGY_ENGINE] Error evaluating strategy ${strat.id}: ${err.message}`);
      }
    }

    // Sort by tradeScore descending
    signals.sort((a, b) => b.signal.tradeScore - a.signal.tradeScore);
    return signals;
  }

  /**
   * Executes full strategy evaluation and constructs trade for top candidate
   */
  public static evaluateAndConstructBestTrade(
    context: MarketEvaluationContext,
    accountCapital: number,
    riskPercent: number
  ): { strategy: BaseStrategy; trade: StructuredTrade } | null {
    const signals = this.evaluateAll(context);
    if (signals.length === 0) return null;

    const best = signals[0];
    const trade = best.strategy.constructTrade(best.signal, context, accountCapital, riskPercent);
    return { strategy: best.strategy, trade };
  }
}
