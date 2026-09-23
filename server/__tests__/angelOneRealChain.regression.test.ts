/*
 * Regression: option chain from real Angel One quotes/OI, and multi-leg
 * valuation from every leg (2026-09-23). The chain was entirely modelled
 * (fake PCR / max pain) and spreads were priced from legs[0] only.
 */
import { optionContracts, OptionContract } from "../src/services/indianMarket/angelOne/optionContracts.js";
import { setOptionQuote } from "../src/services/indianMarket/angelOne/optionQuotes.js";
import { OptionChainService } from "../src/services/indianMarket/optionChainService.js";
import { resolveLivePriceForIndianTrade, MOCK_LIVE_INDIAN_TIKERS } from "../src/services/indianMarket/indianPricing.js";

const EXP = "2026-09-29";
const toks: Record<string, string> = {};
beforeAll(() => {
  const list: OptionContract[] = [];
  let tok = 5000;
  for (let k = 23000; k <= 23900; k += 50) for (const t of ["CE", "PE"] as const) {
    const token = String(tok++);
    toks[`${k}${t}`] = token;
    list.push({ token, exchange: "NFO", tradingSymbol: `NIFTY${k}${t}`, strike: k, type: t, expiry: EXP, lotSize: 65, tickSize: 0.05 });
    // Heavy OI at 23400 on both sides → max pain there; puts carry more OI.
    const oi = k === 23400 ? 900000 : 100000 + (t === "PE" ? 50000 : 0);
    const intrinsic = Math.max(0, t === "CE" ? 23450 - k : k - 23450);
    setOptionQuote(token, { ltp: intrinsic + 60, oi, volume: 1000, bid: intrinsic + 59.9, ask: intrinsic + 60.1 });
  }
  optionContracts.loadContracts({ NIFTY: list });
  MOCK_LIVE_INDIAN_TIKERS["NIFTY50"].ltp = 23450;
});

test("chain is built from real quotes: source, PCR and max pain from OI", () => {
  const chain = OptionChainService.generateOptionChain("NIFTY" as any, 23450, new Date(`${EXP}T15:30:00+05:30`));
  expect(chain.source).toBe("ANGEL_ONE");
  expect(chain.maxPainStrike).toBe(23400);
  expect(chain.pcr).toBeGreaterThan(1);
});

test("implied volatility round-trips the model price", () => {
  const px = OptionChainService.calculateTheoreticalPrice(23450, 23500, 6 / 365, 0.15, true);
  expect(OptionChainService.impliedVolatility(px, 23450, 23500, 6 / 365, true)).toBeCloseTo(0.15, 2);
});

test("multi-leg trades are valued from all legs (debit and credit)", () => {
  const leg = (action: string, strike: number, type: string) => ({ action, strike, instrumentType: type, expiry: EXP });
  // Bull call spread: BUY 23300 CE (150+60) − SELL 23600 CE (60) = 150.
  const debit = resolveLivePriceForIndianTrade({ underlying: "NIFTY", side: "BUY", position: "LONG", legs: [leg("BUY", 23300, "CE"), leg("SELL", 23600, "CE")] });
  expect(debit).toBeCloseTo(150 + 60 - 60, 1);
  // Short strangle: credit = both sold legs.
  const credit = resolveLivePriceForIndianTrade({ underlying: "NIFTY", side: "SELL", position: "SHORT", legs: [leg("SELL", 23600, "CE"), leg("SELL", 23300, "PE")] });
  expect(credit).toBeCloseTo(120, 1);
});
