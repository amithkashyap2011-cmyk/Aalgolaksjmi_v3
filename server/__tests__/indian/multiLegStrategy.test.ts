import { describe, it, expect } from '@jest/globals';
import { StrategyEngine } from '../../src/services/indian/strategies/StrategyEngine.js';

describe('Indian Quantitative Multi-Leg Strategy Engine', () => {
  it('registers all required directional and multi-leg strategies', () => {
    const strategies = StrategyEngine.getAllStrategies();
    const names = strategies.map(s => s.strategyName);
    expect(names).toContain('LONG_CALL');
    expect(names).toContain('LONG_PUT');
    expect(names).toContain('BULL_CALL_SPREAD');
    expect(names).toContain('BEAR_PUT_SPREAD');
    expect(names).toContain('LONG_STRADDLE');
    expect(names).toContain('IRON_CONDOR');
  });

  it('constructs valid 2-leg Bull Call Spread', () => {
    const strat = StrategyEngine.getStrategy('BULL_CALL_SPREAD')!;
    expect(strat).toBeDefined();
    expect(strat.isMultiLeg).toBe(true);

    const signal = {
      signalId: 'SIG_1',
      timestamp: Date.now(),
      underlying: 'NIFTY',
      direction: 'LONG' as const,
      strategy: 'BULL_CALL_SPREAD' as const,
      confidence: 85,
      tradeScore: 85,
      entryReasons: ['TEST'],
      indicators: {}
    };

    const legs = strat.constructLegs(signal, 24500, 75);
    expect(legs.length).toBe(2);
    expect(legs[0].action).toBe('BUY');
    expect(legs[0].instrument).toBe('CE');
    expect(legs[0].strike).toBe(24500); // ATM

    expect(legs[1].action).toBe('SELL');
    expect(legs[1].instrument).toBe('CE');
    expect(legs[1].strike).toBe(24550); // OTM +1
  });

  it('constructs valid 4-leg Iron Condor', () => {
    const strat = StrategyEngine.getStrategy('IRON_CONDOR')!;
    const signal = {
      signalId: 'SIG_2',
      timestamp: Date.now(),
      underlying: 'NIFTY',
      direction: 'LONG' as const,
      strategy: 'IRON_CONDOR' as const,
      confidence: 80,
      tradeScore: 80,
      entryReasons: ['TEST'],
      indicators: {}
    };

    const legs = strat.constructLegs(signal, 24500, 75);
    expect(legs.length).toBe(4);
  });
});
