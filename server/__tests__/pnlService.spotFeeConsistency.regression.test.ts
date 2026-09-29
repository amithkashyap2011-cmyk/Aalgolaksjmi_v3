import { computeUnrealisedPnl, cryptoTakerFee } from '../src/services/pnlService.js';

describe('account-specific crypto fee estimates', () => {
  test.each([['SPOT', 0.001], ['FUTURES', 0.0004], [undefined, 0.0004]])(
    '%s open P&L includes its own entry and exit fees', (accountType, rate) => {
      expect(cryptoTakerFee(accountType as string)).toBe(rate);
      expect(computeUnrealisedPnl({ side: 'BUY', entryPrice: 100, quantity: 2, accountType }, 101))
        .toBeCloseTo(2 - 402 * Number(rate), 10);
    },
  );
  test('reproduces ICP spot stop-exit loss from the trade audit', () => {
    expect(computeUnrealisedPnl({side: 'BUY', entryPrice: 3.37, quantity: 27.347181008902076, accountType: 'SPOT'}, 3.297))
      .toBeCloseTo(-2.1786678694362003, 10);
  });
  test('does not apply crypto fees to Indian equities', () => {
    expect(computeUnrealisedPnl({side: 'BUY', entryPrice: 100, quantity: 2, accountType: 'INDIAN_NSE'}, 101)).toBe(2);
  });
});
