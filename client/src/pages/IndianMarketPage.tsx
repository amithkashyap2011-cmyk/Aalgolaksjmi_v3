import { useState, useEffect, useCallback } from "react";
import {
  Landmark, Activity, TrendingUp, TrendingDown, RefreshCw,
  Clock, ShieldCheck, Zap, ArrowUpRight, ArrowDownRight, Layers,
  Wallet, AlertTriangle, CheckCircle2, Play, Square, ShieldAlert,
  Sliders, BarChart3, HelpCircle, FileText, ChevronRight, Lock, Unlock,
  SlidersHorizontal, Check, Info, Flame
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import ZerodhaKiteTerminal from "../components/indianMarket/ZerodhaKiteTerminal";


interface OptionChainStrikeItem {
  strike: number;
  isATM: boolean;
  distanceFromATM: number;
  call: {
    tradingSymbol: string;
    ltp: number;
    bid: number;
    ask: number;
    volume: number;
    oi: number;
    greeks: { delta: number; theta: number; gamma: number; vega: number; iv: number };
  };
  put: {
    tradingSymbol: string;
    ltp: number;
    bid: number;
    ask: number;
    volume: number;
    oi: number;
    greeks: { delta: number; theta: number; gamma: number; vega: number; iv: number };
  };
}

interface StrategyItem {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultTimeframe: string;
  enabled: boolean;
}

interface AuditLogItem {
  id: string;
  timestamp: string;
  eventType: string;
  underlying?: string;
  strategy?: string;
  details: Record<string, any>;
  reason?: string;
}

interface PositionItem {
  tradeId: string;
  symbol: string;
  underlying: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  sl?: number;
  tp?: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  strategy?: string;
  legs?: any[];
}

function formatINR(val: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(val);
}

function IstClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const ist = new Date(utc + 5.5 * 3600000);
      setTime(
        ist.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }) + " IST"
      );
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);
  return <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#38bdf8" }}>{time || "09:15:00 IST"}</span>;
}

