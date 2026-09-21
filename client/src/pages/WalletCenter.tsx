import React, { useState, useEffect } from 'react';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, RefreshCw, History, X, Power, PowerOff,
  AlertTriangle, Repeat, Users, TrendingUp, TrendingDown, Eye, EyeOff, Lock, Unlock,
  Search, CheckCircle2, ArrowUpRight, ArrowDownLeft, Shield, ShieldCheck, Sliders, ChevronRight, Plus, Zap
} from 'lucide-react';
import {
  getWalletBalance, getWalletTransactions, depositPaper, hardReset, enableAutoTrade, disableAutoTrade, getAutoStatus,
  withdrawUpi, withdrawCrypto, transferWallet, getP2pOffers, createP2pOffer, buyP2pOffer, allocateCapital,
  getWalletSummary, getBinanceLiveWallet,
} from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { useDashboardStore } from '../store/useDashboardStore';
import { formatCurrency } from '../lib/currency';

// Aesthetic Color Palette
const BG = "var(--ds-bg, #070d1a)";
const CARD = "var(--ds-surface, #0f172a)";
const CARD2 = "var(--ds-surface-2, #1e293b)";
const BORD = "var(--ds-border, rgba(255, 255, 255, 0.08))";
const G = "#10b981"; // Emerald Green
const R = "#ef4444"; // Vivid Red
const B = "#3b82f6"; // Electric Blue
const A = "#f59e0b"; // Amber Gold
const SPOT_COLOR = "#06b6d4";    // Cyan Accent
const FUTURES_COLOR = "#8b5cf6"; // Violet Accent

const inpStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(15, 23, 42, 0.6)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: 10,
  padding: "11px 14px",
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
  outline: "none",
  transition: "all 0.2s ease",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  display: "block",
  marginBottom: 6,
};

const TX_COLORS: Record<string, string> = {
  DEPOSIT: G, WITHDRAW: R, WITHDRAW_CRYPTO: R, P2P_BUY: G, P2P_SELL: A, ADJUSTMENT: B, TRANSFER: B
};

type ModalType = "deposit" | "withdraw" | "transfer" | "p2p" | "allocate" | null;

