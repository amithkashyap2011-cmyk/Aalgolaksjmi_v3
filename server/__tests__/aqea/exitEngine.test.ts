import { jest } from '@jest/globals';

const chainMock = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: (jest.fn() as any).mockResolvedValue([])
};

jest.unstable_mockModule("mongoose", () => {
  class MockSchema {
    static Types: any = { ObjectId: "ObjectId" };
    index() {}
  }
  return {
    default: {
      connection: { readyState: 1 },
      Types: { ObjectId: class { id: any; constructor(id: any) { this.id = id; } toString() { return this.id; } static isValid() { return true; } } },
      model: jest.fn().mockReturnValue({ index: jest.fn() }),
      Schema: MockSchema
    },
    Schema: MockSchema,
    model: jest.fn().mockReturnValue({ index: jest.fn() })
  };
});

jest.unstable_mockModule("../../src/models/Trade.js", () => ({
  Trade: { find: jest.fn().mockReturnValue(chainMock) }
}));

jest.unstable_mockModule("../../src/models/AqeaTradeAnalytics.js", () => ({
  AqeaTradeAnalytics: { find: jest.fn().mockReturnValue(chainMock), create: (jest.fn() as any).mockResolvedValue({}) }
}));

jest.unstable_mockModule("../../src/models/AqeaPerformance.js", () => ({
  AqeaPerformance: { find: jest.fn().mockReturnValue(chainMock) }
}));

jest.unstable_mockModule("../../src/services/aqea/AqeaAudit.js", () => ({
  AqeaAuditService: {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    critical: jest.fn(),
    error: jest.fn(),
  },
}));

let ExitEngine: any, AqeaAuditService: any;
beforeAll(async () => {
  ({ ExitEngine } = await import("../../src/services/aqea/exitEngine.js"));
  ({ AqeaAuditService } = await import("../../src/services/aqea/AqeaAudit.js") as any);
});
import type { TradeExitState } from "../../src/services/aqea/exitEngine.js";

jest.setTimeout(60000);

describe("AQEA Exit Engine", () => {
  const entryPrice = 100000;
  const atr = 2000;

  test("Calculate levels correctly for LONG", () => {
    const levels = ExitEngine.calculateLevels("BUY", entryPrice, atr);
    expect(levels.tp1).toBe(104000); // 2.0× ATR
    expect(levels.tp2).toBe(107000); // 3.5× ATR
    expect(levels.tp3).toBe(110000); // 5.0× ATR
    expect(levels.sl).toBe(97600);   // 1.2× ATR
  });

  test("Trigger Stop Loss FULL", () => {
    const state: TradeExitState = {
      side: "BUY", entryPrice, 
      tp1: 102000, tp2: 104000, tp3: 106000, sl: 97000,
      tp1Hit: false, tp2Hit: false, tp3Hit: false
    };
    const res = ExitEngine.evaluateExit(96500, state);
    expect(res.shouldExit).toBe(true);
    expect(res.type).toBe("FULL");
    expect(res.reason).toBe("STOP_LOSS");
  });

  test("Trigger TP1 PARTIAL 25%", () => {
    const state: TradeExitState = {
      side: "BUY", entryPrice, 
      tp1: 102000, tp2: 104000, tp3: 106000, sl: 97000,
      tp1Hit: false, tp2Hit: false, tp3Hit: false
    };
    const res = ExitEngine.evaluateExit(102500, state);
    expect(res.shouldExit).toBe(true);
    expect(res.type).toBe("PARTIAL");
    expect(res.qtyPct).toBe(0.25);
    expect(res.reason).toBe("TP1_HIT");
  });

  test("Trigger TP2 PARTIAL 50% and SL to Entry", () => {
    const state: TradeExitState = {
      side: "BUY", entryPrice, 
      tp1: 102000, tp2: 104000, tp3: 106000, sl: 97000,
      tp1Hit: true, tp2Hit: false, tp3Hit: false
    };
    const res = ExitEngine.evaluateExit(104500, state);
    expect(res.shouldExit).toBe(true);
    expect(res.type).toBe("PARTIAL");
    expect(res.qtyPct).toBe(0.50);
    expect(res.reason).toBe("TP2_HIT");
    expect(res.newStopLoss).toBe(entryPrice);
  });

  test("Trailing Stop priority Supertrend > EMA20 > ATR", () => {
    // Long case: take max
    const tsLong = ExitEngine.calculateTrailingStop(102000, 101500, 101000, true);
    expect(tsLong).toBe(102000);

    // Short case: take min
    const tsShort = ExitEngine.calculateTrailingStop(98000, 98500, 99000, false);
    expect(tsShort).toBe(98000);
  });
});
