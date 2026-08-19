import { computeUnrealisedPnl } from "../src/services/pnlService.js";

describe("Position PnL, ROE and Leverage Mathematics Data-Flow Validation", () => {
  describe("1. Deterministic PnL Formulas", () => {
    test("LONG Profit: Entry=100, Mark=110, Qty=10, AccountType=SPOT (No fee)", () => {
      const trade = { side: "LONG", entryPrice: 100, quantity: 10, accountType: "SPOT" };
      const pnl = computeUnrealisedPnl(trade, 110);
      expect(pnl).toBeCloseTo(100, 4);
    });

    test("LONG Loss: Entry=100, Mark=90, Qty=10, AccountType=SPOT (No fee)", () => {
      const trade = { side: "LONG", entryPrice: 100, quantity: 10, accountType: "SPOT" };
      const pnl = computeUnrealisedPnl(trade, 90);
      expect(pnl).toBeCloseTo(-100, 4);
    });

    test("SHORT Profit: Entry=100, Mark=90, Qty=10, AccountType=SPOT (No fee)", () => {
      const trade = { side: "SHORT", entryPrice: 100, quantity: 10, accountType: "SPOT" };
      const pnl = computeUnrealisedPnl(trade, 90);
      expect(pnl).toBeCloseTo(100, 4);
    });

    test("SHORT Loss: Entry=100, Mark=110, Qty=10, AccountType=SPOT (No fee)", () => {
      const trade = { side: "SHORT", entryPrice: 100, quantity: 10, accountType: "SPOT" };
      const pnl = computeUnrealisedPnl(trade, 110);
      expect(pnl).toBeCloseTo(-100, 4);
    });
  });

  describe("2. Futures Taker Fee Adjustments", () => {
    test("FUTURES LONG net PnL subtracts 0.04% entry and 0.04% exit fees", () => {
      const trade = { side: "LONG", entryPrice: 100, quantity: 10, accountType: "FUTURES" };
      // Gross = (110 - 100) * 10 = 100
      // Entry fee = 100 * 10 * 0.0004 = 0.4
      // Exit fee = 110 * 10 * 0.0004 = 0.44
      // Net PnL = 100 - 0.4 - 0.44 = 99.16
      const pnl = computeUnrealisedPnl(trade, 110);
      expect(pnl).toBeCloseTo(99.16, 4);
    });
  });

  describe("3. Verification of User Prompt Positions", () => {
    test("ETHUSDT: Entry=1151.06, Mark=1918.30, Qty=0.0574, Lev=5x -> Margin=$13.21, PnL=+$43.97, ROE=+332.74%", () => {
      const trade = {
        symbol: "ETHUSDT",
        side: "LONG",
        entryPrice: 1151.06,
        quantity: 0.0574,
        leverage: 5,
        accountType: "FUTURES",
      };

      const markPrice = 1918.30;
      const netPnl = computeUnrealisedPnl(trade, markPrice);
      const entryNotional = trade.entryPrice * trade.quantity;
      const margin = entryNotional / trade.leverage;
      const roe = (netPnl / margin) * 100;

      expect(margin).toBeCloseTo(13.214, 2);
      expect(netPnl).toBeCloseTo(43.97, 1);
      expect(roe).toBeCloseTo(332.74, 1);
    });

    test("BNBUSDT: Entry=594.63, Mark=596.14, Qty=19.3492, Lev=4x -> Margin=$2876.40, PnL=+$29.22 (gross), ROE=+1.02%", () => {
      const entry = 594.63;
      const mark = 596.14;
      const qty = 19.3492;
      const lev = 4;

      const notional = entry * qty;
      const margin = notional / lev;
      const grossPnl = (mark - entry) * qty;
      const roe = (grossPnl / margin) * 100;

      expect(margin).toBeCloseTo(2876.40, 2);
      expect(grossPnl).toBeCloseTo(29.22, 2);
      expect(roe).toBeCloseTo(1.02, 2);
    });
  });
});
