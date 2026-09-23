/*
 * Regression: LIVE positions must have their SL/TP enforced (2026-09-23).
 *
 * A LIVE SPOT PEPE position fell below its stop-loss and was never sold:
 * the SL/TP monitor only scanned PAPER positions, and the AutoTradeEngine
 * only manages exits after its entry gates pass — a fully invested account
 * (zero free USDT) returned early and never reached exit monitoring.
 */
import { jest } from "@jest/globals";

const mockHandleExit = jest.fn() as any;
const prices = new Map<string, number>();

jest.unstable_mockModule("../src/services/autoTradeEngine.js", () => ({
  handleExit: mockHandleExit,
}));
jest.unstable_mockModule("../src/services/binanceService.js", () => ({
  getTickerPriceSync: (symbol: string) => prices.get(symbol) ?? null,
  getLatestFundingRate: (jest.fn() as any).mockResolvedValue(0),
}));
jest.unstable_mockModule("../src/services/socketService.js", () => ({
  emitAlert: jest.fn(),
}));

const paper = await import("../src/services/paperState.js");
const { runMonitorCycle } = await import("../src/services/manualSLTPMonitor.js");

const USER = "6a39c0e7a5e2995ed257ca68";
const SYMBOL = "PEPEUSDT";

function openLivePepe() {
  paper.setPosition(USER, SYMBOL, "LIVE", {
    userId: USER,
    symbol: SYMBOL,
    side: "BUY",
    quantity: 495079.57,
    entryPrice: 0.00000517,
    leverage: 1,
    tradeId: "trade-1",
    sl: 0.00000495,
    tp: 0.00000548,
    accountType: "SPOT",
    meta: {},
  });
}

beforeEach(() => {
  mockHandleExit.mockReset();
  prices.clear();
  paper.removePosition(USER, SYMBOL, "LIVE", "SPOT");
});

describe("ManualSLTPMonitor — LIVE positions", () => {
  test("sells a LIVE position through handleExit when the stop-loss is breached", async () => {
    openLivePepe();
    prices.set(SYMBOL, 0.00000479);
    mockHandleExit.mockImplementation(async () => paper.removePosition(USER, SYMBOL, "LIVE", "SPOT"));

    await runMonitorCycle();

    expect(mockHandleExit).toHaveBeenCalledWith(USER, SYMBOL, "LIVE", "SPOT", "STOP_LOSS_HIT", 1.0, 0.00000479);
  });

  test("takes profit on a LIVE position when TP is reached", async () => {
    openLivePepe();
    prices.set(SYMBOL, 0.0000055);
    mockHandleExit.mockImplementation(async () => paper.removePosition(USER, SYMBOL, "LIVE", "SPOT"));

    await runMonitorCycle();

    expect(mockHandleExit).toHaveBeenCalledWith(USER, SYMBOL, "LIVE", "SPOT", "TAKE_PROFIT_HIT", 1.0, 0.0000055);
  });

  test("leaves a LIVE position alone while price is between SL and TP", async () => {
    openLivePepe();
    prices.set(SYMBOL, 0.00000503);

    await runMonitorCycle();

    expect(mockHandleExit).not.toHaveBeenCalled();
  });

  test("backs off after a failed exchange exit instead of retrying every cycle", async () => {
    const user = "backoff-user-1";
    paper.setPosition(user, SYMBOL, "LIVE", {
      userId: user, symbol: SYMBOL, side: "BUY", quantity: 1000, entryPrice: 0.00000517,
      leverage: 1, tradeId: "trade-2", sl: 0.00000495, accountType: "SPOT", meta: {},
    });
    prices.set(SYMBOL, 0.00000479);
    mockHandleExit.mockRejectedValue(new Error("Binance Spot 401: {\"code\":-2015}"));

    await runMonitorCycle();
    await runMonitorCycle();

    expect(mockHandleExit).toHaveBeenCalledTimes(1);
    paper.removePosition(user, SYMBOL, "LIVE", "SPOT");
  });

  test("treats a quiet no-op exit (position still open) as a failure and backs off", async () => {
    const user = "backoff-user-2";
    paper.setPosition(user, SYMBOL, "LIVE", {
      userId: user, symbol: SYMBOL, side: "BUY", quantity: 1000, entryPrice: 0.00000517,
      leverage: 1, tradeId: "trade-3", sl: 0.00000495, accountType: "SPOT", meta: {},
    });
    prices.set(SYMBOL, 0.00000479);
    mockHandleExit.mockResolvedValue(undefined);

    await runMonitorCycle();
    await runMonitorCycle();

    expect(mockHandleExit).toHaveBeenCalledTimes(1);
    paper.removePosition(user, SYMBOL, "LIVE", "SPOT");
  });

  test("keeps retrying a failed stop-loss exit after price recovers above the stop", async () => {
    // PEPE hit SL, both sells timed out, price bounced to 0.00000497 during
    // the backoff and the monitor stopped trying — leaving it unprotected.
    const user = "latch-user-1";
    paper.setPosition(user, SYMBOL, "LIVE", {
      userId: user, symbol: SYMBOL, side: "BUY", quantity: 1000, entryPrice: 0.00000517,
      leverage: 1, tradeId: "trade-4", sl: 0.00000495, accountType: "SPOT", meta: {},
    });
    prices.set(SYMBOL, 0.00000479);
    mockHandleExit.mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));
    await runMonitorCycle();

    prices.set(SYMBOL, 0.00000497);
    const realNow = Date.now;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => realNow() + 6 * 60_000);
    mockHandleExit.mockImplementation(async () => paper.removePosition(user, SYMBOL, "LIVE", "SPOT"));
    try {
      await runMonitorCycle();
    } finally {
      nowSpy.mockRestore();
    }

    expect(mockHandleExit).toHaveBeenCalledTimes(2);
    expect(mockHandleExit).toHaveBeenLastCalledWith(user, SYMBOL, "LIVE", "SPOT", "STOP_LOSS_HIT", 1.0, 0.00000497);
  });
});
