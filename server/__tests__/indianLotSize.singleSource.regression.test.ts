/*
 * Regression 2026-09-30: three separate static lot-size tables drifted from the
 * exchange (KOTAKBANK 400 vs 2000, TATASTEEL 5500 vs 2750, TATAMOTORS 500 vs
 * 1600, NIFTY 75 vs 65 ...) and from each other. The live Angel One lot must win
 * everywhere, and the static copies (the fallback) must at least agree.
 */
import { optionContracts, exchangeLotSize, normalizeContractUnderlying } from "../src/services/indianMarket/angelOne/optionContracts.js";
import { InstrumentMaster as MarketMaster } from "../src/services/indianMarket/instrumentMaster.js";
import { InstrumentMaster as LegacyMaster } from "../src/services/indian/InstrumentMaster.js";
import { INDIAN_SYMBOLS } from "../src/config/indianSymbols.js";

const c = (und: string, lot: number) => ({
  token: "1", exchange: "NFO" as const, tradingSymbol: `${und}X`, strike: 100, type: "CE" as const,
  expiry: "2099-01-28", lotSize: lot, tickSize: 0.05,
});

describe("static lot tables agree with each other (fallback consistency)", () => {
  const symbols = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX", "RELIANCE", "HDFCBANK", "ICICIBANK", "TCS", "INFY", "SBIN", "TATASTEEL"];
  beforeEach(() => optionContracts.loadContracts({})); // no live contracts => pure static values

  test.each(symbols)("%s has the same lot in every table that defines it", (sym) => {
    const lots = new Set<number>();
    const cfgKey = sym === "NIFTY" ? "NIFTY50" : sym;
    if (INDIAN_SYMBOLS[cfgKey]) lots.add(INDIAN_SYMBOLS[cfgKey].lotSize);
    lots.add(MarketMaster.getSpec(sym as any).lotSize);
    lots.add(LegacyMaster.getSpec(sym).lotSize);
    expect([...lots]).toHaveLength(1);
  });
});

describe("live exchange lot wins over static values", () => {
  beforeEach(() => optionContracts.loadContracts({ RELIANCE: [c("RELIANCE", 500)], KOTAKBANK: [c("KOTAKBANK", 2000)], NIFTY: [c("NIFTY", 65)], SENSEX: [c("SENSEX", 20)] }));
  afterAll(() => optionContracts.loadContracts({}));

  test("both instrument masters use the live lot (symbol WITH a static spec, and one without)", () => {
    // RELIANCE has a static spec (the path that used to ignore live contracts).
    optionContracts.loadContracts({ RELIANCE: [c("RELIANCE", 321)], KOTAKBANK: [c("KOTAKBANK", 2000)] });
    expect(MarketMaster.getSpec("RELIANCE" as any).lotSize).toBe(321);
    expect(LegacyMaster.getSpec("RELIANCE").lotSize).toBe(321);
    // KOTAKBANK has no static spec (fallback path).
    expect(MarketMaster.getSpec("KOTAKBANK" as any).lotSize).toBe(2000);
    expect(LegacyMaster.getSpec("KOTAKBANK").lotSize).toBe(2000);
  });

  test("live lot is found for app aliases (NIFTY50, 'NIFTY 50')", () => {
    expect(exchangeLotSize("NIFTY50")).toBe(65);
    expect(exchangeLotSize("NIFTY 50")).toBe(65);
    expect(normalizeContractUnderlying("Bank Nifty")).toBe("BANKNIFTY");
    expect(MarketMaster.getLotSize?.("NIFTY50" as any) ?? MarketMaster.getSpec("NIFTY50" as any).lotSize).toBe(65);
  });

  test("a stale static value can never override a loaded contract", () => {
    // Even if the static table said something else, the live lot is returned.
    optionContracts.loadContracts({ RELIANCE: [c("RELIANCE", 777)] });
    expect(MarketMaster.getSpec("RELIANCE" as any).lotSize).toBe(777);
    expect(LegacyMaster.getLotSize("RELIANCE")).toBe(777);
  });
});
