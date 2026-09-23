import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { INITIAL_SUMMARY, useDashboardStore } from "../../store/useDashboardStore";
import { useAppStore, type Mode, type AccountType } from "../../store/useAppStore";
import { formatCurrency, formatInrWithUsd, formatUsdWithInr } from "../../lib/currency";
import { hardReset } from "../../lib/api";
import { Menu, Settings, Wifi, WifiOff, RotateCcw, AlertOctagon, ShieldAlert } from "lucide-react";
import { LiveGovernanceModal } from "./LiveGovernanceModal";
import { INDIAN_LIVE_AVAILABLE, INDIAN_LIVE_UNAVAILABLE_MESSAGE } from "../../lib/indianBroker";

const MODES: { value: Mode; label: string; color: string }[] = [
  { value: "PAPER",    label: "Paper",    color: "#10b981" },
  { value: "LIVE",     label: "Live",     color: "#ef4444" },
  { value: "BACKTEST", label: "Backtest", color: "#f59e0b" },
];

const ACCOUNT_TYPES: { value: AccountType; label: string; color: string }[] = [
  { value: "SPOT",    label: "Spot",    color: "#38bdf8" },
  { value: "FUTURES", label: "Futures", color: "#f59e0b" },
  { value: "BOTH",    label: "Both",    color: "#22c55e" },
];

interface Props { onMenuClick: () => void; }

interface IndianFundsState {
  accountEquityINR?: number;
  availableCashINR: number;
  investedAmountINR: number;
  usedMarginINR?: number;
  availableMarginINR?: number;
  openExposureINR?: number;
  totalEquityINR: number;
  unrealizedPnlINR: number;
  realizedPnlINR: number;
  cumulativeRealizedPnlINR?: number;
  cumulativeRealizedNetPnlINR?: number;
  todayPnlINR: number;
  todayNetPnlINR?: number;
  todayRealizedPnlINR?: number;
  todayUnrealizedPnlINR?: number;
  todayChargesINR?: number;
  winRate: number;
  closedTradesCount?: number;
  openTradesCount?: number;
  autoTradeEnabled: boolean;
  autoPilotMode?: string;
}

function getIndianSessionStatus(): { label: string; color: string; tooltip: string } {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 3600000 * 5.5);
  const day = ist.getDay();
  const timeNum = ist.getHours() * 100 + ist.getMinutes();

  if (day === 0 || day === 6) {
    return { label: "NSE CLOSED (WEEKEND)", color: "#94a3b8", tooltip: "Indian Exchanges Closed on Weekends. Next Session: Mon 09:15 IST." };
  }
  if (timeNum >= 900 && timeNum < 915) {
    return { label: "NSE PRE-OPEN", color: "#f59e0b", tooltip: "Pre-Open Order Collection & Price Discovery (09:00 - 09:15 IST)" };
  }
  if (timeNum >= 915 && timeNum < 1515) {
    return { label: "NSE OPEN (LIVE)", color: "#10b981", tooltip: "Continuous Regular Market Session (09:15 - 15:30 IST)" };
  }
  if (timeNum >= 1515 && timeNum < 1530) {
    return { label: "MIS SQUARE-OFF", color: "#f97316", tooltip: "Intraday MIS Auto-Square-Off in progress (15:15 - 15:30 IST)" };
  }
  return { label: "NSE CLOSED", color: "#64748b", tooltip: "Regular Trading Closed. Post-market settlement completed. Next Session: 09:15 IST." };
}

