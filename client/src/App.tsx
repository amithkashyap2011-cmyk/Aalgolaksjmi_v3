import { useEffect, useState, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";
import MarketRibbon from "./components/layout/MarketRibbon";
import BottomNav from "./components/layout/BottomNav";
import ToastContainer from "./components/layout/ToastContainer";
import TradeNotificationPopup from "./components/layout/TradeNotificationPopup";
import AIFooterTradeBar from "./components/ai/AIFooterTradeBar";
import ErrorBoundary from "./components/layout/ErrorBoundary";
import { useAppStore } from "./store/useAppStore";

const HomePage = lazy(() => import("./pages/HomePage"));
const Positions = lazy(() => import("./pages/Positions"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const AIMatrix = lazy(() => import("./pages/AIMatrix"));
const RiskCenterV8 = lazy(() => import("./pages/RiskCenterV8"));
const WalletCenter = lazy(() => import("./pages/WalletCenter"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const BacktestPage = lazy(() => import("./pages/BacktestPage"));
const ForecastCenter = lazy(() => import("./pages/ForecastCenter"));
const ReportsModule = lazy(() => import("./pages/reports/ReportsModule"));
const IndianMarketPage = lazy(() => import("./pages/IndianMarketPage"));
const AgentControlCenter = lazy(() => import("./pages/AgentControlCenter"));
const StrategyLab = lazy(() => import("./pages/StrategyLab"));
const PortfolioCommandCenter = lazy(() => import("./pages/PortfolioCommandCenter"));
const GlobalDashboard = lazy(() => import("./pages/GlobalDashboard"));

export default function App() {
  const boot = useAppStore((s) => s.boot);
  const ready = useAppStore((s) => s.ready);
  const activeMarket = useAppStore((s) => s.activeMarket);
  const setActiveMarket = useAppStore((s) => s.setActiveMarket);
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    boot();
    // Safety fallback: Guarantee the UI renders within 1.2s even if initial network ping is slow
    const safetyTimer = setTimeout(() => {
      if (!useAppStore.getState().ready) {
        useAppStore.setState({ ready: true });
      }
    }, 1200);
    return () => clearTimeout(safetyTimer);
  }, []);

  // Synchronize route with active market domain
  useEffect(() => {
    if (location.pathname.startsWith("/global")) {
      if (activeMarket !== "GLOBAL") setActiveMarket("GLOBAL");
    } else if (location.pathname.startsWith("/india") || location.pathname.startsWith("/indian-market")) {
      if (activeMarket !== "INDIA") setActiveMarket("INDIA");
    } else if (location.pathname.startsWith("/crypto") || location.pathname.startsWith("/futures") || location.pathname.startsWith("/spot")) {
      if (activeMarket !== "CRYPTO") setActiveMarket("CRYPTO");
    }
  }, [location.pathname]);

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#070d1a", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 40, height: 40, border: "2px solid #1e3a5f", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.12em", textTransform: "uppercase" }}>AALGOLAKSHMI V3</span>
        <button
          onClick={() => useAppStore.setState({ ready: true })}
          style={{
            marginTop: 8,
            background: "rgba(59, 130, 246, 0.15)",
            border: "1px solid rgba(59, 130, 246, 0.4)",
            color: "#60a5fa",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: 11,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Open Trading Terminal &rarr;
        </button>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes quickFade{from{opacity:0.85}to{opacity:1}}.page-fade{animation:quickFade 0.08s ease-out}`}</style>

      {/* Mobile sidebar overlay backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40, backdropFilter: "blur(2px)" }}
        />
      )}

      <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "#070d1a" }}>
        {/* Sidebar */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <TopBar onMenuClick={() => setSidebarOpen(true)} />

          {/* Trending coins ticker — symbol · $USDT / ₹INR · BUY/SELL · trend */}
          <MarketRibbon />

          <main
            style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 0 }}
            className="page-fade"
          >
            <ErrorBoundary>
              <Suspense
                fallback={
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
                    <div style={{ width: 32, height: 32, border: "2px solid #1e3a5f", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
                  </div>
                }
              >
                <Routes>
                  {/* Primary Market Routes */}
                  <Route path="/global" element={<GlobalDashboard />} />
                  <Route path="/" element={<HomePage defaultTerminal="SPOT" />} />
                  <Route path="/crypto" element={<HomePage defaultTerminal="SPOT" />} />
                  <Route path="/spot" element={<HomePage defaultTerminal="SPOT" />} />
                  <Route path="/crypto/spot" element={<Navigate to="/spot" replace />} />
                  <Route path="/futures" element={<HomePage defaultTerminal="FUTURES" />} />
                  <Route path="/crypto/futures" element={<Navigate to="/futures" replace />} />
                  <Route path="/india" element={<IndianMarketPage />} />
                  <Route path="/indian-market" element={<IndianMarketPage />} />
                  <Route path="/portfolio" element={<PortfolioCommandCenter />} />
                  <Route path="/portfolio-command" element={<PortfolioCommandCenter />} />

                  {/* Core Platform Modules */}
                  <Route path="/agent-control" element={<AgentControlCenter />} />
                  <Route path="/strategy-lab" element={<StrategyLab />} />
                  <Route path="/aqea/wallet" element={<WalletCenter />} />
                  <Route path="/aqea/positions" element={<Positions />} />
                  <Route path="/aqea/orders" element={<OrdersPage />} />
                  <Route path="/aqea/ai" element={<AIMatrix />} />
                  <Route path="/aqea/risk-center" element={<RiskCenterV8 />} />
                  <Route path="/backtest" element={<BacktestPage />} />
                  <Route path="/prediction" element={<ForecastCenter />} />
                  <Route path="/reports" element={<ReportsModule />} />
                  <Route path="/reports/:section" element={<ReportsModule />} />
                  <Route path="/settings" element={<SettingsPage />} />

                  {/* Convenient Route Aliases & Catch-All */}
                  <Route path="/wallet" element={<Navigate to="/aqea/wallet" replace />} />
                  <Route path="/positions" element={<Navigate to="/aqea/positions" replace />} />
                  <Route path="/orders" element={<Navigate to="/aqea/orders" replace />} />
                  <Route path="/ai" element={<Navigate to="/aqea/ai" replace />} />
                  <Route path="/risk" element={<Navigate to="/aqea/risk-center" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>

          {/* Live Upcoming AI Trade Prediction Bar */}
          <AIFooterTradeBar />

          {/* Mobile bottom nav */}
          <BottomNav />
        </div>
      </div>

      <ToastContainer />
      <TradeNotificationPopup />
    </>
  );
}
