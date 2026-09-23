/*
 * AI profit booking (2026-09-23): a held position is closed when it is in
 * profit after round-trip fees and the AI view (fused ensemble direction or
 * gated decision) has turned against it on consecutive evaluations. It must
 * never close at a loss.
 */
import { describe, test, expect } from "@jest/globals";
import { PositionManager } from "../src/services/aqea/positionManager.js";

const SPOT_FEE = 0.001;
const bearish = { decision: "HOLD", fusedDirection: "SHORT" };
const bullish = { decision: "HOLD", fusedDirection: "LONG" };

let n = 0;
const freshKey = () => `test-user:SYM${++n}:LIVE:SPOT`;

function evaluate(key: string, price: number, view = bearish, pos: any = { side: "BUY", entryPrice: 100 }, minR = 0.3) {
  return PositionManager.evaluateProfitBooking(key, pos, view, price, SPOT_FEE, minR);
}

describe("PositionManager.evaluateProfitBooking", () => {
  test("books a long in profit after the AI turns bearish on two consecutive evaluations", () => {
    const key = freshKey();
    expect(evaluate(key, 101).book).toBe(false);
    const second = evaluate(key, 101);
    expect(second.book).toBe(true);
    expect(second.reason).toBe("AI_BOOK_PROFIT");
    expect(second.netProfitPct).toBeCloseTo(0.01 - 2 * SPOT_FEE, 6);
  });

  test("never books a losing position, however bearish the AI is", () => {
    const key = freshKey();
    for (let i = 0; i < 5; i++) expect(evaluate(key, 99, { decision: "SHORT", fusedDirection: "SHORT" }).book).toBe(false);
  });

  test("a gross gain that round-trip spot fees wipe out is not profit", () => {
    const key = freshKey();
    evaluate(key, 100.25);
    expect(evaluate(key, 100.25).book).toBe(false); // +0.25% gross, +0.05% net < 0.2% floor
  });

  test("holds while the AI still supports the position", () => {
    const key = freshKey();
    for (let i = 0; i < 4; i++) expect(evaluate(key, 102, bullish).book).toBe(false);
  });

  test("a neutral evaluation between bearish ones resets the confirmation", () => {
    const key = freshKey();
    evaluate(key, 101);
    evaluate(key, 101, bullish);
    expect(evaluate(key, 101).book).toBe(false);
    expect(evaluate(key, 101).book).toBe(true);
  });

  test("the gated decision alone also counts as the AI turning against the position", () => {
    const key = freshKey();
    const gatedShort = { decision: "SHORT", fusedDirection: "HOLD" };
    evaluate(key, 101, gatedShort);
    expect(evaluate(key, 101, gatedShort).book).toBe(true);
  });

  test("requires aiFlipExitMinProfitR of the stop distance before banking (PEPE example)", () => {
    // Entry 5.17, SL 4.95 → risk 4.26%; 0.3R ≈ 1.28% net needed.
    const pepe = { side: "BUY", entryPrice: 5.17, sl: 4.95 };
    const small = freshKey();
    evaluate(small, 5.20, bearish, pepe);
    expect(evaluate(small, 5.20, bearish, pepe).book).toBe(false); // +0.58% gross

    const enough = freshKey();
    evaluate(enough, 5.26, bearish, pepe);
    expect(evaluate(enough, 5.26, bearish, pepe).book).toBe(true); // +1.74% gross, +1.54% net
  });

  test("books a short in profit when the AI turns bullish", () => {
    const key = freshKey();
    const short = { side: "SELL", entryPrice: 100 };
    evaluate(key, 98.5, bullish, short);
    expect(evaluate(key, 98.5, bullish, short).book).toBe(true);
  });
});
