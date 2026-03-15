/*
 * ─── Phase 2 Unit Tests: Zustand Store ─────────────────
 *
 * Tests the mock-data-only store: boot, mode, exec mode,
 * symbol, timeframe, alerts, orders, wallet.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { useAppStore } from "../store/useAppStore";

/* Reset store between tests */
beforeEach(() => {
  const { getState, setState } = useAppStore;
  // Re-seed defaults
  setState({
    ready: false,
    mode: "PAPER",
    execMode: "AUTO",
    selectedSymbol: "DOGEUSDT",
    timeframe: "5m",
    wallet: { balance: 5000 },
    positions: [],
    alerts: [],
  });
});

describe("Store – Boot & Auth", () => {
  test("P2-18: boot() sets ready=true and mock user ID", async () => {
    const { boot } = useAppStore.getState();
    await boot();
    const s = useAppStore.getState();
    expect(s.ready).toBe(true);
    expect(s.userId).toBe("mock-user-001");
    expect(s.userEmail).toBe("demo@aalgo.local");
  });
});

describe("Store – Mode Management", () => {
  test("P2-19: setMode switches between PAPER/LIVE/BACKTEST", () => {
    const { setMode } = useAppStore.getState();
    setMode("LIVE");
    expect(useAppStore.getState().mode).toBe("LIVE");
    setMode("BACKTEST");
    expect(useAppStore.getState().mode).toBe("BACKTEST");
    setMode("PAPER");
    expect(useAppStore.getState().mode).toBe("PAPER");
  });

  test("P2-20: setExecMode switches between AUTO/MANUAL", () => {
    const { setExecMode } = useAppStore.getState();
    expect(useAppStore.getState().execMode).toBe("AUTO");
    setExecMode("MANUAL");
    expect(useAppStore.getState().execMode).toBe("MANUAL");
    setExecMode("AUTO");
    expect(useAppStore.getState().execMode).toBe("AUTO");
  });
});

describe("Store – Symbol & Timeframe", () => {
  test("P2-21: setSymbol updates selectedSymbol", () => {
    const { setSymbol } = useAppStore.getState();
    setSymbol("ETHUSDT");
    expect(useAppStore.getState().selectedSymbol).toBe("ETHUSDT");
    setSymbol("BNBUSDT");
    expect(useAppStore.getState().selectedSymbol).toBe("BNBUSDT");
  });

  test("P2-22: setTimeframe updates timeframe", () => {
    const { setTimeframe } = useAppStore.getState();
    setTimeframe("1h");
    expect(useAppStore.getState().timeframe).toBe("1h");
    setTimeframe("1d");
    expect(useAppStore.getState().timeframe).toBe("1d");
  });

  test("P2-23: allowedSymbols includes all 5 required symbols", () => {
    const syms = useAppStore.getState().allowedSymbols;
    expect(syms).toContain("DOGEUSDT");
    expect(syms).toContain("SHIBUSDT");
    expect(syms).toContain("ETHUSDT");
    expect(syms).toContain("ADAUSDT");
    expect(syms).toContain("BNBUSDT");
  });
});

describe("Store – Behavior Weights", () => {
  test("P2-24: setBehaviorWeight updates individual weight", () => {
    const { setBehaviorWeight } = useAppStore.getState();
    setBehaviorWeight("Eagle", 80);
    expect(useAppStore.getState().behaviorWeights.Eagle).toBe(80);
    setBehaviorWeight("Tiger", 20);
    expect(useAppStore.getState().behaviorWeights.Tiger).toBe(20);
  });
});

describe("Store – Alerts", () => {
  test("P2-25: addAlert prepends a new alert to the list", () => {
    const { addAlert } = useAppStore.getState();
    addAlert("RED", "Test alert");
    const alerts = useAppStore.getState().alerts;
    expect(alerts[0].level).toBe("RED");
    expect(alerts[0].text).toBe("Test alert");
    expect(typeof alerts[0].time).toBe("string");
    expect(alerts[0].time.length).toBeGreaterThan(0);
  });
});

describe("Store – Orders & Wallet", () => {
  test("P2-26: submitOrder adds a position and decreases balance", async () => {
    const { submitOrder } = useAppStore.getState();
    const balanceBefore = useAppStore.getState().wallet.balance;
    await submitOrder("DOGEUSDT", "BUY", 100);
    const s = useAppStore.getState();
    expect(s.positions.length).toBeGreaterThanOrEqual(1);
    expect(s.positions[0].symbol).toBe("DOGEUSDT");
    expect(s.positions[0].side).toBe("BUY");
    expect(s.wallet.balance).toBeLessThan(balanceBefore);
  });

  test("P2-27: submitOrder triggers an alert", async () => {
    const { submitOrder } = useAppStore.getState();
    await submitOrder("ETHUSDT", "SELL", 1);
    const alerts = useAppStore.getState().alerts;
    expect(alerts[0].level).toBe("GREEN");
    expect(alerts[0].text).toContain("SELL");
    expect(alerts[0].text).toContain("ETHUSDT");
  });
});

describe("Store – Sidebar", () => {
  test("P2-28: toggleSidebar flips sidebarOpen", () => {
    const initial = useAppStore.getState().sidebarOpen;
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarOpen).toBe(!initial);
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarOpen).toBe(initial);
  });
});

describe("Store – Multi-Symbol Selection", () => {
  test("P2-MS1: toggleSymbol adds a symbol to selectedSymbols", () => {
    useAppStore.getState().toggleSymbol("ETHUSDT");
    const syms = useAppStore.getState().selectedSymbols;
    expect(syms).toContain("ETHUSDT");
    expect(syms).toContain("DOGEUSDT");
  });

  test("P2-MS2: toggleSymbol removes a symbol if already selected (unless last)", () => {
    // Start with DOGE + ETH
    useAppStore.setState({ selectedSymbols: ["DOGEUSDT", "ETHUSDT"], selectedSymbol: "DOGEUSDT" });
    useAppStore.getState().toggleSymbol("ETHUSDT");
    expect(useAppStore.getState().selectedSymbols).toEqual(["DOGEUSDT"]);
  });

  test("P2-MS3: cannot remove the last selected symbol", () => {
    useAppStore.setState({ selectedSymbols: ["DOGEUSDT"], selectedSymbol: "DOGEUSDT" });
    useAppStore.getState().toggleSymbol("DOGEUSDT");
    // Should still have DOGEUSDT since it's the only one
    expect(useAppStore.getState().selectedSymbols).toEqual(["DOGEUSDT"]);
  });

  test("P2-MS4: setSymbols replaces entire selection", () => {
    useAppStore.getState().setSymbols(["SHIBUSDT", "ADAUSDT", "BNBUSDT"]);
    const syms = useAppStore.getState().selectedSymbols;
    expect(syms).toHaveLength(3);
    expect(syms).toContain("SHIBUSDT");
    expect(useAppStore.getState().selectedSymbol).toBe("SHIBUSDT");
  });

  test("P2-MS5: selectedSymbol stays in sync as first of selectedSymbols", () => {
    useAppStore.setState({ selectedSymbols: ["DOGEUSDT"], selectedSymbol: "DOGEUSDT" });
    useAppStore.getState().toggleSymbol("ETHUSDT");
    expect(useAppStore.getState().selectedSymbol).toBe("DOGEUSDT");
  });
});
