/*
 * Regression (2026-09-24): manual crypto orders were accepted with a stop above
 * a BUY (DOGE: stop +0.09%, target −0.08%) and stop = target below entry
 * (PEPE: both −0.19%, closed at a loss as "TAKE_PROFIT_HIT").
 */
import { validateOrderLevels } from "../src/services/orderLevels.js";

test("BUY with the stop above the price is rejected (DOGE case)", () => {
  expect(validateOrderLevels("BUY", 0.08516, 0.08523341, 0.08508906).error).toMatch(/Invalid levels for a BUY/);
});

test("BUY with stop = target below entry is rejected (PEPE case)", () => {
  expect(validateOrderLevels("BUY", 0.00000517, 0.00000516, 0.00000516).error).toMatch(/Invalid levels for a BUY/);
});

test("levels inside the round-trip fees are rejected", () => {
  expect(validateOrderLevels("BUY", 100, 99.9, 103).error).toMatch(/at least 0.25%/);
});

test("valid BUY and SELL levels pass", () => {
  expect(validateOrderLevels("BUY", 0.343, 0.338983, 0.350511).error).toBeUndefined();
  expect(validateOrderLevels("SELL", 100, 101.5, 97).error).toBeUndefined();
});
