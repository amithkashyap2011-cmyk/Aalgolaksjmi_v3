import { jest } from '@jest/globals';
jest.unstable_mockModule('../src/services/indianMarket/angelOne/angelPriceFeed.js', () => ({
  getAngelFeedStatus: () => ({ source: 'ANGEL_ONE', symbolsLive: 1 }),
}));
const { optionContracts } = await import('../src/services/indianMarket/angelOne/optionContracts.js');
const { setOptionQuote } = await import('../src/services/indianMarket/angelOne/optionQuotes.js');
const { priceTradeFromRealQuotes } = await import('../src/services/indianMarket/realQuoteGuard.js');
const expiry = '2026-09-29';
beforeEach(() => {
  optionContracts.loadContracts({ TATASTEEL: [
    { token: '101', tradingSymbol: 'REAL_BUY', exchange: 'NFO', strike: 187.5, type: 'CE', expiry, lotSize: 100, tickSize: 0.05 },
    { token: '102', tradingSymbol: 'REAL_SELL', exchange: 'NFO', strike: 192.5, type: 'CE', expiry, lotSize: 100, tickSize: 0.05 },
  ] });
  setOptionQuote('101', 0.4);
  setOptionQuote('102', 0.1);
});
function proposal(quantity = 200): any {
  return { position: 'LONG', quantity, entryPrice: 0.37, stopLoss: 0.22, target: 0.74, legs: [
    { action: 'BUY', instrumentType: 'CE', strike: 187.5, expiry, token: 'synthetic1', lotSize: 1, quantity },
    { action: 'SELL', instrumentType: 'CE', strike: 192.5, expiry, token: 'synthetic2', lotSize: 1, quantity },
  ] };
}
test('rejects fractional exchange lots before mutating the proposal', () => {
  const t = proposal(14334); const original = JSON.stringify(t);
  expect(priceTradeFromRealQuotes(t, 'TATASTEEL', 188)).toEqual({ok: false, reason: 'INVALID_OPTION_LOT_QUANTITY'});
  expect(JSON.stringify(t)).toBe(original);
});
test('binds accepted prices to canonical broker contracts', () => {
  const t = proposal();
  expect(priceTradeFromRealQuotes(t, 'TATASTEEL', 188).ok).toBe(true);
  expect(t.legs[0]).toMatchObject({token: '101', tradingSymbol: 'REAL_BUY', lotSize: 100, entryPrice: 0.4});
  expect(t.entryPrice).toBe(0.3);
  expect(t.averageEntryPrice).toBe(0.3);
});
test('refuses missing contracts', () => {
  const t = proposal(); t.legs[0].strike = 188;
  expect(priceTradeFromRealQuotes(t, 'TATASTEEL', 188)).toEqual({ok: false, reason: 'UNKNOWN_OPTION_CONTRACT'});
});
test('does not turn a negative spread quote into a fabricated positive premium', () => {
  setOptionQuote('102', 0.5);
  const t = proposal(); const original = JSON.stringify(t);
  expect(priceTradeFromRealQuotes(t, 'TATASTEEL', 188)).toEqual({ok: false, reason: 'INVALID_OPTION_NET_PREMIUM'});
  expect(JSON.stringify(t)).toBe(original);
});
