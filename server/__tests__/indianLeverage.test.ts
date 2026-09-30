import { resolveIndianLeverage, MAX_INDIAN_MIS_LEVERAGE } from "../src/services/indianMarket/leverage.js";

test("delivery is always 1x, whatever is asked", () => {
  expect(resolveIndianLeverage("CNC", 10)).toBe(1);
  expect(resolveIndianLeverage(undefined, 5)).toBe(1);
});
test("intraday defaults to 5x and is capped at 5x", () => {
  expect(resolveIndianLeverage("MIS", undefined)).toBe(MAX_INDIAN_MIS_LEVERAGE);
  expect(resolveIndianLeverage("MIS", "junk")).toBe(5);
  expect(resolveIndianLeverage("MIS", 20)).toBe(5);
  expect(resolveIndianLeverage("MIS", 3)).toBe(3);
  expect(resolveIndianLeverage("MIS", 0)).toBe(5);
  expect(resolveIndianLeverage("MIS", 2.9)).toBe(2);
});
