import { describe, it, expect } from "@jest/globals";
import { IndianCostModel } from "../src/services/indianMarket/costModel.js";

const eq = (action: "BUY" | "SELL", price: number, quantity: number, productType?: any) =>
  IndianCostModel.calculateOrderCost({ instrumentType: "EQUITY", action, price, quantity, productType });

describe("Indian cash-equity costs", () => {
  it("intraday brokerage is min(₹20, 0.03%): a ₹830 order pays ~₹0.25, not ₹20", () => {
    expect(eq("BUY", 415, 2, "MIS").brokerage).toBeCloseTo(0.25, 2);
  });
  it("intraday brokerage caps at ₹20 on large orders", () => {
    expect(eq("BUY", 1000, 1000, "MIS").brokerage).toBe(20);
  });
  it("delivery (CNC) has no brokerage but STT 0.1% on both buy and sell", () => {
    const buy = eq("BUY", 1000, 10, "CNC"), sell = eq("SELL", 1000, 10, "CNC");
    expect(buy.brokerage).toBe(0);
    expect(buy.stt).toBeCloseTo(10, 2);
    expect(sell.stt).toBeCloseTo(10, 2);
  });
  it("intraday STT is sell-side only (0.025%) and stamp duty is 0.003% on buy", () => {
    expect(eq("BUY", 1000, 10, "MIS").stt).toBe(0);
    expect(eq("SELL", 1000, 10, "MIS").stt).toBeCloseTo(2.5, 2);
    expect(eq("BUY", 1000, 10, "MIS").stampDuty).toBeCloseTo(0.3, 2);
    expect(eq("BUY", 1000, 10, "CNC").stampDuty).toBeCloseTo(1.5, 2);
  });
  it("F&O is unchanged: flat ₹20 per order", () => {
    expect(IndianCostModel.calculateOrderCost({ instrumentType: "CE", action: "BUY", price: 10, quantity: 75 }).brokerage).toBe(20);
    expect(IndianCostModel.calculateOrderCost({ instrumentType: "FUTURE", action: "SELL", price: 22000, quantity: 75 }).brokerage).toBe(20);
  });
});
