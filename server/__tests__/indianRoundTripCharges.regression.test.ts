import { describe, it, expect } from "@jest/globals";
import { chargesAtClose } from "../src/services/indianMarket/tradeCharges.js";
import { IndianCostModel } from "../src/services/indianMarket/costModel.js";

describe("chargesAtClose covers both legs", () => {
  it("charges entry + exit (incl. sell-side STT) for a closed option long", () => {
    const trade = { symbol: "NIFTY26OCT24500CE", side: "BUY", entryPrice: 100, exitPrice: 120, quantity: 75, origQty: 75, status: "OPEN" };
    const entry = IndianCostModel.calculateOrderCost({ instrumentType: "CE", action: "BUY", price: 100, quantity: 75 });
    const exit = IndianCostModel.calculateOrderCost({ instrumentType: "CE", action: "SELL", price: 120, quantity: 75 });
    const got = chargesAtClose(trade);
    expect(exit.stt).toBeGreaterThan(0);
    expect(got).toBeCloseTo(entry.totalCharges + exit.totalCharges, 1);
    expect(got).toBeGreaterThan(entry.totalCharges + 20);
  });
});
