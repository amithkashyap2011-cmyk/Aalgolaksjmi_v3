/*
 * ─── Phase 2 Unit Tests: Mock Data ─────────────────────
 *
 * Tests the mock data module used by all Phase 2 components.
 */
import { describe, test, expect } from "vitest";
import {
  SYMBOLS,
  TIMEFRAMES,
  FIB_SIZES,
  MOCK_CANDLES,
  MOCK_POSITIONS,
  MOCK_TRADES,
  MOCK_ALERTS,
  MOCK_WALLET,
  MOCK_HIVEMIND,
  MOCK_PROB_SCORES,
  ANIMAL_MODIFIERS,
  DEFAULT_WEIGHTS,
  BACKTEST_STRATEGIES,
  MOCK_BACKTEST_STATS,
  CORE_STRATEGIES,
  SYMBOL_LABELS,
  computeFibLevels,
  generateOhmWave,
  generateMockGayatriSignals,
  generateMockStrategyEvals,
} from "../mock/data";

describe("Mock Data – Symbols & Timeframes", () => {
  test("P2-01: SYMBOLS contains the 8 supported trading pairs", () => {
    expect(SYMBOLS).toEqual(["BTCUSDT", "ETHUSDT", "ADAUSDT", "BNBUSDT", "SOLUSDT", "DOGEUSDT", "SHIBUSDT", "XRPUSDT"]);
    expect(SYMBOLS).toHaveLength(8);
  });

  test("P2-02: TIMEFRAMES contains 1m, 5m, 15m, 1h, 4h, 1d", () => {
    expect(TIMEFRAMES).toEqual(["1m", "5m", "15m", "1h", "4h", "1d"]);
    expect(TIMEFRAMES).toHaveLength(6);
  });

  test("P2-03: FIB_SIZES are Fibonacci-derived: 3, 5, 8, 13, 21", () => {
    expect([...FIB_SIZES]).toEqual([3, 5, 8, 13, 21]);
  });
});

describe("Mock Data – Candles & Fibonacci", () => {
  test("P2-04: MOCK_CANDLES has 120 bars per symbol", () => {
    for (const sym of SYMBOLS) {
      expect(MOCK_CANDLES[sym]).toHaveLength(120);
    }
  });

  test("P2-05: each candle has OHLCV fields", () => {
    const c = MOCK_CANDLES.DOGEUSDT[0];
    expect(c).toHaveProperty("time");
    expect(c).toHaveProperty("open");
    expect(c).toHaveProperty("high");
    expect(c).toHaveProperty("low");
    expect(c).toHaveProperty("close");
    expect(c).toHaveProperty("volume");
  });

  test("P2-06: computeFibLevels returns correct Fibonacci retracements", () => {
    const candles = MOCK_CANDLES.DOGEUSDT;
    const fib = computeFibLevels(candles);
    expect(fib.fib236).toBeGreaterThan(fib.low);
    expect(fib.fib382).toBeGreaterThan(fib.fib236);
    expect(fib.fib500).toBeGreaterThan(fib.fib382);
    expect(fib.fib618).toBeGreaterThan(fib.fib500);
    expect(fib.fib786).toBeGreaterThan(fib.fib618);
    expect(fib.high).toBeGreaterThan(fib.fib786);
  });

  test("P2-07: generateOhmWave produces 80 [time, value] points", () => {
    const wave = generateOhmWave();
    expect(wave).toHaveLength(80);
    expect(wave[0]).toHaveLength(2);
    expect(typeof wave[0][0]).toBe("number");
    expect(typeof wave[0][1]).toBe("number");
  });
});

