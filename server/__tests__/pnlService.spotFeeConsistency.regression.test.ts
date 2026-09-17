/*
 * ─── Regression: unrealised PnL must apply fees for SPOT too ──────────
 *
 * pnlService.ts's own header comment says its entire purpose is making
 * unrealised (open-position) PnL match realised (on-close) PnL exactly,
 * "so there's no jump on close". But computeUnrealisedPnl() only
 * subtracted entry+exit fees when accountType === "FUTURES" — SPOT fell
 * through to a bare `return grossPnl`, no fees at all — while
 * handleExit() (autoTradeEngine.ts, the function that actually books a
 * close) computes entryFee/exitFee unconditionally, for every account
 * type. A SPOT position's live PnL therefore omitted fees while open and
 * then jumped down by the fee amount the moment it closed: the exact bug
 * this module exists to prevent, just not fixed for SPOT.
 *
 * Golden-value check uses the real BTCUSDT SPOT trade seen live in this
 * app (entry 79165.92, exit 79135.78, qty 0.00033), whose booked netPnl
 * from handleExit was -0.030842024399999807 — computeUnrealisedPnl at
 * the same entry/mark/qty must now match that, not just gross PnL.
 */
import { computeUnrealisedPnl, TAKER_FEE } from "../src/services/pnlService";

describe("computeUnrealisedPnl — SPOT/FUTURES fee consistency", () => {
  test("SPOT and FUTURES trades with identical entry/mark/qty produce identical (fee-inclusive) PnL", () => {
    const entryPrice = 50000;
    const markPrice = 50100;
    const quantity = 1;

    const spotPnl = computeUnrealisedPnl({ side: "BUY", entryPrice, quantity, accountType: "SPOT" }, markPrice);
    const futuresPnl = computeUnrealisedPnl({ side: "BUY", entryPrice, quantity, accountType: "FUTURES" }, markPrice);
    const noAccountTypePnl = computeUnrealisedPnl({ side: "BUY", entryPrice, quantity }, markPrice);

    expect(spotPnl).toBeCloseTo(futuresPnl, 10);
    expect(spotPnl).toBeCloseTo(noAccountTypePnl, 10);
  });

  test("SPOT PnL is net of entry+exit taker fees, not bare gross PnL", () => {
    const entryPrice = 50000;
    const markPrice = 50100;
    const quantity = 1;
    const grossPnl = (markPrice - entryPrice) * quantity;
    const expectedFees = entryPrice * quantity * TAKER_FEE + markPrice * quantity * TAKER_FEE;

    const spotPnl = computeUnrealisedPnl({ side: "BUY", entryPrice, quantity, accountType: "SPOT" }, markPrice);

    expect(spotPnl).not.toBeCloseTo(grossPnl, 6); // must NOT equal the old fee-less value
    expect(spotPnl).toBeCloseTo(grossPnl - expectedFees, 10);
  });

  test("golden value: matches the real handleExit()-booked netPnl for the live BTCUSDT SPOT trade", () => {
    const entryPrice = 79165.92;
    const exitPrice = 79135.78;
    const quantity = 0.00033;
    const knownBookedNetPnl = -0.030842024399999807;

    const unrealisedAtExitPrice = computeUnrealisedPnl(
      { side: "BUY", entryPrice, quantity, accountType: "SPOT" },
      exitPrice
    );

    expect(unrealisedAtExitPrice).toBeCloseTo(knownBookedNetPnl, 10);
  });
});
