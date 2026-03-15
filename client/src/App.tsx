/*
 * ─── App.tsx ───────────────────────────────────────────
 *
 * Phase 2: Root layout with golden-ratio AppLayout.
 *
 *   App
 *   ├── Sidebar          (left nav: Home, AI/Strategies, Orders, Settings)
 *   ├── TopBar            (logo, mode selector, wallet summary)
 *   ├── BottomNav         (mobile-only tab bar)
 *   └── Routes
 *       ├── /          → DashboardPage
 *       ├── /backtest  → BacktestPage
 *       ├── /history   → HistoryPage
 *       ├── /wallet    → WalletPage
 *       └── /settings  → SettingsPage
 */
import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";
import BottomNav from "./components/layout/BottomNav";
import DashboardPage from "./pages/DashboardPage";
import BacktestPage from "./pages/BacktestPage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";
import WalletPage from "./pages/WalletPage";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const boot = useAppStore((s) => s.boot);
  const ready = useAppStore((s) => s.ready);

  useEffect(() => { boot(); }, [boot]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-aurora">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-aalgold border-t-transparent rounded-full mx-auto mb-phi-3" />
          <p className="text-phi-sm text-slate-500">Loading AALGOLAKSHMI…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-aurora">
      {/* Left sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-phi-3 md:p-phi-5 pb-20 lg:pb-phi-5 overflow-y-auto" role="main">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/backtest" element={<BacktestPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/wallet" element={<WalletPage />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
