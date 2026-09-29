import { jest } from '@jest/globals';
const { optionContracts } = await import('../src/services/indianMarket/angelOne/optionContracts.js');
const { InstrumentMaster } = await import('../src/services/indianMarket/instrumentMaster.js');
const expiry = '2026-10-27';
beforeEach(() => {
  optionContracts.loadContracts({ TATASTEEL: [
    { token: '101', tradingSymbol: 'TATASTEEL29SEP26187.5CE', exchange: 'NFO', strike: 187.5, type: 'CE', expiry, lotSize: 2750, tickSize: 0.05 },
  ] });
});
test('half-point strike resolves to the real contract and exchange lot', () => {
  const i = InstrumentMaster.resolveInstrument('TATASTEEL', 'CE', new Date('2026-10-27T00:00:00+05:30'), 187.5);
  expect(i.token).toBe('101');
  expect(i.lotSize).toBe(2750);
});
test('unlisted-strike fallback still uses the exchange lot, not 1', () => {
  expect(InstrumentMaster.getSpec('TATASTEEL').lotSize).toBe(2750);
});