describe("Mock Data – Trading Data", () => {
  test("P2-08: MOCK_WALLET starts at a zero baseline (deposit-driven, not pre-funded)", () => {
    expect(MOCK_WALLET.balance).toBe(0);
  });

  test("P2-09: MOCK_POSITIONS has at least 1 position with required fields", () => {
    expect(MOCK_POSITIONS.length).toBeGreaterThanOrEqual(1);
    const p = MOCK_POSITIONS[0];
    expect(p).toHaveProperty("id");
    expect(p).toHaveProperty("symbol");
    expect(p).toHaveProperty("side");
    expect(p).toHaveProperty("qty");
    expect(p).toHaveProperty("entry");
    expect(p).toHaveProperty("pnl");
  });

  test("P2-10: MOCK_TRADES has 30 history entries", () => {
    expect(MOCK_TRADES).toHaveLength(30);
    const t = MOCK_TRADES[0];
    expect(t).toHaveProperty("id");
    expect(t).toHaveProperty("symbol");
    expect(t).toHaveProperty("side");
    expect(t).toHaveProperty("entry");
    expect(t).toHaveProperty("exit");
    expect(t).toHaveProperty("pnl");
    expect(t).toHaveProperty("time");
  });

  test("P2-11: MOCK_ALERTS has 11 alerts with GREEN/AMBER/RED levels", () => {
    expect(MOCK_ALERTS).toHaveLength(11);
    const levels = new Set(MOCK_ALERTS.map((a) => a.level));
    expect(levels.has("GREEN")).toBe(true);
    expect(levels.has("AMBER")).toBe(true);
    expect(levels.has("RED")).toBe(true);
  });
});

describe("Mock Data – AI & Behaviour", () => {
  test("P2-12: MOCK_HIVEMIND has 6 model tiles with required fields", () => {
    expect(MOCK_HIVEMIND).toHaveLength(6);
    const model = MOCK_HIVEMIND[0];
    expect(model).toHaveProperty("name");
    expect(model).toHaveProperty("pct");
    expect(model).toHaveProperty("barColor");
    expect(model.name).toBe("Lakshmi Master");
  });

  test("P2-13: MOCK_PROB_SCORES has High, Neutral, Low probability bars", () => {
    expect(MOCK_PROB_SCORES).toHaveLength(3);
    expect(MOCK_PROB_SCORES.map((s) => s.label)).toEqual([
      "High Probability", "Neutral", "Low Probability",
    ]);
    // sum should be ≤ 100
    const sum = MOCK_PROB_SCORES.reduce((acc, s) => acc + s.pct, 0);
    expect(sum).toBeLessThanOrEqual(100);
  });

  test("P2-14: ANIMAL_MODIFIERS has 10 animals with emoji + tooltip", () => {
    expect(ANIMAL_MODIFIERS).toHaveLength(10);
    const names = ANIMAL_MODIFIERS.map((a) => a.key);
    expect(names).toContain("Eagle");
    expect(names).toContain("Tiger");
    expect(names).toContain("Lion");
    for (const a of ANIMAL_MODIFIERS) {
      expect(a.emoji.length).toBeGreaterThan(0);
      expect(a.tooltip.length).toBeGreaterThan(10);
    }
  });

  test("P2-15: DEFAULT_WEIGHTS initialises all 10 animals at 50", () => {
    const keys = Object.keys(DEFAULT_WEIGHTS);
    expect(keys).toHaveLength(10);
    for (const v of Object.values(DEFAULT_WEIGHTS)) {
      expect(v).toBe(50);
    }
  });

  test("P2-16: BACKTEST_STRATEGIES has 12 strategies including new core ones", () => {
    expect(BACKTEST_STRATEGIES).toHaveLength(12);
    expect(BACKTEST_STRATEGIES).toContain("Lakshmi Master");
    expect(BACKTEST_STRATEGIES).toContain("Aaryan");
    expect(BACKTEST_STRATEGIES).toContain("Aayush");
    expect(BACKTEST_STRATEGIES).toContain("Gayatri 24-Signal");
  });

  test("P2-17: MOCK_BACKTEST_STATS has all stat fields", () => {
    expect(MOCK_BACKTEST_STATS).toHaveProperty("totalTrades");
    expect(MOCK_BACKTEST_STATS).toHaveProperty("winRate");
    expect(MOCK_BACKTEST_STATS).toHaveProperty("avgPnl");
    expect(MOCK_BACKTEST_STATS).toHaveProperty("maxDrawdown");
    expect(MOCK_BACKTEST_STATS).toHaveProperty("sharpeRatio");
    expect(MOCK_BACKTEST_STATS).toHaveProperty("profitFactor");
  });
});

