import { describe, it, expect } from '@jest/globals';

// Simulate the core math used in the engine
function calculateMargin(quantity: number, price: number, leverage: number): number {
  return (quantity * price) / leverage;
}

function calculatePnL(quantity: number, entryPrice: number, exitPrice: number, side: 'BUY' | 'SELL', leverage: number): number {
  const entryFee = entryPrice * quantity * 0.0004;
  const exitFee = exitPrice * quantity * 0.0004;
  const grossPnL = side === 'BUY'
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;
  return grossPnL - entryFee - exitFee;
}

describe('Trading Engine Core Math (Institutional Grade)', () => {
  it('should correctly calculate margin at 125x leverage', () => {
    const qty = 1000;
    const price = 0.11; // DOGE price
    const leverage = 125;
    const margin = calculateMargin(qty, price, leverage);
    
    // Total value = 110 USDT. Leverage = 125. Margin should be 0.88 USDT.
    expect(margin).toBeCloseTo(0.88, 5);
  });

  it('should correctly calculate margin at 20x leverage', () => {
    const qty = 500;
    const price = 0.11;
    const leverage = 20;
    const margin = calculateMargin(qty, price, leverage);
    
    // Total value = 55 USDT. Leverage = 20. Margin should be 2.75 USDT.
    expect(margin).toBeCloseTo(2.75, 5);
  });

  it('should calculate PnL including 0.04% taker fees', () => {
    const qty = 1000;
    const entry = 0.10;
    const exit = 0.11; // 10% move
    const side = 'BUY';
    const leverage = 20;
    
    const pnl = calculatePnL(qty, entry, exit, side, leverage);
    
    // Gross PnL = (0.11 - 0.10) * 1000 = 10 USDT
    // Entry Fee = 0.10 * 1000 * 0.0004 = 0.04 USDT
    // Exit Fee = 0.11 * 1000 * 0.0004 = 0.044 USDT
    // Net PnL = 10 - 0.04 - 0.044 = 9.916 USDT
    expect(pnl).toBeCloseTo(9.916, 5);
  });

  it('should account for negative PnL accurately', () => {
    const qty = 1000;
    const entry = 0.10;
    const exit = 0.09; // 10% drop
    const side = 'BUY';
    const leverage = 20;
    
    const pnl = calculatePnL(qty, entry, exit, side, leverage);
    
    // Gross PnL = -10 USDT
    // Fees = 0.04 + 0.036 = 0.076
    // Net PnL = -10.076
    expect(pnl).toBeCloseTo(-10.076, 5);
  });
});
