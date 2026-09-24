import CryptoControlCenter from "../components/dashboard/CryptoControlCenter";
import InvestmentSummary from "../components/common/InvestmentSummary";
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
import CryptoPortfolioView from '../components/dashboard/CryptoPortfolioView';

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
  const { userId, selectedSymbol, livePrices, setSymbol, addAlert, accountType, wallet, mode } = useAppStore();
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
    if (defaultTerminal === "SPOT" || location.pathname === "/spot" || location.hash === "#spot") {
      return 'spot';
    }
    // "/" and "/crypto" follow the saved SPOT / FUTURES / BOTH choice. Both
    // routes used to force SPOT, so opening the crypto dashboard from any
    // other page silently reset the user's selection.
    if (accountType === "FUTURES") return 'futures';
    if (accountType === "BOTH") return 'all';
    return 'spot';
  };

  const [terminalTab, setTerminalTab] = useState<'spot' | 'futures' | 'all'>(getInitialTab);

  const [positions, setPositions]       = useState<any[]>([]);
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [consensus, setConsensus]       = useState<any>(null);
  const [loading, setLoading]           = useState(false);
  const [showValues, setShowValues]     = useState(true);
  // Per-tab wallet: holds totalDeposited specific to SPOT / FUTURES / combined
  const [tabWallet, setTabWallet]       = useState<{ totalDeposited: number } | null>(null);
  const appConnected = useAppStore((s) => s.connected);
  const [capitalUsage, setCapitalUsage] = useState<{ deployed: number; trades: number; peak?: number } | null>(null);

  // Quick Order Station state
  const [orderQty, setOrderQty]         = useState<string>("100");
  const [orderLev, setOrderLev]         = useState<number>(20);
  const [marginMode, setMarginMode]     = useState<"CROSS" | "ISOLATED">("CROSS");
  const [orderSl, setOrderSl]           = useState<string>("");
  const [orderTp, setOrderTp]           = useState<string>("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError]     = useState<string | null>(null);
  const [topUpLoading, setTopUpLoading] = useState(false);
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

  }, [location.pathname, location.hash, defaultTerminal, accountType]);

  const refresh = async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    try {
      const activeAcct = terminalTab === 'spot' ? "SPOT" : terminalTab === 'futures' ? "FUTURES" : useAppStore.getState().accountType;
      // Capital actually put into trades for this tab (Spot / Futures / both).
      api.getCapitalUsage(useAppStore.getState().mode || "PAPER", terminalTab === 'all' ? "BOTH" : activeAcct).then((u) => setCapitalUsage(u)).catch(() => {});
      await fetchDashboard(userId, activeAcct);
      // LIVE/PAPER is owned by the app store. The dashboard store's own `mode`
      // is never synced to the toggle, so reading it here loaded PAPER positions
      // even in LIVE — which then fed the header equity with simulated funds.
      const activeMode = useAppStore.getState().mode || "PAPER";
      const [pos, hist, ens, walletRes] = await Promise.allSettled([
        api.getOpenPositions(activeMode, activeAcct === "BOTH" ? "FUTURES" : activeAcct),
        api.getTradeHistory(activeMode, 12, 0, "CLOSED", "CRYPTO"),
        api.getEnsembleReport(symbol),
        // Fetch the tab-specific wallet so Capital Deposited reflects only
        // this account type's deposits, not the combined SPOT+FUTURES total.
        terminalTab === 'all'
          ? Promise.all([
              api.getWalletBalance(activeMode, "SPOT").catch(() => null),
              api.getWalletBalance(activeMode, "FUTURES").catch(() => null),
            ]).then(([s, f]) => ({ totalDeposited: ((s as any)?.totalDeposited ?? 0) + ((f as any)?.totalDeposited ?? 0) }))
          : api.getWalletBalance(activeMode, activeAcct as any).catch(() => null),
      ]);
      if (pos.status === "fulfilled" && Array.isArray(pos.value)) setPositions(pos.value);
      if (hist.status === "fulfilled") {
        const all = (hist.value as any)?.trades ?? [];
        setRecentTrades(all.filter((t: any) => t.status === "CLOSED" || t.closedAt));
      }
      if (ens.status === "fulfilled") setConsensus(ens.value);
      if (walletRes.status === "fulfilled" && walletRes.value) {
        setTabWallet({ totalDeposited: (walletRes.value as any).totalDeposited ?? 0 });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [userId, symbol, terminalTab, mode]);
  useEffect(() => {
    if (!userId) return;
    const t = setInterval(() => refresh(true), 15000);
    return () => clearInterval(t);
  }, [userId, symbol, terminalTab, mode]);

  // ── Paper wallet top-up helper ──────────────────────────────────────
  const handleTopUpWallet = async (acctType: "SPOT" | "FUTURES", amount = 1000) => {
    setTopUpLoading(true);
    try {
      const res = await fetch("/api/wallet/deposit/paper", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
        body: JSON.stringify({ amount, accountType: acctType, currency: "USDT" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Top-up failed");
      setOrderError(null);
      addAlert("GREEN", `✅ Paper wallet topped up +$${amount} USDT (${acctType}). New balance: $${data.newBalance?.toFixed(2) ?? "—"}`);
      await refresh();
    } catch (e: any) {
      addAlert("AMBER", "Top-up failed: " + (e?.message || e));
    } finally {
      setTopUpLoading(false);
    }
  };

  // ── Order execution handlers ─────────────────────────────────────────
  const handleExecuteFuturesOrder = async (side: "BUY" | "SELL") => {
    setOrderError(null);
    const rawVal = parseFloat(orderQty);
    if (!rawVal || rawVal <= 0) {
      setOrderError("Please specify a valid order amount in USDT.");
      return;
    }
    // ── Client-side balance pre-check ──
    const mode = (useAppStore.getState().mode as "PAPER" | "LIVE") || "PAPER";
    if (mode === "PAPER") {
      const freeMargin = balances.futures || 0;
      if (rawVal > freeMargin) {
        setOrderError(`Insufficient futures balance. Order needs $${rawVal.toFixed(2)} USDT but you only have $${freeMargin.toFixed(2)} USDT free.`);
        return;
      }
    }
    setOrderSubmitting(true);
    try {
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
      setOrderError(null);
      addAlert("GREEN", `✅ Futures ${side === "BUY" ? "LONG" : "SHORT"} $${rawVal} USDT (${finalQuantity} ${symbol.replace("USDT","")}) ${orderLev}× filled!`);
      await refresh();
    } catch (e: any) {
      setOrderError("Order failed: " + (e?.message || e));
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleExecuteSpotOrder = async (side: "BUY" | "SELL") => {
    setOrderError(null);
    const rawVal = parseFloat(orderQty);
    if (!rawVal || rawVal <= 0) {
      setOrderError("Please specify a valid order amount in USDT.");
      return;
    }
    // ── Client-side balance pre-check ──
    const mode = (useAppStore.getState().mode as "PAPER" | "LIVE") || "PAPER";
    if (mode === "PAPER") {
      const freeSpot = balances.spot || 0;
      if (rawVal > freeSpot) {
        setOrderError(`Insufficient spot balance. Order needs $${rawVal.toFixed(2)} USDT but you only have $${freeSpot.toFixed(2)} USDT free.`);
        return;
      }
    }
    setOrderSubmitting(true);
    try {
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
      setOrderError(null);
      addAlert("GREEN", `✅ Spot ${side === "BUY" ? "BUY" : "SELL"} $${rawVal} USDT (${finalQuantity} ${symbol.replace("USDT","")}) filled!`);
      await refresh();
    } catch (e: any) {
      setOrderError("Order failed: " + (e?.message || e));
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleClosePosition = async (tradeId: string, force = false) => {
    setClosingId(tradeId);
    try {
      const mode = (useAppStore.getState().mode as "PAPER" | "LIVE") || "PAPER";
      await api.closePosition(tradeId, mode, force);
      addAlert("GREEN", force ? "✓ Position marked as closed locally" : "✓ Position closed at market");
      await refresh();
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      const isLiveFailure = errMsg.includes("Binance LIVE Close Error") || errMsg.includes("-2015") || errMsg.includes("401");
      if (isLiveFailure && !force) {
        const confirmForce = window.confirm(
          `${errMsg}\n\n` +
          `Would you like to Force Close (mark as CLOSED locally)?\n\n` +
          `• Click OK if you have already closed or sold this position directly on Binance.\n` +
          `• Machine Public IP: 14.98.201.25 (whitelist this in Binance API Management if you want live orders).`
        );
        if (confirmForce) {
          try {
            const mode = (useAppStore.getState().mode as "PAPER" | "LIVE") || "PAPER";
            await api.closePosition(tradeId, mode, true);
            addAlert("GREEN", "✓ Position marked as closed locally (Force Closed)");
            await refresh();
            return;
          } catch (forceErr: any) {
            alert("Force close failed: " + (forceErr?.message || forceErr));
          }
        }
      } else {
        alert("Close position failed: " + errMsg);
      }
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
  // "Today" = realized from trades closed since midnight + live open P&L.
  // It used lifetime realized (terminalRealized), so Today always equalled
  // Overall Total — a loss closed today still showed yesterday's gains.
  const todayRealized = cryptoD.todayRealized ?? { total: 0, spot: 0, futures: 0 };

  // Capital Invested = total deposited (money actually put in), not just
  // locked margin. invested.total is margin-in-open-positions only, which
  // shows $0 when no trades are open even if the user deposited capital.
  // tabWallet holds the per-tab (SPOT/FUTURES/combined) deposit total so
  // switching tabs shows the right account's deposits, not a combined sum.
  const depositedCapital = tabWallet?.totalDeposited ?? (wallet?.totalDeposited ?? 0);
  let terminalCapitalDeposited = depositedCapital;

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
    terminalCapitalDeposited = depositedCapital;
    terminalRealized = netPnl.futures || 0;
    terminalOpenPnl = futOpenPnl;
    terminalEquity = (balances.futures || 0) + terminalInvested + terminalOpenPnl;
    terminalDailyPnl = (todayRealized.futures || 0) + terminalOpenPnl;
  } else if (terminalTab === 'spot') {
    terminalInvested = (invested.spot || 0) || spotInvested;
    terminalRealized = netPnl.spot || 0;
    terminalOpenPnl = spotOpenPnl;
    terminalEquity = (balances.spot || 0) + spotHoldingsValue;
    terminalDailyPnl = (todayRealized.spot || 0) + terminalOpenPnl;
  } else {
    // Total / All terminal
    terminalInvested = (invested.total || 0) || (spotInvested + (invested.futures || 0));
    terminalRealized = netPnl.total || 0;
    terminalOpenPnl = futOpenPnl + spotOpenPnl;
    terminalEquity = (balances.spot || 0) + spotHoldingsValue + (balances.futures || 0) + (invested.futures || 0) + futOpenPnl;
    terminalDailyPnl = (todayRealized.total || 0) + terminalOpenPnl;
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

  const formatCoinPrice = (price: number) => {
    if (price == null || isNaN(price) || price === 0) return "0.00";
    if (price >= 100) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    if (price >= 0.01) return price.toFixed(5);
    if (price >= 0.0001) return price.toFixed(6);
    return price.toFixed(8);
  };

  // Filter positions and trades based on active terminal
  const displayPositions = positions.filter((p) => {
    if (terminalTab === 'futures') return (p.accountType ?? "FUTURES") === "FUTURES";
    if (terminalTab === 'spot') return p.accountType === "SPOT";
    return true;
  });

  const displayTrades = recentTrades.filter((t) => {
    // Crypto dashboard: Indian trades carry INR P&L, which formatVal treats
    // as USD and multiplies by the INR rate (₹3,828 loss → "-$3,828 (-₹3.66L)").
    if (String(t.accountType ?? "").startsWith("INDIAN_") || t.market === "INDIA") return false;
    if (terminalTab === 'futures') return (t.accountType ?? "FUTURES") === "FUTURES";
    if (terminalTab === 'spot') return t.accountType === "SPOT";
    return true;
  });

  // The sidebar's Portfolio link (/crypto#portfolio) gets its own holdings view.
  // It used to scroll this dashboard, so Portfolio and Dashboard looked the same.
  if (location.hash === "#portfolio") {
    return (
      <CryptoPortfolioView
        mode={(mode as "PAPER" | "LIVE") || "PAPER"}
        balances={balances}
        livePrices={livePrices as any}
        inrRate={cryptoD.inrRate || 85}
      />
    );
  }

  return (
    <div className="crypto-terminal-page" style={{ background: BG, minHeight: "100%", padding: "16px 16px 64px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* 👑 HEADER: DISTINCT BRANDING PER TERMINAL */}
      <div className="crypto-terminal-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
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

        <div className="crypto-terminal-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
      <div className="crypto-terminal-tabs" style={{
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
            <div style={{ fontSize: 10, fontWeight: 700, color: terminalTab === 'futures' ? "#fbbf24" : "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <span>{terminalTab === 'futures' ? '⚡ BINANCE USD-M FUTURES EQUITY' : terminalTab === 'spot' ? '🛒 CRYPTO SPOT PORTFOLIO EQUITY' : 'TOTAL CRYPTO PORTFOLIO EQUITY'}</span>
              <span style={{
                fontSize: 9,
                fontWeight: 900,
                padding: "2px 7px",
                borderRadius: 4,
                background: mode === "LIVE" ? "rgba(220, 38, 38, 0.2)" : "rgba(59, 130, 246, 0.2)",
                color: mode === "LIVE" ? "#f87171" : "#60a5fa",
                border: `1px solid ${mode === "LIVE" ? "rgba(220, 38, 38, 0.4)" : "rgba(59, 130, 246, 0.4)"}`
              }}>
                {mode === "LIVE" ? "● LIVE BINANCE" : "○ PAPER SIMULATOR"}
              </span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {showValues ? formatEquity(terminalEquity) : "••••••••"}
              {showValues && (
                <span style={{ fontSize: 16, fontWeight: 800, color: "#fbbf24", marginLeft: 10, fontFamily: "sans-serif" }}>
                  (₹{(terminalEquity * inrRate).toLocaleString("en-IN", { maximumFractionDigits: 0 })})
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}
              title={`Total capital deposited into this account. Margin currently in open positions: $${terminalInvested.toFixed(2)}`}>
              <span>Capital Deposited:</span>
              <span style={{ color: "#f8fafc", fontWeight: 700 }}>
                {showValues ? `$${terminalCapitalDeposited.toFixed(2)} (₹${(terminalCapitalDeposited * inrRate).toFixed(0)})` : "••••••••"}
              </span>
              {terminalInvested > 0 && showValues && (
                <span style={{ color: "#94a3b8", fontSize: 10 }}>· Margin in use: ${terminalInvested.toFixed(2)}</span>
              )}
            </div>
            {mode === "LIVE" && terminalEquity === 0 && (
              <div style={{
                marginTop: 8,
                padding: "6px 12px",
                borderRadius: 8,
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.28)",
                color: "#fca5a5",
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                maxWidth: "fit-content"
              }}>
                <span style={{ fontWeight: 800 }}>⚠️ Live Binance IP Restricted:</span>
                <span>Your network IP changes dynamically (currently <strong>157.35.8.92</strong>). In Binance API Management, select <strong>"Unrestricted"</strong> to prevent IP rotation blocks, or switch to <strong>PAPER SIMULATOR</strong>.</span>
              </div>
            )}
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
              background: ((terminalEquity - terminalCapitalDeposited) >= 0) ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
              border: `1px solid ${((terminalEquity - terminalCapitalDeposited) >= 0) ? "#10b981" : "#ef4444"}`,
              padding: "8px 14px",
              borderRadius: 10,
              boxShadow: ((terminalEquity - terminalCapitalDeposited) >= 0) ? "0 0 12px rgba(16,185,129,0.2)" : "0 0 12px rgba(239,68,68,0.2)"
            }} title="Overall Net P&L: current value − money deposited (what your balance actually shows). Booked trade P&L is in the Realized card.">
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 900, color: "#f8fafc", textTransform: "uppercase" }}>
                  🔥 OVERALL TOTAL
                </span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: (terminalEquity - terminalCapitalDeposited) >= 0 ? "#34d399" : "#f87171", fontFamily: "monospace" }}>
                {formatVal(terminalEquity - terminalCapitalDeposited)}
              </span>
              <div style={{ fontSize: 8.5, color: "#cbd5e1", fontWeight: 600, marginTop: 1 }}>Current value − invested</div>
            </div>
          </div>
        </div>

        {/* Invested vs net result (current value − money deposited). */}
        <InvestmentSummary
          currency="$"
          invested={terminalCapitalDeposited}
          netPnl={terminalEquity - terminalCapitalDeposited}
          inOpenTrades={terminalInvested}
          openCount={displayPositions.length}
          deployed={capitalUsage?.deployed}
          tradeCount={capitalUsage?.trades}
          peak={capitalUsage?.peak}
          secondary={{ symbol: "₹", rate: inrRate }}
          hidden={!showValues}
          loading={!appConnected || !userId || userId === "mock-user-001"}
          note={terminalTab === "all" ? "Spot + Futures combined" : undefined}
        />

        {/* Controls, why-no-trade, P&L history and performance (parity with the Indian page). */}
        <CryptoControlCenter mode={mode} accountType={terminalTab === "all" ? "BOTH" : terminalTab === "futures" ? "FUTURES" : "SPOT"} />

        {/* Balance Allocation Strip */}
        <div className="crypto-balance-allocation" style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
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
                <span style={{ color: futuresMarginUsed > 0 ? "#fbbf24" : "#34d399", fontWeight: 700 }}>
                  {futuresMarginUsed > 0 ? `$${Math.max(0, (balances.futures || 0) - futuresMarginUsed).toFixed(2)} free` : "100% Free"}
                </span>
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
                Confidence: <span style={{ color: "var(--ds-text)", fontWeight: 700 }}>{consensus?.confidence != null ? `${(consensus.confidence * 100).toFixed(0)}% (4/4 Models)` : "— (loading)"}</span>
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

            {/* ── Inline error banner (futures) */}
            {orderError && terminalTab === 'futures' && (
              <div style={{
                marginTop: 10, padding: "10px 14px", borderRadius: 8,
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                  <AlertTriangle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fca5a5" }}>{orderError}</span>
                </div>
                {useAppStore.getState().mode === "PAPER" && (
                  <button
                    onClick={() => handleTopUpWallet("FUTURES", 1000)}
                    disabled={topUpLoading}
                    style={{
                      padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(16,185,129,0.4)",
                      background: "rgba(16,185,129,0.15)", color: "#34d399",
                      fontSize: 11, fontWeight: 800, cursor: topUpLoading ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", flexShrink: 0
                    }}
                  >
                    <Wallet size={12} />
                    {topUpLoading ? "Topping up…" : "+ $1,000 Top-Up"}
                  </button>
                )}
              </div>
            )}
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

            {/* ── Inline error banner (spot) */}
            {orderError && terminalTab === 'spot' && (
              <div style={{
                marginTop: 10, padding: "10px 14px", borderRadius: 8,
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                  <AlertTriangle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fca5a5" }}>{orderError}</span>
                </div>
                {useAppStore.getState().mode === "PAPER" && (
                  <button
                    onClick={() => handleTopUpWallet("SPOT", 1000)}
                    disabled={topUpLoading}
                    style={{
                      padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(16,185,129,0.4)",
                      background: "rgba(16,185,129,0.15)", color: "#34d399",
                      fontSize: 11, fontWeight: 800, cursor: topUpLoading ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", flexShrink: 0
                    }}
                  >
                    <Wallet size={12} />
                    {topUpLoading ? "Topping up…" : "+ $1,000 Top-Up"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <AILearningProgressPanel />

      {/* Main Grid: Chart + Intelligence Sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 16 }} className="chart-grid crypto-terminal-chart-grid">
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
                    {["Asset / Symbol", "Side", "Holding Qty", "Avg Buy Price", "Current Price", "Position Value", "AI Stop-Loss", "Gain / Loss ($)", "ROI (%)", "Action"].map((h) => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, fontWeight: 700, color: h === "AI Stop-Loss" ? "#f59e0b" : "var(--ds-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
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
                    const pnl = notional - costBasis - (entry * qty * 0.001) - (mark * qty * 0.001); // 0.1% Binance spot taker fee each leg
                    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
                    const tradeId = p.id || p.tradeId || p._id || `trade-${i}`;
                    // AI dynamic SL: use stored value if present, else 1.5×ATR (≈2% below entry for spot)
                    const storedSL = parseFloat(p.stopLoss ?? p.sl ?? p.stop_loss ?? 0);
                    const aiSL = storedSL > 0 ? storedSL : (entry * 0.97);
                    const slSource = storedSL > 0 ? "📌" : "🤖";
                    const slBreached = mark <= aiSL;

                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${BORD}` }}>
                        <td style={{ padding: "10px 14px", fontWeight: 800, color: "var(--ds-text)" }}>{p.symbol}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: "rgba(56,189,248,0.15)", color: "#38bdf8" }}>
                            SPOT 1:1
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700, color: "#f8fafc" }}>{qty}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${formatCoinPrice(entry)}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${formatCoinPrice(mark)}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700, color: "#38bdf8" }}>${notional.toFixed(2)}</td>
                        {/* AI Stop-Loss column */}
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 12, color: slBreached ? "#ef4444" : "#fbbf24" }}>
                              ${formatCoinPrice(aiSL)}
                            </span>
                            <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 3, background: slBreached ? "rgba(239,68,68,0.18)" : "rgba(16,185,129,0.15)", color: slBreached ? "#ef4444" : "#34d399", width: "fit-content" }}>
                              {slSource} {slBreached ? "AT RISK" : "SAFE"}
                            </span>
                          </div>
                        </td>
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
                    {["Symbol","Side","Lev","Size","Entry","Mark","AI Stop-Loss","Est Liq","Funding (8h)","Margin","Gain/Loss","ROI%","Action"].map((h) => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, fontWeight: 700, color: h === "AI Stop-Loss" ? "#f59e0b" : "var(--ds-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
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
                    // AI dynamic SL: stored value → else AI ATR formula scaled by leverage
                    const storedSL = parseFloat(p.stopLoss ?? p.sl ?? p.stop_loss ?? 0);
                    // For futures: tighter SL scaled by leverage (higher lev = tighter SL)
                    const atrPct = Math.max(0.008, Math.min(0.04, 1.5 / lev)); // 0.8%–4%
                    const aiSL = storedSL > 0
                      ? storedSL
                      : isLong
                        ? (entry * (1 - atrPct))
                        : (entry * (1 + atrPct));
                    const slSource = storedSL > 0 ? "📌" : "🤖 AI";
                    const slBreached = isLong ? mark <= aiSL : mark >= aiSL;

                    const fr = typeof p.fundingRate === "number" ? p.fundingRate : 0.0001;
                    const estFundingCost = notional * Math.abs(fr);

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
                        <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${formatCoinPrice(entry)}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${formatCoinPrice(mark)}</td>
                        {/* AI Stop-Loss column */}
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 12, color: slBreached ? "#ef4444" : "#fbbf24" }}>
                              ${formatCoinPrice(aiSL)}
                            </span>
                            <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 3, background: slBreached ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.15)", color: slBreached ? "#ef4444" : "#34d399", width: "fit-content" }}>
                              {slSource} {slBreached ? "⚠ AT RISK" : "SAFE"}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "#f87171" }}>
                          {estLiq > 0 ? `$${estLiq.toFixed(2)}` : "—"}
                        </td>
                        {/* Funding Rate (8h) */}
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: fr > 0 ? (isLong ? "#f87171" : "#34d399") : (isLong ? "#34d399" : "#f87171") }}>
                              {fr >= 0 ? "+" : ""}{(fr * 100).toFixed(4)}%
                            </span>
                            <span style={{ fontSize: 8, color: "var(--ds-text-faint)", fontFamily: "monospace" }}>
                              ${estFundingCost.toFixed(2)}/8h
                            </span>
                          </div>
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
                  {["Symbol","Type","Side","Size","Entry","Mark","AI Stop-Loss","Gain/Loss","ROI%","Action"].map((h) => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, fontWeight: 700, color: h === "AI Stop-Loss" ? "#f59e0b" : "var(--ds-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
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
                  const pnl = isSpot
                    ? grossPnl - (entry * qty * 0.001) - (mark * qty * 0.001)  // 0.1% spot taker fee each leg
                    : grossPnl - (entry * qty * 0.0004) - (mark * qty * 0.0004); // 0.04% futures taker fee
                  const notional = entry * qty;
                  const pnlPct = notional > 0 ? (pnl / notional) * 100 : 0;
                  const tradeId = p.id || p.tradeId || p._id || `trade-${i}`;
                  // AI dynamic SL for all-tab
                  const storedSLAll = parseFloat(p.stopLoss ?? p.sl ?? p.stop_loss ?? 0);
                  const isLongAll = side === "BUY" || side === "LONG";
                  const levAll = parseFloat(p.leverage ?? 1) || 1;
                  const atrPctAll = isSpot ? 0.03 : Math.max(0.008, Math.min(0.04, 1.5 / levAll));
                  const aiSLAll = storedSLAll > 0
                    ? storedSLAll
                    : isLongAll
                      ? (entry * (1 - atrPctAll))
                      : (entry * (1 + atrPctAll));
                  const slBreachedAll = isLongAll ? mark <= aiSLAll : mark >= aiSLAll;
                  const slSourceAll = storedSLAll > 0 ? "📌" : "🤖 AI";

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
                      <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${formatCoinPrice(entry)}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>${formatCoinPrice(mark)}</td>
                      {/* AI Stop-Loss column */}
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 12, color: slBreachedAll ? "#ef4444" : "#fbbf24" }}>
                            ${formatCoinPrice(aiSLAll)}
                          </span>
                          <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 3, background: slBreachedAll ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.15)", color: slBreachedAll ? "#ef4444" : "#34d399", width: "fit-content" }}>
                            {slSourceAll} {slBreachedAll ? "⚠ AT RISK" : "SAFE"}
                          </span>
                        </div>
                      </td>
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
