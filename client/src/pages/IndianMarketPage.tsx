import InvestmentSummary from "../components/common/InvestmentSummary";
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Landmark, Activity, TrendingUp, TrendingDown, RefreshCw,
  Clock, ShieldCheck, Zap, ArrowUpRight, ArrowDownRight, Layers,
  Wallet, AlertTriangle, CheckCircle2, Play, Square, ShieldAlert,
  Sliders, BarChart3, HelpCircle, FileText, ChevronRight, Lock, Unlock,
  SlidersHorizontal, Check, Info, Flame, History, Award, ArrowLeft
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
  category: "DIRECTIONAL" | "NON_DIRECTIONAL" | "VOLATILITY" | string;
  legsDescription?: string;
  description?: string;
  defaultTimeframe?: string;
  underlying?: string;
  maxRisk?: string;
  targetProfit?: string;
  pcrRange?: string;
  regimeFit?: string[];
  enabled: boolean;
  aiWeight?: number;
  winRate?: number;
  sharpeRatio?: number;
}

interface PositionItem {
  tradeId: string;
  symbol: string;
  underlying: string;
  side: "BUY" | "SELL";
  quantity: number;
  remainingQty?: number;
  entryPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  targetStatus?: "PENDING" | "HIT";
  stopStatus?: "PENDING" | "HIT";
  autoPilotStatus?: string;
  exitOrderStatus?: string;
  positionStatus?: string;
  autoCloseStatus: "ARMED" | "TRIGGERED" | "MANUAL" | string;
  leverage: number;
  accountType: string;
  totalNotional: number;
  marginUsed: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  openedAt: string;
  strategy?: string;
  legs?: any[];
}

interface ClosedTradeItem {
  tradeId: string;
  symbol: string;
  underlying?: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  leverage?: number;
  productType?: string;
  accountType?: string;
  realizedPnl: number;
  realizedPnlPct?: number;
  charges?: number;
  netPnl?: number;
  exitReason?: string;
  openedAt?: string;
  closedAt?: string;
  strategy?: string;
}

interface AuditLogItem {
  id: string;
  timestamp: string;
  eventType: string;
  underlying: string;
  strategy: string;
  reason?: string;
  details?: any;
}

function formatINR(val: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(val);
}

function LiveClockIST() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
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

const IstClock = LiveClockIST;