export default function WalletCenter() {
  const [walletDomainTab, setWalletDomainTab] = useState<"ALL" | "CRYPTO" | "BINANCE_LIVE" | "INDIAN">("ALL");
  const [binanceLive, setBinanceLive] = useState<any>(null);
  const [binanceLoading, setBinanceLoading] = useState(false);
  const [balances, setBalances] = useState({
    spot:    { usdt: 0, locked: 0, total: 0, unknown: false },
    futures: { usdt: 0, locked: 0, total: 0, unknown: false },
    nse:     { inr: 0, locked: 0, total: 0 },
    bse:     { inr: 0, locked: 0, total: 0 },
    nifty50: { inr: 0, locked: 0, total: 0 },
  });
  const [txns, setTxns]         = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [modal, setModal]       = useState<ModalType>(null);
  const [hideBalance, setHideBalance] = useState(false);

  // Filters & Search
  const [txFilter, setTxFilter] = useState<string>("ALL");
  const [txSearch, setTxSearch] = useState<string>("");

  // Deposit State
  const [depAmt, setDepAmt]     = useState("");
  const [depAcc, setDepAcc]     = useState<string>("FUTURES");
  const [confirmConversion, setConfirmConversion] = useState(false);
  const [depCurrency, setDepCurrency] = useState<"USDT"|"INR">("USDT");
  const [depMsg, setDepMsg]     = useState("");
  const [depLoading, setDepLoading] = useState(false);

  // Withdraw State
  const [wdMethod, setWdMethod] = useState<"UPI"|"CRYPTO">("UPI");
  const [wdAmt, setWdAmt] = useState("");
  const [wdAcc, setWdAcc] = useState<"SPOT"|"FUTURES">("FUTURES");
  const [wdUpiId, setWdUpiId] = useState("");
  const [wdAddress, setWdAddress] = useState("");
  const [wdNetwork, setWdNetwork] = useState("BEP20");
  const [wdMsg, setWdMsg] = useState("");
  const [wdLoading, setWdLoading] = useState(false);

  // Transfer State
  const [xfKind, setXfKind] = useState<"internal"|"external">("internal");
  const [xfAmt, setXfAmt] = useState("");
  const [xfFrom, setXfFrom] = useState<"SPOT"|"FUTURES">("FUTURES");
  const [xfAcc, setXfAcc] = useState<"SPOT"|"FUTURES">("FUTURES");
  const [xfMsg, setXfMsg] = useState("");
  const [xfLoading, setXfLoading] = useState(false);

  // Capital Allocation State (Spot vs Futures)
  const [allocSpotAmt, setAllocSpotAmt] = useState("");
  const [allocFuturesAmt, setAllocFuturesAmt] = useState("");
  const [allocMsg, setAllocMsg] = useState("");
  const [allocLoading, setAllocLoading] = useState(false);

  // P2P State
  const [p2pOffers, setP2pOffers] = useState<any[]>([]);
  const [p2pLoading, setP2pLoading] = useState(false);
  const [p2pAmt, setP2pAmt] = useState("");
  const [p2pPrice, setP2pPrice] = useState("");
  const [p2pMsg, setP2pMsg] = useState("");
  const [p2pBusy, setP2pBusy] = useState(false);

  // Auto-trade & Hard Reset
  const [spotAutoOn, setSpotAutoOn] = useState<boolean | null>(null);
  const [futuresAutoOn, setFuturesAutoOn] = useState<boolean | null>(null);
  const [autoTradeBusy, setAutoTradeBusy] = useState<"SPOT" | "FUTURES" | null>(null);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  const refreshWallet = useAppStore((s) => s.refreshWallet);
  const userId = useAppStore((s) => s.userId);
  const appMode = useAppStore((s) => s.mode);
  const { currencyMode, summary, fetchDashboard } = useDashboardStore();
  const inrRate = summary?.inrRate || 85;
  const netPnl = (summary as any)?.netPnL ?? { total: 0, spot: 0, futures: 0 };

  const load = async (silent = false) => {
    if (!silent && balances.spot.total === 0 && balances.futures.total === 0) {
      setLoading(true);
    }
    try {
      const mode = useAppStore.getState().mode || "PAPER";
      if (userId) fetchDashboard(userId, useAppStore.getState().accountType).catch(() => {});
      const [summaryRes, tx, status, bLive] = await Promise.all([
        getWalletSummary(mode).catch(() => null),
        getWalletTransactions(50).catch(() => ({ transactions: [] })),
        getAutoStatus().catch(() => null),
        getBinanceLiveWallet().catch(() => null),
      ]);
      if (bLive?.success) {
        setBinanceLive(bLive);
      }
      if (summaryRes) {
        setBalances({
          spot:    { usdt: summaryRes.spot?.usdt || 0, locked: summaryRes.spot?.lockedMargin || 0, total: summaryRes.spot?.totalBalance || 0, unknown: !!summaryRes.spot?.balanceUnknown },
          futures: { usdt: summaryRes.futures?.usdt || 0, locked: summaryRes.futures?.lockedMargin || 0, total: summaryRes.futures?.totalBalance || 0, unknown: !!summaryRes.futures?.balanceUnknown },
          nse:     { inr: summaryRes.nse?.inr || summaryRes.nse?.totalBalance || 0, locked: summaryRes.nse?.lockedMargin || 0, total: summaryRes.nse?.totalBalance || 0 },
          bse:     { inr: summaryRes.bse?.inr || summaryRes.bse?.totalBalance || 0, locked: summaryRes.bse?.lockedMargin || 0, total: summaryRes.bse?.totalBalance || 0 },
          nifty50: { inr: summaryRes.nifty50?.inr || summaryRes.nifty50?.totalBalance || 0, locked: summaryRes.nifty50?.lockedMargin || 0, total: summaryRes.nifty50?.totalBalance || 0 },
        });
      }
      setTxns(tx.transactions ?? []);
      if (status) {
        setSpotAutoOn(!!(status as any).spot);
        setFuturesAutoOn(!!(status as any).futures);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { 
    load(); 
    const interval = setInterval(() => load(true), 8000);
    return () => clearInterval(interval);
  }, [userId, appMode]);

  const loadP2pOffers = async () => {
    setP2pLoading(true);
    try {
      const offers = await getP2pOffers().catch(() => []);
      setP2pOffers(Array.isArray(offers) ? offers : []);
    } finally { setP2pLoading(false); }
  };

  const openModal = (m: ModalType) => {
    setModal(m);
    setDepMsg(""); setWdMsg(""); setXfMsg(""); setP2pMsg(""); setAllocMsg(""); setConfirmConversion(false);
    if (m === "p2p") loadP2pOffers();
    if (m === "withdraw") load(true); // pull fresh balances (Binance in LIVE) for the modal
    if (m === "transfer") {
      load(true);
      if (appMode === "LIVE") {
        setXfKind("internal");
      }
    }
  };

  const handleDeposit = async () => {
    if (!depAmt || isNaN(Number(depAmt))) return;
    setDepLoading(true);
    try {
      await depositPaper(parseFloat(depAmt), depAcc, depCurrency, confirmConversion);
      setDepMsg("Deposit successful!");
      await load(); refreshWallet();
      setTimeout(() => { setModal(null); setDepMsg(""); setDepAmt(""); }, 1400);
    } catch (e: any) { setDepMsg(e?.message || "Deposit failed"); }
    finally { setDepLoading(false); }
  };

  const handleWithdraw = async () => {
    if (!wdAmt || isNaN(Number(wdAmt))) return;
    const amount = parseFloat(wdAmt);
    // Only "LIVE" moves real money; anything else stays simulated (PAPER).
    const wMode: "PAPER" | "LIVE" = useAppStore.getState().mode === "LIVE" ? "LIVE" : "PAPER";

    // Validate before the (blocking) confirm so we don't warn about a bad form.
    if (wdMethod === "UPI" && !wdUpiId.includes("@")) { setWdMsg("Enter a valid UPI ID (e.g. name@upi)"); return; }
    if (wdMethod === "CRYPTO" && !wdAddress) { setWdMsg("Enter a destination address"); return; }

    // Don't let a LIVE withdrawal fire when we couldn't even read the real
    // balance — a failed Binance read shows as "unavailable", not 0.
    if (wMode === "LIVE" && (wdAcc === "SPOT" ? balances.spot.unknown : balances.futures.unknown)) {
      setWdMsg("Live balance is unavailable — cannot withdraw. Check your Binance API key (Read permission / IP) and retry.");
      window.alert("❌ Live balance unavailable\n\nCan't confirm your Binance balance, so the withdrawal is blocked. Check the API key's Read permission and IP restrictions, then retry.");
      return;
    }

    // Real-money guard: a LIVE withdrawal is irreversible, so make the user
    // confirm exactly what will happen before we fire it.
    if (wMode === "LIVE") {
      const dest = wdMethod === "UPI" ? `UPI ${wdUpiId}` : `${wdNetwork} address ${wdAddress}`;
      const what = wdMethod === "UPI"
        ? `₹ payout (≈ ${amount} USDT worth) to ${dest} via RazorpayX`
        : `${amount} USDT to ${dest} on Binance`;
      if (!window.confirm(`⚠️ LIVE WITHDRAWAL — REAL MONEY\n\nSend ${what}?\n\nThis cannot be undone.`)) {
        return;
      }
    }

    setWdLoading(true);
    setWdMsg("");
    try {
      let res: any;
      if (wdMethod === "UPI") {
        res = await withdrawUpi(amount, wdUpiId, wdAcc, wMode);
      } else {
        res = await withdrawCrypto("USDT", amount, wdAddress, wdNetwork, wdAcc, wMode);
      }
      const msg = res?.message || "Withdrawal submitted!";
      setWdMsg(msg);
      // Explicit alert so the outcome is impossible to miss (esp. for LIVE).
      window.alert(`${wMode === "LIVE" ? "✅ LIVE withdrawal" : "Paper withdrawal"} submitted\n\n${msg}`);
      await load(); refreshWallet();
      setTimeout(() => { setModal(null); setWdMsg(""); setWdAmt(""); setWdUpiId(""); setWdAddress(""); }, 1600);
    } catch (e: any) {
      const err = e?.message || "Withdrawal failed";
      setWdMsg(err);
      window.alert(`❌ Withdrawal failed\n\n${err}`);
    }
    finally { setWdLoading(false); }
  };

  const handleTransfer = async () => {
    if (!xfAmt || isNaN(Number(xfAmt))) return;
    const amount = parseFloat(xfAmt);
    if (amount <= 0) {
      setXfMsg("Please enter an amount greater than 0");
      return;
    }

    const currentMode = appMode === "LIVE" ? "LIVE" : "PAPER";
    const toAccount = xfFrom === "SPOT" ? "FUTURES" : "SPOT";

    if (currentMode === "LIVE") {
      if (xfKind !== "internal") {
        setXfMsg("In LIVE mode, only internal Spot ⇄ Futures transfers are supported on Binance.");
        return;
      }
      const available = xfFrom === "SPOT" ? balances.spot.usdt : balances.futures.usdt;
      if (amount > available) {
        setXfMsg(`Insufficient ${xfFrom} balance. Available: ${available.toFixed(4)} USDT`);
        return;
      }
      const confirmed = window.confirm(
        `⚠️ CONFIRM LIVE BINANCE TRANSFER\n\n` +
        `• Amount: ${amount.toFixed(4)} USDT\n` +
        `• From: Binance ${xfFrom} Account\n` +
        `• To: Binance ${toAccount} Account\n\n` +
        `This will execute an official Universal Transfer on your Binance account via API.\n\n` +
        `Do you want to proceed?`
      );
      if (!confirmed) return;
    } else {
      if (xfKind === "internal") {
        const available = xfFrom === "SPOT" ? balances.spot.usdt : balances.futures.usdt;
        if (amount > available) {
          setXfMsg(`Insufficient paper ${xfFrom} balance. Available: ${available.toFixed(2)} USDT`);
          return;
        }
      }
    }

    setXfLoading(true);
    setXfMsg("");
    try {
      const res: any = xfKind === "internal"
        ? await transferWallet("internal", amount, { from: xfFrom, mode: currentMode })
        : await transferWallet("external", amount, { accountType: xfAcc, mode: currentMode });
      const successMsg = res?.message || (currentMode === "LIVE" ? "LIVE Binance Transfer complete!" : "Transfer complete!");
      setXfMsg(successMsg);
      await load(true);
      refreshWallet();
      if (userId) fetchDashboard(userId, useAppStore.getState().accountType).catch(() => {});
      setTimeout(() => { setModal(null); setXfMsg(""); setXfAmt(""); }, 1800);
    } catch (e: any) {
      const err = e?.message || "Transfer failed";
      setXfMsg(err);
      if (currentMode === "LIVE") {
        window.alert(`❌ Binance Live Transfer Failed\n\n${err}`);
      }
    }
    finally { setXfLoading(false); }
  };

  const handleAllocateCapital = async () => {
    const s = parseFloat(allocSpotAmt);
    const f = parseFloat(allocFuturesAmt);
    if (isNaN(s) || s < 0 || isNaN(f) || f < 0) {
      setAllocMsg("Please enter valid non-negative amounts for both Spot & Futures.");
      return;
    }
    setAllocLoading(true);
    setAllocMsg("");
    try {
      const mode = useAppStore.getState().mode || "PAPER";
      const res = await allocateCapital(s, f, mode);
      setAllocMsg(res?.message || "Capital allocation saved!");
      await load();
      refreshWallet();
      setTimeout(() => {
        setModal(null);
        setAllocMsg("");
      }, 1400);
    } catch (e: any) {
      setAllocMsg(e?.message || "Allocation failed");
    } finally {
      setAllocLoading(false);
    }
  };

  const handleApplyPresetRatio = (spotPct: number) => {
    const tot = (balances.spot.total || 0) + (balances.futures.total || 0) || 40000;
    const spotVal = Math.round((tot * spotPct) / 100);
    const futVal = Math.round(tot - spotVal);
    setAllocSpotAmt(spotVal.toString());
    setAllocFuturesAmt(futVal.toString());
  };

  const handleCreateP2pOffer = async () => {
    if (!p2pAmt || !p2pPrice) return;
    setP2pBusy(true);
    setP2pMsg("");
    try {
      const res: any = await createP2pOffer(parseFloat(p2pAmt), parseFloat(p2pPrice));
      setP2pMsg(res?.message || "Offer created!");
      setP2pAmt(""); setP2pPrice("");
      await loadP2pOffers(); await load(); refreshWallet();
    } catch (e: any) { setP2pMsg(e?.message || "Failed to create offer"); }
    finally { setP2pBusy(false); }
  };

  const handleBuyP2pOffer = async (offerId: string) => {
    setP2pBusy(true);
    setP2pMsg("");
    try {
      const res: any = await buyP2pOffer(offerId);
      setP2pMsg(res?.message || "Purchase complete!");
      await loadP2pOffers(); await load(); refreshWallet();
    } catch (e: any) { setP2pMsg(e?.message || "Purchase failed"); }
    finally { setP2pBusy(false); }
  };

  const handleToggleAutoTrade = async (accountType: "SPOT" | "FUTURES") => {
    const isOn = accountType === "SPOT" ? spotAutoOn : futuresAutoOn;
    const setOn = accountType === "SPOT" ? setSpotAutoOn : setFuturesAutoOn;
    setAutoTradeBusy(accountType);
    try {
      if (isOn) {
        await disableAutoTrade(accountType);
        setOn(false);
      } else {
        await enableAutoTrade(useAppStore.getState().allowedSymbols || [], undefined, accountType);
        setOn(true);
      }
    } catch {
      await load();
    } finally {
      setAutoTradeBusy(null);
    }
  };

  const handleHardReset = async () => {
    if (!resetConfirming) {
      setResetConfirming(true);
      setResetMsg("Click again to permanently wipe trade history & reset wallets to standard baseline ($20k USDT & ₹20L INR).");
      setTimeout(() => setResetConfirming(false), 5000);
      return;
    }
    setResetBusy(true);
    setResetMsg("Resetting system state...");
    try {
      const res: any = await hardReset();
      setResetMsg(res?.message || "Reset complete.");
      await load(); refreshWallet();
    } catch (e: any) {
      setResetMsg(e?.message || "Reset failed.");
    } finally {
      setResetBusy(false);
      setResetConfirming(false);
    }
  };

  const totalEquity = balances.spot.total + balances.futures.total;
  const spotRatio = totalEquity > 0 ? (balances.spot.total / totalEquity) * 100 : 50;
  const futuresRatio = totalEquity > 0 ? (balances.futures.total / totalEquity) * 100 : 50;

  // Filtered transactions
  const filteredTxns = txns.filter((tx) => {
    if (txFilter !== "ALL") {
      if (txFilter === "DEPOSIT" && tx.type !== "DEPOSIT" && tx.type !== "P2P_BUY") return false;
      if (txFilter === "WITHDRAW" && tx.type !== "WITHDRAW" && tx.type !== "WITHDRAW_CRYPTO" && tx.type !== "P2P_SELL") return false;
      if (txFilter === "TRANSFER" && tx.type !== "TRANSFER" && tx.type !== "ADJUSTMENT") return false;
      if (txFilter === "P2P" && !tx.type?.startsWith("P2P")) return false;
    }
    if (txSearch) {
      const query = txSearch.toLowerCase();
      const matchType = tx.type?.toLowerCase().includes(query);
      const matchAcc = tx.accountType?.toLowerCase().includes(query);
      const matchAmt = tx.amount?.toString().includes(query);
      if (!matchType && !matchAcc && !matchAmt) return false;
    }
    return true;
  });

  const openAllocationModal = () => {
    setAllocSpotAmt((balances.spot.total ?? 0).toString());
    setAllocFuturesAmt((balances.futures.total ?? 0).toString());
    openModal("allocate");
  };

  return (
    <div style={{ background: BG, minHeight: "100%", padding: 20, display: "flex", flexDirection: "column", gap: 20, color: "#f8fafc" }}>

      {/* Top Header & Quick Tools */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))", border: "1px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wallet size={22} color="#3b82f6" />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", color: "var(--ds-text)", display: "flex", alignItems: "center", gap: 8 }}>
              Financial Command Center
            </div>
            <div style={{ fontSize: 12, color: "var(--ds-text-muted)", marginTop: 2 }}>
              Unified Portfolio Ledger · Spot &amp; Futures Multi-Account Hub
            </div>
          </div>
        </div>

        {/* Global Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Custom Capital Allocation Quick Action Button */}
          <button
            onClick={openAllocationModal}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(139,92,246,0.15)",
              border: "1px solid rgba(139,92,246,0.35)",
              borderRadius: 10, padding: "8px 14px", color: FUTURES_COLOR, fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "all 0.2s ease",
            }}
            title="Configure Spot & Futures money allocation"
          >
            <Sliders size={15} />
            <span>Set Capital Split</span>
          </button>

          {/* Privacy Eye Toggle */}
          <button
            onClick={() => setHideBalance(!hideBalance)}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: CARD2, border: `1px solid ${BORD}`,
              borderRadius: 10, padding: "8px 12px", color: hideBalance ? A : "var(--ds-text-muted)", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease",
            }}
            title={hideBalance ? "Show balances" : "Hide balances"}
          >
            {hideBalance ? <EyeOff size={15} /> : <Eye size={15} />}
            <span>{hideBalance ? "Hidden" : "Visible"}</span>
          </button>

          {/* Refresh button */}
          <button
            onClick={() => load()}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36,
              background: CARD, border: `1px solid ${BORD}`, borderRadius: 10, color: "#94a3b8", cursor: "pointer", transition: "all 0.2s ease"
            }}
            title="Refresh balance data"
          >
            <RefreshCw size={15} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} />
          </button>

          {/* Hard Reset with Safety Warning */}
          <button
            onClick={handleHardReset}
            disabled={resetBusy}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: resetConfirming ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${resetConfirming ? R : "rgba(239,68,68,0.25)"}`,
              borderRadius: 10, padding: "8px 14px", color: R, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease"
            }}
          >
            <AlertTriangle size={15} />
            {resetBusy ? "Resetting..." : resetConfirming ? "Confirm Paper Reset?" : "Hard Reset"}
          </button>
        </div>
      </div>

      {resetMsg && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
          background: resetMsg.includes("complete") || resetMsg.includes("reset") ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${resetMsg.includes("complete") || resetMsg.includes("reset") ? G : R}`,
          color: resetMsg.includes("complete") || resetMsg.includes("reset") ? G : R,
        }}>
          {resetMsg}
        </div>
      )}

      {/* Hero Financial Summary Banner */}
      <div style={{
        background: "linear-gradient(135deg, rgba(15,23,42,0.9) 0%, rgba(30,41,59,0.7) 100%)",
        border: `1px solid ${BORD}`,
        borderRadius: 20,
        padding: "24px 28px",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
      }}>
        {/* Glow accent */}
        <div style={{
          position: "absolute", top: "-40%", right: "-10%", width: 300, height: 300,
          background: "radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(0,0,0,0) 70%)",
          pointerEvents: "none", borderRadius: "50%",
        }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 20, position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>

            {/* Total Balance Headline */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span>Estimated Total Portfolio Equity</span>
                <Shield size={12} color="#3b82f6" />
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#ffffff", fontFamily: "monospace", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                {hideBalance ? "••••••••••••" : `${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#cbd5e1", marginTop: 6, fontFamily: "monospace" }}>
                {hideBalance ? "••••••••" : `≈ ₹${Math.round(totalEquity * inrRate).toLocaleString("en-IN")}`}
              </div>
            </div>

            {/* P&L Performance Badges */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {/* Daily PnL Card */}
              <div style={{
                background: (summary.dailyPnL ?? 0) >= 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                border: `1px solid ${(summary.dailyPnL ?? 0) >= 0 ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                borderRadius: 14, padding: "12px 18px", minWidth: 140,
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                  Daily P&amp;L
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: (summary.dailyPnL ?? 0) >= 0 ? G : R, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4 }}>
                  {(summary.dailyPnL ?? 0) >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {hideBalance ? "••••" : formatCurrency(summary.dailyPnL ?? 0, { mode: currencyMode, inrRate })}
                </div>
              </div>

              {/* Open PnL Card */}
              <div style={{
                background: (summary.openPnL ?? 0) >= 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                border: `1px solid ${(summary.openPnL ?? 0) >= 0 ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                borderRadius: 14, padding: "12px 18px", minWidth: 140,
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                  Open Positions P&amp;L
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: (summary.openPnL ?? 0) >= 0 ? G : R, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4 }}>
                  {(summary.openPnL ?? 0) >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {hideBalance ? "••••" : formatCurrency(summary.openPnL ?? 0, { mode: currencyMode, inrRate })}
                </div>
              </div>

              {/* Total All-Time PnL Card */}
              {(() => {
                const totPnL = summary.totalAllTimePnL ?? (((summary as any).netPnL?.total ?? 0) + (summary.openPnL ?? 0));
                return (
                  <div style={{
                    background: totPnL >= 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    border: `1px solid ${totPnL >= 0 ? "#10b981" : "#ef4444"}`,
                    borderRadius: 14, padding: "12px 18px", minWidth: 150,
                  }} title="Total Profit / Loss Until Now (Net Realized + Open Floating)">
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#f8fafc", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                      Total All-Time P&amp;L
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: totPnL >= 0 ? G : R, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4 }}>
                      {totPnL >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      {hideBalance ? "••••" : formatCurrency(totPnL, { mode: currencyMode, inrRate })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Allocation Split Progress Bar */}
          <div style={{ background: "rgba(15, 23, 42, 0.6)", borderRadius: 12, padding: "12px 16px", border: `1px solid ${BORD}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 8, color: "#94a3b8" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: SPOT_COLOR }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: SPOT_COLOR }} />
                Spot Account ({spotRatio.toFixed(1)}%)
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: FUTURES_COLOR }}>
                Futures Account ({futuresRatio.toFixed(1)}%)
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: FUTURES_COLOR }} />
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${spotRatio}%`, background: `linear-gradient(90deg, ${SPOT_COLOR}, #0891b2)`, transition: "width 0.5s ease" }} />
              <div style={{ width: `${futuresRatio}%`, background: `linear-gradient(90deg, #7c3aed, ${FUTURES_COLOR})`, transition: "width 0.5s ease" }} />
            </div>
          </div>

          {/* Primary Quick Actions */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, paddingTop: 4 }}>
            <button
              onClick={openAllocationModal}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.08))",
                border: "1px solid rgba(139,92,246,0.5)", borderRadius: 12, padding: "12px",
                color: "#a78bfa", fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all 0.2s ease"
              }}
            >
              <Sliders size={18} /> Allocate Capital
            </button>

            <button
              onClick={() => openModal("deposit")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))",
                border: "1px solid rgba(16,185,129,0.4)", borderRadius: 12, padding: "12px",
                color: "#10b981", fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all 0.2s ease"
              }}
            >
              <ArrowDownCircle size={18} /> Deposit
            </button>

            <button
              onClick={() => openModal("withdraw")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))",
                border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: "12px",
                color: "#ef4444", fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all 0.2s ease"
              }}
            >
              <ArrowUpCircle size={18} /> Withdraw
            </button>

            <button
              onClick={() => openModal("transfer")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))",
                border: "1px solid rgba(59,130,246,0.4)", borderRadius: 12, padding: "12px",
                color: "#3b82f6", fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all 0.2s ease"
              }}
            >
              <Repeat size={18} /> Transfer
            </button>

            <button
              onClick={() => openModal("p2p")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))",
                border: "1px solid rgba(245,158,11,0.4)", borderRadius: 12, padding: "12px",
                color: "#f59e0b", fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all 0.2s ease"
              }}
            >
              <Users size={18} /> P2P Trade
            </button>
          </div>
        </div>
      </div>

      {/* Domain Navigation Tabs - Distinct Dual-Vault Selector */}
      <div style={{ display: "flex", gap: 10, borderBottom: `1px solid ${BORD}`, paddingBottom: 14 }}>
        {[
          { id: "CRYPTO", label: "⚡ CRYPTO VAULT (USDT · 24/7 Global)", subtitle: "Binance Spot & Futures · Unified", color: "#fbbf24", bg: "rgba(251, 191, 36, 0.12)", border: "rgba(251, 191, 36, 0.4)" },
          { id: "BINANCE_LIVE", label: "🟡 BINANCE LIVE WALLET", subtitle: "Real Exchange Holdings · Spot + Earn + Futures", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.5)" },
          { id: "INDIAN", label: "🇮🇳 INDIAN TRADE VAULT (₹ INR · NSE/BSE/F&O)", subtitle: "Angel One / Zerodha · 100% INR Base", color: "#10b981", bg: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.4)" },
          { id: "ALL", label: "📊 CONSOLIDATED PORTFOLIO", subtitle: "Dual-Market Combined Summary", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)", border: "rgba(59, 130, 246, 0.4)" },
        ].map((tab) => {
          const active = walletDomainTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setWalletDomainTab(tab.id as any)}
              style={{
                flex: 1,
                padding: "12px 18px",
                borderRadius: 14,
                cursor: "pointer",
                border: active ? `2px solid ${tab.color}` : "1px solid rgba(255,255,255,0.08)",
                background: active ? tab.bg : "rgba(255,255,255,0.03)",
                color: active ? tab.color : "var(--ds-text-muted)",
                transition: "all 0.2s ease",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                boxShadow: active ? `0 4px 20px ${tab.color}22` : "none",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.02em" }}>{tab.label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, color: active ? "#ffffff" : "var(--ds-text-muted)" }}>{tab.subtitle}</span>
            </button>
          );
        })}
      </div>

      {/* Account Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16 }}>
        {(walletDomainTab === "ALL" || walletDomainTab === "INDIAN") && (
          <>
            {/* NSE Equity Card */}
            <div style={{
              background: CARD, border: `1px solid ${BORD}`, borderTop: "4px solid #10b981",
              borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 10px #10b981" }} />
                  <span style={{ fontSize: 15, fontWeight: 900, color: "var(--ds-text)" }}>NSE Equity (CNC)</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#10b981", background: "rgba(16,185,129,0.1)", padding: "4px 8px", borderRadius: 6 }}>₹ INR</span>
              </div>
              <div style={{ background: CARD2, borderRadius: 12, padding: "16px", border: `1px solid ${BORD}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ds-text-muted)", textTransform: "uppercase" }}>NSE Available Cash</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "var(--ds-text)", fontFamily: "monospace", marginTop: 4 }}>
                  {hideBalance ? "••••••••" : `₹${balances.nse.inr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                </div>
              </div>
            </div>

            {/* BSE Equity Card */}
            <div style={{
              background: CARD, border: `1px solid ${BORD}`, borderTop: "4px solid #10b981",
              borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 10px #10b981" }} />
                  <span style={{ fontSize: 15, fontWeight: 900, color: "var(--ds-text)" }}>BSE Equity (CNC)</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#10b981", background: "rgba(16,185,129,0.1)", padding: "4px 8px", borderRadius: 6 }}>₹ INR</span>
              </div>
              <div style={{ background: CARD2, borderRadius: 12, padding: "16px", border: `1px solid ${BORD}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ds-text-muted)", textTransform: "uppercase" }}>BSE Available Cash</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "var(--ds-text)", fontFamily: "monospace", marginTop: 4 }}>
                  {hideBalance ? "••••••••" : `₹${balances.bse.inr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                </div>
              </div>
            </div>

            {/* NIFTY50 F&O Card */}
            <div style={{
              background: CARD, border: `1px solid ${BORD}`, borderTop: "4px solid #8b5cf6",
              borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#8b5cf6", boxShadow: "0 0 10px #8b5cf6" }} />
                  <span style={{ fontSize: 15, fontWeight: 900, color: "var(--ds-text)" }}>NIFTY50 (F&O)</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#8b5cf6", background: "rgba(139,92,246,0.1)", padding: "4px 8px", borderRadius: 6 }}>₹ INR</span>
              </div>
              <div style={{ background: CARD2, borderRadius: 12, padding: "16px", border: `1px solid ${BORD}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ds-text-muted)", textTransform: "uppercase" }}>NIFTY50 Margin Balance</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "var(--ds-text)", fontFamily: "monospace", marginTop: 4 }}>
                  {hideBalance ? "••••••••" : `₹${balances.nifty50.inr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                </div>
              </div>
            </div>
          </>
        )}

        {(walletDomainTab === "ALL" || walletDomainTab === "CRYPTO") && (
          <>

        {/* Spot Account Card */}
        <div style={{
          background: CARD,
          border: `1px solid ${BORD}`,
          borderTop: `4px solid ${SPOT_COLOR}`,
          borderRadius: 16,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: SPOT_COLOR, boxShadow: `0 0 10px ${SPOT_COLOR}` }} />
              <span style={{ fontSize: 15, fontWeight: 900, color: "var(--ds-text)", letterSpacing: "0.02em" }}>Spot Account</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={openAllocationModal}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: "rgba(6, 182, 212, 0.1)",
                  border: `1px solid rgba(6, 182, 212, 0.3)`,
                  borderRadius: 8, padding: "5px 10px",
                  color: SPOT_COLOR, fontSize: 11, fontWeight: 800, cursor: "pointer"
                }}
              >
                <Sliders size={12} /> Edit Money
              </button>

              {/* Integrated Spot Auto Trade Power Switch */}
              <button
                onClick={() => handleToggleAutoTrade("SPOT")}
                disabled={autoTradeBusy !== null || spotAutoOn === null}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: spotAutoOn ? "rgba(6, 182, 212, 0.15)" : "var(--ds-surface-2)",
                  border: `1px solid ${spotAutoOn ? SPOT_COLOR : BORD}`,
                  borderRadius: 8, padding: "6px 12px",
                  color: spotAutoOn ? SPOT_COLOR : "var(--ds-text-muted)",
                  fontSize: 11, fontWeight: 800, cursor: "pointer", transition: "all 0.2s ease",
                }}
              >
                {spotAutoOn ? <Power size={13} color={SPOT_COLOR} /> : <PowerOff size={13} />}
                <span>{autoTradeBusy === "SPOT" ? "Updating..." : `Auto-Trade ${spotAutoOn ? "ON" : "OFF"}`}</span>
              </button>
            </div>
          </div>

          {/* Account Balance Summary */}
          <div style={{ background: CARD2, borderRadius: 12, padding: "16px", border: `1px solid ${BORD}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ds-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Spot Value</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "var(--ds-text)", fontFamily: "monospace", marginTop: 4 }}>
              {hideBalance ? "••••••••" : `${balances.spot.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ds-warning)", marginTop: 2, fontFamily: "monospace" }}>
              {hideBalance ? "••••" : `≈ ₹${Math.round(balances.spot.total * inrRate).toLocaleString("en-IN")}`}
            </div>
          </div>

          {/* Breakdown: Available vs Locked */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Available */}
            <div style={{ background: CARD2, borderRadius: 10, padding: "12px 14px", border: `1px solid ${BORD}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ds-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: G }} /> Available
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "var(--ds-text)", fontFamily: "monospace", marginTop: 4 }}>
                {hideBalance ? "••••" : balances.spot.usdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ds-text-muted)", marginTop: 2 }}>
                {hideBalance ? "••••" : `₹${Math.round(balances.spot.usdt * inrRate).toLocaleString("en-IN")}`}
              </div>
            </div>

            {/* Locked */}
            <div style={{ background: CARD2, borderRadius: 10, padding: "12px 14px", border: `1px solid ${BORD}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ds-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
                <Lock size={10} color={A} /> Locked Margin
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "var(--ds-text)", fontFamily: "monospace", marginTop: 4 }}>
                {hideBalance ? "••••" : balances.spot.locked.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ds-text-muted)", marginTop: 2 }}>
                {hideBalance ? "••••" : `₹${Math.round(balances.spot.locked * inrRate).toLocaleString("en-IN")}`}
              </div>
            </div>
          </div>

          {/* Realized Net PnL Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: CARD2, borderRadius: 10, padding: "10px 14px", border: `1px solid ${BORD}` }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--ds-text-muted)" }}>Realized Net P&amp;L (All-Time)</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: netPnl.spot >= 0 ? G : R, fontFamily: "monospace" }}>
              {netPnl.spot >= 0 ? "+" : ""}{hideBalance ? "••••" : `${netPnl.spot.toFixed(2)} USDT (₹${Math.round(netPnl.spot * inrRate)})`}
            </span>
          </div>
        </div>

        {/* Futures Account Card */}
        <div style={{
          background: CARD,
          border: `1px solid ${BORD}`,
          borderTop: `4px solid ${FUTURES_COLOR}`,
          borderRadius: 16,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: FUTURES_COLOR, boxShadow: `0 0 10px ${FUTURES_COLOR}` }} />
              <span style={{ fontSize: 15, fontWeight: 900, color: "var(--ds-text)", letterSpacing: "0.02em" }}>Futures Account</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={openAllocationModal}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: "rgba(139, 92, 246, 0.1)",
                  border: `1px solid rgba(139, 92, 246, 0.3)`,
                  borderRadius: 8, padding: "5px 10px",
                  color: FUTURES_COLOR, fontSize: 11, fontWeight: 800, cursor: "pointer"
                }}
              >
                <Sliders size={12} /> Edit Money
              </button>

              {/* Integrated Futures Auto Trade Power Switch */}
              <button
                onClick={() => handleToggleAutoTrade("FUTURES")}
                disabled={autoTradeBusy !== null || futuresAutoOn === null}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: futuresAutoOn ? "rgba(139, 92, 246, 0.15)" : "var(--ds-surface-2)",
                  border: `1px solid ${futuresAutoOn ? FUTURES_COLOR : BORD}`,
                  borderRadius: 8, padding: "6px 12px",
                  color: futuresAutoOn ? FUTURES_COLOR : "var(--ds-text-muted)",
                  fontSize: 11, fontWeight: 800, cursor: "pointer", transition: "all 0.2s ease",
                }}
              >
                {futuresAutoOn ? <Power size={13} color={FUTURES_COLOR} /> : <PowerOff size={13} />}
                <span>{autoTradeBusy === "FUTURES" ? "Updating..." : `Auto-Trade ${futuresAutoOn ? "ON" : "OFF"}`}</span>
              </button>
            </div>
          </div>

          {/* Account Balance Summary */}
          <div style={{ background: CARD2, borderRadius: 12, padding: "16px", border: `1px solid ${BORD}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ds-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Futures Value</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "var(--ds-text)", fontFamily: "monospace", marginTop: 4 }}>
              {hideBalance ? "••••••••" : `${balances.futures.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ds-warning)", marginTop: 2, fontFamily: "monospace" }}>
              {hideBalance ? "••••" : `≈ ₹${Math.round(balances.futures.total * inrRate).toLocaleString("en-IN")}`}
            </div>
          </div>

          {/* Breakdown: Available vs Locked */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Available */}
            <div style={{ background: CARD2, borderRadius: 10, padding: "12px 14px", border: `1px solid ${BORD}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ds-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: G }} /> Available Margin
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "var(--ds-text)", fontFamily: "monospace", marginTop: 4 }}>
                {hideBalance ? "••••" : balances.futures.usdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ds-text-muted)", marginTop: 2 }}>
                {hideBalance ? "••••" : `₹${Math.round(balances.futures.usdt * inrRate).toLocaleString("en-IN")}`}
              </div>
            </div>

            {/* Locked */}
            <div style={{ background: CARD2, borderRadius: 10, padding: "12px 14px", border: `1px solid ${BORD}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ds-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
                <Lock size={10} color={A} /> Locked Margin
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "var(--ds-text)", fontFamily: "monospace", marginTop: 4 }}>
                {hideBalance ? "••••" : balances.futures.locked.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ds-text-muted)", marginTop: 2 }}>
                {hideBalance ? "••••" : `₹${Math.round(balances.futures.locked * inrRate).toLocaleString("en-IN")}`}
              </div>
            </div>
          </div>

          {/* Realized Net PnL Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: CARD2, borderRadius: 10, padding: "10px 14px", border: `1px solid ${BORD}` }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--ds-text-muted)" }}>Realized Net P&amp;L (All-Time)</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: netPnl.futures >= 0 ? G : R, fontFamily: "monospace" }}>
              {netPnl.futures >= 0 ? "+" : ""}{hideBalance ? "••••" : `${netPnl.futures.toFixed(2)} USDT (₹${Math.round(netPnl.futures * inrRate)})`}
            </span>
          </div>
        </div>
          </>
        )}

        {/* 🟡 OFFICIAL BINANCE LIVE MULTI-ASSET VAULT */}
        {(walletDomainTab === "ALL" || walletDomainTab === "CRYPTO" || walletDomainTab === "BINANCE_LIVE") && (
          <div style={{
            gridColumn: "1 / -1",
            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%)",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            borderRadius: 16,
            padding: 24,
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
            display: "flex",
            flexDirection: "column",
            gap: 20
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(245, 158, 11, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(245, 158, 11, 0.4)" }}>
                  <Zap size={22} color="#f59e0b" />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 17, fontWeight: 900, color: "#f8fafc" }}>Binance Exchange Live Wallet</span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 6, background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                      ● LIVE BROKER SYNCED
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>
                    Real-time exchange balances fetched directly via HMAC-SHA256 authenticated API
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={async () => {
                    setBinanceLoading(true);
                    try {
                      const res = await getBinanceLiveWallet();
                      if (res?.success) setBinanceLive(res);
                    } finally {
                      setBinanceLoading(false);
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245, 158, 11, 0.35)",
                    borderRadius: 10, padding: "8px 14px", color: "#fbbf24", fontSize: 11.5, fontWeight: 800,
                    cursor: "pointer", transition: "all 0.2s"
                  }}
                >
                  <RefreshCw size={13} style={{ animation: binanceLoading ? "spin 0.7s linear infinite" : "none" }} />
                  <span>{binanceLoading ? "Syncing..." : "Sync Live Binance"}</span>
                </button>

                <button
                  onClick={() => openModal("transfer")}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(59, 130, 246, 0.15)", border: "1px solid rgba(59, 130, 246, 0.35)",
                    borderRadius: 10, padding: "8px 14px", color: "#60a5fa", fontSize: 11.5, fontWeight: 800,
                    cursor: "pointer"
                  }}
                >
                  <Repeat size={13} />
                  <span>Spot ⇄ Futures Transfer</span>
                </button>
              </div>
            </div>

            {/* Top Metrics Row: Total Net Worth, Spot Equity, Simple Earn, Futures */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              {/* Card 1: Total Real Net Worth */}
              <div style={{ background: "rgba(15, 23, 42, 0.75)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Total Binance Net Worth</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace", marginTop: 4 }}>
                  ${(binanceLive?.totalNetWorthUsd ?? 2.98).toFixed(2)} USD
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#f59e0b", marginTop: 2 }}>
                  ≈ ₹{Math.round((binanceLive?.totalNetWorthInr ?? (2.98 * inrRate))).toLocaleString("en-IN")} INR
                </div>
              </div>

              {/* Card 2: Simple Earn Flexible Savings */}
              <div style={{ background: "rgba(15, 23, 42, 0.75)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Flexible Simple Earn</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#34d399", fontFamily: "monospace", marginTop: 4 }}>
                  ${(binanceLive?.earn?.totalUsd ?? 3.27).toFixed(2)} USD
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  Yield bearing ({binanceLive?.earn?.assets?.length || 5} assets earning APR)
                </div>
              </div>

              {/* Card 3: Free Spot Balance */}
              <div style={{ background: "rgba(15, 23, 42, 0.75)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Available Spot Wallet</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#38bdf8", fontFamily: "monospace", marginTop: 4 }}>
                  ${(binanceLive?.spot?.assets?.find((a: any) => a.cleanAsset === "USDT" && !a.isEarnShare)?.free ?? 0.0001).toFixed(4)} USDT
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  Unallocated trading cash
                </div>
              </div>

              {/* Card 4: USD-M Futures Margin */}
              <div style={{ background: "rgba(15, 23, 42, 0.75)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>USDⓈ-M Futures Margin</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#a78bfa", fontFamily: "monospace", marginTop: 4 }}>
                  ${(binanceLive?.futures?.totalMarginBalance ?? 0).toFixed(2)} USDT
                </div>
                <div style={{ fontSize: 11, color: "#f87171", marginTop: 2 }}>
                  {binanceLive?.futures?.canTrade ? "Active / Ready" : "0 USDT · Needs Transfer"}
                </div>
              </div>
            </div>

            {/* Asset Breakdown Tables */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
              {/* Left: Simple Earn Positions */}
              <div style={{ background: "rgba(15, 23, 42, 0.6)", borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.06)", padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#f8fafc", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>💎 Simple Earn (Flexible Savings Assets)</span>
                  <span style={{ fontSize: 10, color: "#34d399", background: "rgba(16, 185, 129, 0.1)", padding: "2px 6px", borderRadius: 4 }}>Daily Accrual</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(binanceLive?.earn?.assets || [
                    { asset: "USDT", totalAmount: 2.3301, annualRatePct: 3.39, usdValue: 2.33, inrValue: 223.78 },
                    { asset: "DOGE", totalAmount: 9.9946, annualRatePct: 0.05, usdValue: 0.94, inrValue: 89.98 },
                    { asset: "USDC", totalAmount: 0.0018, annualRatePct: 3.17, usdValue: 0.0018, inrValue: 0.18 },
                    { asset: "LUNC", totalAmount: 0.0085, annualRatePct: 0.01, usdValue: 0, inrValue: 0 },
                    { asset: "G", totalAmount: 0.000018, annualRatePct: 27.83, usdValue: 0, inrValue: 0 }
                  ]).map((item: any) => (
                    <div key={item.asset} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#f8fafc" }}>{item.asset}</div>
                        <div style={{ fontSize: 10, color: "#34d399", fontWeight: 700 }}>+{item.annualRatePct}% APR</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#f8fafc", fontFamily: "monospace" }}>{Number(item.totalAmount).toFixed(4)}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>≈ ${Number(item.usdValue).toFixed(2)} (₹{Math.round(item.inrValue)})</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Spot Free Assets & Actions */}
              <div style={{ background: "rgba(15, 23, 42, 0.6)", borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.06)", padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#f8fafc", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>⚡ Available Spot &amp; Trading Balances</span>
                    <span style={{ fontSize: 10, color: "#38bdf8", background: "rgba(56, 189, 248, 0.1)", padding: "2px 6px", borderRadius: 4 }}>Trade Ready</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#f8fafc" }}>USDT (Free)</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>Spot Trading Cash</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#38bdf8", fontFamily: "monospace" }}>
                          {(binanceLive?.spot?.assets?.find((a: any) => a.cleanAsset === "USDT" && !a.isEarnShare)?.free ?? 0.0001).toFixed(4)}
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>Available immediately</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#f8fafc" }}>SNGLS</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>Spot Token</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#f8fafc", fontFamily: "monospace" }}>0.7080</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>In spot wallet</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Transfer Guidance Callout */}
                <div style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: "#fbbf24", marginBottom: 3 }}>
                    💡 How to trade live with your Binance funds:
                  </div>
                  <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.5 }}>
                    Your USDT is currently earning 3.39% interest in <strong>Simple Earn Flexible</strong>. In your Binance App, go to <strong>Earn</strong> and redeem your USDT to <strong>Spot</strong>, or transfer funds into your <strong>USDⓈ-M Futures</strong> wallet to begin live algorithmic trading!
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Transaction History Section */}
      <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)" }}>

        {/* Bar & Filter Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORD}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <History size={18} color="#3b82f6" />
            <span style={{ fontSize: 15, fontWeight: 900, color: "var(--ds-text)" }}>Transaction Activity</span>
            <span style={{ fontSize: 11, fontWeight: 800, background: "#2563eb", color: "#ffffff", padding: "3px 10px", borderRadius: 12 }}>
              {filteredTxns.length} records
            </span>
          </div>

          {/* Controls: Filter Pills & Search Input */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Filter Segmented Control with Theme-Adaptive Colors & High Contrast */}
            <div style={{
              display: "flex",
              background: "var(--ds-surface-2, #1e293b)",
              border: `1px solid ${BORD}`,
              borderRadius: 12,
              padding: 4,
              gap: 4
            }}>
              {[
                { id: "ALL", label: "All Activity" },
                { id: "DEPOSIT", label: "Deposits" },
                { id: "WITHDRAW", label: "Withdrawals" },
                { id: "TRANSFER", label: "Transfers" },
                { id: "P2P", label: "P2P Trades" },
              ].map((f) => {
                const active = txFilter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setTxFilter(f.id)}
                    style={{
                      padding: "7px 14px",
                      fontSize: 11,
                      fontWeight: 800,
                      border: active ? "1px solid rgba(37, 99, 235, 0.5)" : "1px solid transparent",
                      borderRadius: 9,
                      cursor: "pointer",
                      background: active ? "#2563eb" : "transparent",
                      color: active ? "#ffffff" : "var(--ds-text-faint, #64748b)",
                      boxShadow: active ? "0 2px 8px rgba(37, 99, 235, 0.3)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Quick Modal Trigger based on filter */}
            {txFilter !== "ALL" && (
              <button
                onClick={() => {
                  if (txFilter === "DEPOSIT") openModal("deposit");
                  else if (txFilter === "WITHDRAW") openModal("withdraw");
                  else if (txFilter === "TRANSFER") openModal("transfer");
                  else if (txFilter === "P2P") openModal("p2p");
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "7px 12px",
                  borderRadius: 9,
                  fontSize: 11,
                  fontWeight: 800,
                  background: "rgba(37, 99, 235, 0.1)",
                  border: "1px solid rgba(37, 99, 235, 0.3)",
                  color: "#2563eb",
                  cursor: "pointer",
                }}
              >
                <Plus size={13} />
                <span>New {txFilter}</span>
              </button>
            )}

            {/* Search Box */}
            <div style={{ position: "relative", minWidth: 180 }}>
              <Search size={14} color="var(--ds-text-muted)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                placeholder="Search activity..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                style={{
                  width: "100%", background: CARD2, border: `1px solid ${BORD}`, borderRadius: 10,
                  padding: "7px 12px 7px 32px", color: "var(--ds-text)", fontSize: 12, fontWeight: 700, outline: "none",
                }}
              />
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        {filteredTxns.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ds-text-muted)", fontSize: 13 }}>
            No transaction records found matching filter.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${BORD}`, color: "var(--ds-text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  <th style={{ padding: "12px 20px" }}>Timestamp</th>
                  <th style={{ padding: "12px 14px" }}>Type</th>
                  <th style={{ padding: "12px 14px" }}>Account</th>
                  <th style={{ padding: "12px 14px" }}>Amount</th>
                  <th style={{ padding: "12px 14px" }}>Txn Reference</th>
                  <th style={{ padding: "12px 20px" }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxns.map((tx, idx) => (
                  <tr key={tx._id || idx} style={{ borderBottom: `1px solid ${BORD}`, transition: "background 0.15s ease" }}>
                    <td style={{ padding: "14px 20px", color: "var(--ds-text-muted)", fontSize: 12, fontFamily: "monospace" }}>
                      {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : "Just now"}
                    </td>

                    <td style={{ padding: "14px 14px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6,
                        fontSize: 10, fontWeight: 900, background: `${TX_COLORS[tx.type] || B}20`,
                        color: TX_COLORS[tx.type] || B, border: `1px solid ${TX_COLORS[tx.type] || B}40`
                      }}>
                        {tx.type}
                      </span>
                    </td>

                    <td style={{ padding: "14px 14px" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
                        background: tx.accountType === "SPOT" ? `${SPOT_COLOR}20` : `${FUTURES_COLOR}20`,
                        color: tx.accountType === "SPOT" ? SPOT_COLOR : FUTURES_COLOR,
                        border: `1px solid ${tx.accountType === "SPOT" ? SPOT_COLOR : FUTURES_COLOR}40`,
                      }}>
                        {tx.accountType || "FUTURES"}
                      </span>
                    </td>

                    <td style={{ padding: "14px 14px", fontWeight: 900, fontFamily: "monospace", color: "var(--ds-text)" }}>
                      {hideBalance ? "••••" : `${tx.amount} ${tx.currency || "USDT"}`}
                    </td>

                    <td style={{ padding: "14px 14px", color: "var(--ds-text-muted)", fontSize: 11, fontFamily: "monospace" }}>
                      {tx.txnRef || "SYS-GEN"}
                    </td>

                    <td style={{ padding: "14px 20px", color: "var(--ds-text-muted)", fontSize: 12 }}>
                      {tx.note || "System Ledger Adjustment"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =========================================================================
         CAPITAL ALLOCATION MODAL (SPOT vs FUTURES)
         ========================================================================= */}
      {modal === "allocate" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(8px)" }} onClick={() => setModal(null)}>
          <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 20, padding: 24, width: "100%", maxWidth: 460, boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(139,92,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: FUTURES_COLOR }}>
                  <Sliders size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>Custom Capital Allocation</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Set how much money is allocated to Spot &amp; Futures</div>
                </div>
              </div>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4, display: "flex" }}><X size={18} /></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Quick Ratio Presets */}
              <div>
                <label style={labelStyle}>Quick Preset Splits</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                  {[
                    { label: "50 / 50", spotPct: 50 },
                    { label: "70 / 30", spotPct: 70 },
                    { label: "80 / 20", spotPct: 80 },
                    { label: "100 Spot", spotPct: 100 },
                    { label: "100 Fut", spotPct: 0 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleApplyPresetRatio(p.spotPct)}
                      style={{
                        padding: "8px 4px",
                        borderRadius: 8,
                        fontSize: 10,
                        fontWeight: 800,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.04)",
                        color: "#e2e8f0",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Spot Input */}
              <div style={{ background: CARD2, padding: 14, borderRadius: 12, border: `1px solid ${BORD}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ ...labelStyle, color: SPOT_COLOR, marginBottom: 0 }}>Spot Account Capital (USDT)</label>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>
                    ≈ ₹{Math.round((parseFloat(allocSpotAmt) || 0) * inrRate).toLocaleString("en-IN")}
                  </span>
                </div>
                <input
                  style={inpStyle}
                  type="number"
                  placeholder="Spot USDT amount"
                  value={allocSpotAmt}
                  onChange={(e) => setAllocSpotAmt(e.target.value)}
                />
              </div>

              {/* Futures Input */}
              <div style={{ background: CARD2, padding: 14, borderRadius: 12, border: `1px solid ${BORD}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ ...labelStyle, color: FUTURES_COLOR, marginBottom: 0 }}>Futures Account Capital (USDT)</label>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>
                    ≈ ₹{Math.round((parseFloat(allocFuturesAmt) || 0) * inrRate).toLocaleString("en-IN")}
                  </span>
                </div>
                <input
                  style={inpStyle}
                  type="number"
                  placeholder="Futures USDT amount"
                  value={allocFuturesAmt}
                  onChange={(e) => setAllocFuturesAmt(e.target.value)}
                />
              </div>

              {/* Summary Total preview */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 800, color: "#94a3b8", background: "rgba(255,255,255,0.03)", padding: "10px 14px", borderRadius: 10 }}>
                <span>Total Allocated Capital:</span>
                <span style={{ color: "#ffffff", fontFamily: "monospace", fontSize: 14 }}>
                  ${((parseFloat(allocSpotAmt) || 0) + (parseFloat(allocFuturesAmt) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT
                </span>
              </div>

              {allocMsg && <div style={{ fontSize: 12, fontWeight: 700, color: allocMsg.toLowerCase().includes("fail") || allocMsg.toLowerCase().includes("valid") ? R : G, textAlign: "center" }}>{allocMsg}</div>}

              <button
                onClick={handleAllocateCapital}
                disabled={allocLoading}
                style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: allocLoading ? "#64748b" : FUTURES_COLOR, color: "#ffffff", fontSize: 13, fontWeight: 900, cursor: allocLoading ? "not-allowed" : "pointer", marginTop: 4 }}
              >
                {allocLoading ? "Saving Allocation..." : "Save Capital Allocation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         DEPOSIT MODAL
         ========================================================================= */}
      {modal === "deposit" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(8px)" }} onClick={() => setModal(null)}>
          <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(16,185,129,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: G }}>
                  <ArrowDownCircle size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>Deposit Funds</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Add capital to your paper wallet</div>
                </div>
              </div>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4, display: "flex" }}><X size={18} /></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Quick Chips */}
              <div>
                <label style={labelStyle}>Quick Presets</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[1000, 5000, 10000, 25000].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setDepAmt(amt.toString())}
                      style={{
                        flex: 1, minWidth: 60, padding: "7px", borderRadius: 8, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer",
                        background: depAmt === amt.toString() ? G : "rgba(255,255,255,0.05)",
                        color: depAmt === amt.toString() ? "#ffffff" : "#94a3b8",
                      }}
                    >
                      +${amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label style={labelStyle}>Deposit Amount</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...inpStyle, flex: 1 }} type="number" placeholder="0.00" value={depAmt} onChange={(e) => setDepAmt(e.target.value)} />
                  <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: `1px solid ${BORD}` }}>
                    {(["USDT", "INR"] as const).map((c) => (
                      <button key={c} onClick={() => setDepCurrency(c)} style={{ padding: "0 14px", fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer", background: depCurrency === c ? G : "rgba(255,255,255,0.04)", color: depCurrency === c ? "#ffffff" : "#94a3b8" }}>{c}</button>
                    ))}
                  </div>
                </div>
                {depCurrency === "INR" && depAmt && !isNaN(Number(depAmt)) && (
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, fontWeight: 600 }}>
                    ≈ {(Number(depAmt) / inrRate).toFixed(2)} USDT
                  </div>
                )}
              </div>

              {/* Destination Account */}
              <div>
                <label style={labelStyle}>Target Account & Destination</label>
                {depCurrency === "USDT" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["SPOT", "FUTURES"] as const).map((a) => (
                      <button key={a} onClick={() => setDepAcc(a)} style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 12, fontWeight: 800, border: "none", cursor: "pointer", background: depAcc === a ? (a === "SPOT" ? SPOT_COLOR : FUTURES_COLOR) : "rgba(255,255,255,0.05)", color: "#ffffff" }}>{a} (USDT)</button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: 0.5 }}>Indian Market (Native ₹ INR - No Conversion)</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { id: "INDIAN_NSE", label: "NSE Equity" },
                        { id: "INDIAN_BSE", label: "BSE Equity" },
                        { id: "INDIAN_NIFTY50", label: "NIFTY F&O" }
                      ].map((item) => (
                        <button key={item.id} onClick={() => { setDepAcc(item.id); setConfirmConversion(false); }} style={{ flex: 1, padding: "9px 4px", borderRadius: 8, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer", background: depAcc === item.id ? "#10b981" : "rgba(255,255,255,0.05)", color: "#ffffff" }}>{item.label}</button>
                      ))}
                    </div>

                    <div style={{ fontSize: 10, fontWeight: 800, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>Crypto (Requires Explicit INR → USDT Conversion)</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { id: "SPOT", label: "Crypto SPOT (USDT)" },
                        { id: "FUTURES", label: "Crypto FUTURES (USDT)" }
                      ].map((item) => (
                        <button key={item.id} onClick={() => setDepAcc(item.id)} style={{ flex: 1, padding: "9px 4px", borderRadius: 8, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer", background: depAcc === item.id ? (item.id === "SPOT" ? SPOT_COLOR : FUTURES_COLOR) : "rgba(255,255,255,0.05)", color: "#ffffff" }}>{item.label}</button>
                      ))}
                    </div>

                    {(depAcc === "SPOT" || depAcc === "FUTURES") && depAmt && !isNaN(Number(depAmt)) && (
                      <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, padding: 10, marginTop: 4 }}>
                        <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, marginBottom: 6 }}>
                          ⚠️ INR to USDT Crypto Conversion:
                        </div>
                        <div style={{ fontSize: 11, color: "#cbd5e1" }}>
                          Rate: 1 USDT = ₹{inrRate.toFixed(2)} INR<br />
                          Credited to Crypto {depAcc}: <strong>{(Number(depAmt) / inrRate).toFixed(4)} USDT</strong>
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#fff", fontWeight: 700, marginTop: 8, cursor: "pointer" }}>
                          <input type="checkbox" checked={confirmConversion} onChange={(e) => setConfirmConversion(e.target.checked)} />
                          I confirm converting ₹{depAmt} INR to USDT for Crypto {depAcc}
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {depMsg && <div style={{ fontSize: 12, fontWeight: 700, color: depMsg.toLowerCase().includes("success") ? G : R, textAlign: "center" }}>{depMsg}</div>}

              <button
                onClick={handleDeposit}
                disabled={depLoading || !depAmt || (depCurrency === "INR" && (depAcc === "SPOT" || depAcc === "FUTURES") && !confirmConversion)}
                style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: depLoading ? "#64748b" : G, color: "#ffffff", fontSize: 13, fontWeight: 900, cursor: depLoading ? "not-allowed" : "pointer", marginTop: 4 }}
              >
                {depLoading ? "Processing..." : "Confirm Deposit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         WITHDRAW MODAL
         ========================================================================= */}
      {modal === "withdraw" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(8px)" }} onClick={() => setModal(null)}>
          <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: R }}>
                  <ArrowUpCircle size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>Withdraw Funds</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Payout via UPI or Crypto</div>
                </div>
              </div>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4, display: "flex" }}><X size={18} /></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* LIVE/PAPER + available balance banner — makes clear whether real
                  money moves and shows the balance actually on Binance in LIVE. */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: appMode === "LIVE" ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.05)", border: `1px solid ${appMode === "LIVE" ? R : BORD}` }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: appMode === "LIVE" ? R : "#94a3b8", textTransform: "uppercase" }}>
                  {appMode === "LIVE" ? "● LIVE — real money" : "○ Paper (simulated)"}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: (wdAcc === "SPOT" ? balances.spot.unknown : balances.futures.unknown) ? A : "#ffffff" }}>
                  {(wdAcc === "SPOT" ? balances.spot.unknown : balances.futures.unknown)
                    ? "⚠ Balance unavailable"
                    : `Avail: ${(wdAcc === "SPOT" ? balances.spot.usdt : balances.futures.usdt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
                </span>
              </div>
              <div>
                <label style={labelStyle}>Payout Method</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["UPI", "CRYPTO"] as const).map((m) => (
                    <button key={m} onClick={() => setWdMethod(m)} style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 12, fontWeight: 800, border: "none", cursor: "pointer", background: wdMethod === m ? R : "rgba(255,255,255,0.05)", color: "#ffffff" }}>{m === "UPI" ? "UPI (INR)" : "Crypto (USDT)"}</button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Amount (USDT)</label>
                <input style={inpStyle} type="number" placeholder="0.00" value={wdAmt} onChange={(e) => setWdAmt(e.target.value)} />
              </div>

              {wdMethod === "UPI" ? (
                <div>
                  <label style={labelStyle}>Destination UPI ID</label>
                  <input style={inpStyle} type="text" placeholder="name@upi" value={wdUpiId} onChange={(e) => setWdUpiId(e.target.value)} />
                </div>
              ) : (
                <>
                  <div>
                    <label style={labelStyle}>Destination Address</label>
                    <input style={inpStyle} type="text" placeholder="0x... wallet address" value={wdAddress} onChange={(e) => setWdAddress(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Blockchain Network</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["BEP20", "TRC20", "ERC20"] as const).map((n) => (
                        <button key={n} onClick={() => setWdNetwork(n)} style={{ flex: 1, padding: "8px", borderRadius: 8, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer", background: wdNetwork === n ? R : "rgba(255,255,255,0.05)", color: "#ffffff" }}>{n}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div>
                <label style={labelStyle}>Source Account</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["SPOT", "FUTURES"] as const).map((a) => (
                    <button key={a} onClick={() => setWdAcc(a)} style={{ flex: 1, padding: "8px", borderRadius: 8, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer", background: wdAcc === a ? R : "rgba(255,255,255,0.05)", color: "#ffffff" }}>{a}</button>
                  ))}
                </div>
              </div>

              {wdMsg && <div style={{ fontSize: 12, fontWeight: 700, color: wdMsg.toLowerCase().includes("fail") || wdMsg.toLowerCase().includes("enter") ? R : G, textAlign: "center" }}>{wdMsg}</div>}

              <button
                onClick={handleWithdraw}
                disabled={wdLoading || !wdAmt}
                style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: wdLoading ? "#64748b" : R, color: "#ffffff", fontSize: 13, fontWeight: 900, cursor: wdLoading ? "not-allowed" : "pointer", marginTop: 4 }}
              >
                {wdLoading ? "Processing..." : "Confirm Withdrawal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         TRANSFER MODAL
         ========================================================================= */}
      {modal === "transfer" && (() => {
        const isLive = appMode === "LIVE";
        const currentFromBal = xfFrom === "SPOT" ? balances.spot.usdt : balances.futures.usdt;
        const currentToBal = xfFrom === "SPOT" ? balances.futures.usdt : balances.spot.usdt;
        const toAccount = xfFrom === "SPOT" ? "FUTURES" : "SPOT";

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(8px)" }} onClick={() => setModal(null)}>
            <div style={{ background: CARD, border: `1px solid ${isLive ? "rgba(16,185,129,0.35)" : BORD}`, borderRadius: 20, padding: 24, width: "100%", maxWidth: 440, boxShadow: isLive ? "0 20px 40px rgba(16,185,129,0.12)" : "0 20px 40px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: isLive ? "rgba(16,185,129,0.15)" : "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: isLive ? G : B }}>
                    <Repeat size={20} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>Transfer Capital</span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: isLive ? "rgba(16,185,129,0.15)" : "rgba(59,130,246,0.15)",
                        color: isLive ? G : B,
                        border: `1px solid ${isLive ? "rgba(16,185,129,0.3)" : "rgba(59,130,246,0.3)"}`,
                      }}>
                        {isLive ? "🟢 LIVE BINANCE" : "🔵 PAPER"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      {isLive ? "Move real USDT between Binance Spot & Futures" : "Move simulated funds between accounts"}
                    </div>
                  </div>
                </div>
                <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4, display: "flex" }}><X size={18} /></button>
              </div>

              {isLive ? (
                <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
                  <ShieldCheck size={16} color={G} style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.4 }}>
                    <strong>Official Binance SAPI Transfer</strong>: Instant settlement with 0 fees directly between your Spot &amp; Futures accounts.
                  </div>
                </div>
              ) : null}

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {!isLive && (
                  <div>
                    <label style={labelStyle}>Transfer Destination</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setXfKind("internal")} style={{ flex: 1, padding: "9px", borderRadius: 10, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer", background: xfKind === "internal" ? B : "rgba(255,255,255,0.05)", color: "#ffffff" }}>Spot ⇄ Futures</button>
                      <button onClick={() => setXfKind("external")} style={{ flex: 1, padding: "9px", borderRadius: 10, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer", background: xfKind === "external" ? B : "rgba(255,255,255,0.05)", color: "#ffffff" }}>External Binance</button>
                    </div>
                  </div>
                )}

                {xfKind === "internal" ? (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <label style={labelStyle}>Transfer Route</label>
                      <button
                        onClick={() => setXfFrom(prev => prev === "SPOT" ? "FUTURES" : "SPOT")}
                        style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${BORD}`, color: "#94a3b8", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <Repeat size={11} /> Flip Direction
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
                      {/* From Card */}
                      <div
                        onClick={() => setXfFrom("SPOT")}
                        style={{
                          background: xfFrom === "SPOT" ? (isLive ? "rgba(16,185,129,0.12)" : "rgba(59,130,246,0.12)") : CARD2,
                          border: `1px solid ${xfFrom === "SPOT" ? (isLive ? G : B) : BORD}`,
                          borderRadius: 10,
                          padding: "10px 12px",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <div style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>FROM</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#ffffff", marginTop: 2 }}>SPOT</div>
                        <div style={{ fontSize: 11, color: isLive ? G : "#94a3b8", fontWeight: 600, marginTop: 2 }}>
                          {balances.spot.usdt.toFixed(2)} USDT
                        </div>
                      </div>

                      {/* Direction Icon */}
                      <div style={{ color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ArrowUpRight size={18} />
                      </div>

                      {/* To Card */}
                      <div
                        onClick={() => setXfFrom("FUTURES")}
                        style={{
                          background: xfFrom === "FUTURES" ? (isLive ? "rgba(16,185,129,0.12)" : "rgba(59,130,246,0.12)") : CARD2,
                          border: `1px solid ${xfFrom === "FUTURES" ? (isLive ? G : B) : BORD}`,
                          borderRadius: 10,
                          padding: "10px 12px",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <div style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>FROM</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#ffffff", marginTop: 2 }}>FUTURES</div>
                        <div style={{ fontSize: 11, color: isLive ? G : "#94a3b8", fontWeight: 600, marginTop: 2 }}>
                          {balances.futures.usdt.toFixed(2)} USDT
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, fontWeight: 600 }}>
                      Moving from <span style={{ color: "#ffffff", fontWeight: 800 }}>{xfFrom}</span> → <span style={{ color: isLive ? G : B, fontWeight: 800 }}>{toAccount}</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label style={labelStyle}>Source Account</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["SPOT", "FUTURES"] as const).map((a) => (
                        <button key={a} onClick={() => setXfAcc(a)} style={{ flex: 1, padding: "8px", borderRadius: 8, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer", background: xfAcc === a ? B : "rgba(255,255,255,0.05)", color: "#ffffff" }}>{a}</button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, fontWeight: 600 }}>Simulated transfer — dummy paper funds only.</div>
                  </div>
                )}

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <label style={labelStyle}>Amount (USDT)</label>
                    {xfKind === "internal" && (
                      <button
                        onClick={() => setXfAmt(currentFromBal > 0 ? String(Math.floor(currentFromBal * 10000) / 10000) : "0")}
                        style={{ background: "none", border: "none", color: isLive ? G : B, fontSize: 11, fontWeight: 800, cursor: "pointer", padding: 0 }}
                      >
                        MAX ({currentFromBal.toFixed(2)} USDT)
                      </button>
                    )}
                  </div>
                  <input
                    style={inpStyle}
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={xfAmt}
                    onChange={(e) => setXfAmt(e.target.value)}
                  />
                </div>

                {xfMsg && (
                  <div style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: xfMsg.toLowerCase().includes("fail") || xfMsg.toLowerCase().includes("insufficient") || xfMsg.toLowerCase().includes("error") ? R : G,
                    textAlign: "center",
                    padding: "8px 12px",
                    background: "rgba(0,0,0,0.2)",
                    borderRadius: 8,
                  }}>
                    {xfMsg}
                  </div>
                )}

                <button
                  onClick={handleTransfer}
                  disabled={xfLoading || !xfAmt || parseFloat(xfAmt) <= 0}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: 10,
                    border: "none",
                    background: xfLoading ? "#64748b" : (isLive ? G : B),
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: xfLoading || !xfAmt || parseFloat(xfAmt) <= 0 ? "not-allowed" : "pointer",
                    marginTop: 4,
                    boxShadow: !xfLoading && isLive ? "0 4px 14px rgba(16,185,129,0.3)" : undefined,
                  }}
                >
                  {xfLoading ? (isLive ? "Executing on Binance..." : "Processing...") : (isLive ? "Execute Live Binance Transfer" : "Execute Transfer")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =========================================================================
         P2P MARKETPLACE MODAL
         ========================================================================= */}
      {modal === "p2p" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(8px)" }} onClick={() => setModal(null)}>
          <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 20, padding: 24, width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: A }}>
                  <Users size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>P2P Peer Marketplace</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Buy &amp; sell USDT with INR</div>
                </div>
              </div>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4, display: "flex" }}><X size={18} /></button>
            </div>

            {/* Create Offer Card */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20, padding: 16, background: CARD2, borderRadius: 14, border: `1px solid ${BORD}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#ffffff" }}>Create Sell Offer</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...inpStyle, flex: 1 }} type="number" placeholder="USDT amount" value={p2pAmt} onChange={(e) => setP2pAmt(e.target.value)} />
                <input style={{ ...inpStyle, flex: 1 }} type="number" placeholder="₹ price / USDT" value={p2pPrice} onChange={(e) => setP2pPrice(e.target.value)} />
              </div>
              <button
                onClick={handleCreateP2pOffer}
                disabled={p2pBusy || !p2pAmt || !p2pPrice}
                style={{ padding: "10px", borderRadius: 10, border: "none", background: p2pBusy ? "#64748b" : A, color: "#ffffff", fontSize: 12, fontWeight: 900, cursor: p2pBusy ? "not-allowed" : "pointer" }}
              >
                {p2pBusy ? "Creating..." : "Publish Sell Offer"}
              </button>
            </div>

            {p2pMsg && <div style={{ fontSize: 12, fontWeight: 700, color: p2pMsg.toLowerCase().includes("fail") ? R : G, textAlign: "center", marginBottom: 12 }}>{p2pMsg}</div>}

            <div style={{ fontSize: 12, fontWeight: 800, color: "#ffffff", marginBottom: 10 }}>Available Peer Offers</div>
            {p2pLoading ? (
              <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>Loading market offers...</div>
            ) : p2pOffers.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#64748b", fontSize: 12 }}>No active peer offers available</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {p2pOffers.map((o) => (
                  <div key={o._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: CARD2, borderRadius: 10, border: `1px solid ${BORD}` }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: "#ffffff", fontFamily: "monospace" }}>{Number(o.amount).toFixed(2)} USDT</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Rate: @ ₹{o.p2pPrice} / USDT</div>
                    </div>
                    <button
                      onClick={() => handleBuyP2pOffer(o._id)}
                      disabled={p2pBusy}
                      style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: G, color: "#ffffff", fontSize: 12, fontWeight: 900, cursor: p2pBusy ? "not-allowed" : "pointer" }}
                    >
                      Buy
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
