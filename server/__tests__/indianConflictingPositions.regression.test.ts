/*
 * Regression (2026-09-25): the duplicate-position gate only compared trades
 * with the same strategy, so TATAMOTORS had a bearish put spread (09:44) and
 * a bullish stock buy (12:09) open at the same time. tradeDirection() lets
 * the gate refuse a new position that bets against an open one.
 */
import { tradeDirection } from "../src/services/indianMarket/riskManager.js";

const opt = (action: string, strike: number, instrumentType: "CE" | "PE") => ({ action, strike, instrumentType, expiry: "2026-09-29" });

test("stored side is BUY for every Indian trade, so direction comes from the legs", () => {
  // bear put spread (as stored: side BUY)
  expect(tradeDirection({ side: "BUY", legs: [opt("BUY", 295, "PE"), opt("SELL", 285, "PE")] })).toBe("BEAR");
  // bull call spreads
  expect(tradeDirection({ side: "BUY", legs: [opt("BUY", 1220, "CE"), opt("SELL", 1240, "CE")] })).toBe("BULL");
  // stock buy (no legs)
  expect(tradeDirection({ side: "BUY", legs: [] })).toBe("BULL");
  expect(tradeDirection({ side: "SELL" })).toBe("BEAR");
  // single option legs
  expect(tradeDirection({ side: "BUY", legs: [opt("BUY", 290, "CE")] })).toBe("BULL");
  expect(tradeDirection({ side: "BUY", legs: [opt("BUY", 290, "PE")] })).toBe("BEAR");
  expect(tradeDirection({ side: "SELL", legs: [opt("SELL", 290, "PE")] })).toBe("BULL");
});

test("the TATAMOTORS pair conflicts; neutral structures never block", () => {
  const putSpread = { side: "BUY", legs: [opt("BUY", 295, "PE"), opt("SELL", 285, "PE")] };
  const stockBuy = { side: "BUY", legs: [] };
  expect(tradeDirection(putSpread)).not.toBe(tradeDirection(stockBuy));
  const condor = { side: "BUY", legs: [opt("SELL", 280, "PE"), opt("BUY", 270, "PE"), opt("SELL", 300, "CE"), opt("BUY", 310, "CE")] };
  expect(tradeDirection(condor)).toBe("NEUTRAL");
  const straddle = { side: "BUY", legs: [opt("BUY", 290, "CE"), opt("BUY", 290, "PE")] };
  expect(tradeDirection(straddle)).toBe("NEUTRAL");
});
