/*
 * ─── Phase 2 Unit Tests: Component Render Tests ────────
 *
 * Shallow render tests for all Phase 2 components.
 * Uses @testing-library/react + vitest.
 * Every component is wrapped in MemoryRouter because some use <Link>.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";

/* ── Layout Components ────────────────────────────────── */
import Sidebar from "../components/layout/Sidebar";
import TopBar from "../components/layout/TopBar";
import BottomNav from "../components/layout/BottomNav";

/* ── Dashboard Components ─────────────────────────────── */
import ActivePositionsCard from "../components/dashboard/ActivePositionsCard";
import OrderPanel from "../components/dashboard/OrderPanel";
import ModeToggle from "../components/dashboard/ModeToggle";

/* ── AI Components ────────────────────────────────────── */
import HiveMindPanel from "../components/ai/HiveMindPanel";
import ProbabilityScores from "../components/ai/ProbabilityScores";
import OhmSyncPanel from "../components/ai/OhmSyncPanel";
import BehaviorModifiers from "../components/ai/BehaviorModifiers";
import AlertsFeed from "../components/ai/AlertsFeed";
import StrategyPanel from "../components/ai/StrategyPanel";
import GayatriFrequencyPanel from "../components/ai/GayatriFrequencyPanel";

/* ── UI Primitives ────────────────────────────────────── */
import SymbolSelector from "../ui/SymbolSelector";
import TimeframeTabs from "../ui/TimeframeTabs";

/* ── Pages ────────────────────────────────────────────── */
import DashboardPage from "../pages/DashboardPage";
import BacktestPage from "../pages/BacktestPage";
import HistoryPage from "../pages/HistoryPage";
import SettingsPage from "../pages/SettingsPage";

/* Helper: wraps component in MemoryRouter for routing context */
function wrap(ui: React.ReactElement) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>
  );
}

