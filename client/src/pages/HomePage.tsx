import { useEffect, useState } from 'react';
import { INITIAL_SUMMARY, useDashboardStore, type DomainMetrics, INITIAL_DOMAIN_METRICS } from '../store/useDashboardStore';
import { useAppStore } from '../store/useAppStore';
import { formatCurrency } from '../lib/currency';
import KlineChart from '../components/chart/KlineChart';
import * as api from '../lib/api';
import {
  TrendingUp, TrendingDown, Activity, ShieldCheck,
  Target, Zap, RefreshCw, Brain, Eye, EyeOff, Wallet, RotateCcw,
  ArrowUpRight, ArrowDownRight, Layers, CheckCircle2, ChevronRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AILearningProgressPanel from '../components/ai/AILearningProgressPanel';

/* ── Design Tokens ── */
const BG    = "var(--ds-bg)";
const CARD   = "var(--ds-surface)";
const CARD2  = "var(--ds-surface-2)";
const BORD   = "var(--ds-border)";
const G     = "var(--ds-buy)";
const R     = "var(--ds-sell)";
const B     = "var(--ds-primary)";
const A     = "var(--ds-warning)";

export default function HomePage() {
  const navigate = useNavigate();
  const { userId, selectedSymbol, livePrices } = useAppStore();
  const { currencyMode, fetchDashboard } = useDashboardStore();
  const summary = useDashboardStore((s) => s.summary) ?? INITIAL_SUMMARY;
  const domains = useDashboardStore((s) => s.domains);
  
  const [positions, setPositions]       = useState<any[]>([]);
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [consensus, setConsensus]       = useState<any>(null);
  const [loading, setLoading]           = useState(false);
  const [showValues, setShowValues]     = useState(true);
  const [domainTab, setDomainTab]       = useState<'all' | 'crypto' | 'indian'>('all');

  const symbol  = selectedSymbol || "BTCUSDT";
  const inrRate = summary.inrRate || 84.0;



  const refresh = async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    try {
      await fetchDashboard(userId, useAppStore.getState().accountType);
      const [pos, hist, ens] = await Promise.allSettled([
        api.getOpenPositions((useDashboardStore.getState() as any).mode || "PAPER"),
        api.getTradeHistory("PAPER", 8, 0),
        api.getEnsembleReport(symbol),
      ]);
      if (pos.status === "fulfilled" && Array.isArray(pos.value)) setPositions(pos.value);
      if (hist.status === "fulfilled") {
        const all = (hist.value as any)?.trades ?? [];
        setRecentTrades(all.filter((t: any) => t.status === "CLOSED" || t.closedAt));
      }
      if (ens.status === "fulfilled") setConsensus(ens.value);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [userId, symbol]);
  useEffect(() => {
    if (!userId) return;
    const t = setInterval(() => refresh(true), 15000);
    return () => clearInterval(t);
  }, [userId, symbol]);

  // Domain-specific metrics
  const cryptoD = domains?.crypto ?? { ...INITIAL_DOMAIN_METRICS, currency: 'USD' };
  const indianD = domains?.indianStock ?? { ...INITIAL_DOMAIN_METRICS, currency: 'INR' };

  // Active domain metrics based on tab
  const activeCrypto = domainTab === 'all' || domainTab === 'crypto';
  const activeIndian = domainTab === 'all' || domainTab === 'indian';

  // Derived values from active domain
  const totalEquity = domainTab === 'all'
    ? (cryptoD.totalEquity + indianD.totalEquity / inrRate)
    : domainTab === 'crypto' ? cryptoD.totalEquity : indianD.totalEquity;
  const dailyPnl = domainTab === 'all'
    ? (cryptoD.dailyPnL + indianD.dailyPnL / inrRate)
    : domainTab === 'crypto' ? cryptoD.dailyPnL : indianD.dailyPnL;
  const openPnl = domainTab === 'all'
    ? (cryptoD.openPnL + indianD.openPnL / inrRate)
    : domainTab === 'crypto' ? cryptoD.openPnL : indianD.openPnL;
  const invested   = domainTab === 'crypto'
    ? (cryptoD.invested ?? { total: 0, spot: 0, futures: 0 })
    : domainTab === 'indian'
      ? (indianD.invested ?? { total: 0, spot: 0, futures: 0 })
      : (summary as any).invested ?? { total: 0, spot: 0, futures: 0 };
  const balances   = domainTab === 'crypto'
    ? (cryptoD.balances ?? { spot: 0, futures: 0 })
    : domainTab === 'indian'
      ? (indianD.balances ?? { spot: 0, futures: 0 })
      : (summary as any).balances ?? { spot: 0, futures: 0 };
  const netPnl     = domainTab === 'crypto'
    ? (cryptoD.netPnL ?? { total: 0, spot: 0, futures: 0 })
    : domainTab === 'indian'
      ? (indianD.netPnL ?? { total: 0, spot: 0, futures: 0 })
      : (summary as any).netPnL ?? { total: 0, spot: 0, futures: 0 };
  const winRate    = domainTab === 'crypto' ? cryptoD.winRate
    : domainTab === 'indian' ? indianD.winRate
    : Number((summary as any).winRate) || 0;
  const pf         = domainTab === 'crypto' ? Number(cryptoD.profitFactor) || 0
    : domainTab === 'indian' ? Number(indianD.profitFactor) || 0
    : Number((summary as any).profitFactor) || 0;
  const drawdown   = domainTab === 'crypto' ? cryptoD.maxDrawdown
    : domainTab === 'indian' ? indianD.maxDrawdown
    : Number((summary as any).maxDrawdown) || 0;
  const heat       = domainTab === 'crypto' ? cryptoD.currentExposure
    : domainTab === 'indian' ? indianD.currentExposure
    : Number(summary.currentExposure ?? 0);
  const totalDecisions = domainTab === 'crypto' ? String(cryptoD.totalTrades)
    : domainTab === 'indian' ? String(indianD.totalTrades)
    : String((summary as any).totalTrades ?? 0);

  // Currency helpers per domain
  const isInrDomain = domainTab === 'indian';
  const currSymbol = isInrDomain ? '₹' : '$';

  const totalBal = Math.max(0.01, (balances.spot || 0) + (balances.futures || 0));
  const spotPct  = Math.min(100, Math.max(0, ((balances.spot || 0) / totalBal) * 100));
  const futPct   = Math.min(100, Math.max(0, ((balances.futures || 0) / totalBal) * 100));

  const formatVal = (usd: number) => {
    if (!showValues) return "••••••••";
    if (isInrDomain) {
      // Indian stock: show INR primary
      const inrStr = `${usd >= 0 ? "+" : "-"}₹${Math.abs(usd).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
      return inrStr;
    }
    const usdStr = `${usd >= 0 ? "+" : "-"}$${Math.abs(usd).toFixed(2)}`;
    const inrStr = `${usd >= 0 ? "+" : "-"}₹${Math.abs(usd * inrRate).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    return `${usdStr} (${inrStr})`;
  };

  const formatEquity = (val: number) => {
    if (!showValues) return "••••••••";
    if (isInrDomain) return `₹${val.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    return `$${val.toFixed(2)}`;
  };

  return (
    <div style={{ background: BG, minHeight: "100%", padding: "16px 16px 64px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, background: "rgba(59,130,246,0.12)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(59,130,246,0.2)" }}>
            <Brain size={18} color={B} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ds-text)", letterSpacing: "-0.02em" }}>Portfolio Dashboard</div>
            <div style={{ fontSize: 11, color: "var(--ds-text-faint)" }}>AQEA Quant Trading &amp; Analytics Overview</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setShowValues(!showValues)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1px solid ${BORD}`, background: CARD, color: "var(--ds-text-faint)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            title={showValues ? "Hide amounts" : "Show amounts"}
          >
            {showValues ? <EyeOff size={13} /> : <Eye size={13} />}
            <span>{showValues ? "Hide Balances" : "Show Balances"}</span>
          </button>
          <button
            onClick={() => navigate("/aqea/wallet")}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.12)", color: "#34d399", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
          >
            <Wallet size={13} /> Wallet Center
          </button>

          <button
            onClick={async () => {
              if (confirm("☢️ NUCLEAR RESET: Purge all old trades, open positions, alerts, and reset paper wallet to 0 USDT / ₹0 INR?")) {
                try {
                  await api.hardReset();
                  await useAppStore.getState().boot();
                  await refresh();
                  alert("✓ Full Reset Complete! All old trades and P&L history purged.");
                } catch (e: any) {
                  alert("Reset failed: " + (e?.message || e));
                }
              }
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.12)", color: "#f87171", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
            title="Purge all old history and reset baseline for testing"
          >
            <RotateCcw size={13} /> Reset Testing Data
          </button>

          <button
            onClick={() => refresh()}
            style={{ display: "flex", alignItems: "center", gap: 6, background: CARD, border: `1px solid ${BORD}`, borderRadius: 8, padding: "7px 10px", color: "var(--ds-text-faint)", cursor: "pointer" }}
          >
            <RefreshCw size={13} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} />
          </button>
        </div>
      </div>

      {/* 🔀 DOMAIN TAB SWITCHER */}
      <div style={{
        display: "flex", gap: 0, borderRadius: 12, overflow: "hidden",
        border: `1px solid ${BORD}`, background: CARD
      }}>
        {[
          { key: 'all' as const, label: '🌐 All Markets', color: '#38bdf8' },
          { key: 'crypto' as const, label: '⚡ Crypto ($ USD)', color: '#fbbf24' },
          { key: 'indian' as const, label: '🇮🇳 Indian Stocks (₹ INR)', color: '#10b981' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setDomainTab(tab.key)}
            style={{
              flex: 1, padding: "10px 16px", fontSize: 12, fontWeight: 800,
              cursor: "pointer", border: "none", transition: "all 0.2s",
              background: domainTab === tab.key ? `${tab.color}22` : "transparent",
              color: domainTab === tab.key ? tab.color : "#94a3b8",
              borderBottom: domainTab === tab.key ? `2px solid ${tab.color}` : "2px solid transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 👑 EXECUTIVE HERO PORTFOLIO BANNER */}
      <div style={{
        background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: 16,
        padding: "20px 24px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        display: "flex",
        flexDirection: "column",
        gap: 16
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              {domainTab === 'crypto' ? '⚡ CRYPTO PORTFOLIO EQUITY' : domainTab === 'indian' ? '🇮🇳 INDIAN STOCK PORTFOLIO' : 'TOTAL PORTFOLIO EQUITY'}
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {showValues ? formatEquity(totalEquity) : "••••••••"}
              {showValues && !isInrDomain && (
                <span style={{ fontSize: 16, fontWeight: 800, color: "#fbbf24", marginLeft: 10, fontFamily: "sans-serif" }}>
                  (₹{(totalEquity * inrRate).toLocaleString("en-IN", { maximumFractionDigits: 0 })})
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span>Capital Invested:</span>
              <span style={{ color: "#f8fafc", fontWeight: 700 }}>
                {showValues ? (isInrDomain ? `₹${invested.total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : `$${invested.total.toFixed(2)} (₹${(invested.total * inrRate).toFixed(0)})`) : "••••••••"}
              </span>
            </div>
          </div>

          {/* Quick PnL Badges Row — Plain-English & Beginner-Friendly */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            
            {/* 1. Today's Performance */}
            <div
              style={{ background: dailyPnl >= 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${dailyPnl >= 0 ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, padding: "8px 14px", borderRadius: 10 }}
              title="Today's Performance (Realized gains made today + current live trade profits)"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>TODAY'S PROFIT / LOSS</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: dailyPnl >= 0 ? "#34d399" : "#f87171", fontFamily: "monospace" }}>
                {formatVal(dailyPnl)}
              </span>
              <div style={{ fontSize: 8.5, color: "#64748b", fontWeight: 600, marginTop: 1 }}>Since midnight today</div>
            </div>

            {/* 2. Live Active Trades */}
            <div
              style={{ background: openPnl >= 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${openPnl >= 0 ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, padding: "8px 14px", borderRadius: 10 }}
              title="Live Floating P&L: Profit or loss on trades that are currently running and NOT yet closed"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>LIVE ACTIVE TRADES</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: openPnl >= 0 ? "#34d399" : "#f87171", fontFamily: "monospace" }}>
                {formatVal(openPnl)}
              </span>
              <div style={{ fontSize: 8.5, color: "#64748b", fontWeight: 600, marginTop: 1 }}>Floating (not sold yet)</div>
            </div>

            {/* 3. Closed History */}
            <div
              style={{ background: netPnl.total >= 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${netPnl.total >= 0 ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, padding: "8px 14px", borderRadius: 10 }}
              title="Locked Realized P&L: Total cash profit or loss locked into wallet from all closed trades since day 1"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>LOCKED IN WALLET</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: netPnl.total >= 0 ? "#34d399" : "#f87171", fontFamily: "monospace" }}>
                {formatVal(netPnl.total)}
              </span>
              <div style={{ fontSize: 8.5, color: "#64748b", fontWeight: 600, marginTop: 1 }}>All past closed trades</div>
            </div>

            {/* 4. Total All-Time P&L (Realized + Open Unrealized) */}
            <div style={{
              background: ((summary.totalAllTimePnL ?? (netPnl.total + openPnl)) >= 0) ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
              border: `1px solid ${((summary.totalAllTimePnL ?? (netPnl.total + openPnl)) >= 0) ? "#10b981" : "#ef4444"}`,
              padding: "8px 14px",
              borderRadius: 10,
              boxShadow: ((summary.totalAllTimePnL ?? (netPnl.total + openPnl)) >= 0) ? "0 0 12px rgba(16,185,129,0.2)" : "0 0 12px rgba(239,68,68,0.2)"
            }} title="Overall Account Total: Locked Cash in Wallet + Live Floating Trades combined">
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 900, color: "#f8fafc", textTransform: "uppercase" }}>
                  🔥 OVERALL TOTAL
                </span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: ((summary.totalAllTimePnL ?? (netPnl.total + openPnl)) >= 0) ? "#34d399" : "#f87171", fontFamily: "monospace" }}>
                {formatVal(summary.totalAllTimePnL ?? (netPnl.total + openPnl))}
              </span>
              <div style={{ fontSize: 8.5, color: "#cbd5e1", fontWeight: 600, marginTop: 1 }}>Locked + Live combined</div>
            </div>
          </div>
        </div>

        {/* Domain-specific Account Split Details */}
        {domainTab === 'indian' ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#10b981", textTransform: "uppercase" }}>NSE Equity (CNC)</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace", marginTop: 4 }}>
                {showValues ? `₹${((indianD.balances as any)?.nse ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "••••"}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                Invested: ₹{((indianD.invested as any)?.nse ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </div>
            </div>

            <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#10b981", textTransform: "uppercase" }}>BSE Equity (CNC)</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace", marginTop: 4 }}>
                {showValues ? `₹${((indianD.balances as any)?.bse ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "••••"}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                Invested: ₹{((indianD.invested as any)?.bse ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </div>
            </div>

            <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#a78bfa", textTransform: "uppercase" }}>NIFTY50 (F&O)</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace", marginTop: 4 }}>
                {showValues ? `₹${((indianD.balances as any)?.nifty50 ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "••••"}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                Invested: ₹{((indianD.invested as any)?.nifty50 ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
              <span style={{ color: "#38bdf8", display: "flex", alignItems: "center", gap: 6 }}>
                <span>SPOT ACCOUNT:</span>
                <span>{showValues ? `${(balances.spot || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "••••"}</span>
                <span style={{ color: "#94a3b8", fontSize: 10 }}>(Invested: ${invested.spot.toLocaleString("en-IN", { maximumFractionDigits: 2 })})</span>
              </span>
              <span style={{ color: "#c084fc", display: "flex", alignItems: "center", gap: 6 }}>
                <span>FUTURES ACCOUNT:</span>
                <span>{showValues ? `${(balances.futures || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "••••"}</span>
                <span style={{ color: "#94a3b8", fontSize: 10 }}>(Invested: ${invested.futures.toLocaleString("en-IN", { maximumFractionDigits: 2 })})</span>
              </span>
            </div>

            <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
              <div style={{ width: `${spotPct}%`, background: "#38bdf8", transition: "width 0.5s ease" }} />
              <div style={{ width: `${futPct}%`, background: "#c084fc", transition: "width 0.5s ease" }} />
            </div>
          </div>
        )}

        {/* Domain Split Summary (visible only on "All Markets" tab) */}
        {domainTab === 'all' && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "#fbbf24", textTransform: "uppercase", marginBottom: 4 }}>⚡ CRYPTO</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace" }}>
                {showValues ? `$${cryptoD.totalEquity.toFixed(2)}` : "••••"}
              </div>
              <div style={{ fontSize: 10, color: cryptoD.dailyPnL >= 0 ? "#34d399" : "#f87171", fontWeight: 700, marginTop: 2 }}>
                Today: {showValues ? `${cryptoD.dailyPnL >= 0 ? '+' : '-'}$${Math.abs(cryptoD.dailyPnL).toFixed(2)}` : "••••"}
                {' '}| Win: {cryptoD.winRate.toFixed(1)}% | Trades: {cryptoD.totalTrades}
              </div>
            </div>
            <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "#10b981", textTransform: "uppercase", marginBottom: 4 }}>🇮🇳 INDIAN STOCKS</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace" }}>
                {showValues ? `₹${indianD.totalEquity.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "••••"}
              </div>
              <div style={{ fontSize: 10, color: indianD.dailyPnL >= 0 ? "#34d399" : "#f87171", fontWeight: 700, marginTop: 2 }}>
                Today: {showValues ? `${indianD.dailyPnL >= 0 ? '+' : '-'}₹${Math.abs(indianD.dailyPnL).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "••••"}
                {' '}| Win: {indianD.winRate.toFixed(1)}% | Trades: {indianD.totalTrades}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 📊 4 EXECUTIVE TELEMETRY CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        
        {/* Risk & Heat */}
        <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase" }}>PORTFOLIO HEAT</span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: heat > 40 ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)", color: heat > 40 ? "#fbbf24" : "#34d399" }}>
              {heat > 40 ? "WARNING" : "SAFE"}
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: heat > 40 ? A : G, fontFamily: "monospace", lineHeight: 1, marginBottom: 6 }}>
            {heat.toFixed(1)}%
          </div>
          <div style={{ fontSize: 10, color: "var(--ds-text-faint)" }}>
            Max Drawdown: <span style={{ color: drawdown > 10 ? R : "var(--ds-text)", fontWeight: 700 }}>{drawdown.toFixed(2)}%</span>
          </div>
        </div>

        {/* AI Win Rate */}
        <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase" }}>AI WIN RATE (LIFETIME)</span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: "rgba(16,185,129,0.2)", color: "#34d399" }}>
              PF {pf.toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: winRate >= 50 ? G : "#fbbf24", fontFamily: "monospace", lineHeight: 1, marginBottom: 6 }}>
            {winRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: 10, color: "var(--ds-text-faint)", display: "flex", justifyContent: "space-between" }}>
            <span>All-Time Trades: <span style={{ color: "var(--ds-text)", fontWeight: 700 }}>{totalDecisions}</span></span>
            <span style={{ color: "#38bdf8", fontWeight: 700 }}>Active Model: 80%+</span>
          </div>
        </div>

        {/* Market Regime */}
        <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase" }}>MARKET REGIME</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: summary.regime?.direction?.includes("BULL") ? G : summary.regime?.direction?.includes("BEAR") ? R : A }}>
              {summary.regime?.riskState ?? "NORMAL"}
            </span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: summary.regime?.direction?.includes("BULL") ? G : summary.regime?.direction?.includes("BEAR") ? R : A, fontFamily: "monospace", lineHeight: 1, marginBottom: 6 }}>
            {summary.regime?.direction?.replace(/_/g, " ") || "SIDEWAYS"}
          </div>
          <div style={{ fontSize: 10, color: "var(--ds-text-faint)" }}>
            Consensus: <span style={{ color: "var(--ds-text)", fontWeight: 700 }}>{(summary.regime?.strength ?? 0).toFixed(0)}%</span>
          </div>
        </div>

        {/* AI Signal */}
        <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase" }}>ACTIVE AI SIGNAL</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--ds-text-faint)" }}>{symbol}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: consensus?.signal === "LONG" ? G : consensus?.signal === "SHORT" ? R : A, fontFamily: "monospace", lineHeight: 1, marginBottom: 6 }}>
            {consensus?.signal ?? "HOLD"}
          </div>
          <div style={{ fontSize: 10, color: "var(--ds-text-faint)" }}>
            Confidence: <span style={{ color: "var(--ds-text)", fontWeight: 700 }}>{consensus?.confidence != null ? `${(consensus.confidence * 100).toFixed(0)}%` : "—"}</span>
          </div>
        </div>

      </div>

      <AILearningProgressPanel />

      {/* Main Grid: Chart + Intelligence Sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 16 }} className="chart-grid">
        <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
          <KlineChart symbol={symbol} interval="60" height={420} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Quick Performance Breakdown */}
          <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: "16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              Account P&L Breakdown
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>Spot P&L</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: netPnl.spot >= 0 ? G : R, fontFamily: "monospace" }}>
                  {formatVal(netPnl.spot)}
                </span>
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#c084fc", fontWeight: 700 }}>Futures P&L</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: netPnl.futures >= 0 ? G : R, fontFamily: "monospace" }}>
                  {formatVal(netPnl.futures)}
                </span>
              </div>

              <div style={{ borderTop: `1px solid ${BORD}`, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--ds-text-muted)", fontWeight: 700 }}>Open Positions</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--ds-text)", fontFamily: "monospace" }}>
                  {positions.length} active
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate("/aqea/risk-center")}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${BORD}`, background: CARD2, color: "var(--ds-text)", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <ShieldCheck size={16} color={R} /> Open Risk Command
          </button>
        </div>
      </div>

      {/* Open Positions Table */}
      {positions.length > 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORD}`, display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={14} color={B} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ds-text)" }}>Open Positions ({positions.length})</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORD}` }}>
                  {["Symbol","Side","Lev","Size","Entry","Mark","Invested","Gain/Loss","P&L%"].map((h) => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((p, i) => {
                  const side   = p.side ?? p.positionSide ?? "LONG";
                  const isLong = side === "BUY" || side === "LONG";
                  const isFutures = (p.accountType ?? "FUTURES") === "FUTURES";
                  const qty    = parseFloat(p.quantity ?? p.positionAmt ?? p.size ?? p.qty ?? 0);
                  const entry  = parseFloat(p.entryPrice ?? p.entry ?? 0);
                  const lev    = parseFloat(p.leverage ?? 1) || 1;
                  const notional = entry * qty;

                  const liveMark = livePrices && livePrices[p.symbol] ? parseFloat(String(livePrices[p.symbol])) : parseFloat(p.markPrice ?? p.mark ?? p.currentPrice ?? entry);
                  const mark   = liveMark > 0 ? liveMark : entry;

                  const grossPnl = isLong ? (mark - entry) * qty : (entry - mark) * qty;
                  const entryFee = isFutures ? entry * qty * 0.0004 : 0;
                  const exitFee = isFutures ? mark * qty * 0.0004 : 0;
                  const pnl = isFutures ? (grossPnl - entryFee - exitFee) : grossPnl;

                  const inv = p.margin ? parseFloat(p.margin) : (lev > 0 ? notional / lev : notional);
                  const pnlPct = inv > 0 ? (pnl / inv) * 100 : 0;

                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${BORD}` }}>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: "var(--ds-text)" }}>{p.symbol}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: side === "BUY" || side === "LONG" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: side === "BUY" || side === "LONG" ? G : R }}>
                          {side}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700 }}>{lev}×</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>{qty}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${entry.toFixed(2)}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${mark.toFixed(2)}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${inv.toFixed(2)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: pnl >= 0 ? G : R, fontFamily: "monospace" }}>
                        {formatVal(pnl)}
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: pnlPct >= 0 ? G : R, fontFamily: "monospace" }}>
                        {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closed Trade History */}
      {recentTrades.length > 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORD}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ds-text)" }}>Recent Closed Trades</span>
            <button onClick={() => navigate("/aqea/orders")} style={{ background: "none", border: "none", color: B, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              View All <ChevronRight size={12} />
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORD}` }}>
                  {["Symbol","Side","PnL","Closed At"].map((h) => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTrades.slice(0, 5).map((t, i) => {
                  const pnl = parseFloat(t.pnl ?? 0);
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${BORD}` }}>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: "var(--ds-text)" }}>{t.symbol}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: t.side === "BUY" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: t.side === "BUY" ? G : R }}>
                          {t.side}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: pnl >= 0 ? G : R, fontFamily: "monospace" }}>
                        {formatVal(pnl)}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--ds-text-faint)", fontSize: 11 }}>
                        {t.closedAt ? new Date(t.closedAt).toLocaleTimeString() : "Recent"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
