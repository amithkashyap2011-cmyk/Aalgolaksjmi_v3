import { describe, it, expect } from '@jest/globals';
import { InstrumentMaster } from '../../src/services/indian/InstrumentMaster.js';

describe('Indian Instrument Master & Contract Specifications', () => {
  it('correctly resolves lot size for NSE and BSE indices', () => {
    expect(InstrumentMaster.getLotSize('NIFTY')).toBe(65);
    expect(InstrumentMaster.getLotSize('NIFTY50')).toBe(65);
    expect(InstrumentMaster.getLotSize('BANKNIFTY')).toBe(30);
    expect(InstrumentMaster.getLotSize('FINNIFTY')).toBe(60);
    expect(InstrumentMaster.getLotSize('SENSEX')).toBe(20);
  });

  it('correctly resolves strike intervals for indices and stocks', () => {
    expect(InstrumentMaster.getStrikeInterval('NIFTY')).toBe(50);
    expect(InstrumentMaster.getStrikeInterval('BANKNIFTY')).toBe(100);
    expect(InstrumentMaster.getStrikeInterval('SENSEX')).toBe(100);
    expect(InstrumentMaster.getStrikeInterval('RELIANCE')).toBe(20);
  });

  it('formats standardized trading symbols', () => {
    const sym1 = InstrumentMaster.formatTradingSymbol('NIFTY', 'CE', 25000, '26AUG');
    expect(sym1).toBe('NIFTY26AUG25000CE');

    const sym2 = InstrumentMaster.formatTradingSymbol('BANKNIFTY', 'PE', 52000, '26AUG');
    expect(sym2).toBe('BANKNIFTY26AUG52000PE');

    const sym3 = InstrumentMaster.formatTradingSymbol('NIFTY', 'FUTURE', undefined, '26AUG');
    expect(sym3).toBe('NIFTY26AUGFUT');
  });
});