describe("Mock Data – Core Strategies", () => {
  test("P2-S1: CORE_STRATEGIES has 6 strategies (Lakshmi, Aaryan, Aayush, Gayatri, Ohmkara, Saraswati)", () => {
    expect(CORE_STRATEGIES).toHaveLength(6);
    expect(CORE_STRATEGIES.map((s) => s.id)).toEqual(["LAKSHMI", "AARYAN", "AAYUSH", "GAYATRI", "OHMKARA", "SARASWATI"]);
  });

  test("P2-S2: Each strategy has emoji, tagline, description, color", () => {
    for (const s of CORE_STRATEGIES) {
      expect(s.emoji.length).toBeGreaterThan(0);
      expect(s.tagline.length).toBeGreaterThan(5);
      expect(s.description.length).toBeGreaterThan(20);
      expect(s.color).toMatch(/^text-/);
      expect(s.bgColor).toMatch(/^bg-/);
    }
  });

  test("P2-S3: SYMBOL_LABELS maps all 8 symbols to short names", () => {
    expect(Object.keys(SYMBOL_LABELS)).toHaveLength(8);
    expect(SYMBOL_LABELS.DOGEUSDT).toBe("DOGE");
    expect(SYMBOL_LABELS.SHIBUSDT).toBe("SHIB");
    expect(SYMBOL_LABELS.ETHUSDT).toBe("ETH");
  });

  test("P2-S4: MOCK_POSITIONS have strategy and sl/tp fields", () => {
    for (const p of MOCK_POSITIONS) {
      expect(p.strategy).toBeDefined();
      expect(["LAKSHMI", "AARYAN", "AAYUSH", "GAYATRI", "OHMKARA", "SARASWATI"]).toContain(p.strategy);
      expect(typeof p.sl).toBe("number");
      expect(typeof p.tp).toBe("number");
    }
  });

  test("P2-S5: MOCK_TRADES have strategy field", () => {
    for (const t of MOCK_TRADES) {
      expect(t.strategy).toBeDefined();
      expect(["LAKSHMI", "AARYAN", "AAYUSH", "GAYATRI"]).toContain(t.strategy);
    }
  });
});

describe("Mock Data – Gayatri 24-Signal", () => {
  test("P2-G1: generateMockGayatriSignals returns exactly 24 signals", () => {
    const signals = generateMockGayatriSignals("DOGEUSDT");
    expect(signals).toHaveLength(24);
  });

  test("P2-G2: Each signal has id, syllable, octave, label, active, detail", () => {
    const signals = generateMockGayatriSignals("ETHUSDT");
    for (const s of signals) {
      expect(s).toHaveProperty("id");
      expect(s).toHaveProperty("syllable");
      expect(["TAT", "SAT", "OM"]).toContain(s.octave);
      expect(typeof s.label).toBe("string");
      expect(typeof s.active).toBe("boolean");
    }
  });

  test("P2-G3: Signals are split 8/8/8 across TAT, SAT, OM octaves", () => {
    const signals = generateMockGayatriSignals("ADAUSDT");
    expect(signals.filter((s) => s.octave === "TAT")).toHaveLength(8);
    expect(signals.filter((s) => s.octave === "SAT")).toHaveLength(8);
    expect(signals.filter((s) => s.octave === "OM")).toHaveLength(8);
  });

  test("P2-G4: generateMockStrategyEvals returns 6 evaluations per symbol", () => {
    const evals = generateMockStrategyEvals("DOGEUSDT");
    expect(evals).toHaveLength(6);
    expect(evals.map((e) => e.id)).toEqual(["LAKSHMI", "AARYAN", "AAYUSH", "GAYATRI", "OHMKARA", "SARASWATI"]);
  });

  test("P2-G5: Each eval has signal, confidence, slPct, tpPct, reasons", () => {
    const evals = generateMockStrategyEvals("BNBUSDT");
    for (const ev of evals) {
      expect(["STRONG_BUY", "BUY", "HOLD", "SELL", "STRONG_SELL"]).toContain(ev.signal);
      expect(ev.confidence).toBeGreaterThanOrEqual(0);
      expect(ev.confidence).toBeLessThanOrEqual(1);
      expect(ev.slPct).toBeGreaterThan(0);
      expect(ev.tpPct).toBeGreaterThan(0);
      expect(ev.reasons.length).toBeGreaterThanOrEqual(1);
    }
  });
});
