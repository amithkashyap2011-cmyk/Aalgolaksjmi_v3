import { describe, it, expect } from '@jest/globals';
import { StrikeSelector } from '../../src/services/indian/StrikeSelector.js';
import { ExpiryResolver } from '../../src/services/indian/ExpiryResolver.js';

describe('Indian Strike Selector & Expiry Resolver', () => {
  it('correctly computes ATM strike for NIFTY spot price', () => {
    expect(StrikeSelector.getAtmStrike('NIFTY', 24532)).toBe(24550);
    expect(StrikeSelector.getAtmStrike('NIFTY', 24518)).toBe(24500);
  });

  it('correctly computes ATM strike for BANKNIFTY spot price', () => {
    expect(StrikeSelector.getAtmStrike('BANKNIFTY', 52140)).toBe(52100);
    expect(StrikeSelector.getAtmStrike('BANKNIFTY', 52165)).toBe(52200);
  });

  it('correctly generates OTM and ITM strikes with offset', () => {
    const otmCall = StrikeSelector.selectStrike('NIFTY', 24500, 'CE', 'OTM', 1);
    expect(otmCall.strike).toBe(24550);

    const itmCall = StrikeSelector.selectStrike('NIFTY', 24500, 'CE', 'ITM', 1);
    expect(itmCall.strike).toBe(24450);

    const otmPut = StrikeSelector.selectStrike('NIFTY', 24500, 'PE', 'OTM', 1);
    expect(otmPut.strike).toBe(24450);
  });

  it('resolves valid expiry dates dynamically', () => {
    const ref = new Date('2026-08-25T10:00:00Z'); // Tuesday
    const expiry = ExpiryResolver.resolveExpiry('NIFTY', 'NEAREST_VALID_EXPIRY', ref);
    expect(expiry.expiryDate).toBeDefined();
    expect(expiry.daysToExpiry).toBeGreaterThanOrEqual(0);
  });
});
