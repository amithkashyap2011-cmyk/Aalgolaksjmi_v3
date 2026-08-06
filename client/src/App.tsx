import { useEffect, Suspense, lazy, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";
import MarketRibbon from "./components/layout/MarketRibbon";
import BottomNav from "./components/layout/BottomNav";
import ToastContainer from "./components/layout/ToastContainer";
import AIFooterTradeBar from "./components/ai/AIFooterTradeBar";
import { useAppStore } from "./store/useAppStore";

const HomePage       = lazy(() => import("./pages/HomePage"));
const Positions      = lazy(() => import("./pages/Positions"));
const OrdersPage     = lazy(() => import("./pages/OrdersPage"));
const AIMatrix       = lazy(() => import("./pages/AIMatrix"));
const RiskCenterV8   = lazy(() => import("./pages/RiskCenterV8"));
const WalletCenter   = lazy(() => import("./pages/WalletCenter"));
const SettingsPage   = lazy(() => import("./pages/SettingsPage"));
const BacktestPage   = lazy(() => import("./pages/BacktestPage"));
const ForecastCenter = lazy(() => import("./pages/ForecastCenter"));
const ReportsModule  = lazy(() => import("./pages/reports/ReportsModule"));
const IndianMarketPage = lazy(() => import("./pages/IndianMarketPage"));

const Spinner = () => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", minHeight:300 }}>
    <div style={{ width:32, height:32, border:"2px solid #1e3a5f", borderTopColor:"#3b82f6", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
  </div>
);

export default function App() {
  const boot  = useAppStore((s) => s.boot);
  const ready = useAppStore((s) => s.ready);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { boot(); }, [boot]);

  if (!ready) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#070d1a", flexDirection:"column", gap:16 }}>
        <div style={{ width:40, height:40, border:"2px solid #1e3a5f", borderTopColor:"#3b82f6", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
        <span style={{ fontSize:11, fontWeight:700, color:"#475569", letterSpacing:"0.12em", textTransform:"uppercase" }}>AALGOLAKSHMI</span>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.page-fade{animation:fadeIn 0.25s ease-out}`}</style>

      {/* Mobile sidebar overlay backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:40, backdropFilter:"blur(2px)" }}
        />
      )}

      <div style={{ display:"flex", height:"100dvh", overflow:"hidden", background:"#070d1a" }}>
        {/* Sidebar */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main column */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden" }}>
          <TopBar onMenuClick={() => setSidebarOpen(true)} />

          {/* Trending coins ticker — symbol · $USDT / ₹INR · BUY/SELL · trend */}
          <MarketRibbon />

          <main
            style={{ flex:1, overflowY:"auto", overflowX:"hidden", paddingBottom: 0 }}
            className="page-fade"
          >
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route path="/"                  element={<HomePage />} />
                <Route path="/indian-market"     element={<IndianMarketPage />} />
                <Route path="/aqea/wallet"        element={<WalletCenter />} />
                <Route path="/aqea/positions"     element={<Positions />} />
                <Route path="/aqea/orders"        element={<OrdersPage />} />
                <Route path="/aqea/ai"            element={<AIMatrix />} />
                <Route path="/aqea/risk-center"   element={<RiskCenterV8 />} />
                <Route path="/backtest"           element={<BacktestPage />} />
                <Route path="/prediction"         element={<ForecastCenter />} />
                <Route path="/reports"            element={<ReportsModule />} />
                <Route path="/reports/:section"   element={<ReportsModule />} />
                <Route path="/settings"           element={<SettingsPage />} />
              </Routes>
            </Suspense>
          </main>

          {/* Live Upcoming AI Trade Prediction Bar */}
          <AIFooterTradeBar />

          {/* Mobile bottom nav */}
          <BottomNav />
        </div>
      </div>

      <ToastContainer />
    </>
  );
}
