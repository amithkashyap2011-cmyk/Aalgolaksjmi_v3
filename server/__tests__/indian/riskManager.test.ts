import { describe, it, expect, beforeEach } from '@jest/globals';
import { IndianRiskManager } from '../../src/services/indian/risk/IndianRiskManager.js';

describe('Indian Pre-Trade Risk Manager & Guardrails', () => {
  beforeEach(() => {
    IndianRiskManager.setPanicStop(false);
  });

  it('blocks orders when PANIC STOP is activated', () => {
    IndianRiskManager.setPanicStop(true);
    expect(IndianRiskManager.isPanicStopActive()).toBe(true);

    const signal = {
      signalId: 'SIG_1',
      timestamp: Date.now(),
      underlying: 'NIFTY',
      direction: 'LONG' as const,
      strategy: 'LONG_CALL' as const,
      confidence: 90,
      tradeScore: 90,
      entryReasons: ['TEST'],
      indicators: {}
    };

    const res = IndianRiskManager.validatePreTrade('user1', signal, 100000, 200, 150, {
      autoTradeEnabled: true,
      maxRiskPerTradePercent: 0.02,
      maxDailyLossAmountINR: 5000,
      maxTradesPerDay: 5,
      maxConcurrentTrades: 2,
      maxNiftyTrades: 2,
      maxBankNiftyTrades: 2,
      strategyCooldownMinutes: 3,
      panicStop: true,
      minTradeScore: 70,
      minConfidence: 70
    });

    expect(res.allowed).toBe(false);
    expect(res.blockReason).toBe('PANIC_STOP_ACTIVE');
  });

  it('correctly calculates position size rounded to exchange lot size', () => {
    // ₹100,000 capital, 2% risk = ₹2,000 risk capital
    // SL distance = 20 pts. Lot size = 75. Loss per lot = 20 * 75 = ₹1,500.
    // 2000 / 1500 = 1 lot = 75 shares.
    const size = IndianRiskManager.calculatePositionSize('NIFTY', 100000, 24500, 24480, 0.02, 5);
    expect(size.lots).toBe(1);
    expect(size.quantity).toBe(75);
    expect(size.riskAmountINR).toBe(1500);
  });
});