export default function IndianMarketPage() {
  const { addAlert } = useAppStore();
  const navigate = useNavigate();

  const addToast = (text: string, type: "success" | "error" | "info" = "info") => {
    const level = type === "success" ? "GREEN" : type === "error" ? "RED" : "AMBER";
    addAlert(level, text);
  };

  // Terminal View Mode: KITE_SIMPLE vs QUANT_AI (persisted in localStorage)
  const [terminalMode, setTerminalMode] = useState<"KITE_SIMPLE" | "QUANT_AI">(() => {
    return (localStorage.getItem("INDIAN_TERMINAL_MODE") as "KITE_SIMPLE" | "QUANT_AI") || "KITE_SIMPLE";
  });

  const handleSetTerminalMode = (mode: "KITE_SIMPLE" | "QUANT_AI") => {
    setTerminalMode(mode);
    try {
      localStorage.setItem("INDIAN_TERMINAL_MODE", mode);
    } catch {}
  };

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<"COMMAND_CENTER" | "OPTION_CHAIN" | "STRATEGIES" | "POSITIONS" | "AUDIT_LOGS" | "ANALYTICS">("COMMAND_CENTER");
  const [selectedUnderlying, setSelectedUnderlying] = useState<"NIFTY" | "BANKNIFTY" | "FINNIFTY" | "SENSEX">("NIFTY");
  const location = useLocation();

  // Synchronize sidebar hash navigation (#options, #positions, #reconciliation)
  useEffect(() => {
    const hash = location.hash;
    if (hash === "#options") {
      setActiveTab("OPTION_CHAIN");
    } else if (hash === "#positions" || hash === "#portfolio") {
      // 🛡️ 2026-09-16: the sidebar's "Portfolio" link (/india#portfolio)
      // wasn't in this list, so it fell through with no matching branch —
      // the tab silently stayed whatever it already was, making Portfolio
      // indistinguishable from Dashboard. POSITIONS is this page's actual
      // holdings view, so #portfolio maps there like #positions already did.
      setActiveTab("POSITIONS");
    } else if (hash === "#reconciliation") {
      setActiveTab("AUDIT_LOGS");
    } else if (hash === "#strategies") {
      setActiveTab("STRATEGIES");
    } else if (hash === "#analytics") {
      setActiveTab("ANALYTICS");
    } else if (!hash || hash === "#terminal") {
      setActiveTab("COMMAND_CENTER");
    }
  }, [location.hash]);

  // Core Controls (Auto-Trade enabled by default)
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(true);
  // Shared with the TopBar toggle and persisted; independent of the crypto mode.
  const executionMode = useAppStore((s) => s.indianMode);
  const setExecutionMode = useAppStore((s) => s.setIndianMode);
  const [panicStopActive, setPanicStopActive] = useState(false);
  const [dailyRiskLock, setDailyRiskLock] = useState(false);

  // Financial Funds & Margins
  const [funds, setFunds] = useState<{
    availableCashINR: number;
    investedAmountINR: number;
    totalEquityINR: number;
    unrealizedPnlINR: number;
    realizedPnlINR: number;
    todayPnlINR: number;
    openTradesCount: number;
    closedTradesCount: number;
    winRate: number;
    autoTradeEnabled: boolean;
    inrRate?: number;
    cumulativeRealizedNetPnlINR?: number;
    accountMode?: string;
    capitalSource?: string;
  }>({
    availableCashINR: 0,
    investedAmountINR: 0,
    totalEquityINR: 0,
    unrealizedPnlINR: 0,
    realizedPnlINR: 0,
    todayPnlINR: 0,
    openTradesCount: 0,
    closedTradesCount: 0,
    winRate: 0,
    autoTradeEnabled: true,
    inrRate: 95.613964,
    cumulativeRealizedNetPnlINR: 0,
  });
  const [depositing, setDepositing] = useState(false);

  const handleAddPaperFunds = async (amount: number = 100000) => {
    setDepositing(true);
    try {
      const res = await fetch("/api/indian-market/funds/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "guest-user", amount }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(`✅ Added ₹${amount.toLocaleString("en-IN")} Paper Trading Margin!`, "success");
        await fetchData();
      }
    } catch (err: any) {
      addToast(`Deposit failed: ${err.message}`, "error");
    } finally {
      setDepositing(false);
    }
  };

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
  const [marketSession, setMarketSession] = useState<any>(null);
  const [scanStocks, setScanStocks] = useState<any[]>([]);
  const [optionChain, setOptionChain] = useState<any | null>(null);
  const [strategies, setStrategies] = useState<StrategyItem[]>([]);
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTradeItem[]>([]);
  const [positionSubTab, setPositionSubTab] = useState<"OPEN" | "CLOSED">("OPEN");
  const hasAutoSwitched = useRef(false);
  const [historyTimeframe, setHistoryTimeframe] = useState<"daily" | "weekly" | "monthly" | "all">("all");
  const [tradeGroups, setTradeGroups] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [regimeAnalysis, setRegimeAnalysis] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [executingStrategy, setExecutingStrategy] = useState<string | null>(null);

  // Parallel, timeout-protected fetch helper
  const safeFetch = async (url: string, timeoutMs: number = 4000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      return await res.json();
    } catch {
      clearTimeout(id);
      return null;
    }
  };

  // Fetch market and strategy state with tiered polling
  const fetchData = useCallback(async (isFullRefresh = false) => {
    try {
      let openCount = 0;
      let closedCount = 0;

      const activeTasks: Promise<any>[] = [
        // 0. Account Margin & Funds
        safeFetch(`/api/indian-market/funds?userId=guest-user&mode=${executionMode}`).then((json) => {
          if (json?.success) {
            setFunds(json);
            if (typeof json.autoTradeEnabled === "boolean") {
              setAutoTradeEnabled(json.autoTradeEnabled);
            }
          }
        }),

        // 1. Scan & Market Overview
        safeFetch("/api/indian-market/scan?userId=guest-user").then((json) => {
          if (json?.success) {
            setScanStocks(json.stocks || []);
            if (json.session) setMarketSession(json.session);
          }
        }),

        // 2. Option Chain for Selected Underlying
        safeFetch(`/api/indian-market/option-chain?underlying=${selectedUnderlying}`).then((json) => {
          if (json?.success) setOptionChain(json.chain);
        }),

        // 5. Positions (real-time single source of truth)
        safeFetch("/api/indian-market/positions").then((json) => {
          if (json?.success) {
            const p = json.positions || [];
            setPositions(p);
            openCount = p.length;
          }
        }),
      ];

      // Lower frequency endpoints: only on fullRefresh (every 20s or on mount / user action)
      if (isFullRefresh) {
        activeTasks.push(
          // 3. Strategy Router Regime
          safeFetch(`/api/indian-market/strategy-router?underlying=${selectedUnderlying}`).then((json) => {
            if (json?.success) setRegimeAnalysis(json.analysis);
          }),
          // 4. Strategies List
          safeFetch("/api/indian-market/strategies").then((json) => {
            if (json?.success) setStrategies(json.strategies || []);
          }),
          // 5b. Closed Trade History
          safeFetch(`/api/indian-market/history?timeframe=${historyTimeframe}`).then((json) => {
            if (json?.success) {
              const h = json.history || [];
              setClosedTrades(h);
              closedCount = h.length;
            }
          }),
          // 5c. Trade Groups
          safeFetch("/api/indian-market/trade-groups").then((json) => {
            if (json?.success) setTradeGroups(json.groups || []);
          }),
          // 6. Risk Settings & Status
          safeFetch("/api/indian-market/risk-settings").then((json) => {
            if (json?.success && json.settings) {
              setRiskSettings(json.settings);
              setAutoTradeEnabled(json.settings.autoTrade);
              setPanicStopActive(json.settings.panicStop);
              setDailyRiskLock(json.settings.dailyRiskLock);
            }
          }),
          // 7. Audit Logs
          safeFetch("/api/indian-market/audit-logs?limit=50").then((json) => {
            if (json?.success) setAuditLogs(json.logs || []);
          }),
          // 8. Analytics
          safeFetch("/api/indian-market/analytics").then((json) => {
            if (json?.success) setAnalytics(json.analytics);
          }),
        );
      }

      await Promise.allSettled(activeTasks);

      // Smart default: on initial load, if there are no open positions but settled trades exist, show the closed ledger
      if (!hasAutoSwitched.current && isFullRefresh) {
        if (openCount === 0 && closedCount > 0) {
          hasAutoSwitched.current = true;
          setPositionSubTab("CLOSED");
        }
      }
    } catch (err: any) {
      console.warn("Failed fetching Indian Market state:", err);
    }
  }, [selectedUnderlying, historyTimeframe, executionMode]);

  useEffect(() => {
    let tickCount = 0;
    fetchData(true); // Full initial load
    const interval = setInterval(() => {
      tickCount++;
      const isFull = tickCount % 5 === 0; // Full refresh every 20s (5 * 4s)
      fetchData(isFull);
    }, 4000);
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
    return (
      <ZerodhaKiteTerminal
        onSwitchToQuant={() => handleSetTerminalMode("QUANT_AI")}
        onBack={() => navigate("/")}
      />
    );
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
              <span style={{
                color: marketSession ? (marketSession.isOpen ? "#10b981" : "#f59e0b") : "#10b981",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}>
                <span style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: marketSession ? (marketSession.isOpen ? "#10b981" : "#f59e0b") : "#10b981",
                  display: "inline-block",
                }} />
                {marketSession ? (marketSession.isOpen ? "Regular Market (09:15 - 15:30 IST)" : marketSession.reason) : "Regular Market (09:15 - 15:30 IST)"}
              </span>
              <span>•</span>
              <span style={{ color: "#e2e8f0" }}>NFO / BFO Supported</span>
            </div>
          </div>
        </div>

        {/* Master Control Toggles */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          
          {/* Back to Dashboard */}
          <button
            onClick={() => navigate("/")}
            title="Go back to Main Dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#cbd5e1",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.12)";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              e.currentTarget.style.color = "#cbd5e1";
            }}
          >
            <ArrowLeft size={14} />
            <span>Dashboard</span>
          </button>

          {/* Switch to Kite Simple Mode Button */}
          <button
            onClick={() => handleSetTerminalMode("KITE_SIMPLE")}
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

      {/* ─── 1.5 NON-TECHNICAL USER FINANCIAL SCOREBOARD ─────────────── */}
      <div style={{ marginBottom: 18 }}>
        {/* Source Badge & Mode Indicator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.06em",
              padding: "3px 10px",
              borderRadius: 6,
              background: executionMode === "LIVE" ? "rgba(239, 68, 68, 0.15)" : "rgba(37, 99, 235, 0.15)",
              color: executionMode === "LIVE" ? "#f87171" : "#60a5fa",
              border: `1px solid ${executionMode === "LIVE" ? "rgba(239, 68, 68, 0.3)" : "rgba(37, 99, 235, 0.3)"}`
            }}>
              ● {executionMode === "LIVE" ? "LIVE BROKER (ANGEL ONE)" : "PAPER ACCOUNT (SIMULATED LEDGER)"}
            </span>
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>
              {executionMode === "LIVE" ? "Source: Official Exchange Margin" : `Source: Paper deposits (₹${Number((funds as any).totalDepositsINR || 0).toLocaleString("en-IN")} INR)`}
            </span>
          </div>
          <span style={{ fontSize: 11, color: "#10b981", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            RECONCILED
          </span>
        </div>

        {/* Invested vs net result. Net P/L is after charges (realized net +
            open P/L); current value = invested + net P/L. */}
        <InvestmentSummary
          currency="₹"
          invested={Number((funds as any).totalDepositsINR) || 0}
          netPnl={(Number((funds as any).cumulativeRealizedNetPnlINR) || 0) + (Number((funds as any).unrealizedPnlINR) || 0)}
          inOpenTrades={Number((funds as any).investedAmountINR) || 0}
          openCount={Number((funds as any).openTradesCount) || 0}
          deployed={Number((funds as any).capitalDeployedINR) || 0}
          tradeCount={Number((funds as any).tradesCountINR) || 0}
          note={executionMode === "LIVE" ? "LIVE — Angel One account" : "PAPER account"}
        />

        {/* Top 4 Financial Metric Cards */}
        {(() => {
          const inrFxRate = funds?.inrRate || 95.613964;
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              
              {/* 1. Available Cash Margin */}
              <div style={{ background: "linear-gradient(145deg, #0f172a 0%, #0a1120 100%)", border: "1px solid rgba(56, 189, 248, 0.25)", borderRadius: 14, padding: "16px 18px", boxShadow: "0 4px 20px rgba(0,0,0,0.35)", position: "relative", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(56, 189, 248, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Wallet size={16} color="#38bdf8" />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Available Balance</span>
                  </div>
                  <button
                    onClick={() => handleAddPaperFunds(100000)}
                    disabled={depositing}
                    style={{ background: "rgba(56, 189, 248, 0.12)", border: "1px solid rgba(56, 189, 248, 0.3)", color: "#38bdf8", padding: "4px 9px", borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                    title="Add ₹1,00,000 Paper Trading Margin"
                  >
                    {depositing ? "Adding..." : "+ Add ₹1L Cash"}
                  </button>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace", marginTop: 10, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span>₹{(funds?.availableCashINR ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 700 }}>(${(((funds?.availableCashINR ?? 0) / inrFxRate)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={12} color="#34d399" />
                  <span>Ready for new option &amp; stock orders</span>
                </div>
              </div>

              {/* 2. Invested in Trades */}
              <div style={{ background: "linear-gradient(145deg, #0f172a 0%, #0a1120 100%)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: 14, padding: "16px 18px", boxShadow: "0 4px 20px rgba(0,0,0,0.35)", position: "relative", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(245, 158, 11, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Layers size={16} color="#fbbf24" />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Invested Capital</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", background: "rgba(245, 158, 11, 0.12)", padding: "2px 8px", borderRadius: 6 }}>
                    {positions.length} Positions Active
                  </span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#fbbf24", fontFamily: "monospace", marginTop: 10, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span>₹{(funds?.investedAmountINR ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span style={{ fontSize: 13, color: "#f59e0b", opacity: 0.85, fontWeight: 700 }}>(${(((funds?.investedAmountINR ?? 0) / inrFxRate)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                  Total Margin: ₹{(funds?.totalEquityINR ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${(((funds?.totalEquityINR ?? 0) / inrFxRate)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </div>
              </div>

              {/* 3. Today's Profit / Loss */}
              {(() => {
                const todayP = funds?.todayPnlINR ?? 0;
                const isPos = todayP >= 0;
                return (
                  <div style={{ background: "linear-gradient(145deg, #0f172a 0%, #0a1120 100%)", border: `1px solid ${isPos ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`, borderRadius: 14, padding: "16px 18px", boxShadow: "0 4px 20px rgba(0,0,0,0.35)", position: "relative", overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: isPos ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {isPos ? <TrendingUp size={16} color="#34d399" /> : <TrendingDown size={16} color="#f87171" />}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Today's P&amp;L</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: isPos ? "#34d399" : "#f87171", background: isPos ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)", padding: "2px 8px", borderRadius: 6 }}>
                        Live Today
                      </span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: isPos ? "#10b981" : "#ef4444", fontFamily: "monospace", marginTop: 10, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span>{isPos ? "+" : ""}₹{todayP.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span style={{ fontSize: 13, opacity: 0.85, fontWeight: 700 }}>({isPos ? "+" : ""}${((todayP / inrFxRate)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                      Unrealized Live Floating: ₹{(funds?.unrealizedPnlINR ?? 0).toLocaleString("en-IN")} (${(((funds?.unrealizedPnlINR ?? 0) / inrFxRate)).toFixed(2)})
                    </div>
                  </div>
                );
              })()}

              {/* 4. Total All-Time Profit */}
              {(() => {
                // Net of charges, like Today's P&L. It showed the gross ledger
                // figure while Today was net, so the tiles didn't compare.
                const grossP = funds?.realizedPnlINR ?? 0;
                const totP = funds?.cumulativeRealizedNetPnlINR ?? grossP;
                const chargesP = grossP - totP;
                const settledCount = funds?.closedTradesCount ?? closedTrades.length;
                const isPos = totP >= 0;
                return (
                  <div style={{ background: "linear-gradient(145deg, #0f172a 0%, #0a1120 100%)", border: `1px solid ${isPos ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`, borderRadius: 14, padding: "16px 18px", boxShadow: "0 4px 20px rgba(0,0,0,0.35)", position: "relative", overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(16, 185, 129, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Award size={16} color="#34d399" />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Realized Profit</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#38bdf8", background: "rgba(56, 189, 248, 0.12)", padding: "2px 8px", borderRadius: 6 }}>
                        {settledCount} Trades Settled
                      </span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: isPos ? "#10b981" : "#ef4444", fontFamily: "monospace", marginTop: 10, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span>{isPos ? "+" : ""}₹{totP.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span style={{ fontSize: 13, opacity: 0.85, fontWeight: 700 }}>({isPos ? "+" : ""}${((totP / inrFxRate)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                      Net of charges · Gross ₹{grossP.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} − Charges ₹{chargesP.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                );
              })()}

            </div>
          );
        })()}

        {/* AI Auto-Pilot Safety & Control Strip */}
        <div style={{
          marginTop: 12,
          background: autoTradeEnabled
            ? "linear-gradient(90deg, rgba(16, 185, 129, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%)"
            : "linear-gradient(90deg, rgba(100, 116, 139, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%)",
          border: `1px solid ${autoTradeEnabled ? "rgba(16, 185, 129, 0.4)" : "rgba(100, 116, 139, 0.3)"}`,
          borderRadius: 12,
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 12, height: 12, borderRadius: "50%",
              background: autoTradeEnabled ? "#10b981" : "#64748b",
              boxShadow: autoTradeEnabled ? "0 0 12px #10b981" : "none",
              animation: autoTradeEnabled ? "pulse 2s infinite" : "none",
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: autoTradeEnabled ? "#34d399" : "#cbd5e1", display: "flex", alignItems: "center", gap: 8 }}>
                <span>{autoTradeEnabled ? "🤖 AI Auto-Trader is Active (Default: ON)" : "⏸️ AI Auto-Trader is Paused"}</span>
                <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.08)", color: "#94a3b8", fontWeight: 600 }}>
                  Capital Safety Guard Active
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                {autoTradeEnabled
                  ? "The AI automatically scans NIFTY/BANKNIFTY every 10 seconds, selects low-risk entries, and guards your capital with automated stop-loss protection."
                  : "Automatic trade execution is paused. You can click Resume Auto-Trade to let the AI resume autonomous trading."}
              </div>
            </div>
          </div>
          <button
            onClick={handleToggleAutoTrade}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 16px",
              borderRadius: 8,
              border: autoTradeEnabled ? "1px solid rgba(239, 68, 68, 0.4)" : "none",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 12,
              background: autoTradeEnabled ? "rgba(239, 68, 68, 0.2)" : "#10b981",
              color: autoTradeEnabled ? "#f87171" : "#fff",
              transition: "all 0.15s",
            }}
          >
            {autoTradeEnabled ? <Square size={13} fill="#f87171" /> : <Play size={13} fill="#fff" />}
            <span>{autoTradeEnabled ? "Pause Auto-Trade" : "Resume Auto-Trade"}</span>
          </button>
        </div>
      </div>

      {/* ─── 1.5. HOLIDAY & MARKET CLOSED COMPREHENSIVE ALERT BANNER ─── */}
      {marketSession && !marketSession.isOpen && (
        <div
          style={{
            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(239, 68, 68, 0.1) 100%)",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            borderRadius: 14,
            padding: "16px 20px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            boxShadow: "0 4px 24px rgba(0, 0, 0, 0.35)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 280, flex: 1 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                background: "rgba(245, 158, 11, 0.2)",
                border: "1px solid rgba(245, 158, 11, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#f59e0b",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={24} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 900, color: "#ffffff", letterSpacing: "-0.01em" }}>
                  {marketSession.isHoliday ? "🇮🇳 INDIAN EXCHANGE HOLIDAY TODAY" : "🇮🇳 INDIAN MARKET CLOSED TODAY"}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: marketSession.isHoliday ? "rgba(239, 68, 68, 0.25)" : "rgba(245, 158, 11, 0.25)",
                    color: marketSession.isHoliday ? "#fca5a5" : "#fcd34d",
                    border: `1px solid ${marketSession.isHoliday ? "rgba(239, 68, 68, 0.4)" : "rgba(245, 158, 11, 0.4)"}`,
                    textTransform: "uppercase",
                  }}
                >
                  {marketSession.statusBadge || (marketSession.isHoliday ? "EXCHANGE HOLIDAY" : "WEEKEND")}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4, lineHeight: 1.5 }}>
                {marketSession.alertMessage || marketSession.reason}
                <span style={{ color: "#94a3b8", display: "block", marginTop: 2 }}>
                  All prices, PCR, and option chain premiums are <strong>frozen at the previous close</strong>. Real-time tick simulations and order execution will resume when the exchange opens.
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "rgba(0, 0, 0, 0.35)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 10,
              padding: "10px 14px",
            }}
          >
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Next Session</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#38bdf8", marginTop: 2 }}>
                {marketSession.nextSessionOpen || "Monday at 09:15 IST"}
              </div>
            </div>
            <div style={{ width: 1, height: 28, background: "rgba(255, 255, 255, 0.12)" }} />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Auto-Trader</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#34d399", marginTop: 2 }}>
                SAFE / STANDBY
              </div>
            </div>
          </div>
        </div>
      )}

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
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>NIFTY 50 (NSE)</span>
              {marketSession && !marketSession.isOpen && (
                <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                  FROZEN (CLOSE)
                </span>
              )}
            </div>
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
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>BANKNIFTY (NSE)</span>
              {marketSession && !marketSession.isOpen && (
                <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                  FROZEN (CLOSE)
                </span>
              )}
            </div>
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
              {regimeAnalysis?.regime || "SIDEWAYS"}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginTop: 6 }}>
            Recommended: {regimeAnalysis?.recommendedStrategies?.[0] || "NONE"}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
            ADX: {regimeAnalysis?.adx ?? 0} • Bandwidth: {regimeAnalysis?.bollingerBandwidthPct ?? 0}% • Conf: {regimeAnalysis?.confidence ?? 0}%
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
              PF: {analytics?.profitFactor ? Number(analytics.profitFactor).toFixed(2) : "0.00"}
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#10b981", marginTop: 4 }}>
            {analytics?.winRate !== undefined ? `${analytics.winRate}%` : "0.0%"}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginTop: 6 }}>
            <span>Trades: {analytics?.totalTrades ?? 0}</span>
            <span>Net: {analytics?.netPnL !== undefined ? (analytics.netPnL >= 0 ? `+₹${analytics.netPnL.toLocaleString("en-IN")}` : `-₹${Math.abs(analytics.netPnL).toLocaleString("en-IN")}`) : "₹0"}</span>
            <span>Max DD: {analytics?.maxDrawdown || "0.0%"}</span>
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
          { key: "POSITIONS", label: `Positions (${positions.length}) • History (${closedTrades.length})`, icon: Layers },
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

      {/* TAB 3: POSITIONS & CLOSED TRADE HISTORY */}
      {activeTab === "POSITIONS" && (
        <div style={{ background: "#0a1120", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
          {/* Sub-Header with Segmented Control & Timeframe Filter */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
            <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 4, gap: 4 }}>
              <button
                onClick={() => setPositionSubTab("OPEN")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  borderRadius: 7,
                  border: "none",
                  background: positionSubTab === "OPEN" ? "#2563eb" : "transparent",
                  color: positionSubTab === "OPEN" ? "#fff" : "#94a3b8",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <Layers size={14} />
                <span>Active Open Positions</span>
                <span
                  style={{
                    background: positionSubTab === "OPEN" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
                    padding: "2px 7px",
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {positions.length}
                </span>
              </button>

              <button
                onClick={() => setPositionSubTab("CLOSED")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  borderRadius: 7,
                  border: "none",
                  background: positionSubTab === "CLOSED" ? "#2563eb" : "transparent",
                  color: positionSubTab === "CLOSED" ? "#fff" : "#94a3b8",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <History size={14} />
                <span>Closed Order History</span>
                <span
                  style={{
                    background: positionSubTab === "CLOSED" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
                    padding: "2px 7px",
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {closedTrades.length}
                </span>
              </button>
            </div>

            {positionSubTab === "CLOSED" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Timeframe:</span>
                <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 3, gap: 2 }}>
                  {[
                    { id: "daily", label: "Today" },
                    { id: "weekly", label: "7 Days" },
                    { id: "monthly", label: "30 Days" },
                    { id: "all", label: "All Records" },
                  ].map((tf) => (
                    <button
                      key={tf.id}
                      onClick={() => setHistoryTimeframe(tf.id as any)}
                      style={{
                        background: historyTimeframe === tf.id ? "#3b82f6" : "transparent",
                        color: historyTimeframe === tf.id ? "#fff" : "#94a3b8",
                        border: "none",
                        padding: "5px 11px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SUB-VIEW 1: ACTIVE OPEN POSITIONS */}
          {positionSubTab === "OPEN" && (
            <div>
              {positions.length === 0 ? (
                <div style={{ padding: "48px 20px", textAlign: "center", color: "#94a3b8" }}>
                  <div style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                    <CheckCircle2 size={24} color="#10b981" />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>No Open Derivatives Positions</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, maxWidth: 480, margin: "6px auto 0", lineHeight: 1.5 }}>
                    {closedTrades.length > 0
                      ? `All positions from today have reached Target TP or Stop-Loss and exited. ${closedTrades.length} trades settled with profit safely banked in cash.`
                      : "Execute a strategy from the Strategy Deck or turn on Auto-Trade to enter positions."}
                  </div>
                  {closedTrades.length > 0 && (
                    <div style={{ marginTop: 18 }}>
                      <button
                        onClick={() => setPositionSubTab("CLOSED")}
                        style={{
                          background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                          color: "#fff",
                          border: "none",
                          padding: "9px 20px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
                        }}
                      >
                        <History size={14} />
                        View Closed Order History ({closedTrades.length} Trades Settled) →
                      </button>
                    </div>
                  )}
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
                            {pos.side} • {pos.remainingQty ?? pos.quantity} QTY
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: pos.targetStatus === "HIT" ? "rgba(16,185,129,0.2)" : "rgba(148,163,184,0.1)",
                              color: pos.targetStatus === "HIT" ? "#34d399" : "#94a3b8",
                            }}
                          >
                            Target: {pos.targetStatus === "HIT" ? "HIT" : "PENDING"}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: pos.stopStatus === "HIT" ? "rgba(239,68,68,0.2)" : "rgba(148,163,184,0.1)",
                              color: pos.stopStatus === "HIT" ? "#f87171" : "#94a3b8",
                            }}
                          >
                            Stop: {pos.stopStatus === "HIT" ? "HIT" : "PENDING"}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: pos.autoPilotStatus === "EXIT_PENDING" ? "rgba(245,158,11,0.2)" : "rgba(56,189,248,0.2)",
                              color: pos.autoPilotStatus === "EXIT_PENDING" ? "#fbbf24" : "#38bdf8",
                            }}
                          >
                            Auto-Pilot: {pos.autoPilotStatus || "ARMED"}
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

                        {pos.positionStatus === "CLOSED" ? (
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8" }}>EXIT FILLED</span>
                        ) : pos.autoPilotStatus === "EXIT_PENDING" ? (
                          <span
                            style={{
                              padding: "6px 12px",
                              background: "rgba(245,158,11,0.15)",
                              border: "1px solid rgba(245,158,11,0.4)",
                              color: "#fbbf24",
                              borderRadius: 6,
                              fontWeight: 800,
                              fontSize: 11,
                            }}
                          >
                            EXIT PENDING
                          </span>
                        ) : (
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
                            title="Square off position immediately"
                          >
                            EXIT AVAILABLE
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUB-VIEW 2: CLOSED ORDER HISTORY LEDGER */}
          {positionSubTab === "CLOSED" && (
            <div>
              {/* Scorecard Summary Bar */}
              {(() => {
                const totalRealized = closedTrades.reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
                const totalNet = closedTrades.reduce((acc, t) => acc + (t.netPnl ?? (t.realizedPnl - (t.charges || 0))), 0);
                const totalCharges = closedTrades.reduce((acc, t) => acc + (t.charges || 0), 0);
                const wins = closedTrades.filter((t) => (t.realizedPnl || 0) > 0).length;
                const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(1) : "0.0";

                return (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Total Closed Orders</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginTop: 4 }}>
                        {closedTrades.length} Trades
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{wins} Won / {closedTrades.length - wins} Lost</div>
                    </div>

                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Win Rate</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: Number(winRate) >= 50 ? "#10b981" : "#38bdf8", marginTop: 4 }}>
                        {winRate}%
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Based on realized profit</div>
                    </div>

                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Gross Realized P&L</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: totalRealized >= 0 ? "#10b981" : "#ef4444", marginTop: 4 }}>
                        {totalRealized >= 0 ? "+" : ""}{formatINR(totalRealized)}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Before STT & Charges</div>
                    </div>

                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Net Realized P&L</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: totalNet >= 0 ? "#10b981" : "#ef4444", marginTop: 4 }}>
                        {totalNet >= 0 ? "+" : ""}{formatINR(totalNet)}
                      </div>
                      <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>Est. Charges: ~{formatINR(totalCharges)}</div>
                    </div>
                  </div>
                );
              })()}

              {closedTrades.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
                  <History size={36} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                  <div>No closed Indian market orders found for this timeframe.</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Orders squared off manually or triggered by SL/TP will appear here.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {closedTrades.map((t) => {
                    const isProfit = (t.realizedPnl || 0) >= 0;
                    const closedTime = t.closedAt ? new Date(t.closedAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    }) + " IST" : "N/A";

                    return (
                      <div
                        key={t.tradeId}
                        style={{
                          background: "rgba(255,255,255,0.02)",
                          border: `1px solid ${isProfit ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)"}`,
                          borderRadius: 10,
                          padding: "14px 16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 12,
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ flex: "1 1 320px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{t.symbol}</span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: t.side === "BUY" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                                color: t.side === "BUY" ? "#34d399" : "#f87171",
                              }}
                            >
                              {t.side} • {t.quantity} QTY
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "rgba(59,130,246,0.15)",
                                color: "#60a5fa",
                              }}
                            >
                              {t.productType || "MIS"}
                            </span>
                            {t.strategy && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "rgba(255,255,255,0.05)",
                                  color: "#94a3b8",
                                }}
                              >
                                {t.strategy}
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "rgba(100,116,139,0.2)",
                                color: "#94a3b8",
                              }}
                            >
                              CLOSED
                            </span>
                          </div>

                          <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 6 }}>
                            Entry: <b style={{ color: "#fff" }}>₹{t.entryPrice?.toFixed(2) || "0.00"}</b> → Exit: <b style={{ color: "#fff" }}>₹{t.exitPrice?.toFixed(2) || "0.00"}</b>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "#64748b", marginTop: 4, flexWrap: "wrap" }}>
                            <span>Closed: <b style={{ color: "#94a3b8" }}>{closedTime}</b></span>
                            <span>•</span>
                            <span style={{ color: isProfit ? "#34d399" : "#f87171" }}>
                              Exit Reason: <b>{t.exitReason || "SQUARED_OFF"}</b>
                            </span>
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: isProfit ? "#10b981" : "#ef4444" }}>
                            {isProfit ? "+" : ""}{formatINR(t.realizedPnl || 0)}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: isProfit ? "#34d399" : "#f87171" }}>
                            {isProfit ? "+" : ""}{t.realizedPnlPct ? `${t.realizedPnlPct.toFixed(2)}%` : "0.00%"}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                            Est. Charges: ~{formatINR(t.charges || 20)} • Net: <b style={{ color: (t.netPnl ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>{formatINR(t.netPnl || 0)}</b>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
              { label: "Total Completed Trades", val: analytics?.totalTrades || 0 },
              { label: "Win Rate", val: `${analytics?.winRate || 0}%`, color: "#10b981" },
              { label: "Profit Factor", val: analytics?.profitFactor || 0, color: "#38bdf8" },
              { label: "Net Realized P&L", val: `₹${analytics?.netPnL?.toLocaleString("en-IN") || "0"}`, color: "#10b981" },
              { label: "Average Winner", val: `₹${analytics?.avgWinner || 0}` },
              { label: "Average Loser", val: `₹${analytics?.avgLoser || 0}` },
              { label: "Max Drawdown", val: analytics?.maxDrawdown || "0%", color: "#f87171" },
              { label: "Expectancy", val: analytics?.expectancy || "₹0/trade" },
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
