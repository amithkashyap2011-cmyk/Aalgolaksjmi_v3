import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TopBar from "../components/layout/TopBar";
import { useAppStore } from "../store/useAppStore";
import { useDashboardStore } from "../store/useDashboardStore";

function renderTopBar(onMenuClick = vi.fn()) {
  return {
    onMenuClick,
    ...render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TopBar onMenuClick={onMenuClick} />
      </MemoryRouter>
    ),
  };
}

describe("TopBar Unit Tests", () => {
  beforeEach(async () => {
    // Reset stores
    useAppStore.setState({
      mode: "PAPER",
      accountType: "BOTH",
      activeMarket: "CRYPTO",
      connected: true,
      execMode: "MANUAL",
      userId: "test-user-id",
    });

    useDashboardStore.setState({
      summary: {
        totalEquity: 406.5,
        dailyPnL: 0,
        openPnL: 0,
        totalAllTimePnL: 0,
        openPositions: 0,
        closedTrades: 0,
        winRate: 75,
        profitFactor: 2.1,
        maxDrawdown: 0,
        currentExposure: 0,
        inrRate: 95.94,
        regime: {
          direction: "SIDEWAYS",
          strength: 50,
          consensus: 60,
          forecast: "NEUTRAL",
          riskState: "NORMAL",
        },
      },
      domains: {
        crypto: {
          totalEquity: 312.69,
          dailyPnL: 12.5,
          openPnL: 0,
          totalAllTimePnL: 0,
          openPositions: 0,
          closedTrades: 4,
          totalTrades: 4,
          winRate: 75,
          realizedWinRate: 75,
          overallWinRate: 75,
          profitFactor: 2.1,
          maxDrawdown: 1.2,
          currentExposure: 0,
          invested: { total: 0, spot: 0, futures: 0 },
          balances: { spot: 156.35, futures: 156.35 },
          netPnL: { total: 12.5, spot: 6.25, futures: 6.25 },
          currency: "USD",
          inrRate: 95.94,
        },
        indianStock: {
          totalEquity: 9000,
          dailyPnL: 0,
          openPnL: 0,
          totalAllTimePnL: 0,
          openPositions: 0,
          closedTrades: 0,
          totalTrades: 0,
          winRate: 0,
          realizedWinRate: 0,
          overallWinRate: 0,
          profitFactor: 0,
          maxDrawdown: 0,
          currentExposure: 0,
          invested: { total: 0, spot: 0, futures: 0 },
          balances: { spot: 9000, futures: 0 },
          netPnL: { total: 0, spot: 0, futures: 0 },
          currency: "INR",
          inrRate: 95.94,
        },
      },
    });
  });

  it("renders header container with brand name", () => {
    renderTopBar();
    const brand = screen.getByText("AALGOLAKSHMI");
    expect(brand).toBeInTheDocument();
  });

  it("renders 3-way Market Switcher buttons: INDIA, CRYPTO, GLOBAL", () => {
    renderTopBar();
    expect(screen.getByText("INDIA")).toBeInTheDocument();
    expect(screen.getByText("CRYPTO")).toBeInTheDocument();
    expect(screen.getByText("GLOBAL")).toBeInTheDocument();
  });

  it("updates activeMarket when market buttons are clicked", () => {
    renderTopBar();
    const indiaBtn = screen.getByTitle(/Switch to Indian Market/i);
    fireEvent.click(indiaBtn);
    expect(useAppStore.getState().activeMarket).toBe("INDIA");

    const cryptoBtn = screen.getByTitle(/Switch to Crypto Market/i);
    fireEvent.click(cryptoBtn);
    expect(useAppStore.getState().activeMarket).toBe("CRYPTO");
  });

  it("renders execution mode buttons: PAPER, LIVE, BACKTEST", () => {
    renderTopBar();
    expect(screen.getByText("Paper")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Backtest")).toBeInTheDocument();
  });

  it("switches to PAPER mode when Paper button is clicked", () => {
    useAppStore.setState({ mode: "BACKTEST" });
    renderTopBar();
    const paperBtn = screen.getByText("Paper");
    fireEvent.click(paperBtn);
    expect(useAppStore.getState().mode).toBe("PAPER");
  });

  it("renders crypto account modes: Both, Spot, Futures when on Crypto market", () => {
    useAppStore.setState({ activeMarket: "CRYPTO" });
    renderTopBar();
    expect(screen.getByText("Both")).toBeInTheDocument();
    expect(screen.getByText("Spot")).toBeInTheDocument();
    expect(screen.getByText("Futures")).toBeInTheDocument();
  });

  it("switches crypto accountType when Spot is clicked", () => {
    useAppStore.setState({ activeMarket: "CRYPTO", accountType: "BOTH" });
    renderTopBar();
    const spotBtn = screen.getByText("Spot");
    fireEvent.click(spotBtn);
    expect(useAppStore.getState().accountType).toBe("SPOT");
  });

  it("renders online status badge when connected", () => {
    useAppStore.setState({ connected: true });
    renderTopBar();
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("renders offline status badge when disconnected", () => {
    useAppStore.setState({ connected: false });
    renderTopBar();
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("renders 24/7 LIVE session badge for Crypto market", () => {
    useAppStore.setState({ activeMarket: "CRYPTO" });
    renderTopBar();
    expect(screen.getByText("24/7 LIVE")).toBeInTheDocument();
  });

  it("renders Crypto balance metrics accurately from domain store", () => {
    useAppStore.setState({ activeMarket: "CRYPTO" });
    renderTopBar();
    expect(screen.getByText("SPOT CASH")).toBeInTheDocument();
    expect(screen.getByText("FUT CASH")).toBeInTheDocument();
    expect(screen.getByText("TOTAL EQUITY")).toBeInTheDocument();
    expect(screen.getByText("WIN RATE")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("renders NET P&L and TODAY P&L with percentage badges in Crypto view", () => {
    useAppStore.setState({ activeMarket: "CRYPTO" });
    renderTopBar();
    expect(screen.getByText("NET P&L")).toBeInTheDocument();
    expect(screen.getByText("TODAY P&L")).toBeInTheDocument();
    // 12.5 / (312.69 - 12.5) * 100 = +4.16%
    const pctBadges = screen.getAllByText("+4.16%");
    expect(pctBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Net P&L and Today's P&L in Indian market view", () => {
    useAppStore.setState({ activeMarket: "INDIA" });
    renderTopBar();
    expect(screen.getByText("Net P&L")).toBeInTheDocument();
    expect(screen.getByText("Today's P&L")).toBeInTheDocument();
  });

  it("triggers onMenuClick when hamburger button is clicked", () => {
    const onMenuClick = vi.fn();
    const { container } = renderTopBar(onMenuClick);
    const hamburger = container.querySelector("header button.lg\\:hidden") || container.querySelector("header button");
    expect(hamburger).toBeTruthy();
    if (hamburger) {
      fireEvent.click(hamburger);
      expect(onMenuClick).toHaveBeenCalledTimes(1);
    }
  });

  describe("Indian market mode is independent of the crypto mode", () => {
    const isActive = (label: string) => (screen.getByText(label).closest("button") as HTMLButtonElement).style.color === "rgb(255, 255, 255)";

    it("shows the Indian PAPER choice even when crypto is LIVE", () => {
      useAppStore.setState({ activeMarket: "INDIA", mode: "LIVE", indianMode: "PAPER" });
      renderTopBar();
      expect(isActive("Paper")).toBe(true);
      expect(isActive("Live")).toBe(false);
      expect(screen.queryByText("Backtest")).not.toBeInTheDocument();
    });

    // No Indian broker is integrated yet (lib/indianBroker INDIAN_LIVE_AVAILABLE
    // = false): choosing LIVE must explain that and stay on PAPER, never
    // pretend to route orders to Angel One / Kite.
    it("choosing LIVE in the Indian view is blocked while no broker is integrated", () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      localStorage.removeItem("aalgo_indian_mode");
      useAppStore.setState({ activeMarket: "INDIA", mode: "PAPER", indianMode: "PAPER" });
      renderTopBar();
      fireEvent.click(screen.getByText("Live"));
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("isn't available yet"));
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(useAppStore.getState().indianMode).toBe("PAPER");
      expect(useAppStore.getState().mode).toBe("PAPER");
      expect(localStorage.getItem("aalgo_indian_mode")).not.toBe("LIVE");
      alertSpy.mockRestore();
      confirmSpy.mockRestore();
    });

    it("the Indian broker badge says simulated, not Angel / Kite", () => {
      useAppStore.setState({ activeMarket: "INDIA", mode: "LIVE", indianMode: "PAPER" });
      renderTopBar();
      expect(screen.getByText("Simulated · No Broker")).toBeInTheDocument();
      expect(screen.queryByText("Angel / Kite")).not.toBeInTheDocument();
    });

    it("fetches Indian funds with the Indian mode, not the crypto mode", () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockClear();
      useAppStore.setState({ activeMarket: "INDIA", mode: "LIVE", indianMode: "PAPER" });
      renderTopBar();
      const fundsCalls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/api/indian-market/funds"));
      expect(fundsCalls.length).toBeGreaterThan(0);
      expect(fundsCalls.every((u) => u.includes("mode=PAPER"))).toBe(true);
    });

    it("crypto view still shows and switches the crypto mode", () => {
      useAppStore.setState({ activeMarket: "CRYPTO", mode: "PAPER", indianMode: "LIVE" });
      renderTopBar();
      expect(isActive("Paper")).toBe(true);
      expect(screen.getByText("Backtest")).toBeInTheDocument();
    });
  });
});
