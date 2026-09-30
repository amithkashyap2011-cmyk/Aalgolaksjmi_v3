import { expiryDateOfTrade } from "../src/services/indianMarket/expiryFromSymbol.js";

test("single option contract", () => {
  expect(expiryDateOfTrade({ symbol: "NIFTY06OCT2622700CE" })).toBe("2026-10-06");
  expect(expiryDateOfTrade({ symbol: "TCS27OCT262080PE" })).toBe("2026-10-27");
});
test("a spread takes its expiry from the legs (earliest wins)", () => {
  expect(expiryDateOfTrade({
    symbol: "KOTAKBANK_BULL_CALL_SPREAD",
    legs: [{ symbol: "KOTAKBANK27OCT26410CE" }, { tradingSymbol: "KOTAKBANK27OCT26420CE" }],
  })).toBe("2026-10-27");
});
test("cash equity and junk have no expiry", () => {
  expect(expiryDateOfTrade({ symbol: "KOTAKBANK" })).toBeNull();
  expect(expiryDateOfTrade({ symbol: "FOO99XXX26100CE" })).toBeNull();
  expect(expiryDateOfTrade({})).toBeNull();
});