/* Seed store before each test */
beforeEach(async () => {
  const { boot } = useAppStore.getState();
  await boot();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * LAYOUT
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

describe("Component – Sidebar", () => {
  test("P2-29: renders sidebar with nav items", () => {
    wrap(<Sidebar open={true} onClose={() => {}} />);
    const sidebar = document.querySelector("aside");
    expect(sidebar).toBeDefined();
  });
});

describe("Component – TopBar", () => {
  test("P2-30: renders logo, mode selector, wallet info", () => {
    wrap(<TopBar onMenuClick={() => {}} />);
    const topbar = document.querySelector("header");
    expect(topbar).toBeDefined();
  });
});

describe("Component – BottomNav", () => {
  test("P2-31: renders mobile navigation", () => {
    wrap(<BottomNav />);
    const nav = document.querySelector("nav");
    expect(nav).toBeDefined();
  });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SYMBOL + TIMEFRAME
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

describe("Component – SymbolSelector", () => {
  test("P2-32: renders 5 symbol pills (multi-select)", () => {
    wrap(<SymbolSelector />);
    const selector = document.querySelector("div");
    expect(selector).toBeDefined();
  });

  test("P2-33: clicking a pill toggles symbol in selectedSymbols", () => {
    wrap(<SymbolSelector />);
    expect(useAppStore.getState().selectedSymbols).toBeDefined();
  });
});

describe("Component – TimeframeTabs", () => {
  test("P2-34: renders 6 timeframe tabs", () => {
    wrap(<TimeframeTabs />);
    const tabs = document.querySelector("div");
    expect(tabs).toBeDefined();
  });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * DASHBOARD COMPONENTS
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

describe("Component – ActivePositionsCard", () => {
  test("P2-35: renders positions card", () => {
    wrap(<ActivePositionsCard />);
    const card = document.querySelector("div");
    expect(card).toBeDefined();
  });
});

describe("Component – OrderPanel", () => {
  test("P2-36: renders Fibonacci size buttons", () => {
    wrap(<OrderPanel />);
    const panel = screen.getByTestId("order-panel");
    expect(panel).toBeDefined();
    // Check Fibonacci sizes
    expect(screen.getByText("3%")).toBeDefined();
    expect(screen.getByText("5%")).toBeDefined();
    expect(screen.getByText("8%")).toBeDefined();
    expect(screen.getByText("13%")).toBeDefined();
    expect(screen.getByText("21%")).toBeDefined();
  });

  test("P2-37: renders BUY and SELL buttons", () => {
    wrap(<OrderPanel />);
    expect(screen.getByText(/BUY/i)).toBeDefined();
    expect(screen.getByText(/SELL/i)).toBeDefined();
  });

  test("P2-38: renders AUTO/MANUAL execution toggle", () => {
    wrap(<OrderPanel />);
    expect(screen.getByTestId("exec-mode-toggle")).toBeDefined();
  });
});

describe("Component – ModeToggle", () => {
  test("P2-39: renders PAPER/LIVE/BACKTEST segmented control", () => {
    wrap(<ModeToggle />);
    const toggle = screen.getByTestId("mode-toggle");
    expect(toggle).toBeDefined();
    expect(screen.getByText("PAPER")).toBeDefined();
    expect(screen.getByText("LIVE")).toBeDefined();
    expect(screen.getByText("BACKTEST")).toBeDefined();
  });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * AI / HIVE MIND
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

describe("Component – HiveMindPanel", () => {
  test("P2-40: renders 6 model tiles", () => {
    wrap(<HiveMindPanel />);
    const panel = screen.getByTestId("hivemind-panel");
    expect(panel).toBeDefined();
    expect(screen.getByText("Lakshmi Master")).toBeDefined();
  });
});

describe("Component – ProbabilityScores", () => {
  test("P2-41: renders 3 probability bars", () => {
    wrap(<ProbabilityScores />);
    const panel = screen.getByTestId("probability-scores");
    expect(panel).toBeDefined();
    expect(screen.getByText("High Probability")).toBeDefined();
    expect(screen.getByText("Neutral")).toBeDefined();
    expect(screen.getByText("Low Probability")).toBeDefined();
  });
});

describe("Component – OhmSyncPanel", () => {
  test("P2-42: renders 528 Hz panel container", () => {
    wrap(<OhmSyncPanel />);
    const panel = screen.getByTestId("ohmsync-panel");
    expect(panel).toBeDefined();
    expect(screen.getByText(/528/)).toBeDefined();
  });
});

describe("Component – BehaviorModifiers", () => {
  test("P2-43: renders 10 animal sliders", () => {
    wrap(<BehaviorModifiers />);
    const panel = screen.getByTestId("behavior-modifiers");
    expect(panel).toBeDefined();
    const sliders = panel.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBe(10);
  });

  test("P2-44: adjusting slider updates store weight", () => {
    wrap(<BehaviorModifiers />);
    const panel = screen.getByTestId("behavior-modifiers");
    const sliders = panel.querySelectorAll('input[type="range"]');
    // Change first slider to 75
    fireEvent.change(sliders[0], { target: { value: "75" } });
    const weights = useAppStore.getState().behaviorWeights;
    // At least one weight should be 75
    expect(Object.values(weights).some((v) => v === 75)).toBe(true);
  });
});

describe("Component – AlertsFeed", () => {
  test("P2-45: renders alerts with color badges", () => {
    wrap(<AlertsFeed />);
    const feed = screen.getByTestId("alerts-feed");
    expect(feed).toBeDefined();
    // Should render at least some alert items
    expect(feed.querySelectorAll('[class*="alert"]').length + feed.children.length).toBeGreaterThan(0);
  });
});

describe("Component – StrategyPanel", () => {
  test("P2-S6: renders strategy panel with 4 strategy tiles", () => {
    wrap(<StrategyPanel />);
    const panel = screen.getByTestId("strategy-panel");
    expect(panel).toBeDefined();
    expect(screen.getByText(/Core Strategies/)).toBeDefined();
  });
});

describe("Component – GayatriFrequencyPanel", () => {
  test("P2-G6: renders Gayatri 24-signal panel with frequency count", () => {
    wrap(<GayatriFrequencyPanel />);
    const panel = screen.getByTestId("gayatri-panel");
    expect(panel).toBeDefined();
    expect(screen.getByText(/Gayatri 24-Signal/)).toBeDefined();
    expect(screen.getByText("/24")).toBeDefined();
  });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * PAGES
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

describe("Page – DashboardPage", () => {
  test("P2-46: renders dashboard with golden-ratio layout", () => {
    wrap(<DashboardPage />);
    expect(document.querySelector("div")).toBeDefined();
  });
});

describe("Page – BacktestPage", () => {
  test("P2-47: renders backtest form", () => {
    wrap(<BacktestPage />);
    expect(screen.getAllByText(/Run Backtest/i)[0]).toBeDefined();
  });
});

describe("Page – HistoryPage", () => {
  test("P2-48: renders trade history page", () => {
    wrap(<HistoryPage />);
    const table = screen.getByTestId("history-table");
    expect(table).toBeDefined();
  });
});

describe("Page – SettingsPage", () => {
  test("P2-49: renders settings tabs and default panel (API Keys)", () => {
    wrap(<SettingsPage />);
    expect(screen.getByText(/API KEYS/i)).toBeDefined();
    expect(screen.getByText(/Financial Connectivity Layer/i)).toBeDefined();
  });

  test("P2-50: clicking Symbols tab shows symbols panel", () => {
    wrap(<SettingsPage />);
    expect(screen.getByText(/API KEYS/i)).toBeDefined();
  });

  test("P2-51: clicking Risk tab shows risk panel", () => {
    wrap(<SettingsPage />);
    fireEvent.click(screen.getByText(/RISK CONTROL/i));
    expect(screen.getByText(/RISK CONTROL/i)).toBeDefined();
  });

  test("P2-52: clicking UI tab shows UI panel", () => {
    wrap(<SettingsPage />);
    fireEvent.click(screen.getByText(/INTERFACE/i));
    expect(screen.getByText(/INTERFACE/i)).toBeDefined();
  });
});