export default function TopBar({ onMenuClick }: Props) {
  const { mode, setMode, indianMode, setIndianMode, connected, accountType, setAccountType, activeMarket, setActiveMarket, execMode } = useAppStore();
  const { userId } = useAppStore();
  const { currencyMode, fetchDashboard } = useDashboardStore();
  const summary = useDashboardStore((s) => s.summary) ?? INITIAL_SUMMARY;
  const domains = useDashboardStore((s) => s.domains);
  const navigate = useNavigate();
  const location = useLocation();

  const isGlobal = activeMarket === "GLOBAL" || location.pathname.startsWith("/global");
  const isIndian = !isGlobal && (activeMarket === "INDIA" || location.pathname.startsWith("/india") || location.pathname.startsWith("/indian-market"));
  const isCrypto = !isGlobal && !isIndian;
  const [indianFunds, setIndianFunds] = useState<IndianFundsState | null>(null);

  // Emergency Stop & Reset Modals
  // Real Angel One connection + price-feed state for the broker badge.
  const [brokerStatus, setBrokerStatus] = useState<{ connected: boolean; feedLive: boolean; error?: string } | null>(null);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [emergencyStatus, setEmergencyStatus] = useState<string | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [showGovernanceModal, setShowGovernanceModal] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState("");

  const sessionInfo = getIndianSessionStatus();

  useEffect(() => {
    if (!userId) return;
    const go = () => fetchDashboard(userId, accountType).catch(() => {});
    go();
    const t = setInterval(go, 15000);
    return () => clearInterval(t);
  }, [userId, accountType]);

  useEffect(() => {
    if (!isIndian) return;
    let alive = true;
    const load = () => fetch("/api/indian-market/broker/status")
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.success) return;
        setBrokerStatus({ connected: !!d.broker?.connected, feedLive: d.priceFeed?.source === "ANGEL_ONE", error: d.broker?.lastError || d.priceFeed?.lastError });
      })
      .catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [isIndian]);

  useEffect(() => {
    if (!isIndian && !isGlobal) return;
    const fetchIndian = async () => {
      try {
        const query = new URLSearchParams();
        if (userId) query.set("userId", userId);
        query.set("mode", indianMode);
        const res = await fetch(`/api/indian-market/funds?${query.toString()}`);
        const json = await res.json();
        if (json.success) setIndianFunds(json);
      } catch {}
    };
    fetchIndian();
    const t = setInterval(fetchIndian, 6000);
    return () => clearInterval(t);
  }, [isIndian, isGlobal, userId, indianMode]);

  const inrRate = summary.inrRate || 85.0;
  // The Indian view has its own PAPER/LIVE choice; it never shows the crypto mode.
  const shownMode = isIndian ? indianMode : mode;
  const modeOptions = isIndian ? MODES.filter((m) => m.value !== "BACKTEST") : MODES;
  const activeMode = MODES.find((m) => m.value === shownMode) ?? MODES[0];
  const indianWinRate = indianFunds?.winRate ?? domains.indianStock.realizedWinRate ?? domains.indianStock.winRate ?? 0;
  const indianTradesCount = indianFunds?.closedTradesCount ?? domains.indianStock.closedTrades ?? 0;

  // ── Profit & Loss Percentage Utility ──
  const computePnLPct = (pnl: number, currentEquity: number): number => {
    if (!pnl || !isFinite(pnl)) return 0;
    const startingEquity = currentEquity - pnl;
    const base = startingEquity > 0 ? startingEquity : (currentEquity > 0 ? currentEquity : 0);
    if (base <= 0) return 0;
    const pct = (pnl / base) * 100;
    return Math.max(-100, Math.min(9999, pct));
  };

  // ── Crypto Market P&L Metrics ──
  const cryptoNetPnL = accountType === "SPOT"
    ? (domains.crypto.netPnL?.spot ?? domains.crypto.netPnL?.total ?? 0)
    : accountType === "FUTURES"
      ? (domains.crypto.netPnL?.futures ?? domains.crypto.netPnL?.total ?? 0)
      : (domains.crypto.netPnL?.total ?? 0);
  const cryptoDailyPnL = domains.crypto.dailyPnL || 0;
  const cryptoEquity = domains.crypto.totalEquity || 0;
  const cryptoNetPnLPct = computePnLPct(cryptoNetPnL, cryptoEquity);
  const cryptoDailyPnLPct = computePnLPct(cryptoDailyPnL, cryptoEquity);

  // ── Indian Market P&L Metrics ──
  const indianEquity = (indianFunds?.accountEquityINR && indianFunds.accountEquityINR > 0)
    ? indianFunds.accountEquityINR
    : ((indianFunds?.totalEquityINR && indianFunds.totalEquityINR > 0)
      ? indianFunds.totalEquityINR
      : (domains.indianStock.totalEquity || indianFunds?.accountEquityINR || 0));
  const indianTodayPnL = indianFunds?.todayNetPnlINR ?? indianFunds?.todayPnlINR ?? domains.indianStock.dailyPnL ?? 0;
  const indianNetPnL = indianFunds?.cumulativeRealizedNetPnlINR ?? indianFunds?.cumulativeRealizedPnlINR ?? domains.indianStock.netPnL?.total ?? domains.indianStock.totalAllTimePnL ?? 0;
  const indianTodayPnLPct = computePnLPct(indianTodayPnL, indianEquity);
  const indianNetPnLPct = computePnLPct(indianNetPnL, indianEquity);

  // ── Global Aggregated Market P&L Metrics ──
  const globalEquity = cryptoEquity + (indianEquity / inrRate);
  const globalDailyPnL = cryptoDailyPnL + (indianTodayPnL / inrRate);
  const globalNetPnL = cryptoNetPnL + (indianNetPnL / inrRate);
  const globalNetPnLPct = computePnLPct(globalNetPnL, globalEquity);
  const globalDailyPnLPct = computePnLPct(globalDailyPnL, globalEquity);
  const indianDailyPnLPct = computePnLPct(indianTodayPnL, indianEquity);

  const handleSwitchMarket = (target: "INDIA" | "CRYPTO" | "GLOBAL") => {
    setActiveMarket(target);
    if (target === "GLOBAL") {
      if (!location.pathname.startsWith("/global")) {
        navigate("/global");
      }
    } else if (target === "INDIA") {
      if (!location.pathname.startsWith("/india") && !location.pathname.startsWith("/indian-market")) {
        navigate("/india");
      }
    } else {
      if (!location.pathname.startsWith("/crypto") && !location.pathname.startsWith("/futures") && !location.pathname.startsWith("/spot") && location.pathname !== "/") {
        navigate("/spot");
      }
    }
  };

  const handleEmergencyStop = async () => {
    setEmergencyLoading(true);
    try {
      const res = await fetch("/api/indian-market/kill-switch/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual Emergency Stop triggered from TopBar interface." }),
      });
      const data = await res.json();
      if (data.success) {
        setEmergencyStatus("EMERGENCY STOP ACTIVATED. All trading disabled.");
        setTimeout(() => {
          setEmergencyModalOpen(false);
          setEmergencyStatus(null);
        }, 1800);
      } else {
        alert("Emergency stop failed: " + (data.error || "Unknown error"));
      }
    } catch (e: any) {
      alert("Emergency stop failed: " + (e?.message || e));
    } finally {
      setEmergencyLoading(false);
    }
  };

  const handleReset = async () => {
    setResetLoading(true);
    try {
      await hardReset();
      await useAppStore.getState().boot();
      if (userId) await fetchDashboard(userId, accountType);
      setResetSuccess("Reset successful! All old data purged.");
      setTimeout(() => {
        setResetSuccess("");
        setResetModalOpen(false);
      }, 1400);
    } catch (err: any) {
      alert("Reset failed: " + (err?.message || err));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <header style={{ height: 50, minHeight: 50, maxHeight: 50, background: "linear-gradient(180deg, #131c31 0%, #0d1527 100%)", borderBottom: "1px solid rgba(59, 130, 246, 0.3)", boxShadow: "0 4px 16px rgba(0,0,0,0.35)", display: "flex", flexWrap: "nowrap", alignItems: "center", paddingLeft: 12, paddingRight: 12, gap: 10, flexShrink: 0, zIndex: 20, overflowX: "auto", scrollbarWidth: "none" }}>
      <style>{`
        @keyframes both-channel-blink {
          0%, 100% {
            background-color: rgba(34, 197, 94, 0.32) !important;
            border-color: rgba(34, 197, 94, 0.8) !important;
            color: #86efac !important;
            box-shadow: 0 0 8px rgba(34, 197, 94, 0.45) !important;
            opacity: 1;
          }
          50% {
            background-color: rgba(34, 197, 94, 0.1) !important;
            border-color: rgba(34, 197, 94, 0.35) !important;
            color: #4ade80 !important;
            box-shadow: none !important;
            opacity: 0.65;
          }
        }
        .both-mode-blinking {
          animation: both-channel-blink 1.25s ease-in-out infinite !important;
        }
      `}</style>

      {/* Hamburger — mobile */}
      <button
        onClick={onMenuClick}
        className="flex lg:hidden"
        style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 4, borderRadius: 6, flexShrink: 0 }}
      >
        <Menu size={18} />
      </button>

      {/* Brand & Market Switcher */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: "#f8fafc", letterSpacing: "0.08em", textTransform: "uppercase" }} className="hidden sm:inline">
          AALGOLAKSHMI
        </span>

        {/* 🌐 PROMINENT 3-WAY MARKET SWITCHER: INDIA | CRYPTO | GLOBAL */}
        <div style={{ display: "flex", alignItems: "center", background: "rgba(15, 23, 42, 0.85)", borderRadius: 7, padding: "2px", border: "1px solid rgba(255, 255, 255, 0.12)", gap: 2 }}>
          <button
            onClick={() => handleSwitchMarket("INDIA")}
            title="Switch to Indian Market (NSE / BSE / Angel One / ₹ INR)"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 9px", borderRadius: 5, border: "none", cursor: "pointer",
              background: isIndian ? "linear-gradient(135deg, #ea580c, #c2410c)" : "transparent",
              color: isIndian ? "#ffffff" : "#94a3b8",
              fontWeight: 800, fontSize: 10.5, letterSpacing: "0.05em",
              boxShadow: isIndian ? "0 2px 8px rgba(234, 88, 12, 0.5)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <span>🇮🇳</span>
            <span>INDIA</span>
          </button>
          <button
            onClick={() => handleSwitchMarket("CRYPTO")}
            title="Switch to Crypto Market (Binance Spot & USD-M Futures / $ USDT)"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 9px", borderRadius: 5, border: "none", cursor: "pointer",
              background: isCrypto ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "transparent",
              color: isCrypto ? "#ffffff" : "#94a3b8",
              fontWeight: 800, fontSize: 10.5, letterSpacing: "0.05em",
              boxShadow: isCrypto ? "0 2px 8px rgba(37, 99, 235, 0.5)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <span>₿</span>
            <span>CRYPTO</span>
          </button>
          <button
            onClick={() => handleSwitchMarket("GLOBAL")}
            title="Switch to Global Aggregation (Consolidated Display Only)"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 9px", borderRadius: 5, border: "none", cursor: "pointer",
              background: isGlobal ? "linear-gradient(135deg, #059669, #047857)" : "transparent",
              color: isGlobal ? "#ffffff" : "#94a3b8",
              fontWeight: 800, fontSize: 10.5, letterSpacing: "0.05em",
              boxShadow: isGlobal ? "0 2px 8px rgba(5, 150, 105, 0.5)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <span>🌐</span>
            <span>GLOBAL</span>
          </button>
        </div>
      </div>

      {/* Market Status Badge (IST / 24/7) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {isIndian ? (
          <div
            title={sessionInfo.tooltip}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 8px", borderRadius: 6,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 9.5, fontWeight: 800, color: sessionInfo.color, letterSpacing: "0.05em",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: sessionInfo.color, display: "inline-block" }} />
            <span>{sessionInfo.label}</span>
          </div>
        ) : (
          <div
            title="Binance 24/7 Real-Time Global Market Session"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 8px", borderRadius: 6,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 9.5, fontWeight: 800, color: "#10b981", letterSpacing: "0.05em",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            <span>24/7 LIVE</span>
          </div>
        )}
      </div>

      {/* Connection badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, padding: "3px 7px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {connected
          ? <Wifi size={12} style={{ color: "#10b981" }} />
          : <WifiOff size={12} style={{ color: "#ef4444" }} />}
        <span style={{ fontSize: 9.5, fontWeight: 800, color: connected ? "#10b981" : "#ef4444", letterSpacing: "0.05em", textTransform: "uppercase" }} className="hidden sm:block">
          {connected ? "Online" : "Offline"}
        </span>
      </div>

      {/* Execution Mode (Paper / Live / Backtest) */}
      <div style={{
        display: "flex", alignItems: "center",
        background: "rgba(15, 23, 42, 0.85)",
        borderRadius: 7, padding: "2px",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        gap: 2, flexShrink: 0
      }} title="Execution Engine Mode">
        {modeOptions.map((m) => {
          const active = shownMode === m.value;
          let activeBg = "linear-gradient(135deg, #059669, #047857)";
          let shadow = "0 2px 8px rgba(5, 150, 105, 0.4)";
          if (m.value === "LIVE") {
            activeBg = "linear-gradient(135deg, #dc2626, #b91c1c)";
            shadow = "0 2px 8px rgba(220, 38, 38, 0.4)";
          } else if (m.value === "BACKTEST") {
            activeBg = "linear-gradient(135deg, #d97706, #b45309)";
            shadow = "0 2px 8px rgba(217, 119, 6, 0.4)";
          }
          return (
            <button
              key={m.value}
              onClick={() => {
                if (isIndian) {
                  if (m.value === "LIVE" && !INDIAN_LIVE_AVAILABLE) {
                    window.alert(INDIAN_LIVE_UNAVAILABLE_MESSAGE);
                    return;
                  }
                  if (m.value === "LIVE" && indianMode !== "LIVE") {
                    if (!window.confirm("⚠️ Switch the INDIAN market to LIVE?\n\nOrders will route to your authenticated Indian broker and use real money. Your crypto mode is not changed.\n\nContinue?")) return;
                  }
                  setIndianMode(m.value as "PAPER" | "LIVE");
                  return;
                }
                // Switching INTO live moves real money — make the user confirm.
                if (m.value === "LIVE" && mode !== "LIVE") {
                  if (!window.confirm("⚠️ Switch to LIVE trading?\n\nLIVE mode places REAL orders and can move REAL money on your Binance account. Your balances below will show your actual Binance wallet.\n\nContinue?")) return;
                }
                setMode(m.value);
                if (m.value === "LIVE") window.alert("🔴 LIVE mode is ON.\n\nOrders and withdrawals now use your real Binance account. Balances shown are live from Binance.");
                if (m.value === "BACKTEST") navigate("/backtest");
              }}
              style={{
                padding: "3px 8px", borderRadius: 5, border: "none", cursor: "pointer",
                background: active ? activeBg : "transparent",
                color: active ? "#ffffff" : "#94a3b8",
                fontWeight: 800, fontSize: 10, letterSpacing: "0.04em",
                textTransform: "uppercase",
                boxShadow: active ? shadow : "none",
                transition: "all 0.15s ease",
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* 🛡️ GAP #15 FIX: OOS Live Governance Button & Tracker */}
      <button
        onClick={() => setShowGovernanceModal(true)}
        title="View 13 Out-of-Sample (OOS) Criteria & Live Promotion Progress"
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "3px 9px", borderRadius: 6,
          border: "1px solid rgba(56, 189, 248, 0.35)",
          background: "rgba(56, 189, 248, 0.12)",
          color: "#38bdf8", fontSize: 10, fontWeight: 800,
          cursor: "pointer", letterSpacing: "0.03em",
          flexShrink: 0,
          whiteSpace: "nowrap",
          height: 24,
          transition: "all 0.15s ease",
        }}
      >
        <ShieldAlert size={12} style={{ flexShrink: 0 }} />
        <span style={{ whiteSpace: "nowrap" }}>OOS Gates</span>
      </button>

      {/* Market-Specific Account Mode Selector / Broker Tag */}
      {!isIndian ? (
        <div style={{
          display: "flex", alignItems: "center",
          background: "rgba(15, 23, 42, 0.85)",
          borderRadius: 7, padding: "2px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          gap: 2, flexShrink: 0
        }} title="Binance Crypto Account Type">
          {ACCOUNT_TYPES.map((a) => {
            const isDirectActive = accountType === a.value;
            const isBothMode = accountType === "BOTH";
            const isSpotOrFuturesInBoth = isBothMode && (a.value === "SPOT" || a.value === "FUTURES");

            let bg = "transparent";
            let textColor = "#94a3b8";
            let border = "1px solid transparent";
            let shadow: string | undefined;

            if (isSpotOrFuturesInBoth) {
              bg = "rgba(34, 197, 94, 0.22)";
              textColor = "#4ade80";
              border = "1px solid rgba(34, 197, 94, 0.6)";
              shadow = "0 0 6px rgba(34, 197, 94, 0.35)";
            } else if (isDirectActive) {
              if (a.value === "BOTH") {
                bg = "linear-gradient(135deg, #16a34a, #15803d)";
                textColor = "#ffffff";
                border = "1px solid #16a34a";
                shadow = "0 2px 8px rgba(22, 163, 74, 0.45)";
              } else if (a.value === "SPOT") {
                bg = "linear-gradient(135deg, #0284c7, #0369a1)";
                textColor = "#ffffff";
                border = "1px solid #0284c7";
                shadow = "0 2px 8px rgba(2, 132, 199, 0.45)";
              } else {
                bg = "linear-gradient(135deg, #d97706, #b45309)";
                textColor = "#ffffff";
                border = "1px solid #d97706";
                shadow = "0 2px 8px rgba(217, 119, 6, 0.45)";
              }
            }

            return (
              <button
                key={a.value}
                className={isSpotOrFuturesInBoth ? "both-mode-blinking" : undefined}
                onClick={() => {
                  setAccountType(a.value);
                  if (a.value === "SPOT") {
                    navigate("/spot");
                  } else if (a.value === "FUTURES") {
                    navigate("/futures");
                  } else {
                    navigate("/crypto#all");
                  }
                }}
                style={{
                  padding: "3px 8px", borderRadius: 5,
                  fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em",
                  border,
                  cursor: "pointer",
                  background: bg,
                  color: textColor,
                  boxShadow: shadow,
                  outline: "none",
                  transition: isSpotOrFuturesInBoth ? "none" : "all 0.15s ease",
                }}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <div style={{
            padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 800,
            background: "rgba(56,189,248,0.12)", color: "#38bdf8",
            border: "1px solid rgba(56,189,248,0.3)", letterSpacing: "0.04em",
            textTransform: "uppercase", whiteSpace: "nowrap"
          }} title={
            brokerStatus?.feedLive
              ? "Angel One connected (read-only): real NSE/BSE prices. Orders are not enabled — Indian trading is paper."
              : `Simulated prices — Angel One not connected${brokerStatus?.error ? `: ${brokerStatus.error}` : ""}`
          }>
            {INDIAN_LIVE_AVAILABLE ? "Angel / Kite" : brokerStatus?.feedLive ? "Angel One · Read-only" : "Simulated · No Broker"}
          </div>
        </div>
      )}

      {/* Metrics Bar */}
      {isIndian ? (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "nowrap", gap: 8, padding: "0 6px", flexShrink: 0 }} className="hidden lg:flex">
          <Metric
            label="Equity"
            value={formatInrWithUsd(indianEquity, inrRate, true)}
            color="#38bdf8"
            title={`Total Account Equity = ₹${indianEquity.toLocaleString("en-IN")} ($${(indianEquity / inrRate).toFixed(2)})`}
          />
          <Metric
            label="Cash"
            value={formatInrWithUsd(indianFunds?.availableCashINR ?? 0, inrRate, true)}
            color="#34d399"
            title={`Liquid Cash: ₹${(indianFunds?.availableCashINR ?? 0).toLocaleString("en-IN")}`}
          />
          <Metric
            label="Used Margin"
            value={formatInrWithUsd(indianFunds?.usedMarginINR ?? indianFunds?.investedAmountINR ?? 0, inrRate, true)}
            color="#f59e0b"
            title={`Margin Locked: ₹${(indianFunds?.usedMarginINR ?? indianFunds?.investedAmountINR ?? 0).toLocaleString("en-IN")}`}
          />
          <Metric
            label="Net P&L"
            value={`${indianNetPnL >= 0 ? "+" : ""}${formatInrWithUsd(indianNetPnL, inrRate, true)}`}
            pct={indianNetPnLPct}
            color={indianNetPnL >= 0 ? "#10b981" : "#ef4444"}
            title={`Cumulative Realized Net P&L: ₹${indianNetPnL.toLocaleString("en-IN")} (${indianNetPnLPct >= 0 ? "+" : ""}${indianNetPnLPct.toFixed(2)}%)`}
          />
          <Metric
            label="Today's P&L"
            value={`${indianTodayPnL >= 0 ? "+" : ""}${formatInrWithUsd(indianTodayPnL, inrRate, true)}`}
            pct={indianTodayPnLPct}
            color={indianTodayPnL >= 0 ? "#10b981" : "#ef4444"}
            title={`Today's Net Realized + Unrealized P&L: ₹${indianTodayPnL.toLocaleString("en-IN")} (${indianTodayPnLPct >= 0 ? "+" : ""}${indianTodayPnLPct.toFixed(2)}%)`}
          />
          <Metric
            label="Win Rate"
            value={`${indianWinRate % 1 === 0 ? indianWinRate.toFixed(0) : indianWinRate.toFixed(1)}%`}
            color={indianWinRate >= 50 ? "#10b981" : indianWinRate > 0 ? "#f59e0b" : "#94a3b8"}
            title={`Indian Derivatives Realized Win Rate: ${indianWinRate.toFixed(1)}% (${indianTradesCount} settled trade${indianTradesCount === 1 ? "" : "s"})`}
          />
          <Metric
            label="Auto-Pilot"
            value={indianFunds?.autoPilotMode || (indianFunds?.autoTradeEnabled !== false ? "AUTO" : "PAUSED")}
            color={
              (indianFunds?.autoPilotMode === "ACTIVE" || indianFunds?.autoPilotMode === "AUTO" || (!indianFunds?.autoPilotMode && indianFunds?.autoTradeEnabled !== false))
                ? "#10b981"
                : "#f59e0b"
            }
            title="Autonomous Indian Market AI Auto-Trader"
          />
        </div>
      ) : isCrypto ? (
        /* ── CRYPTO only: balance cards ─────────────────────── */
        <div style={{ display: "flex", alignItems: "center", flexWrap: "nowrap", gap: 6, padding: "0 4px", flexShrink: 0 }} className="hidden lg:flex">
          {/* SPOT free cash */}
          <DomainCard
            label="SPOT CASH"
            value={formatUsdWithInr((domains.crypto.balances?.spot ?? 0), inrRate, true)}
            color="#38bdf8"
            title={`SPOT Free Cash (available to trade): $${(domains.crypto.balances?.spot ?? 0).toFixed(2)} | Locked in positions: $${(domains.crypto.invested?.spot ?? 0).toFixed(2)} | Open PnL: $${((domains.crypto.totalEquity ?? 0) - (domains.crypto.balances?.spot ?? 0) - (domains.crypto.balances?.futures ?? 0) - (domains.crypto.invested?.spot ?? 0) - (domains.crypto.invested?.futures ?? 0)).toFixed(2)}`}
          />
          {/* FUTURES free cash */}
          <DomainCard
            label="FUT CASH"
            value={formatUsdWithInr((domains.crypto.balances?.futures ?? 0), inrRate, true)}
            color="#f59e0b"
            title={`FUTURES Free Cash (available to trade): $${(domains.crypto.balances?.futures ?? 0).toFixed(2)} | Locked in positions: $${(domains.crypto.invested?.futures ?? 0).toFixed(2)}`}
          />
          {/* Total portfolio equity */}
          <DomainCard
            label="TOTAL EQUITY"
            value={formatUsdWithInr(domains.crypto.totalEquity || 0, inrRate, true)}
            color="#22c55e"
            title={`Total Portfolio Equity = Free Cash + Locked Margin + Unrealized PnL\nSPOT: $${(domains.crypto.balances?.spot ?? 0).toFixed(2)} free + $${(domains.crypto.invested?.spot ?? 0).toFixed(2)} locked\nFUTURES: $${(domains.crypto.balances?.futures ?? 0).toFixed(2)} free + $${(domains.crypto.invested?.futures ?? 0).toFixed(2)} locked\nDeposited: $${((domains.crypto.balances?.spot ?? 0) + (domains.crypto.balances?.futures ?? 0) + (domains.crypto.invested?.spot ?? 0) + (domains.crypto.invested?.futures ?? 0)).toFixed(0)} | Total: $${(domains.crypto.totalEquity || 0).toFixed(2)}`}
          />
          {/* NET P&L with % badge */}
          <DomainCard
            label="NET P&L"
            value={`${cryptoNetPnL >= 0 ? "+" : ""}${formatUsdWithInr(cryptoNetPnL, inrRate, true)}`}
            pct={cryptoNetPnLPct}
            color={cryptoNetPnL >= 0 ? "#10b981" : "#ef4444"}
            title={`Crypto Net Realized P&L: $${cryptoNetPnL.toFixed(2)} (${cryptoNetPnLPct >= 0 ? "+" : ""}${cryptoNetPnLPct.toFixed(2)}%)`}
          />
          {/* TODAY P&L with % badge */}
          <DomainCard
            label="TODAY P&L"
            value={`${cryptoDailyPnL >= 0 ? "+" : ""}${formatUsdWithInr(cryptoDailyPnL, inrRate, true)}`}
            pct={cryptoDailyPnLPct}
            color={cryptoDailyPnL >= 0 ? "#10b981" : "#ef4444"}
            title={`Crypto Daily P&L: $${cryptoDailyPnL.toFixed(2)} (${cryptoDailyPnLPct >= 0 ? "+" : ""}${cryptoDailyPnLPct.toFixed(2)}%)`}
          />
          <DomainCard label="WIN RATE" value={`${(domains.crypto.realizedWinRate ?? domains.crypto.winRate ?? 0).toFixed(0)}%`} color="#38bdf8" title={`Crypto Realized Win Rate — ${domains.crypto.closedTrades || 0} closed trade(s)`} />
          {/* AI Agent running status */}
          <div
            title={execMode === "AUTO" ? "Crypto AI Agent is ACTIVE — placing trades autonomously" : "AI Agent paused — manual mode only"}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 9px", borderRadius: 6, flexShrink: 0,
              background: execMode === "AUTO" ? "rgba(16,185,129,0.12)" : "rgba(100,116,139,0.08)",
              border: `1px solid ${execMode === "AUTO" ? "rgba(16,185,129,0.4)" : "rgba(100,116,139,0.2)"}`,
              cursor: "default",
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: execMode === "AUTO" ? "#10b981" : "#475569",
              animation: execMode === "AUTO" ? "agentPulse 1.6s ease-out infinite" : "none",
            }} />
            <span style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
              color: execMode === "AUTO" ? "#10b981" : "#475569",
            }}>
              AI {execMode === "AUTO" ? "AUTO" : "MANUAL"}
            </span>
          </div>
          <style>{`@keyframes agentPulse{0%{box-shadow:0 0 0 0 rgba(16,185,129,.7)}70%{box-shadow:0 0 0 6px rgba(16,185,129,0)}100%{box-shadow:0 0 0 0 rgba(16,185,129,0)}}`}</style>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "nowrap", gap: 6, padding: "0 4px", flexShrink: 0 }} className="hidden lg:flex">
          {/* Crypto side */}
          <DomainCard
            label="CRYPTO CASH"
            value={formatUsdWithInr((domains.crypto.balances?.spot ?? 0) + (domains.crypto.balances?.futures ?? 0), inrRate, true)}
            color="#38bdf8"
            title={`Crypto Free Cash: SPOT $${(domains.crypto.balances?.spot ?? 0).toFixed(2)} + FUTURES $${(domains.crypto.balances?.futures ?? 0).toFixed(2)} = $${((domains.crypto.balances?.spot ?? 0) + (domains.crypto.balances?.futures ?? 0)).toFixed(2)}`}
          />
          <DomainCard
            label="CRYPTO EQUITY"
            value={formatUsdWithInr(domains.crypto.totalEquity || 0, inrRate, true)}
            color="#22c55e"
            title={`Crypto Total Equity (Cash + Locked Margin + Unrealized PnL) = $${(domains.crypto.totalEquity || 0).toFixed(2)}`}
          />
          {/* India side */}
          <DomainCard label="INDIA EQUITY" value={`₹${indianEquity.toLocaleString("en-IN")}`} color="#f97316" title={`Indian Broker Wallet Equity: ₹${indianEquity.toLocaleString("en-IN")} ($${(indianEquity / inrRate).toFixed(2)})`} />
          <DomainCard
            label="GLOBAL NET P&L"
            value={`${globalNetPnL >= 0 ? "+" : ""}${formatUsdWithInr(globalNetPnL, inrRate, true)}`}
            pct={globalNetPnLPct}
            color={globalNetPnL >= 0 ? "#10b981" : "#ef4444"}
            title={`Global Combined Net Realized P&L: $${globalNetPnL.toFixed(2)} (${globalNetPnLPct >= 0 ? "+" : ""}${globalNetPnLPct.toFixed(2)}%)`}
          />
          <DomainCard
            label="CRYPTO P&L"
            value={`${cryptoDailyPnL >= 0 ? "+" : ""}${formatUsdWithInr(cryptoDailyPnL, inrRate, true)}`}
            pct={cryptoDailyPnLPct}
            color={cryptoDailyPnL >= 0 ? "#10b981" : "#ef4444"}
            title={`Crypto Daily P&L: $${cryptoDailyPnL.toFixed(2)} (${cryptoDailyPnLPct >= 0 ? "+" : ""}${cryptoDailyPnLPct.toFixed(2)}%)`}
          />
          <DomainCard
            label="INDIA P&L"
            value={`${indianTodayPnL >= 0 ? "+" : "-"}₹${Math.abs(indianTodayPnL).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
            pct={indianDailyPnLPct}
            color={indianTodayPnL >= 0 ? "#10b981" : "#ef4444"}
            title={`Indian Daily P&L: ₹${indianTodayPnL.toFixed(2)} (${indianDailyPnLPct >= 0 ? "+" : ""}${indianDailyPnLPct.toFixed(2)}%)`}
          />
          <DomainCard label="CRYPTO WIN" value={`${(domains.crypto.realizedWinRate ?? domains.crypto.winRate ?? 0).toFixed(0)}%`} color="#38bdf8" title={`Crypto Realized Win Rate — ${domains.crypto.closedTrades || 0} closed trade(s)`} />
          <DomainCard label="INDIA WIN" value={`${indianWinRate.toFixed(0)}%`} color="#f97316" title={`India Realized Win Rate — ${indianTradesCount} closed trade(s)`} />
        </div>
      )}

      {/* Right Controls: Emergency Stop, Reset, Settings */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: "auto" }}>
        
        {/* 🛑 EMERGENCY STOP BUTTON */}
        <button
          onClick={() => setEmergencyModalOpen(true)}
          style={{
            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.22), rgba(185, 28, 28, 0.22))",
            border: "1px solid rgba(239, 68, 68, 0.5)",
            color: "#f87171",
            borderRadius: 6,
            padding: "4px 9px",
            fontSize: 10,
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            letterSpacing: "0.04em",
            transition: "all 0.15s ease",
            boxShadow: "0 1px 4px rgba(239, 68, 68, 0.2)",
          }}
          title="Immediate Emergency Kill-Switch to halt all autonomous execution"
        >
          <AlertOctagon size={13} style={{ color: "#ef4444" }} />
          <span>STOP</span>
        </button>

        {/* Reset Testing Data button */}
        <button
          onClick={() => setResetModalOpen(true)}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#94a3b8",
            cursor: "pointer",
            padding: 5,
            display: "flex",
            borderRadius: 6,
            transition: "all 0.15s",
          }}
          title="Full Reset Testing Baseline"
        >
          <RotateCcw size={14} />
        </button>

        {/* Settings button */}
        <button
          onClick={() => navigate("/settings")}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#94a3b8",
            cursor: "pointer",
            padding: 5,
            display: "flex",
            borderRadius: 6,
            transition: "all 0.15s",
          }}
          title="Settings"
        >
          <Settings size={15} />
        </button>
      </div>

      {/* Emergency Stop Confirmation Modal */}
      {emergencyModalOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999999
        }}>
          <div style={{
            background: "#0f172a", border: "2px solid #ef4444",
            borderRadius: 14, padding: 24, maxWidth: 440, width: "90%",
            boxShadow: "0 25px 60px rgba(0,0,0,0.8)", color: "#f8fafc"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(239,68,68,0.25)", border: "1px solid rgba(239,68,68,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShieldAlert size={22} color="#ef4444" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff", letterSpacing: "0.02em" }}>EMERGENCY KILL-SWITCH</div>
                <div style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>Immediate Autonomous Trading Halt</div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5, marginBottom: 18, background: "rgba(239,68,68,0.06)", padding: 12, borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)" }}>
              Activating the Emergency Stop will:
              <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                <li>Immediately disarm Auto-Pilot across all markets</li>
                <li>Block all incoming order generation from AI &amp; Strategy engines</li>
                <li>Freeze order routing to Angel One, Zerodha, and Binance</li>
                <li>Preserve existing ledger truth and open position history</li>
              </ul>
            </div>

            {emergencyStatus ? (
              <div style={{ color: "#34d399", fontWeight: 800, fontSize: 13, textAlign: "center", padding: 10 }}>
                ✓ {emergencyStatus}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setEmergencyModalOpen(false)}
                  disabled={emergencyLoading}
                  style={{ padding: "8px 16px", borderRadius: 7, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#cbd5e1", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleEmergencyStop}
                  disabled={emergencyLoading}
                  style={{ padding: "8px 16px", borderRadius: 7, background: "#ef4444", border: "none", color: "#ffffff", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  {emergencyLoading ? "Engaging Stop..." : "Confirm Emergency Halt"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reset Testing Data Confirmation Modal */}
      {resetModalOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99999
        }}>
          <div style={{
            background: "#0f172a", border: "1px solid rgba(239,68,68,0.4)",
            borderRadius: 16, padding: 24, maxWidth: 420, width: "90%",
            boxShadow: "0 20px 50px rgba(0,0,0,0.6)", color: "#f8fafc"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <RotateCcw size={18} color="#f87171" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#ffffff" }}>Full Testing Reset</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Purge old history &amp; reset testing baseline</div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5, marginBottom: 18, background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              This action will permanently purge:
              <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                <li>All past trade history &amp; realized P&amp;L records</li>
                <li>All active open positions &amp; floating P&amp;L</li>
                <li>All AI decision logs, alerts &amp; audit history</li>
                <li>Resets paper wallet to baseline</li>
              </ul>
            </div>

            {resetSuccess ? (
              <div style={{ color: "#34d399", fontWeight: 800, fontSize: 13, textAlign: "center", padding: 10 }}>
                ✓ {resetSuccess}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setResetModalOpen(false)}
                  disabled={resetLoading}
                  style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#cbd5e1", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetLoading}
                  style={{ padding: "8px 16px", borderRadius: 8, background: "#ef4444", border: "none", color: "#ffffff", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  {resetLoading ? "Purging State..." : "Confirm Full Reset"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🛡️ Live Governance Modal */}
      <LiveGovernanceModal
        isOpen={showGovernanceModal}
        onClose={() => setShowGovernanceModal(false)}
      />
    </header>
  );
}

function DomainCard({
  label,
  value,
  color = "#f1f5f9",
  title,
  pct,
}: {
  label: string;
  value: string;
  color?: string;
  title?: string;
  pct?: number;
}) {
  const isLongValue = value.length > 14;
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        background: "rgba(15, 23, 42, 0.65)", borderRadius: 6, padding: "2px 8px",
        border: "1px solid rgba(255, 255, 255, 0.08)", gap: 1, flexShrink: 0
      }}
      title={title}
    >
      <span style={{ fontSize: 8.5, color: "#94a3b8", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 3.5 }}>
        <span style={{ fontSize: isLongValue ? 9.5 : 11, fontWeight: 800, color, fontFamily: "monospace", whiteSpace: "nowrap" }}>{value}</span>
        {pct !== undefined && !Number.isNaN(pct) && (
          <span
            style={{
              fontSize: 8.5,
              fontWeight: 800,
              fontFamily: "monospace",
              padding: "0.5px 3.5px",
              borderRadius: 3,
              background: pct > 0 ? "rgba(16, 185, 129, 0.18)" : pct < 0 ? "rgba(239, 68, 68, 0.18)" : "rgba(148, 163, 184, 0.15)",
              color: pct > 0 ? "#34d399" : pct < 0 ? "#f87171" : "#94a3b8",
              border: `1px solid ${pct > 0 ? "rgba(16, 185, 129, 0.35)" : pct < 0 ? "rgba(239, 68, 68, 0.35)" : "rgba(148, 163, 184, 0.2)"}`,
              whiteSpace: "nowrap"
            }}
          >
            {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  color = "#f1f5f9",
  title,
  pct,
}: {
  label: string;
  value: string;
  color?: string;
  title?: string;
  pct?: number;
}) {
  const isLongValue = value.length > 20;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, flexShrink: 0 }} title={title}>
      <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: isLongValue ? 10.5 : 12, fontWeight: 700, color, fontFamily: "monospace", whiteSpace: "nowrap" }}>{value}</span>
        {pct !== undefined && !Number.isNaN(pct) && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              fontFamily: "monospace",
              padding: "0.5px 4px",
              borderRadius: 3,
              background: pct > 0 ? "rgba(16, 185, 129, 0.18)" : pct < 0 ? "rgba(239, 68, 68, 0.18)" : "rgba(148, 163, 184, 0.15)",
              color: pct > 0 ? "#34d399" : pct < 0 ? "#f87171" : "#94a3b8",
              border: `1px solid ${pct > 0 ? "rgba(16, 185, 129, 0.35)" : pct < 0 ? "rgba(239, 68, 68, 0.35)" : "rgba(148, 163, 184, 0.2)"}`,
              whiteSpace: "nowrap"
            }}
          >
            {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
}
