/*
 * Regression: real contracts, quotes and indicators (2026-09-23).
 *
 * The app generated Thursday weekly expiries for every underlying with stale
 * lot sizes, priced options from a model, and decided on sine-wave RSI/ADX.
 * With Angel One contracts loaded it must use the exchange's expiries, lots,
 * symbols and premiums, falling back to the old behaviour only without them.
 */
import { optionContracts, OptionContract } from "../src/services/indianMarket/angelOne/optionContracts.js";
import { setOptionQuote } from "../src/services/indianMarket/angelOne/optionQuotes.js";
import { rsi, adx } from "../src/services/indianMarket/angelOne/indicators.js";
import { ExpiryResolver } from "../src/services/indianMarket/expiryResolver.js";
import { StrikeSelector } from "../src/services/indianMarket/strikeSelector.js";
import { InstrumentMaster } from "../src/services/indianMarket/instrumentMaster.js";
import { OptionChainService } from "../src/services/indianMarket/optionChainService.js";

const c = (und: string, expiry: string, strike: number, type: "CE" | "PE", token: string, lot: number, exch: "NFO" | "BFO" = "NFO"): OptionContract => ({
  token, exchange: exch, tradingSymbol: `${und}${expiry}${strike}${type}`, strike, type, expiry, lotSize: lot, tickSize: 0.05,
});

// Two NIFTY weeklies (Tue) + BANKNIFTY monthly only, like the real listing.
const NOW = new Date("2026-09-23T12:00:00+05:30");
beforeAll(() => {
  const nifty: OptionContract[] = [];
  let tok = 1000;
  for (const exp of ["2026-09-29", "2026-10-06"]) for (let k = 23300; k <= 23600; k += 50) for (const t of ["CE", "PE"] as const) nifty.push(c("NIFTY", exp, k, t, String(tok++), 65));
  const bank: OptionContract[] = [];
  for (let k = 56300; k <= 56800; k += 100) for (const t of ["CE", "PE"] as const) bank.push(c("BANKNIFTY", "2026-09-29", k, t, String(tok++), 30));
  optionContracts.loadContracts({ NIFTY: nifty, BANKNIFTY: bank });
});

describe("real expiries", () => {
  test("NIFTY uses the listed Tuesday weekly, not a computed Thursday", () => {
    const e = ExpiryResolver.resolveExpiry("NIFTY" as any, { type: "NEAREST_VALID_EXPIRY" }, NOW);
    expect(e.expiry).toBe("2026-09-29");
    expect(e.date.toISOString()).toBe("2026-09-29T10:00:00.000Z"); // 15:30 IST
    expect(ExpiryResolver.resolveExpiry("NIFTY" as any, { type: "NEXT_EXPIRY" }, NOW).expiry).toBe("2026-10-06");
  });

  test("BANKNIFTY (monthly only) resolves to its listed monthly", () => {
    const e = ExpiryResolver.resolveExpiry("BANKNIFTY" as any, { type: "NEAREST_VALID_EXPIRY" }, NOW);
    expect(e).toMatchObject({ expiry: "2026-09-29", isMonthly: true });
  });
});

describe("real strikes, lots and symbols", () => {
  test("strike step comes from the listed strikes", () => {
    expect(StrikeSelector.getStrikeStep("BANKNIFTY" as any, 56548)).toBe(100);
    expect(StrikeSelector.getATMStrike("NIFTY" as any, 23446.8)).toBe(23450);
  });

  test("resolveInstrument returns the listed contract's lot size, symbol and token", () => {
    const exp = ExpiryResolver.resolveExpiry("NIFTY" as any, { type: "NEAREST_VALID_EXPIRY" }, NOW);
    const inst = InstrumentMaster.resolveInstrument("NIFTY" as any, "CE", exp.date, 23450);
    const real = optionContracts.getContract("NIFTY", "2026-09-29", 23450, "CE")!;
    expect(inst).toMatchObject({ lotSize: 65, token: real.token, tradingSymbol: real.tradingSymbol, exchange: "NFO" });
  });
});

describe("real premiums", () => {
  test("markPrice uses a fresh exchange quote for the contract", () => {
    const real = optionContracts.getContract("NIFTY", "2026-09-29", 23450, "PE")!;
    setOptionQuote(real.token, 99.4);
    expect(OptionChainService.markPrice("NIFTY" as any, 23446.8, 23450, false, "2026-09-29")).toBe(99.4);
  });

  test("markPrice falls back to the model when no quote exists", () => {
    const p = OptionChainService.markPrice("NIFTY" as any, 23446.8, 23600, true, "2026-10-06");
    expect(p).toBeGreaterThan(0);
    expect(p).not.toBe(99.4);
  });
});

describe("indicators", () => {
  test("RSI: steady rise → 100, steady fall → 0, too little data → undefined", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(up)).toBe(100);
    expect(rsi(up.slice().reverse())).toBeCloseTo(0, 5);
    expect(rsi([1, 2, 3])).toBeUndefined();
  });

  test("ADX is high in a clean trend and low in a sideways zig-zag", () => {
    const n = 60;
    const trendC = Array.from({ length: n }, (_, i) => 100 + i);
    const trend = adx(trendC.map((x) => x + 0.5), trendC.map((x) => x - 0.5), trendC)!;
    const zigC = Array.from({ length: n }, (_, i) => 100 + (i % 2 ? 1 : -1));
    const zig = adx(zigC.map((x) => x + 0.5), zigC.map((x) => x - 0.5), zigC)!;
    expect(trend).toBeGreaterThan(60);
    expect(zig).toBeLessThan(25);
  });
});
