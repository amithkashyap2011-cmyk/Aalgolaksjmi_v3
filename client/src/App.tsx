import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";
import MarketRibbon from "./components/layout/MarketRibbon";
import BottomNav from "./components/layout/BottomNav";
import ToastContainer from "./components/layout/ToastContainer";
import AIFooterTradeBar from "./components/ai/AIFooterTradeBar";
import { useAppStore } from "./store/useAppStore";

import HomePage from "./pages/HomePage";
import Positions from "./pages/Positions";
import OrdersPage from "./pages/OrdersPage";
import AIMatrix from "./pages/AIMatrix";
import RiskCenterV8 from "./pages/RiskCenterV8";
import WalletCenter from "./pages/WalletCenter";
import SettingsPage from "./pages/SettingsPage";
import BacktestPage from "./pages/BacktestPage";
import ForecastCenter from "./pages/ForecastCenter";
import ReportsModule from "./pages/reports/ReportsModule";
import IndianMarketPage from "./pages/IndianMarketPage";

export default function App() {
  const boot  = useAppStore((s) => s.boot);
  const ready = useAppStore((s) => s.ready);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    boot();
  }, []);

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
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes quickFade{from{opacity:0.85}to{opacity:1}}.page-fade{animation:quickFade 0.08s ease-out}`}</style>

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
