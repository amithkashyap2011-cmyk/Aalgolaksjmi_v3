/*
 * Regression: futures 1000x meme contracts (2026-09-23).
 *
 * Binance USDⓈ-M lists PEPE, BONK and FLOKI (like SHIB) only as 1000-unit
 * contracts. Only SHIB was mapped, so a futures short on PEPE/BONK/FLOKI was
 * sent as "PEPEUSDT" and rejected with -1121 Invalid symbol.
 */
import { toBinanceSymbol, fromBinanceSymbol, is1000xContract } from "../src/services/binanceService.js";

const PAIRS: Array<[string, string]> = [
  ["SHIBUSDT", "1000SHIBUSDT"],
  ["PEPEUSDT", "1000PEPEUSDT"],
  ["BONKUSDT", "1000BONKUSDT"],
  ["FLOKIUSDT", "1000FLOKIUSDT"],
];

describe("futures 1000x symbol mapping", () => {
  test.each(PAIRS)("%s maps to %s on futures and back", (ours, binance) => {
    expect(toBinanceSymbol(ours, true)).toBe(binance);
    expect(fromBinanceSymbol(binance)).toBe(ours);
    expect(is1000xContract(binance)).toBe(true);
    expect(is1000xContract(binance.toLowerCase())).toBe(true); // WS stream names are lowercase
  });

  test.each(PAIRS)("%s keeps its plain symbol on spot", (ours) => {
    expect(toBinanceSymbol(ours, false)).toBe(ours);
    expect(is1000xContract(ours)).toBe(false);
  });

  test("ordinary futures symbols are untouched", () => {
    for (const s of ["BTCUSDT", "DOGEUSDT", "WIFUSDT"]) {
      expect(toBinanceSymbol(s, true)).toBe(s);
      expect(fromBinanceSymbol(s)).toBe(s);
      expect(is1000xContract(s)).toBe(false);
    }
  });
});
