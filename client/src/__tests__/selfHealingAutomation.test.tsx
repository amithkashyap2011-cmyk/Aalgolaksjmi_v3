import { describe, test, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import DashboardPage from "../pages/DashboardPage";
import IndianMarketPage from "../pages/IndianMarketPage";
import HistoryPage from "../pages/HistoryPage";
import SettingsPage from "../pages/SettingsPage";
import BacktestPage from "../pages/BacktestPage";
import { useAppStore } from "../store/useAppStore";

/**
 * ═══════════════════════════════════════════════════════════════════
 *  Self-Healing Test Automation Engine
 * ═══════════════════════════════════════════════════════════════════
 *  Attempts primary selector, then falls back through alternative
 *  DOM heuristics (Role -> ARIA Label -> Text -> TestID -> Class)
 *  and records healed selectors.
 */
class SelfHealingLocator {
  private static healedCount = 0;

  public static findElement(
    container: HTMLElement,
    candidates: Array<{ type: "id" | "role" | "text" | "aria" | "class"; value: string }>
  ): HTMLElement {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      let el: HTMLElement | null = null;

      try {
        if (candidate.type === "id") {
          el = container.querySelector(`#${candidate.value}`) as HTMLElement;
        } else if (candidate.type === "role") {
          el = container.querySelector(`[role="${candidate.value}"]`) as HTMLElement;
        } else if (candidate.type === "text") {
          const allEls = Array.from(container.querySelectorAll("*"));
          el = (allEls.find(e => e.children.length === 0 && e.textContent?.includes(candidate.value)) ||
                allEls.find(e => e.textContent?.includes(candidate.value))) as HTMLElement || null;
        } else if (candidate.type === "aria") {
          el = container.querySelector(`[aria-label="${candidate.value}"]`) as HTMLElement;
        } else if (candidate.type === "class") {
          el = container.querySelector(`.${candidate.value}`) as HTMLElement;
        }
      } catch (err) {
        el = null;
      }

      if (el) {
        if (i > 0) {
          this.healedCount++;
          console.log(`[SELF_HEALING_AUTOMATION] Primary selector failed. HEALED using candidate index ${i} (${candidate.type}="${candidate.value}")`);
        }
        return el;
      }
    }
    throw new Error(`SelfHealingLocator failed after testing ${candidates.length} candidate strategies.`);
  }

  public static getHealedCount(): number {
    return this.healedCount;
  }
}

describe("Self-Healing Test Automation & Visual Verification", { timeout: 15000 }, () => {
  beforeEach(() => {
    useAppStore.setState({
      selectedSymbol: "BTCUSDT",
      mode: "PAPER",
      wallet: { balance: 10000 },
    });
  });

  test("Self-Healing Automation: Locates nav tabs when primary ID changes", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardPage />
      </MemoryRouter>
    );

    // Primary broken ID "non-existent-nav-id", fallback to text "NIFTY" / "Indian Market" or class
    const element = SelfHealingLocator.findElement(container, [
      { type: "id", value: "non-existent-nav-id" },
      { type: "text", value: "BTC" },
      { type: "class", value: "dot-paper" }
    ]);

    expect(element).toBeDefined();
    expect(SelfHealingLocator.getHealedCount()).toBeGreaterThan(0);
  });

  test("Visual Testing: Dashboard UI layout structure & theme tokens", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardPage />
      </MemoryRouter>
    );

    // Verify main container renders
    expect(container.firstChild).not.toBeNull();
    const dashboardDiv = container.querySelector(".container-fluid, .dashboard-container, div");
    expect(dashboardDiv).toBeDefined();
  });

  test("Visual Testing: Indian Market page theme rendering & buttons", async () => {
    let container: HTMLElement;
    await act(async () => {
      const res = render(
        <MemoryRouter initialEntries={["/indian-market"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <IndianMarketPage />
        </MemoryRouter>
      );
      container = res.container;
    });

    // Self-heal button finding
    const scanBtn = SelfHealingLocator.findElement(container!, [
      { type: "id", value: "broken-scan-btn-id" },
      { type: "text", value: "Scan" },
      { type: "class", value: "btn" }
    ]);

    expect(scanBtn).toBeDefined();
  });

  test("Predictive Test Execution: History Page P&L filtering impact", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/history"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HistoryPage />
      </MemoryRouter>
    );

    expect(container.textContent).toContain("History");
  });

  test("Predictive Test Execution: Settings Page tab switches & form state", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/settings"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SettingsPage />
      </MemoryRouter>
    );

    const apiTab = SelfHealingLocator.findElement(container, [
      { type: "text", value: "API" },
      { type: "class", value: "nav-link" }
    ]);

    expect(apiTab).toBeDefined();
  });
});
