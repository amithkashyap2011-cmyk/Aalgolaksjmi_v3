/*
 * ─── DashboardPage ─────────────────────────────────────
 *
 * Phase 2: Main trading screen with golden-ratio layout.
 * Desktop: ~62% center (chart + positions + orders)
 *          ~38% right  (Hive Mind AI panels)
 * Tablet:  two-column golden split
 * Mobile:  single column stacked, touch-optimized
 *
 * Components: SymbolSelector, TimeframeTabs, PriceChart,
 * ActivePositionsCard, OrderPanel, ModeToggle,
 * HiveMindPanel, ProbabilityScores, OhmSyncPanel,
 * BehaviorModifiers, AlertsFeed.
 */
import SymbolSelector from "../ui/SymbolSelector";
import TimeframeTabs from "../ui/TimeframeTabs";
import PriceChart from "../components/chart/PriceChart";
import ActivePositionsCard from "../components/dashboard/ActivePositionsCard";
import OrderPanel from "../components/dashboard/OrderPanel";
import HiveMindPanel from "../components/ai/HiveMindPanel";
import ProbabilityScores from "../components/ai/ProbabilityScores";
import OhmSyncPanel from "../components/ai/OhmSyncPanel";
import BehaviorModifiers from "../components/ai/BehaviorModifiers";
import AlertsFeed from "../components/ai/AlertsFeed";
import AILearningProgressPanel from "../components/ai/AILearningProgressPanel";
import StrategyPanel from "../components/ai/StrategyPanel";
import GayatriFrequencyPanel from "../components/ai/GayatriFrequencyPanel";
import PageShell from "../components/layout/PageShell";
import { useAppStore } from "../store/useAppStore";

export default function DashboardPage() {
  const { selectedSymbol, mode } = useAppStore();

  return (
    <PageShell>
      {/* ── Top strip: Symbol + Timeframe selectors ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-phi-3 animate-in">
        <div className="flex flex-wrap items-center gap-phi-3">
          <SymbolSelector />
          <TimeframeTabs />
        </div>
        <div className="flex items-center gap-phi-2 text-phi-xs text-slate-500">
          <span className={mode === "LIVE" ? "dot-live" : mode === "BACKTEST" ? "dot-backtest" : "dot-paper"} />
          <span>{mode}</span>
          <span className="text-slate-300">·</span>
          <span className="font-semibold text-slate-800">{selectedSymbol}</span>
        </div>
      </div>

      {/* ── Golden-ratio 61.8% / 38.2% split ── */}
      <div className="golden-split">
        {/* Center panel — 61.8% */}
        <section className="golden-major space-y-phi-4 animate-in" aria-label="Chart and orders">
          {/* Price chart with Fibonacci bands */}
          <div className="card-phi">
            <PriceChart />
          </div>

          {/* Positions + Orders row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-phi-4">
            <ActivePositionsCard />
            <OrderPanel />
          </div>
        </section>

        {/* Right panel — 38.2% (Hive Mind & AI Telemetry) */}
        <aside
          className="golden-minor space-y-phi-4 animate-in"
          style={{ animationDelay: "0.1s" }}
          aria-label="AI and behaviour panels"
        >
          <AILearningProgressPanel />
          <StrategyPanel />
          <GayatriFrequencyPanel />
          <HiveMindPanel />
          <ProbabilityScores />
          <OhmSyncPanel />
          <BehaviorModifiers />
          <AlertsFeed />
        </aside>
      </div>
    </PageShell>
  );
}
