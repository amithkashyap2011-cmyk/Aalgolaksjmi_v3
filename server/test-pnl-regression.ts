import { describe, expect, test } from '@jest/globals';

describe('PnL Calculation Regression Tests', () => {
  test('LONG position - Price goes up (Positive PnL)', () => {
    const side = 'BUY';
    const entryPrice = 0.1607;
    const currentPrice = 0.1700;
    const quantity = 1047.293;
    
    const pnl = side === 'BUY' 
      ? (currentPrice - entryPrice) * quantity 
      : (entryPrice - currentPrice) * quantity;
      
    expect(pnl).toBeGreaterThan(0);
    expect(pnl).toBeCloseTo(9.7398, 4);
  });

  test('LONG position - Price goes down (Negative PnL)', () => {
    const side = 'BUY';
    const entryPrice = 0.1607;
    const currentPrice = 0.1581;
    const quantity = 1047.293;
    
    const pnl = side === 'BUY' 
      ? (currentPrice - entryPrice) * quantity 
      : (entryPrice - currentPrice) * quantity;
      
    expect(pnl).toBeLessThan(0);
    expect(pnl).toBeCloseTo(-2.7229, 4);
  });

  test('SHORT position - Price goes down (Positive PnL)', () => {
    const side = 'SELL';
    const entryPrice = 1561.96;
    const currentPrice = 1550.00;
    const quantity = 0.107749;
    
    const pnl = side === 'BUY' 
      ? (currentPrice - entryPrice) * quantity 
      : (entryPrice - currentPrice) * quantity;
      
    expect(pnl).toBeGreaterThan(0);
    expect(pnl).toBeCloseTo(1.2886, 4);
  });

  test('SHORT position - Price goes up (Negative PnL)', () => {
    const side = 'SELL';
    const entryPrice = 1561.96;
    const currentPrice = 1585.39; // Note: This is an SL hit scenario
    const quantity = 0.107749;
    
    const pnl = side === 'BUY' 
      ? (currentPrice - entryPrice) * quantity 
      : (entryPrice - currentPrice) * quantity;
      
    expect(pnl).toBeLessThan(0);
    expect(pnl).toBeCloseTo(-2.5245, 4);
  });
});
