/*
 * Regression (2026-09-24): Indian option buys debited only the stop-loss risk
 * (~28% of premium) and exits credited max(0, margin + pnl), so any loss past
 * that amount was never charged — ₹6,736.25 of phantom cash on 9 trades.
 */
import { IndianRiskManager } from "../src/services/indianMarket/riskManager.js";

const leg = (t: "CE" | "PE", action = "BUY") => ({ instrumentType: t, action });

test("buying an option debits the full premium, not just the stop-loss risk", () => {
  const m = IndianRiskManager.computeRequiredMargin({ legs: [leg("PE")], position: "LONG", entryPrice: 383.63, quantity: 30, risk: { riskAmount: 3222.6 } } as any);
  expect(m).toBeCloseTo(383.63 * 30, 2);
});

test("credit / short positions keep the risk-based margin", () => {
  const m = IndianRiskManager.computeRequiredMargin({ legs: [leg("CE", "SELL"), leg("CE")], position: "SHORT", entryPrice: 40, quantity: 65, risk: { riskAmount: 9000 } } as any);
  expect(m).toBe(9000);
});

test("exit release uses the recorded debit (legacy shape without legs)", () => {
  const m = IndianRiskManager.computeRequiredMargin({ risk: { riskAmount: 11508.9 }, entryPrice: 383.63, quantity: 30 } as any);
  expect(m).toBe(11508.9);
});

import { chargesAtClose } from "../src/services/indianMarket/tradeCharges.js";

test("exits deduct the ledger's charges from cash (wallet agrees with net P/L)", () => {
  const c = chargesAtClose({ symbol: "NIFTY29SEP2623100PE", side: "BUY", quantity: 65, entryPrice: 153.7, exitPrice: 110.59, status: "OPEN", pnl: -2802.15, openedAt: new Date(), closedAt: new Date(), legs: [{ instrumentType: "PE", action: "BUY", strike: 23100 }] });
  expect(c).toBeGreaterThan(0);
  expect(c).toBeLessThan(200); // brokerage + taxes on one lot, not a notional-sized number
});