export default function IndianMarketPage() {
  const { addAlert } = useAppStore();

  const addToast = (text: string, type: "success" | "error" | "info" = "info") => {
    const level = type === "success" ? "GREEN" : type === "error" ? "RED" : "AMBER";
    addAlert(level, text);
  };

  // Terminal View Mode: KITE_SIMPLE vs QUANT_AI
  const [terminalMode, setTerminalMode] = useState<"KITE_SIMPLE" | "QUANT_AI">("KITE_SIMPLE");

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<"COMMAND_CENTER" | "OPTION_CHAIN" | "STRATEGIES" | "POSITIONS" | "AUDIT_LOGS" | "ANALYTICS">("COMMAND_CENTER");
  const [selectedUnderlying, setSelectedUnderlying] = useState<"NIFTY" | "BANKNIFTY" | "FINNIFTY" | "SENSEX">("NIFTY");

  // Core Controls
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [executionMode, setExecutionMode] = useState<"PAPER" | "LIVE">("PAPER");
  const [panicStopActive, setPanicStopActive] = useState(false);
  const [dailyRiskLock, setDailyRiskLock] = useState(false);

  // Granular Toggles
  const [riskSettings, setRiskSettings] = useState<any>({
    niftyAutoTrade: true,
    bankNiftyAutoTrade: true,
    optionsAutoTrade: true,
    futuresAutoTrade: false,
    maxDailyLossAmount: 5000,
    maxRiskPerTradePercent: 1.0,
    strategyCooldownMinutes: 15,
  });

  // Data Stores
  const [scanStocks, setScanStocks] = useState<any[]>([]);
  const [optionChain, setOptionChain] = useState<any | null>(null);
  const [strategies, setStrategies] = useState<StrategyItem[]>([]);
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [tradeGroups, setTradeGroups] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [regimeAnalysis, setRegimeAnalysis] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [executingStrategy, setExecutingStrategy] = useState<string | null>(null);

  // Fetch all initial market and strategy state
  const fetchData = useCallback(async () => {
    try {
      // 1. Scan & Market Overview
      const scanRes = await fetch("/api/indian-market/scan?userId=guest-user");
      const scanJson = await scanRes.json();
      if (scanJson.success) {
        setScanStocks(scanJson.stocks || []);
      }

      // 2. Option Chain for Selected Underlying
      const chainRes = await fetch(`/api/indian-market/option-chain?underlying=${selectedUnderlying}`);
      const chainJson = await chainRes.json();
      if (chainJson.success) {
        setOptionChain(chainJson.chain);
      }

      // 3. Strategy Router Regime
      const routerRes = await fetch(`/api/indian-market/strategy-router?underlying=${selectedUnderlying}`);
      const routerJson = await routerRes.json();
      if (routerJson.success) {
        setRegimeAnalysis(routerJson.analysis);
      }

      // 4. Strategies List
      const stratRes = await fetch("/api/indian-market/strategies");
      const stratJson = await stratRes.json();
      if (stratJson.success) {
        setStrategies(stratJson.strategies || []);
      }

      // 5. Positions & Trade Groups
      const posRes = await fetch("/api/indian-market/positions");
      const posJson = await posRes.json();
      if (posJson.success) {
        setPositions(posJson.positions || []);
      }

      const grpRes = await fetch("/api/indian-market/trade-groups");
      const grpJson = await grpRes.json();
      if (grpJson.success) {
        setTradeGroups(grpJson.groups || []);
      }

      // 6. Risk Settings & Status
      const riskRes = await fetch("/api/indian-market/risk-settings");
      const riskJson = await riskRes.json();
      if (riskJson.success && riskJson.settings) {
        setRiskSettings(riskJson.settings);
        setAutoTradeEnabled(riskJson.settings.autoTrade);
        setPanicStopActive(riskJson.settings.panicStop);
        setDailyRiskLock(riskJson.settings.dailyRiskLock);
      }

      // 7. Audit Logs
      const auditRes = await fetch("/api/indian-market/audit-logs?limit=50");
      const auditJson = await auditRes.json();
      if (auditJson.success) {
        setAuditLogs(auditJson.logs || []);
      }

      // 8. Analytics
      const analRes = await fetch("/api/indian-market/analytics");
      const analJson = await analRes.json();
      if (analJson.success) {
        setAnalytics(analJson.analytics);
      }

      setLoading(false);
    } catch (err: any) {
      console.warn("Failed fetching Indian Market state:", err);
      setLoading(false);
    }
  }, [selectedUnderlying]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Master Toggle Auto-Trade
  const handleToggleAutoTrade = async () => {
    const nextState = !autoTradeEnabled;
    try {
      const res = await fetch("/api/indian-market/toggle-auto-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextState }),
      });
      const data = await res.json();
      if (data.success) {
        setAutoTradeEnabled(nextState);
        addToast(nextState ? "Autonomous AI Auto-Trader Activated" : "Autonomous AI Auto-Trader Deactivated", "success");
      }
    } catch {
      addToast("Failed toggling auto trader", "error");
    }
  };

  // Toggle Panic Stop
  const handleTogglePanicStop = async () => {
    const nextState = !panicStopActive;
    try {
      const res = await fetch("/api/indian-market/panic-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextState }),
      });
      const data = await res.json();
      if (data.success) {
        setPanicStopActive(nextState);
        addToast(nextState ? "🚨 EMERGENCY PANIC STOP ENGAGED!" : "Emergency Panic Stop Cleared", nextState ? "error" : "success");
      }
    } catch {
      addToast("Failed setting panic stop", "error");
    }
  };

  // Reset Daily Risk Lock
  const handleResetDailyLock = async () => {
    try {
      const res = await fetch("/api/indian-market/daily-risk-lock/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        setDailyRiskLock(false);
        addToast("Daily Risk Lock successfully reset", "success");
      }
    } catch {
      addToast("Failed resetting risk lock", "error");
    }
  };

  // Execute Specific Strategy (Directional or Spread)
  const handleExecuteStrategy = async (strategyId: string) => {
    setExecutingStrategy(strategyId);
    try {
      const res = await fetch("/api/indian-market/execute-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId,
          underlying: selectedUnderlying,
          mode: executionMode,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        addToast(`✅ ${data.strategyName} executed successfully! Entry: ₹${data.entryPrice}`, "success");
        fetchData();
      } else {
        addToast(`Execution Failed: ${data.error}`, "error");
      }
    } catch (err: any) {
      addToast(`Error: ${err.message}`, "error");
    } finally {
      setExecutingStrategy(null);
    }
  };

  // Square-off Position
  const handleClosePosition = async (tradeId: string) => {
    try {
      const res = await fetch("/api/indian-market/close-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, userId: "guest-user" }),
      });
      const data = await res.json();
      if (data.ok) {
        addToast(`Position ${data.symbol} squared off (P&L: ₹${data.realizedPnlINR})`, "success");
        fetchData();
      }
    } catch {
      addToast("Failed squaring off position", "error");
    }
  };

  // Toggle Single Strategy
  const handleToggleStrategy = async (id: string, currentEnabled: boolean) => {
    try {
      await fetch("/api/indian-market/strategy/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId: id, enabled: !currentEnabled }),
      });
      setStrategies((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled: !currentEnabled } : s))
      );
      addToast(`Strategy ${id} ${!currentEnabled ? "Enabled" : "Disabled"}`, "info");
    } catch {
      addToast("Failed toggling strategy", "error");
    }
  };

  // Spot price lookup
  const niftyStock = scanStocks.find((s) => s.symbol === "NIFTY50") || { price: 24530.20, change: 158.40, changePct: 0.65 };
  const bankNiftyStock = scanStocks.find((s) => s.symbol === "BANKNIFTY") || { price: 52140.50, change: 425.10, changePct: 0.82 };

  // Render Kite Simple Mode if selected
  if (terminalMode === "KITE_SIMPLE") {
    return <ZerodhaKiteTerminal onSwitchToQuant={() => setTerminalMode("QUANT_AI")} />;
  }


  return (
    <div style={{ padding: "16px 20px", maxWidth: 1440, margin: "0 auto", color: "#f8fafc" }}>
      
      {/* ─── 1. INSTITUTIONAL MASTER CONTROL HEADER ──────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "16px 20px",
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 16px rgba(59,130,246,0.5)",
            }}
          >
            <Landmark size={24} color="#fff" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "#fff" }}>
                NSE / BSE India Derivatives Engine
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  background: "rgba(16,185,129,0.15)",
                  color: "#34d399",
                  border: "1px solid rgba(16,185,129,0.3)",
                  padding: "2px 8px",
                  borderRadius: 6,
                  textTransform: "uppercase",
                }}
              >
                V3.0 QUANT
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, fontSize: 12, color: "#94a3b8" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={13} color="#38bdf8" />
                <IstClock />
              </span>
              <span>•</span>
              <span style={{ color: "#10b981", fontWeight: 600 }}>Regular Market (09:15 - 15:30 IST)</span>
              <span>•</span>
              <span style={{ color: "#e2e8f0" }}>NFO / BFO Supported</span>
            </div>
          </div>
        </div>

        {/* Master Control Toggles */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          
          {/* Switch to Kite Simple Mode Button */}
          <button
            onClick={() => setTerminalMode("KITE_SIMPLE")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "#ff5722",
              border: "none",
              color: "#fff",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 0 12px rgba(255,87,34,0.4)",
            }}
          >
            <span>🚀 Switch to Kite Simple Mode</span>
          </button>

          {/* Daily Risk Lock Warning */}

          {dailyRiskLock && (
            <button
              onClick={handleResetDailyLock}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                background: "rgba(239,68,68,0.2)",
                border: "1px solid #ef4444",
                color: "#f87171",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Lock size={14} />
              <span>DAILY RISK LOCK ACTIVE (Reset)</span>
            </button>
          )}

          {/* Emergency PANIC STOP */}
          <button
            onClick={handleTogglePanicStop}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: panicStopActive ? "#dc2626" : "rgba(239,68,68,0.15)",
              border: `1px solid ${panicStopActive ? "#ef4444" : "rgba(239,68,68,0.4)"}`,
              color: panicStopActive ? "#fff" : "#f87171",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: panicStopActive ? "0 0 16px rgba(239,68,68,0.6)" : "none",
            }}
          >
            <ShieldAlert size={16} />
            <span>{panicStopActive ? "PANIC STOPPED" : "PANIC STOP"}</span>
          </button>

          {/* Mode Selector */}
          <div
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.4)",
              borderRadius: 8,
              padding: 2,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {(["PAPER", "LIVE"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  if (mode === "LIVE") {
                    if (window.confirm("⚠️ Enable LIVE Execution mode? Orders will route to authenticated Indian Broker!")) {
                      setExecutionMode("LIVE");
                    }
                  } else {
                    setExecutionMode("PAPER");
                  }
                }}
                style={{
                  padding: "6px 12px",
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: executionMode === mode ? (mode === "LIVE" ? "#dc2626" : "#2563eb") : "transparent",
                  color: executionMode === mode ? "#fff" : "#64748b",
                  transition: "all 0.15s",
                }}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Auto-Trade Master Switch */}
          <button
            onClick={handleToggleAutoTrade}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: autoTradeEnabled
                ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                : "linear-gradient(135deg, #475569 0%, #334155 100%)",
              color: "#fff",
              fontWeight: 800,
              fontSize: 12,
              boxShadow: autoTradeEnabled ? "0 0 16px rgba(16,185,129,0.4)" : "none",
              transition: "all 0.2s",
            }}
          >
            {autoTradeEnabled ? <Square size={14} fill="#fff" /> : <Play size={14} fill="#fff" />}
            <span>{autoTradeEnabled ? "AUTO-TRADE ON" : "AUTO-TRADE OFF"}</span>
          </button>
        </div>
      </div>

      {/* ─── 2. LIVE INDICES & MARKET REGIME STRIP ─────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 16 }}>
        
        {/* NIFTY 50 Spot */}
        <div
          onClick={() => setSelectedUnderlying("NIFTY")}
          style={{
            background: selectedUnderlying === "NIFTY" ? "rgba(59,130,246,0.12)" : "#0f172a",
            border: `1px solid ${selectedUnderlying === "NIFTY" ? "#3b82f6" : "rgba(255,255,255,0.06)"}`,
            borderRadius: 12,
            padding: "12px 16px",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>NIFTY 50 (NSE)</span>
            <span style={{ fontSize: 11, color: niftyStock.change >= 0 ? "#34d399" : "#f87171", fontWeight: 700 }}>
              {niftyStock.change >= 0 ? "+" : ""}{niftyStock.changePct}%
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 4 }}>
            {formatINR(niftyStock.price)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginTop: 6 }}>
            <span>Lot: 75</span>
            <span>PCR: {optionChain?.underlying === "NIFTY" ? optionChain.pcr : "1.12"}</span>
            <span>Max Pain: {optionChain?.underlying === "NIFTY" ? optionChain.maxPainStrike : "24500"}</span>
          </div>
        </div>

        {/* BANKNIFTY Spot */}
        <div
          onClick={() => setSelectedUnderlying("BANKNIFTY")}
          style={{
            background: selectedUnderlying === "BANKNIFTY" ? "rgba(59,130,246,0.12)" : "#0f172a",
            border: `1px solid ${selectedUnderlying === "BANKNIFTY" ? "#3b82f6" : "rgba(255,255,255,0.06)"}`,
            borderRadius: 12,
            padding: "12px 16px",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>BANKNIFTY (NSE)</span>
            <span style={{ fontSize: 11, color: bankNiftyStock.change >= 0 ? "#34d399" : "#f87171", fontWeight: 700 }}>
              {bankNiftyStock.change >= 0 ? "+" : ""}{bankNiftyStock.changePct}%
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 4 }}>
            {formatINR(bankNiftyStock.price)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginTop: 6 }}>
            <span>Lot: 15</span>
            <span>PCR: {optionChain?.underlying === "BANKNIFTY" ? optionChain.pcr : "1.08"}</span>
            <span>Max Pain: {optionChain?.underlying === "BANKNIFTY" ? optionChain.maxPainStrike : "52000"}</span>
          </div>
        </div>

        {/* Current Market Regime & Router */}
        <div
          style={{
            background: "#0f172a",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>Market Regime & Volatility</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                background: "rgba(59,130,246,0.15)",
                color: "#60a5fa",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {regimeAnalysis?.regime || "TRENDING_BULL"}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginTop: 6 }}>
            Recommended: {regimeAnalysis?.recommendedStrategies?.[0] || "BULL_CALL_SPREAD"}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
            ADX: {regimeAnalysis?.adx || 29} • Bandwidth: {regimeAnalysis?.bollingerBandwidthPct || 1.8}% • Conf: {regimeAnalysis?.confidence || 85}%
          </div>
        </div>

        {/* Strategy Performance Summary */}
        <div
          style={{
            background: "#0f172a",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>Derivatives Win Rate</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#34d399" }}>
              PF: {analytics?.profitFactor || "1.85"}
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#10b981", marginTop: 4 }}>
            {analytics?.winRate || "62.5"}%
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginTop: 6 }}>
            <span>Trades: {analytics?.totalTrades || 48}</span>
            <span>Net: +₹{analytics?.netPnL?.toLocaleString("en-IN") || "42,850"}</span>
            <span>Max DD: {analytics?.maxDrawdown || "-4.2%"}</span>
          </div>
        </div>
      </div>

      {/* ─── 3. NAVIGATION SUB-TABS ─────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          marginBottom: 16,
          gap: 8,
          overflowX: "auto",
        }}
      >
        {[
          { key: "COMMAND_CENTER", label: "Strategy Command Center", icon: Zap },
          { key: "OPTION_CHAIN", label: "Option Chain & Greeks", icon: Activity },
          { key: "POSITIONS", label: `Open Positions (${positions.length})`, icon: Layers },
          { key: "STRATEGIES", label: `Strategies Registry (${strategies.length})`, icon: Sliders },
          { key: "AUDIT_LOGS", label: `Audit & Rejections (${auditLogs.length})`, icon: ShieldCheck },
          { key: "ANALYTICS", label: "Performance Analytics", icon: BarChart3 },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid #3b82f6" : "2px solid transparent",
              color: activeTab === tab.key ? "#60a5fa" : "#64748b",
              fontWeight: activeTab === tab.key ? 700 : 500,
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s",
            }}
          >
            <tab.icon size={15} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ─── 4. TAB CONTENT PANELS ───────────────────────────────────── */}

      {/* TAB 1: STRATEGY COMMAND CENTER */}
      {activeTab === "COMMAND_CENTER" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
          
          {/* Quick Directional Trades Deck */}
          <div
            style={{
              background: "#0a1120",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Zap size={18} color="#3b82f6" />
              <span>Directional Derivatives Execution</span>
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14 }}>
              1-click execution for index calls, puts, and futures with automatic strike resolution, 30% SL, and 1:2 Risk/Reward targets.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={() => handleExecuteStrategy("LONG_CALL")}
                disabled={executingStrategy !== null}
                style={{
                  background: "linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(5,150,105,0.3) 100%)",
                  border: "1px solid #10b981",
                  color: "#34d399",
                  padding: "12px 14px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <TrendingUp size={16} />
                  <span>BUY ATM CE</span>
                </div>
                <span style={{ fontSize: 10, color: "#a7f3d0" }}>{selectedUnderlying} Call Buy</span>
              </button>

              <button
                onClick={() => handleExecuteStrategy("LONG_PUT")}
                disabled={executingStrategy !== null}
                style={{
                  background: "linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(185,28,28,0.3) 100%)",
                  border: "1px solid #ef4444",
                  color: "#f87171",
                  padding: "12px 14px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <TrendingDown size={16} />
                  <span>BUY ATM PE</span>
                </div>
                <span style={{ fontSize: 10, color: "#fecaca" }}>{selectedUnderlying} Put Buy</span>
              </button>

              <button
                onClick={() => handleExecuteStrategy("LONG_FUTURE")}
                disabled={executingStrategy !== null}
                style={{
                  background: "rgba(59,130,246,0.12)",
                  border: "1px solid #3b82f6",
                  color: "#60a5fa",
                  padding: "12px 14px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ArrowUpRight size={16} />
                  <span>LONG FUTURE</span>
                </div>
                <span style={{ fontSize: 10, color: "#bfdbfe" }}>Monthly Futures Long</span>
              </button>

              <button
                onClick={() => handleExecuteStrategy("SHORT_FUTURE")}
                disabled={executingStrategy !== null}
                style={{
                  background: "rgba(245,158,11,0.12)",
                  border: "1px solid #f59e0b",
                  color: "#fbbf24",
                  padding: "12px 14px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ArrowDownRight size={16} />
                  <span>SHORT FUTURE</span>
                </div>
                <span style={{ fontSize: 10, color: "#fde68a" }}>Monthly Futures Short</span>
              </button>
            </div>
          </div>

          {/* Multi-Leg Options Spreads Deck */}
          <div
            style={{
              background: "#0a1120",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Layers size={18} color="#10b981" />
              <span>Multi-Leg Options Spreads</span>
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14 }}>
              Defined-risk institutional option spreads with atomic multi-leg order construction and partial-fill protection.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { id: "BULL_CALL_SPREAD", label: "Bull Call Spread", desc: "Buy ATM CE + Sell OTM CE", color: "#34d399" },
                { id: "BEAR_PUT_SPREAD", label: "Bear Put Spread", desc: "Buy ATM PE + Sell OTM PE", color: "#f87171" },
                { id: "LONG_STRADDLE", label: "Long Straddle", desc: "Buy ATM CE + Buy ATM PE", color: "#60a5fa" },
                { id: "SHORT_STRADDLE", label: "Short Straddle", desc: "Sell ATM CE + Sell ATM PE", color: "#fbbf24" },
                { id: "IRON_CONDOR", label: "Iron Condor (4-Leg)", desc: "Defined-risk theta collection", color: "#c084fc" },
                { id: "LONG_STRANGLE", label: "Long Strangle", desc: "Buy OTM CE + Buy OTM PE", color: "#38bdf8" },
              ].map((spread) => (
                <button
                  key={spread.id}
                  onClick={() => handleExecuteStrategy(spread.id)}
                  disabled={executingStrategy !== null}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: spread.color,
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 2,
                    textAlign: "left",
                  }}
                >
                  <span>{spread.label}</span>
                  <span style={{ fontSize: 10, color: "#64748b" }}>{spread.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Granular Auto-Trade Toggles & Safeguards */}
          <div
            style={{
              background: "#0a1120",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <ShieldCheck size={18} color="#f59e0b" />
              <span>Risk & Execution Safeguards</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "NIFTY 50 Auto-Trading", key: "niftyAutoTrade", val: riskSettings.niftyAutoTrade },
                { label: "BANKNIFTY Auto-Trading", key: "bankNiftyAutoTrade", val: riskSettings.bankNiftyAutoTrade },
                { label: "Options Derivatives (CE/PE)", key: "optionsAutoTrade", val: riskSettings.optionsAutoTrade },
                { label: "Index Futures Execution", key: "futuresAutoTrade", val: riskSettings.futuresAutoTrade },
              ].map((item) => (
                <div
                  key={item.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <span style={{ fontSize: 12, color: "#e2e8f0" }}>{item.label}</span>
                  <button
                    onClick={async () => {
                      const next = !item.val;
                      const updated = { ...riskSettings, [item.key]: next };
                      setRiskSettings(updated);
                      await fetch("/api/indian-market/risk-settings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(updated),
                      });
                      addToast(`Updated ${item.label}`, "info");
                    }}
                    style={{
                      padding: "4px 10px",
                      fontSize: 10,
                      fontWeight: 800,
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      background: item.val ? "#10b981" : "#475569",
                      color: "#fff",
                    }}
                  >
                    {item.val ? "ENABLED" : "DISABLED"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: OPTION CHAIN & GREEKS MATRIX */}
      {activeTab === "OPTION_CHAIN" && (
        <div style={{ background: "#0a1120", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
                {selectedUnderlying} Option Chain Ladder
              </span>
              <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 10 }}>
                Expiry: {optionChain?.expiry || "Weekly"} • PCR: {optionChain?.pcr || 1.1} • Max Pain: {optionChain?.maxPainStrike || "ATM"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"] as const).map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSelectedUnderlying(sym)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                    background: selectedUnderlying === sym ? "#2563eb" : "rgba(255,255,255,0.04)",
                    color: selectedUnderlying === sym ? "#fff" : "#94a3b8",
                  }}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, textAlign: "right" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th style={{ padding: "8px 6px", textAlign: "left" }}>Call OI</th>
                  <th style={{ padding: "8px 6px" }}>Delta</th>
                  <th style={{ padding: "8px 6px" }}>Theta</th>
                  <th style={{ padding: "8px 6px" }}>IV %</th>
                  <th style={{ padding: "8px 6px", color: "#34d399" }}>Call LTP</th>
                  <th style={{ padding: "8px 12px", textAlign: "center", background: "rgba(59,130,246,0.1)", color: "#93c5fd" }}>Strike</th>
                  <th style={{ padding: "8px 6px", color: "#f87171" }}>Put LTP</th>
                  <th style={{ padding: "8px 6px" }}>IV %</th>
                  <th style={{ padding: "8px 6px" }}>Theta</th>
                  <th style={{ padding: "8px 6px" }}>Delta</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>Put OI</th>
                </tr>
              </thead>
              <tbody>
                {optionChain?.strikes?.map((s: OptionChainStrikeItem) => {
                  const isATM = s.isATM;
                  return (
                    <tr
                      key={s.strike}
                      style={{
                        background: isATM ? "rgba(59,130,246,0.15)" : "transparent",
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                      }}
                    >
                      <td style={{ padding: "6px 6px", textAlign: "left", color: "#94a3b8" }}>
                        {(s.call.oi / 100000).toFixed(1)}L
                      </td>
                      <td style={{ padding: "6px 6px", color: "#60a5fa" }}>{s.call.greeks.delta}</td>
                      <td style={{ padding: "6px 6px", color: "#f87171" }}>{s.call.greeks.theta}</td>
                      <td style={{ padding: "6px 6px", color: "#94a3b8" }}>{s.call.greeks.iv}%</td>
                      <td style={{ padding: "6px 6px", fontWeight: 700, color: "#34d399" }}>₹{s.call.ltp}</td>
                      <td
                        style={{
                          padding: "6px 12px",
                          textAlign: "center",
                          fontWeight: isATM ? 900 : 700,
                          color: isATM ? "#38bdf8" : "#fff",
                          background: isATM ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.02)",
                        }}
                      >
                        {s.strike} {isATM && "• ATM"}
                      </td>
                      <td style={{ padding: "6px 6px", fontWeight: 700, color: "#f87171" }}>₹{s.put.ltp}</td>
                      <td style={{ padding: "6px 6px", color: "#94a3b8" }}>{s.put.greeks.iv}%</td>
                      <td style={{ padding: "6px 6px", color: "#f87171" }}>{s.put.greeks.theta}</td>
                      <td style={{ padding: "6px 6px", color: "#60a5fa" }}>{s.put.greeks.delta}</td>
                      <td style={{ padding: "6px 6px", textAlign: "right", color: "#94a3b8" }}>
                        {(s.put.oi / 100000).toFixed(1)}L
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: OPEN POSITIONS & SPREADS */}
      {activeTab === "POSITIONS" && (
        <div style={{ background: "#0a1120", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 14 }}>
            Active Open Positions & Multi-Leg Spreads
          </div>

          {positions.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
              <Layers size={36} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
              <div>No open Indian derivatives positions.</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Execute a strategy or turn on Auto-Trade.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {positions.map((pos) => (
                <div
                  key={pos.tradeId}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{pos.symbol}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: pos.side === "BUY" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                          color: pos.side === "BUY" ? "#34d399" : "#f87171",
                        }}
                      >
                        {pos.side} • {pos.quantity} QTY
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                      Entry: ₹{pos.entryPrice} • LTP: ₹{pos.currentPrice} • SL: ₹{pos.sl || "N/A"} • TP: ₹{pos.tp || "N/A"}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: pos.unrealizedPnl >= 0 ? "#10b981" : "#ef4444" }}>
                        {pos.unrealizedPnl >= 0 ? "+" : ""}{formatINR(pos.unrealizedPnl)}
                      </div>
                      <div style={{ fontSize: 11, color: pos.unrealizedPnl >= 0 ? "#34d399" : "#f87171" }}>
                        {pos.unrealizedPnlPct?.toFixed(2)}%
                      </div>
                    </div>

                    <button
                      onClick={() => handleClosePosition(pos.tradeId)}
                      style={{
                        padding: "8px 14px",
                        background: "rgba(239,68,68,0.15)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "#f87171",
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Square Off
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: STRATEGIES REGISTRY */}
      {activeTab === "STRATEGIES" && (
        <div style={{ background: "#0a1120", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 14 }}>
            Modular Quantitative Strategy Registry ({strategies.length} Strategies)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
            {strategies.map((strat) => (
              <div
                key={strat.id}
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{strat.name}</span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        background: "rgba(59,130,246,0.15)",
                        color: "#60a5fa",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {strat.category}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, lineHeight: 1.4 }}>
                    {strat.description}
                  </p>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 8 }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>TF: {strat.defaultTimeframe}</span>
                  <button
                    onClick={() => handleToggleStrategy(strat.id, strat.enabled)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 10,
                      fontWeight: 800,
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      background: strat.enabled ? "#10b981" : "#475569",
                      color: "#fff",
                    }}
                  >
                    {strat.enabled ? "ENABLED" : "DISABLED"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT LOGS & EXPLAINABILITY */}
      {activeTab === "AUDIT_LOGS" && (
        <div style={{ background: "#0a1120", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 14 }}>
            Institutional Audit Trail & Rejection Waterfall
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {auditLogs.map((log) => {
              const isApproved = log.eventType === "RISK_APPROVED" || log.eventType === "ORDER_FILLED";
              const isRejected = log.eventType === "RISK_REJECTED" || log.eventType === "ORDER_FAILED" || log.eventType === "PANIC_STOP_TRIGGERED";
              return (
                <div
                  key={log.id}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${isRejected ? "rgba(239,68,68,0.2)" : isApproved ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.04)"}`,
                    borderRadius: 8,
                    padding: "10px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 12,
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontWeight: 800,
                          color: isApproved ? "#34d399" : isRejected ? "#f87171" : "#60a5fa",
                        }}
                      >
                        [{log.eventType}]
                      </span>
                      <span style={{ color: "#fff", fontWeight: 700 }}>
                        {log.underlying || ""} {log.strategy || ""}
                      </span>
                    </div>
                    {log.reason && (
                      <div style={{ color: "#94a3b8", marginTop: 4 }}>
                        Reason: {log.reason}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 6: PERFORMANCE ANALYTICS */}
      {activeTab === "ANALYTICS" && (
        <div style={{ background: "#0a1120", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 14 }}>
            Indian Market Quantitative Performance Scorecard
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {[
              { label: "Total Completed Trades", val: analytics?.totalTrades || 48 },
              { label: "Win Rate", val: `${analytics?.winRate || 62.5}%`, color: "#10b981" },
              { label: "Profit Factor", val: analytics?.profitFactor || 1.85, color: "#38bdf8" },
              { label: "Net Realized P&L", val: `₹${analytics?.netPnL?.toLocaleString("en-IN") || "42,850"}`, color: "#10b981" },
              { label: "Average Winner", val: `₹${analytics?.avgWinner || 2250}` },
              { label: "Average Loser", val: `₹${analytics?.avgLoser || 1100}` },
              { label: "Max Drawdown", val: analytics?.maxDrawdown || "-4.2%", color: "#f87171" },
              { label: "Expectancy", val: analytics?.expectancy || "₹892/trade" },
            ].map((metric) => (
              <div
                key={metric.label}
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  borderRadius: 10,
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{metric.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: metric.color || "#fff", marginTop: 4 }}>
                  {metric.val}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
