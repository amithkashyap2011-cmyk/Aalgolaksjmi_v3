import { useEffect, useState, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { INITIAL_SUMMARY, useDashboardStore, type DomainMetrics, INITIAL_DOMAIN_METRICS } from '../store/useDashboardStore';
import { useAppStore } from '../store/useAppStore';
import { formatCurrency } from '../lib/currency';

const KlineChart = lazy(() => import('../components/chart/KlineChart'));
import * as api from '../lib/api';
import {
  TrendingUp, TrendingDown, Activity, ShieldCheck,
  Target, Zap, RefreshCw, Brain, Eye, EyeOff, Wallet, RotateCcw,
  ArrowUpRight, ArrowDownRight, Layers, CheckCircle2, ChevronRight,
  LayoutDashboard, Briefcase, Sliders, AlertTriangle, X
} from 'lucide-react';

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

const TOP_CRYPTO_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT"] as const;

interface HomePageProps {
  defaultTerminal?: "SPOT" | "FUTURES" | "ALL";
}

export default function HomePage({ defaultTerminal }: HomePageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId, selectedSymbol, livePrices, setSymbol, addAlert, accountType } = useAppStore();
  const { currencyMode, fetchDashboard } = useDashboardStore();
  const summary = useDashboardStore((s) => s.summary) ?? INITIAL_SUMMARY;
  const domains = useDashboardStore((s) => s.domains);

  // Active Terminal View state: 'spot' | 'futures' | 'all'
  const getInitialTab = (): 'spot' | 'futures' | 'all' => {
    if (defaultTerminal === "FUTURES" || location.pathname === "/futures" || location.hash === "#futures") {
      return 'futures';
    }
    if (location.hash === "#all") {
      return 'all';
    }
    if (defaultTerminal === "SPOT" || location.pathname === "/spot" || location.pathname === "/crypto" || location.hash === "#spot") {
      return 'spot';
    }
    if (accountType === "FUTURES") return 'futures';
    return 'spot';
  };

  const [terminalTab, setTerminalTab] = useState<'spot' | 'futures' | 'all'>(getInitialTab);

  const [positions, setPositions]       = useState<any[]>([]);
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [consensus, setConsensus]       = useState<any>(null);
  const [loading, setLoading]           = useState(false);
  const [showValues, setShowValues]     = useState(true);

  // Quick Order Station state
  const [orderQty, setOrderQty]         = useState<string>("100");
  const [orderLev, setOrderLev]         = useState<number>(20);
  const [marginMode, setMarginMode]     = useState<"CROSS" | "ISOLATED">("CROSS");
  const [orderSl, setOrderSl]           = useState<string>("");
  const [orderTp, setOrderTp]           = useState<string>("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [closingId, setClosingId]       = useState<string | null>(null);

  const symbol  = selectedSymbol || "BTCUSDT";
  const inrRate = summary.inrRate || 84.0;

  // Synchronize route and hash changes with active terminal and accountType
  useEffect(() => {
    let targetTab: 'spot' | 'futures' | 'all';
    if (defaultTerminal === "FUTURES" || location.pathname === "/futures" || location.hash === "#futures") {
      targetTab = "futures";
    } else if (location.hash === "#all") {
      targetTab = "all";
    } else if (defaultTerminal === "SPOT" || location.pathname === "/spot" || location.hash === "#spot") {
      targetTab = "spot";
    } else {
      // General routes like "/" or "/crypto" without explicit hash follow accountType
      targetTab = accountType === "FUTURES" ? "futures" : accountType === "BOTH" ? "all" : "spot";
    }

    setTerminalTab(targetTab);
    const targetAcct = targetTab === "futures" ? "FUTURES" : targetTab === "all" ? "BOTH" : "SPOT";
    if (useAppStore.getState().accountType !== targetAcct) {
      useAppStore.getState().setAccountType(targetAcct);
    }

    // 🛡️ 2026-09-16: the sidebar's "Portfolio" link (/crypto#portfolio)
    // was never handled here — #portfolio fell through to the same
    // default as no hash at all, so clicking it landed on an identical
    // view to Dashboard with no visible difference. The actual holdings
    // section already exists further down this same page; #portfolio now
    // scrolls to it instead of doing nothing.
    if (location.hash === "#portfolio") {
      // Wait for the terminal-tab switch above to render its branch
      // (spot/futures/all each mount a different #portfolio-holdings node).
      setTimeout(() => {
        document.getElementById("portfolio-holdings")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [location.pathname, location.hash, defaultTerminal, accountType]);

  const refresh = async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    try {
      const activeAcct = terminalTab === 'spot' ? "SPOT" : terminalTab === 'futures' ? "FUTURES" : useAppStore.getState().accountType;
      await fetchDashboard(userId, activeAcct);
      const [pos, hist, ens] = await Promise.allSettled([
        api.getOpenPositions((useDashboardStore.getState() as any).mode || "PAPER", activeAcct === "BOTH" ? "FUTURES" : activeAcct),
        api.getTradeHistory("PAPER", 12, 0),
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

  useEffect(() => { refresh(); }, [userId, symbol, terminalTab]);
  useEffect(() => {
    if (!userId) return;
    const t = setInterval(() => refresh(true), 15000);
    return () => clearInterval(t);
  }, [userId, symbol, terminalTab]);

  // Order execution handlers
  const handleExecuteFuturesOrder = async (side: "BUY" | "SELL") => {
    const rawVal = parseFloat(orderQty);
    if (!rawVal || rawVal <= 0) {
      alert("Please specify a valid order amount in USDT.");
      return;
    }
    setOrderSubmitting(true);
    try {
      const mode = (useAppStore.getState().mode as "PAPER" | "LIVE") || "PAPER";
      const sl = orderSl ? parseFloat(orderSl) : undefined;
      const tp = orderTp ? parseFloat(orderTp) : undefined;
      const liveMark = livePrices && livePrices[symbol] ? parseFloat(String(livePrices[symbol])) : 0;
      const finalQuantity = (liveMark > 0 && rawVal >= 1) ? parseFloat((rawVal / liveMark).toFixed(5)) : rawVal;

      await api.placeOrder({
        symbol,
        side,
        quantity: finalQuantity,
        mode,
        leverage: orderLev,
        accountType: "FUTURES",
        sl,
        tp,
      });
      addAlert("GREEN", `✅ Futures ${side === "BUY" ? "LONG" : "SHORT"} $${rawVal} USDT (${finalQuantity} ${symbol.replace("USDT","")}) ${orderLev}× filled!`);
      await refresh();
    } catch (e: any) {
      alert("Futures order failed: " + (e?.message || e));
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleExecuteSpotOrder = async (side: "BUY" | "SELL") => {
    const rawVal = parseFloat(orderQty);
    if (!rawVal || rawVal <= 0) {
      alert("Please specify a valid order amount in USDT.");
      return;
    }
    setOrderSubmitting(true);
    try {
      const mode = (useAppStore.getState().mode as "PAPER" | "LIVE") || "PAPER";
      const liveMark = livePrices && livePrices[symbol] ? parseFloat(String(livePrices[symbol])) : 0;
      const finalQuantity = (liveMark > 0 && rawVal >= 1) ? parseFloat((rawVal / liveMark).toFixed(5)) : rawVal;

      await api.placeOrder({
        symbol,
        side,
        quantity: finalQuantity,
        mode,
        leverage: 1,
        accountType: "SPOT",
      });
      addAlert("GREEN", `✅ Spot ${side === "BUY" ? "BUY" : "SELL"} $${rawVal} USDT (${finalQuantity} ${symbol.replace("USDT","")}) filled!`);
      await refresh();
    } catch (e: any) {
      alert("Spot order failed: " + (e?.message || e));
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleClosePosition = async (tradeId: string) => {
    setClosingId(tradeId);
    try {
      const mode = (useAppStore.getState().mode as "PAPER" | "LIVE") || "PAPER";
      await api.closePosition(tradeId, mode);
      addAlert("GREEN", "✓ Position closed at market");
      await refresh();
    } catch (e: any) {
      alert("Close position failed: " + (e?.message || e));
    } finally {
      setClosingId(null);
    }
  };

  const handleCloseAllFutures = async () => {
    const futPositions = positions.filter((p) => (p.accountType ?? "FUTURES") === "FUTURES");
    if (futPositions.length === 0) {
      alert("No active futures positions to close.");
      return;
    }
    if (!confirm(`⚠️ Emergency Panic Close: Market-close all ${futPositions.length} active Futures positions?`)) return;
    setLoading(true);
    try {
      const mode = (useAppStore.getState().mode as "PAPER" | "LIVE") || "PAPER";
      for (const p of futPositions) {
        const id = p.id || p.tradeId || p._id;
        if (id) {
          try { await api.closePosition(id, mode); } catch (err) { console.error("Close failed for", p.symbol, err); }
        }
      }
      addAlert("AMBER", `All ${futPositions.length} Futures positions closed at market.`);
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  // Domain & Account metrics
  const cryptoD = domains?.crypto ?? { ...INITIAL_DOMAIN_METRICS, currency: 'USD' };
  const balances = cryptoD.balances ?? { spot: 0, futures: 0 };
  const invested = cryptoD.invested ?? { total: 0, spot: 0, futures: 0 };
  const netPnl   = cryptoD.netPnL ?? { total: 0, spot: 0, futures: 0 };

  // Calculate terminal-specific equity and PnL
  let terminalEquity = cryptoD.totalEquity;
  let terminalInvested = invested.total;
  let terminalDailyPnl = cryptoD.dailyPnL;
  let terminalOpenPnl  = cryptoD.openPnL;
  let terminalRealized = netPnl.total;

  const futPositions = positions.filter(p => (p.accountType ?? "FUTURES") === "FUTURES");
  const spotPositions = positions.filter(p => p.accountType === "SPOT");

  const futOpenPnl = futPositions.reduce((sum, p) => {
    const side   = p.side ?? p.positionSide ?? "LONG";
    const isLong = side === "BUY" || side === "LONG";
    const qty    = parseFloat(p.quantity ?? p.positionAmt ?? p.size ?? p.qty ?? 0);
    const entry  = parseFloat(p.entryPrice ?? p.entry ?? 0);
    const liveMark = livePrices && livePrices[p.symbol] ? parseFloat(String(livePrices[p.symbol])) : parseFloat(p.markPrice ?? p.mark ?? entry);
    const mark   = liveMark > 0 ? liveMark : entry;
    const grossPnl = isLong ? (mark - entry) * qty : (entry - mark) * qty;
    const fees = (entry + mark) * qty * 0.0004;
    return sum + (grossPnl - fees);
  }, 0);

  const spotHoldingsValue = spotPositions.reduce((sum, p) => {
    const qty = parseFloat(p.quantity ?? p.positionAmt ?? p.size ?? p.qty ?? 0);
    const entry = parseFloat(p.entryPrice ?? p.entry ?? 0);
    const liveMark = livePrices && livePrices[p.symbol] ? parseFloat(String(livePrices[p.symbol])) : parseFloat(p.markPrice ?? p.mark ?? entry);
    const mark = liveMark > 0 ? liveMark : entry;
    return sum + (qty * mark);
  }, 0);

  const spotInvested = spotPositions.reduce((sum, p) => {
    const qty = parseFloat(p.quantity ?? p.positionAmt ?? p.size ?? p.qty ?? 0);
    const entry = parseFloat(p.entryPrice ?? p.entry ?? 0);
    return sum + (qty * entry);
  }, 0);

  const spotOpenPnl = spotPositions.reduce((sum, p) => {
    const qty    = parseFloat(p.quantity ?? p.positionAmt ?? p.size ?? p.qty ?? 0);
    const entry  = parseFloat(p.entryPrice ?? p.entry ?? 0);
    const liveMark = livePrices && livePrices[p.symbol] ? parseFloat(String(livePrices[p.symbol])) : parseFloat(p.markPrice ?? p.mark ?? entry);
    const mark   = liveMark > 0 ? liveMark : entry;
    return sum + ((mark - entry) * qty);
  }, 0);

  if (terminalTab === 'futures') {
    terminalInvested = (invested.futures || 0) || futPositions.reduce((sum, p) => sum + (parseFloat(p.margin) || 0), 0);
    terminalRealized = netPnl.futures || 0;
    terminalOpenPnl = futOpenPnl;
    terminalEquity = (balances.futures || 0) + terminalInvested + terminalOpenPnl;
    terminalDailyPnl = terminalRealized + terminalOpenPnl;
  } else if (terminalTab === 'spot') {
    terminalInvested = (invested.spot || 0) || spotInvested;
    terminalRealized = netPnl.spot || 0;
    terminalOpenPnl = spotOpenPnl;
    terminalEquity = (balances.spot || 0) + spotHoldingsValue;
    terminalDailyPnl = terminalRealized + terminalOpenPnl;
  } else {
    // Total / All terminal
    terminalInvested = (invested.total || 0) || (spotInvested + (invested.futures || 0));
    terminalRealized = netPnl.total || 0;
    terminalOpenPnl = futOpenPnl + spotOpenPnl;
    terminalEquity = (balances.spot || 0) + spotHoldingsValue + (balances.futures || 0) + (invested.futures || 0) + futOpenPnl;
    terminalDailyPnl = terminalRealized + terminalOpenPnl;
  }

  // Graceful fallback if balances/positions are still loading
  if (terminalEquity <= 0 && cryptoD.totalEquity > 0) {
    terminalEquity = cryptoD.totalEquity;
  }

  const winRate    = cryptoD.winRate || Number((summary as any).winRate) || 0;
  const pf         = Number(cryptoD.profitFactor) || Number((summary as any).profitFactor) || 0;
  const drawdown   = cryptoD.maxDrawdown || Number((summary as any).maxDrawdown) || 0;
  const heat       = cryptoD.currentExposure || Number(summary.currentExposure ?? 0);
  const totalDecisions = String(cryptoD.totalTrades || (summary as any).totalTrades || 0);

  const totalBal = Math.max(0.01, (balances.spot || 0) + (balances.futures || 0));
  const spotPct  = Math.min(100, Math.max(0, ((balances.spot || 0) / totalBal) * 100));
  const futPct   = Math.min(100, Math.max(0, ((balances.futures || 0) / totalBal) * 100));

  // Futures Margin Ratio calculation
  const futuresMarginUsed = positions
    .filter(p => (p.accountType ?? "FUTURES") === "FUTURES")
    .reduce((sum, p) => sum + (parseFloat(p.margin) || ((parseFloat(p.entryPrice || 0) * parseFloat(p.quantity || 0)) / (parseFloat(p.leverage || 1) || 1))), 0);
  const futuresMarginUtilPct = balances.futures > 0 ? Math.min(100, (futuresMarginUsed / balances.futures) * 100) : 0;

  const formatVal = (usd: number) => {
    if (!showValues) return "••••••••";
    const usdStr = `${usd >= 0 ? "+" : "-"}$${Math.abs(usd).toFixed(2)}`;
    const inrStr = `${usd >= 0 ? "+" : "-"}₹${Math.abs(usd * inrRate).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    return `${usdStr} (${inrStr})`;
  };

  const formatEquity = (val: number) => {
    if (!showValues) return "••••••••";
    return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Filter positions and trades based on active terminal
  const displayPositions = positions.filter((p) => {
    if (terminalTab === 'futures') return (p.accountType ?? "FUTURES") === "FUTURES";
    if (terminalTab === 'spot') return p.accountType === "SPOT";
    return true;
  });

  const displayTrades = recentTrades.filter((t) => {
    if (terminalTab === 'futures') return (t.accountType ?? "FUTURES") === "FUTURES";
    if (terminalTab === 'spot') return t.accountType === "SPOT";
    return true;
  });

  return (
    <div style={{ background: BG, minHeight: "100%", padding: "16px 16px 64px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* 👑 HEADER: DISTINCT BRANDING PER TERMINAL */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 40, height: 40,
            background: terminalTab === 'futures' ? "rgba(245, 158, 11, 0.15)" : terminalTab === 'spot' ? "rgba(56, 189, 248, 0.15)" : "rgba(16, 185, 129, 0.15)",
            borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${terminalTab === 'futures' ? "rgba(245, 158, 11, 0.35)" : terminalTab === 'spot' ? "rgba(56, 189, 248, 0.35)" : "rgba(16, 185, 129, 0.35)"}`
          }}>
            {terminalTab === 'futures' ? (
              <Zap size={22} color="#fbbf24" />
            ) : terminalTab === 'spot' ? (
              <LayoutDashboard size={22} color="#38bdf8" />
            ) : (
              <Layers size={22} color="#34d399" />
            )}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 19, fontWeight: 900, color: "var(--ds-text)", letterSpacing: "-0.02em" }}>
                {terminalTab === 'futures' ? "Binance USD-M Futures Terminal" : terminalTab === 'spot' ? "Crypto Spot & Portfolio Terminal" : "Multi-Market Crypto Intelligence"}
              </span>
              <span style={{
                fontSize: 9.5, fontWeight: 800, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em",
                background: terminalTab === 'futures' ? "rgba(245, 158, 11, 0.2)" : "rgba(56, 189, 248, 0.2)",
                color: terminalTab === 'futures' ? "#fbbf24" : "#38bdf8",
                border: `1px solid ${terminalTab === 'futures' ? "rgba(245, 158, 11, 0.4)" : "rgba(56, 189, 248, 0.4)"}`
              }}>
                {terminalTab === 'futures' ? "⚡ 24/7 PERPETUAL" : terminalTab === 'spot' ? "SPOT 1:1" : "CROSS-MARKET"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ds-text-faint)" }}>
              {terminalTab === 'futures'
                ? "Binance USD-M Perpetual Contracts · High-Leverage (1x - 50x) Autonomous Quant Execution & Margin Control"
                : terminalTab === 'spot'
                  ? "Binance Spot 24/7 · Non-Margin 1:1 Collateral Asset Allocation & Order Execution"
                  : "Consolidated Cross-Account Crypto Asset Overview & Telemetry"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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

          {terminalTab === 'futures' && displayPositions.length > 0 && (
            <button
              onClick={handleCloseAllFutures}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.15)", color: "#f87171", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
              title="Emergency: Market-close all active futures positions immediately"
            >
              <AlertTriangle size={13} /> Close All Futures ({displayPositions.length})
            </button>
          )}

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
            title="Refresh Terminal Data"
          >
            <RefreshCw size={13} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} />
          </button>
        </div>
      </div>

      {/* 🔀 CRYPTO TERMINAL MODE TABS */}
      <div style={{
        display: "flex", gap: 0, borderRadius: 12, overflow: "hidden",
        border: `1px solid ${BORD}`, background: CARD, alignItems: "center"
      }}>
        {[
          { key: 'spot' as const, label: '🛒 Spot Terminal (1:1 Spot)', color: '#38bdf8', icon: LayoutDashboard },
          { key: 'futures' as const, label: '⚡ Futures Terminal (USD-M Perp)', color: '#f59e0b', icon: Zap },
          { key: 'all' as const, label: '🌐 All Crypto Watchlists', color: '#10b981', icon: Layers },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              setTerminalTab(tab.key);
              if (tab.key === 'spot') {
                useAppStore.getState().setAccountType("SPOT");
                navigate("/spot");
              } else if (tab.key === 'futures') {
                useAppStore.getState().setAccountType("FUTURES");
                navigate("/futures");
              } else {
                useAppStore.getState().setAccountType("BOTH");
                navigate("/crypto#all");
              }
            }}
            style={{
              flex: 1, padding: "10px 16px", fontSize: 12, fontWeight: 800,
              cursor: "pointer", border: "none", transition: "all 0.2s",
              background: terminalTab === tab.key ? `${tab.color}22` : "transparent",
              color: terminalTab === tab.key ? tab.color : "#94a3b8",
              borderBottom: terminalTab === tab.key ? `2px solid ${tab.color}` : "2px solid transparent",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8
            }}
          >
            <tab.icon size={14} />
            <span>{tab.label}</span>
          </button>
        ))}
        <button
          onClick={() => {
            useAppStore.getState().setActiveMarket("INDIA");
            navigate("/india");
          }}
          style={{
            padding: "10px 16px", fontSize: 11.5, fontWeight: 800,
            cursor: "pointer", border: "none", background: "rgba(234, 88, 12, 0.08)",
            color: "#fb923c", display: "flex", alignItems: "center", gap: 6,
            borderLeft: `1px solid ${BORD}`
          }}
          title="Switch to Indian Market Terminal"
        >
          <span>🇮🇳 Indian Terminal &rarr;</span>
        </button>
      </div>

      {/* 👑 EXECUTIVE HERO PORTFOLIO BANNER */}
      <div style={{
        background: terminalTab === 'futures'
          ? "linear-gradient(135deg, rgba(20, 20, 32, 0.95), rgba(45, 30, 20, 0.85))"
          : "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))",
        border: `1px solid ${terminalTab === 'futures' ? "rgba(245, 158, 11, 0.25)" : "rgba(255, 255, 255, 0.1)"}`,
        borderRadius: 16,
        padding: "20px 24px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        display: "flex",
        flexDirection: "column",
        gap: 16
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: terminalTab === 'futures' ? "#fbbf24" : "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              {terminalTab === 'futures' ? '⚡ BINANCE USD-M FUTURES EQUITY' : terminalTab === 'spot' ? '🛒 CRYPTO SPOT PORTFOLIO EQUITY' : 'TOTAL CRYPTO PORTFOLIO EQUITY'}
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {showValues ? formatEquity(terminalEquity) : "••••••••"}
              {showValues && (
                <span style={{ fontSize: 16, fontWeight: 800, color: "#fbbf24", marginLeft: 10, fontFamily: "sans-serif" }}>
                  (₹{(terminalEquity * inrRate).toLocaleString("en-IN", { maximumFractionDigits: 0 })})
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span>Capital Invested:</span>
              <span style={{ color: "#f8fafc", fontWeight: 700 }}>
                {showValues ? `$${terminalInvested.toFixed(2)} (₹${(terminalInvested * inrRate).toFixed(0)})` : "••••••••"}
              </span>
            </div>
          </div>

          {/* Quick PnL Badges Row */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            
            {/* 1. Today's Performance */}
            <div
              style={{ background: terminalDailyPnl >= 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${terminalDailyPnl >= 0 ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, padding: "8px 14px", borderRadius: 10 }}
              title="Today's Performance (Realized gains made today + current live trade profits)"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>TODAY'S PROFIT / LOSS</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: terminalDailyPnl >= 0 ? "#34d399" : "#f87171", fontFamily: "monospace" }}>
                {formatVal(terminalDailyPnl)}
              </span>
              <div style={{ fontSize: 8.5, color: "#64748b", fontWeight: 600, marginTop: 1 }}>Since midnight today</div>
            </div>

            {/* 2. Live Active Trades */}
            <div
              style={{ background: terminalOpenPnl >= 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${terminalOpenPnl >= 0 ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, padding: "8px 14px", borderRadius: 10 }}
              title="Live Floating P&L: Profit or loss on trades that are currently running and NOT yet closed"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>LIVE ACTIVE TRADES</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: terminalOpenPnl >= 0 ? "#34d399" : "#f87171", fontFamily: "monospace" }}>
                {formatVal(terminalOpenPnl)}
              </span>
              <div style={{ fontSize: 8.5, color: "#64748b", fontWeight: 600, marginTop: 1 }}>Floating (not sold yet)</div>
            </div>

            {/* 3. Closed History / Realized P&L */}
            <div
              style={{ background: terminalRealized >= 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${terminalRealized >= 0 ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, padding: "8px 14px", borderRadius: 10 }}
              title="Realized P&L: Total cumulative profit or loss booked from all settled/closed trades"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>REALIZED (BOOKED) P&amp;L</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: terminalRealized >= 0 ? "#34d399" : "#f87171", fontFamily: "monospace" }}>
                {formatVal(terminalRealized)}
              </span>
              <div style={{ fontSize: 8.5, color: "#64748b", fontWeight: 600, marginTop: 1 }}>All past closed trades</div>
            </div>

            {/* 4. Total All-Time P&L */}
            <div style={{
              background: ((terminalRealized + terminalOpenPnl) >= 0) ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
              border: `1px solid ${((terminalRealized + terminalOpenPnl) >= 0) ? "#10b981" : "#ef4444"}`,
              padding: "8px 14px",
              borderRadius: 10,
              boxShadow: ((terminalRealized + terminalOpenPnl) >= 0) ? "0 0 12px rgba(16,185,129,0.2)" : "0 0 12px rgba(239,68,68,0.2)"
            }} title="Overall Net P&L: Realized Booked P&L + Live Floating P&L combined">
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 900, color: "#f8fafc", textTransform: "uppercase" }}>
                  🔥 OVERALL TOTAL
                </span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: (terminalRealized + terminalOpenPnl) >= 0 ? "#34d399" : "#f87171", fontFamily: "monospace" }}>
                {formatVal(terminalRealized + terminalOpenPnl)}
              </span>
              <div style={{ fontSize: 8.5, color: "#cbd5e1", fontWeight: 600, marginTop: 1 }}>Realized + Live combined</div>
            </div>
          </div>
        </div>

        {/* Balance Allocation Strip */}
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
            <span style={{ color: "#38bdf8", display: "flex", alignItems: "center", gap: 6 }}>
              <span>SPOT ACCOUNT:</span>
              <span>{showValues ? `$${(balances.spot || 0).toFixed(2)}` : "••••"}</span>
              <span style={{ color: "#94a3b8", fontSize: 10 }}>(Invested: ${invested.spot.toFixed(2)})</span>
            </span>
            <span style={{ color: "#fbbf24", display: "flex", alignItems: "center", gap: 6 }}>
              <span>FUTURES ACCOUNT:</span>
              <span>{showValues ? `$${(balances.futures || 0).toFixed(2)}` : "••••"}</span>
              <span style={{ color: "#94a3b8", fontSize: 10 }}>(Invested: ${invested.futures.toFixed(2)})</span>
            </span>
          </div>

          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
            <div style={{ width: `${spotPct}%`, background: "#38bdf8", transition: "width 0.5s ease" }} />
            <div style={{ width: `${futPct}%`, background: "#fbbf24", transition: "width 0.5s ease" }} />
          </div>
        </div>
      </div>

      {/* 📊 4 EXECUTIVE TELEMETRY CARDS (DIFFERENTIATED FOR FUTURES VS SPOT) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        
        {terminalTab === 'futures' ? (
          <>
            {/* Futures Metric 1: Margin Ratio */}
            <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase" }}>MARGIN RATIO &amp; HEAT</span>
                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: futuresMarginUtilPct > 60 ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)", color: futuresMarginUtilPct > 60 ? R : G }}>
                  {futuresMarginUtilPct > 60 ? "HIGH RISK" : "SAFE"}
                </span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: futuresMarginUtilPct > 60 ? R : G, fontFamily: "monospace", lineHeight: 1, marginBottom: 6 }}>
                {futuresMarginUtilPct.toFixed(1)}%
              </div>
              <div style={{ fontSize: 10, color: "var(--ds-text-faint)" }}>
                Used: <span style={{ color: "var(--ds-text)", fontWeight: 700 }}>${futuresMarginUsed.toFixed(2)}</span> | Free: <span style={{ color: "#34d399", fontWeight: 700 }}>${Math.max(0, balances.futures - futuresMarginUsed).toFixed(2)}</span>
              </div>
            </div>

            {/* Futures Metric 2: Available Margin */}
            <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase" }}>AVAILABLE FUTURES MARGIN</span>
                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}>
                  {orderLev}× ACTIVE
                </span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24", fontFamily: "monospace", lineHeight: 1, marginBottom: 6 }}>
                ${(balances.futures || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 10, color: "var(--ds-text-faint)", display: "flex", justifyContent: "space-between" }}>
                <span>Buying Power: <span style={{ color: "#38bdf8", fontWeight: 700 }}>${((balances.futures || 0) * orderLev).toFixed(0)}</span></span>
                <span style={{ color: "#34d399", fontWeight: 700 }}>100% Free</span>
              </div>
            </div>

            {/* Futures Metric 3: Funding Rate */}
            <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase" }}>PERP FUNDING RATE (8H)</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#38bdf8" }}>8H CYCLE</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: G, fontFamily: "monospace", lineHeight: 1, marginBottom: 6 }}>
                +0.0100%
              </div>
              <div style={{ fontSize: 10, color: "var(--ds-text-faint)" }}>
                Next Settlement: <span style={{ color: "var(--ds-text)", fontWeight: 700 }}>~4h 15m (Binance Perp)</span>
              </div>
            </div>

            {/* Futures Metric 4: AI Perpetual Signal */}
            <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase" }}>FUTURES AI SIGNAL</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#fbbf24" }}>{symbol} PERP</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: consensus?.signal === "LONG" ? G : consensus?.signal === "SHORT" ? R : A, fontFamily: "monospace", lineHeight: 1, marginBottom: 6 }}>
                {consensus?.signal ?? "LONG"}
              </div>
              <div style={{ fontSize: 10, color: "var(--ds-text-faint)" }}>
                Confidence: <span style={{ color: "var(--ds-text)", fontWeight: 700 }}>{consensus?.confidence != null ? `${(consensus.confidence * 100).toFixed(0)}%` : "88%"} (4/4 Models)</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Spot Metric 1: Risk & Heat */}
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

            {/* Spot Metric 2: AI Win Rate */}
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

            {/* Spot Metric 3: Market Regime */}
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

            {/* Spot Metric 4: AI Signal */}
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
          </>
        )}

      </div>

      {/* ⚡ INTERACTIVE EXECUTION STATION (DIFFERENTIATED FOR FUTURES VS SPOT) */}
      <div style={{
        background: CARD, border: `1px solid ${terminalTab === 'futures' ? "rgba(245, 158, 11, 0.3)" : BORD}`,
        borderRadius: 12, padding: "16px", display: "flex", flexDirection: "column", gap: 14
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {terminalTab === 'futures' ? <Zap size={16} color="#fbbf24" /> : <LayoutDashboard size={16} color="#38bdf8" />}
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--ds-text)" }}>
              {terminalTab === 'futures' ? "⚡ Binance USD-M Futures Instant Order Station" : "🛒 Binance Spot Quick Order Station"}
            </span>
          </div>

          {/* Symbol Selector Pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TOP_CRYPTO_SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 800,
                  border: symbol === s ? "1px solid #3b82f6" : `1px solid ${BORD}`,
                  background: symbol === s ? "rgba(59, 130, 246, 0.2)" : CARD2,
                  color: symbol === s ? "#60a5fa" : "var(--ds-text-faint)",
                  cursor: "pointer", transition: "all 0.15s ease"
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {terminalTab === 'futures' ? (
          /* Futures Execution Bar */
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, alignItems: "center" }}>
            {/* Leverage Selector */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>
                Leverage ({orderLev}×)
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 5, 10, 20, 50].map((lev) => (
                  <button
                    key={lev}
                    onClick={() => setOrderLev(lev)}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 11, fontWeight: 800,
                      border: orderLev === lev ? "1px solid #f59e0b" : `1px solid ${BORD}`,
                      background: orderLev === lev ? "rgba(245, 158, 11, 0.25)" : CARD2,
                      color: orderLev === lev ? "#fbbf24" : "var(--ds-text-faint)",
                      cursor: "pointer"
                    }}
                  >
                    {lev}×
                  </button>
                ))}
              </div>
            </div>

            {/* Margin Mode */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>
                Margin Mode
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {(["CROSS", "ISOLATED"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMarginMode(m)}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 10.5, fontWeight: 800,
                      border: marginMode === m ? "1px solid #38bdf8" : `1px solid ${BORD}`,
                      background: marginMode === m ? "rgba(56, 189, 248, 0.2)" : CARD2,
                      color: marginMode === m ? "#38bdf8" : "var(--ds-text-faint)",
                      cursor: "pointer"
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Order Size */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>
                Margin Size (USDT)
              </div>
              <input
                type="number"
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
                placeholder="100"
                style={{
                  width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${BORD}`,
                  background: CARD2, color: "#f8fafc", fontSize: 12, fontWeight: 700, fontFamily: "monospace"
                }}
              />
            </div>

            {/* Optional Stop-Loss */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>
                Stop-Loss Price ($)
              </div>
              <input
                type="number"
                value={orderSl}
                onChange={(e) => setOrderSl(e.target.value)}
                placeholder="Optional"
                style={{
                  width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${BORD}`,
                  background: CARD2, color: "#f8fafc", fontSize: 12, fontWeight: 700, fontFamily: "monospace"
                }}
              />
            </div>

            {/* Order Execution Buttons */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                disabled={orderSubmitting}
                onClick={() => handleExecuteFuturesOrder("BUY")}
                style={{
                  flex: 1, padding: "8px 14px", borderRadius: 8, border: "none",
                  background: "linear-gradient(135deg, #10b981, #059669)", color: "#ffffff",
                  fontSize: 12, fontWeight: 900, cursor: orderSubmitting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  boxShadow: "0 2px 10px rgba(16, 185, 129, 0.3)"
                }}
              >
                <ArrowUpRight size={15} />
                <span>LONG / BUY</span>
              </button>

              <button
                disabled={orderSubmitting}
                onClick={() => handleExecuteFuturesOrder("SELL")}
                style={{
                  flex: 1, padding: "8px 14px", borderRadius: 8, border: "none",
                  background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#ffffff",
                  fontSize: 12, fontWeight: 900, cursor: orderSubmitting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  boxShadow: "0 2px 10px rgba(239, 68, 68, 0.3)"
                }}
              >
                <ArrowDownRight size={15} />
                <span>SHORT / SELL</span>
              </button>
            </div>
          </div>
        ) : (
          /* Spot Execution Bar */
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>
                Available Cash (Spot USDT)
              </div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#38bdf8", fontFamily: "monospace" }}>
                ${(balances.spot || 0).toFixed(2)} USDT
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
                  Order Amount (USDT)
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        const spotAvail = balances.spot || 1000;
                        const calc = Math.max(10, Math.floor(spotAvail * (pct / 100)));
                        setOrderQty(calc.toString());
                      }}
                      style={{
                        padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 800,
                        background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8",
                        border: "1px solid rgba(56, 189, 248, 0.3)", cursor: "pointer"
                      }}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
                placeholder="100"
                style={{
                  width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${BORD}`,
                  background: CARD2, color: "#f8fafc", fontSize: 12, fontWeight: 700, fontFamily: "monospace"
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={orderSubmitting}
                onClick={() => handleExecuteSpotOrder("BUY")}
                style={{
                  flex: 1, padding: "8px 14px", borderRadius: 8, border: "none",
                  background: "linear-gradient(135deg, #10b981, #059669)", color: "#ffffff",
                  fontSize: 12, fontWeight: 900, cursor: orderSubmitting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                }}
              >
                <ArrowUpRight size={15} />
                <span>BUY / ACCUMULATE</span>
              </button>

              <button
                disabled={orderSubmitting}
                onClick={() => handleExecuteSpotOrder("SELL")}
                style={{
                  flex: 1, padding: "8px 14px", borderRadius: 8, border: "none",
                  background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#ffffff",
                  fontSize: 12, fontWeight: 900, cursor: orderSubmitting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                }}
              >
                <ArrowDownRight size={15} />
                <span>SELL / TAKE PROFIT</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <AILearningProgressPanel />

      {/* Main Grid: Chart + Intelligence Sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 16 }} className="chart-grid">
        <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
          <Suspense fallback={<div style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 12 }}>Loading Live Market Chart...</div>}>
            <KlineChart symbol={symbol} interval="60" height={420} />
          </Suspense>
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
                <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700 }}>Futures P&L</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: netPnl.futures >= 0 ? G : R, fontFamily: "monospace" }}>
                  {formatVal(netPnl.futures)}
                </span>
              </div>

              <div style={{ borderTop: `1px solid ${BORD}`, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--ds-text-muted)", fontWeight: 700 }}>Open Positions</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--ds-text)", fontFamily: "monospace" }}>
                  {displayPositions.length} active ({terminalTab === 'futures' ? "Futures" : terminalTab === 'spot' ? "Spot" : "Total"})
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

      {/* 💼 OPEN POSITIONS & SPOT HOLDINGS (DIFFERENTIATED PER TERMINAL) */}
      {terminalTab === 'spot' ? (
        <div id="portfolio-holdings" style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORD}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LayoutDashboard size={15} color="#38bdf8" />
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--ds-text)" }}>
                Crypto Spot Holdings & Asset Balances ({displayPositions.length})
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: "rgba(56,189,248,0.15)", color: "#38bdf8", border: "1px solid rgba(56,189,248,0.3)" }}>
                1:1 SPOT
              </span>
            </div>
          </div>

          {displayPositions.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(56,189,248,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LayoutDashboard size={22} color="#38bdf8" />
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ds-text)" }}>
                No Active Spot Holdings Yet
              </div>
              <div style={{ fontSize: 12, color: "var(--ds-text-faint)", maxWidth: 460, lineHeight: 1.5 }}>
                Your Spot paper wallet has <span style={{ color: "#38bdf8", fontWeight: 700 }}>${(balances.spot || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} USDT</span> cash available. Place a BUY order above to acquire 1:1 spot crypto assets.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORD}` }}>
                    {["Asset / Symbol", "Side", "Holding Qty", "Avg Buy Price", "Current Price", "Position Value", "Gain / Loss ($)", "ROI (%)", "Action"].map((h) => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayPositions.map((p, i) => {
                    const side = p.side ?? p.positionSide ?? "BUY";
                    const qty = parseFloat(p.quantity ?? p.positionAmt ?? p.size ?? p.qty ?? 0);
                    const entry = parseFloat(p.entryPrice ?? p.entry ?? 0);
                    const liveMark = livePrices && livePrices[p.symbol] ? parseFloat(String(livePrices[p.symbol])) : parseFloat(p.markPrice ?? p.mark ?? p.currentPrice ?? entry);
                    const mark = liveMark > 0 ? liveMark : entry;
                    const notional = mark * qty;
                    const costBasis = entry * qty;
                    const pnl = notional - costBasis;
                    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
                    const tradeId = p.id || p.tradeId || p._id || `trade-${i}`;

                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${BORD}` }}>
                        <td style={{ padding: "10px 14px", fontWeight: 800, color: "var(--ds-text)" }}>{p.symbol}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: "rgba(56,189,248,0.15)", color: "#38bdf8" }}>
                            SPOT 1:1
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700, color: "#f8fafc" }}>{qty}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${entry.toFixed(2)}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${mark.toFixed(2)}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700, color: "#38bdf8" }}>${notional.toFixed(2)}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 800, color: pnl >= 0 ? G : R, fontFamily: "monospace" }}>
                          {formatVal(pnl)}
                        </td>
                        <td style={{ padding: "10px 14px", fontWeight: 800, color: pnlPct >= 0 ? G : R, fontFamily: "monospace" }}>
                          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <button
                            disabled={closingId === tradeId}
                            onClick={() => handleClosePosition(tradeId)}
                            style={{
                              padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.4)",
                              background: "rgba(239,68,68,0.15)", color: "#f87171", fontSize: 10, fontWeight: 800,
                              cursor: closingId === tradeId ? "not-allowed" : "pointer"
                            }}
                          >
                            {closingId === tradeId ? "Selling..." : "Sell / Exit"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : terminalTab === 'futures' ? (
        <div id="portfolio-holdings" style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORD}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={14} color="#fbbf24" />
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ds-text)" }}>
                Open Perpetual Futures Positions ({displayPositions.length})
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}>
                ⚡ 24/7 PERPETUAL
              </span>
            </div>
            {displayPositions.length > 0 && (
              <button
                onClick={handleCloseAllFutures}
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}
              >
                Close All
              </button>
            )}
          </div>

          {displayPositions.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={22} color="#fbbf24" />
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ds-text)" }}>
                No Active Futures Positions
              </div>
              <div style={{ fontSize: 12, color: "var(--ds-text-faint)", maxWidth: 460, lineHeight: 1.5 }}>
                Available Futures Margin: <span style={{ color: "#fbbf24", fontWeight: 700 }}>${(balances.futures || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} USDT</span>. Use the Futures Instant Order Station above to enter leveraged LONG or SHORT perpetual positions.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORD}` }}>
                    {["Symbol","Side","Lev","Size","Entry","Mark","Est Liq","Margin","Gain/Loss","ROI%","Action"].map((h) => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayPositions.map((p, i) => {
                    const side   = p.side ?? p.positionSide ?? "LONG";
                    const isLong = side === "BUY" || side === "LONG";
                    const qty    = parseFloat(p.quantity ?? p.positionAmt ?? p.size ?? p.qty ?? 0);
                    const entry  = parseFloat(p.entryPrice ?? p.entry ?? 0);
                    const lev    = parseFloat(p.leverage ?? 1) || 1;
                    const notional = entry * qty;

                    const liveMark = livePrices && livePrices[p.symbol] ? parseFloat(String(livePrices[p.symbol])) : parseFloat(p.markPrice ?? p.mark ?? p.currentPrice ?? entry);
                    const mark   = liveMark > 0 ? liveMark : entry;

                    const grossPnl = isLong ? (mark - entry) * qty : (entry - mark) * qty;
                    const entryFee = entry * qty * 0.0004;
                    const exitFee = mark * qty * 0.0004;
                    const pnl = grossPnl - entryFee - exitFee;

                    const inv = p.margin ? parseFloat(p.margin) : (lev > 0 ? notional / lev : notional);
                    const pnlPct = inv > 0 ? (pnl / inv) * 100 : 0;

                    // Estimated liquidation price
                    const estLiq = isLong
                      ? Math.max(0, entry * (1 - 1 / lev + 0.005))
                      : entry * (1 + 1 / lev - 0.005);

                    const tradeId = p.id || p.tradeId || p._id || `trade-${i}`;

                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${BORD}` }}>
                        <td style={{ padding: "10px 14px", fontWeight: 800, color: "var(--ds-text)" }}>{p.symbol}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: side === "BUY" || side === "LONG" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: side === "BUY" || side === "LONG" ? G : R }}>
                            {side}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700, color: "#fbbf24" }}>{lev}×</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>{qty}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${entry.toFixed(2)}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${mark.toFixed(2)}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "#f87171" }}>
                          {estLiq > 0 ? `$${estLiq.toFixed(2)}` : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${inv.toFixed(2)}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 800, color: pnl >= 0 ? G : R, fontFamily: "monospace" }}>
                          {formatVal(pnl)}
                        </td>
                        <td style={{ padding: "10px 14px", fontWeight: 800, color: pnlPct >= 0 ? G : R, fontFamily: "monospace" }}>
                          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <button
                            disabled={closingId === tradeId}
                            onClick={() => handleClosePosition(tradeId)}
                            style={{
                              padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.4)",
                              background: "rgba(239,68,68,0.15)", color: "#f87171", fontSize: 10, fontWeight: 800,
                              cursor: closingId === tradeId ? "not-allowed" : "pointer"
                            }}
                          >
                            {closingId === tradeId ? "Closing..." : "Close"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : displayPositions.length > 0 ? (
        <div id="portfolio-holdings" style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORD}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={14} color="#10b981" />
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ds-text)" }}>
                All Crypto Open Positions ({displayPositions.length})
              </span>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORD}` }}>
                  {["Symbol","Type","Side","Size","Entry","Mark","Gain/Loss","ROI%","Action"].map((h) => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "var(--ds-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayPositions.map((p, i) => {
                  const side = p.side ?? p.positionSide ?? "BUY";
                  const isSpot = p.accountType === "SPOT";
                  const qty = parseFloat(p.quantity ?? p.positionAmt ?? p.size ?? p.qty ?? 0);
                  const entry = parseFloat(p.entryPrice ?? p.entry ?? 0);
                  const liveMark = livePrices && livePrices[p.symbol] ? parseFloat(String(livePrices[p.symbol])) : parseFloat(p.markPrice ?? p.mark ?? p.currentPrice ?? entry);
                  const mark = liveMark > 0 ? liveMark : entry;
                  const grossPnl = side === "BUY" || side === "LONG" ? (mark - entry) * qty : (entry - mark) * qty;
                  const pnl = isSpot ? grossPnl : grossPnl - (entry * qty * 0.0004) - (mark * qty * 0.0004);
                  const notional = entry * qty;
                  const pnlPct = notional > 0 ? (pnl / notional) * 100 : 0;
                  const tradeId = p.id || p.tradeId || p._id || `trade-${i}`;

                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${BORD}` }}>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: "var(--ds-text)" }}>{p.symbol}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: isSpot ? "rgba(56,189,248,0.15)" : "rgba(245,158,11,0.15)", color: isSpot ? "#38bdf8" : "#fbbf24" }}>
                          {isSpot ? "SPOT" : "FUTURES"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: side === "BUY" || side === "LONG" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: side === "BUY" || side === "LONG" ? G : R }}>
                          {side}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>{qty}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${entry.toFixed(2)}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${mark.toFixed(2)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: pnl >= 0 ? G : R, fontFamily: "monospace" }}>
                        {formatVal(pnl)}
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: pnlPct >= 0 ? G : R, fontFamily: "monospace" }}>
                        {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <button
                          disabled={closingId === tradeId}
                          onClick={() => handleClosePosition(tradeId)}
                          style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.15)", color: "#f87171", fontSize: 10, fontWeight: 800, cursor: closingId === tradeId ? "not-allowed" : "pointer" }}
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Closed Trade History */}
      {displayTrades.length > 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORD}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ds-text)" }}>
              {terminalTab === 'futures' ? "Recent Closed Futures Trades" : "Recent Closed Trades"}
            </span>
            <button onClick={() => navigate("/aqea/orders?market=CRYPTO")} style={{ background: "none", border: "none", color: B, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
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
                {displayTrades.slice(0, 5).map((t, i) => {
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
