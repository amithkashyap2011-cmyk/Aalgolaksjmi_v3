import { ExitEngine, breakevenBufferPct } from "../../src/services/aqea/exitEngine.js";

// 2026-09-27: the breakeven elevation used a flat +0.1% for every account,
// but SPOT pays 0.1% per side, so a "breakeven" SPOT stop still booked a
// loss (DOT: SL 1.26026, exit 1.2600, -$0.0003).
const SPOT_FEE = 0.001;
const FUT_FEE = 0.0004;

function elevate(accountType?: "SPOT" | "FUTURES") {
  // +0.6% in profit, below TP1, stop still under entry → elevation fires.
  return ExitEngine.evaluateExit(100.6, {
    side: "BUY", entryPrice: 100, tp1: 102, tp2: 103, tp3: 104, sl: 98,
    tp1Hit: false, tp2Hit: false, tp3Hit: false, accountType,
  });
}

describe("breakeven stop covers round-trip fees", () => {
  test("SPOT buffer clears 0.1% x2 fees; FUTURES/unset keep 0.1%", () => {
    expect(breakevenBufferPct("SPOT")).toBeGreaterThan(2 * SPOT_FEE);
    expect(breakevenBufferPct("FUTURES")).toBeGreaterThan(2 * FUT_FEE);
    expect(breakevenBufferPct(undefined)).toBe(0.001);
  });

  test("SPOT long: elevated stop is entry + 0.25%, and exiting there nets a profit after fees", () => {
    const sig = elevate("SPOT");
    expect(sig.reason).toBe("BREAKEVEN_ELEVATION");
    expect(sig.newStopLoss).toBeCloseTo(100.25, 10);
    const net = (sig.newStopLoss! - 100) - (100 + sig.newStopLoss!) * SPOT_FEE;
    expect(net).toBeGreaterThan(0);
  });

  test("FUTURES long keeps the 0.1% stop (already above 0.04% x2 fees)", () => {
    expect(elevate("FUTURES").newStopLoss).toBeCloseTo(100.1, 10);
  });

  test("SHORT mirrors the buffer below entry", () => {
    const sig = ExitEngine.evaluateExit(99.4, {
      side: "SELL", entryPrice: 100, tp1: 98, tp2: 97, tp3: 96, sl: 102,
      tp1Hit: false, tp2Hit: false, tp3Hit: false, accountType: "FUTURES",
    });
    expect(sig.newStopLoss).toBeCloseTo(99.9, 10);
  });
});
