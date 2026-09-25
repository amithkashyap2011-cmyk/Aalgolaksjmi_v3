/*
 * Regression (2026-09-24): Indian option trades were opened/closed on a mix
 * of model and real prices (phantom 1-2 minute wins and losses), the regime
 * was always RANGING (empty bars → ADX 22), and stops were a flat −28%.
 */
import { optionContracts, OptionContract } from "../src/services/indianMarket/angelOne/optionContracts.js";
import { setOptionQuote } from "../src/services/indianMarket/angelOne/optionQuotes.js";
import { realOptionValue, priceTradeFromRealQuotes, volScaledStops, volScaledSpreadStops, isOptionTrade } from "../src/services/indianMarket/realQuoteGuard.js";
import { StrategyRouter } from "../src/services/indianMarket/strategyRouter.js";

const EXP = "2026-09-29";
beforeAll(() => {
  const list: OptionContract[] = [];
  let tok = 9000;
  for (const k of [55500, 55600]) for (const t of ["CE", "PE"] as const) {
    list.push({ token: String(tok++), exchange: "NFO", tradingSymbol: `BANKNIFTY${k}${t}`, strike: k, type: t, expiry: EXP, lotSize: 30, tickSize: 0.05 });
  }
  optionContracts.loadContracts({ BANKNIFTY: list });
  setOptionQuote("9000", 410); // 55500 CE
  setOptionQuote("9001", 380); // 55500 PE
  // 9002/9003 (55600) deliberately have no quote
});

const leg = (strike: number, t: "CE" | "PE", action = "BUY") => ({ strike, instrumentType: t, expiry: EXP, action, tradingSymbol: `${strike}${t}` });

test("exit monitor value uses only fresh real quotes (no model fallback)", () => {
  expect(realOptionValue({ legs: [leg(55500, "PE")] }, "BANKNIFTY")).toBe(380);
  expect(realOptionValue({ legs: [leg(55600, "PE")] }, "BANKNIFTY")).toBeUndefined();
  // spread: long 55500 CE (410) − short 55500 PE (380) = 30
  expect(realOptionValue({ side: "BUY", legs: [leg(55500, "CE"), leg(55500, "PE", "SELL")] }, "BANKNIFTY")).toBe(30);
  expect(isOptionTrade({ legs: [leg(55500, "CE")] })).toBe(true);
});

test("entries are refused while the spot feed is simulated", () => {
  const trade: any = { legs: [leg(55500, "PE")], entryPrice: 185.9, stopLoss: 134, target: 270 };
  const r = priceTradeFromRealQuotes(trade, "BANKNIFTY", 56500);
  expect(r.ok).toBe(false);
  expect((r as any).reason).toMatch(/SPOT_FEED_NOT_LIVE/);
  expect(trade.entryPrice).toBe(185.9); // untouched
});

test("stops scale with the option's volatility and stay within bounds", () => {
  for (const [spot, strike, isCall, prem] of [[56500, 55500, false, 380], [56500, 56500, true, 420], [56500, 57500, true, 60]] as const) {
    const { slPct, tpPct } = volScaledStops(spot, strike, isCall, EXP, prem);
    expect(slPct).toBeGreaterThanOrEqual(0.12);
    expect(slPct).toBeLessThanOrEqual(0.40);
    expect(tpPct).toBeGreaterThanOrEqual(0.20);
    expect(tpPct).toBeLessThanOrEqual(0.80);
    expect(tpPct / slPct).toBeGreaterThanOrEqual(1.6); // target always ≥ 1.6× stop
  }
});

test("regime uses real ADX and direction vs open — not a hardcoded RANGING", () => {
  // Stock option: no chain, pcr defaults to 1.0; strong downtrend.
  expect(StrategyRouter.classifyRegime(990, [], 1.0, { adx14: 32, open: 1000 }).regime).toBe("TRENDING_BEAR");
  expect(StrategyRouter.classifyRegime(1010, [], 1.0, { adx14: 32, open: 1000 }).regime).toBe("TRENDING_BULL");
  expect(StrategyRouter.classifyRegime(1000.5, [], 1.0, { adx14: 14, open: 1000 }).regime).not.toMatch(/TRENDING/);
});

test("debit spreads get volatility-scaled stops instead of a flat −60% / +75%-of-max", () => {
  // 2026-09-25: RELIANCE 1220/1240 CE bull call spread bought at 8 had stop
  // 3.20 (−60%) and target 17.00 (+112%) on an intraday trade.
  for (const [spot, buyK, sellK, buyPx, sellPx, t] of [
    [1225, 1220, 1240, 20, 12, "CE"],
    [55550, 55500, 55600, 410, 360, "CE"],
    [290, 295, 285, 9.1, 6.0, "PE"],
  ] as const) {
    const legs = [
      { action: "BUY", strike: buyK, instrumentType: t, expiry: EXP },
      { action: "SELL", strike: sellK, instrumentType: t, expiry: EXP },
    ];
    const debit = buyPx - sellPx;
    const r = volScaledSpreadStops(spot, legs, [buyPx, sellPx], debit)!;
    expect(r).toBeDefined();
    expect(r.slPct).toBeGreaterThanOrEqual(0.10);
    expect(r.slPct).toBeLessThanOrEqual(0.40); // never the old −60%
    expect(r.tpPct).toBeGreaterThanOrEqual(0.25);
    expect(debit * (1 + r.tpPct)).toBeLessThan(Math.abs(buyK - sellK)); // below max value
    expect(r.tpPct / r.slPct).toBeGreaterThanOrEqual(1.6 - 1e-9);
  }
  // not a vertical debit spread → no override
  expect(volScaledSpreadStops(1225, [{ action: "BUY", strike: 1220, instrumentType: "CE", expiry: EXP }], [20], 20)).toBeUndefined();
  expect(volScaledSpreadStops(1225, [
    { action: "BUY", strike: 1220, instrumentType: "CE", expiry: EXP },
    { action: "SELL", strike: 1220, instrumentType: "PE", expiry: EXP },
  ], [20, 12], 8)).toBeUndefined();
});
