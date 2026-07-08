import { useState, useEffect } from 'react';
import { Wallet, ArrowDownCircle, ArrowUpCircle, RefreshCw, History, X, Power, PowerOff, AlertTriangle, Repeat, Users } from 'lucide-react';
import {
  getWalletBalance, getWalletTransactions, depositPaper, hardReset, enableAutoTrade, disableAutoTrade, getAutoStatus,
  withdrawUpi, withdrawCrypto, transferWallet, getP2pOffers, createP2pOffer, buyP2pOffer,
} from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { useDashboardStore } from '../store/useDashboardStore';
import { formatCurrency, withInr } from '../lib/currency';

const BG = "var(--ds-bg)", CARD = "var(--ds-surface)", CARD2 = "var(--ds-surface-2)", BORD = "var(--ds-border)";
const G = "var(--ds-buy)", R = "var(--ds-sell)", B = "var(--ds-primary)", A = "var(--ds-warning)";
// Distinct identity colors for the two account types — independent of the
// green/red profit-loss coloring, so Spot and Futures are visually
// distinguishable at a glance regardless of whether either is up or down.
const SPOT_COLOR = "#06b6d4";    // cyan
const FUTURES_COLOR = "#8b5cf6"; // violet

const inp: React.CSSProperties = {
  width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid rgba(255,255,255,0.1)`,
  borderRadius:8, padding:"10px 12px", color:"var(--ds-text)", fontSize:13, outline:"none",
};

const label: React.CSSProperties = {
  fontSize:10, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6,
};

const TX_COLORS: Record<string, string> = {
  DEPOSIT: G, WITHDRAW: R, WITHDRAW_CRYPTO: R, P2P_BUY: G, P2P_SELL: A, ADJUSTMENT: B,
};

function BalCard({ label, value, sub, color = "var(--ds-text)" }: any) {
  return (
    <div style={{ background:CARD2, border:`1px solid ${BORD}`, borderRadius:12, padding:"16px 20px" }}>
      <div style={{ fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color, fontFamily:"monospace", lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:"var(--ds-text-faint)", marginTop:4 }}>{sub}</div>}
    </div>
  );
}

function ActionButton({ icon, label, onClick, color = B }: { icon: React.ReactNode; label: string; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display:"flex", flexDirection:"column", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer",
        padding:"8px 4px", flex:1, minWidth:64,
      }}
    >
      <div style={{ width:40, height:40, borderRadius:"50%", background:`${color}18`, border:`1px solid ${color}40`, display:"flex", alignItems:"center", justifyContent:"center", color }}>
        {icon}
      </div>
      <span style={{ fontSize:10, fontWeight:700, color:"var(--ds-text)" }}>{label}</span>
    </button>
  );
}

type ModalType = "deposit" | "withdraw" | "transfer" | "p2p" | null;

export default function WalletCenter() {
  const [balances, setBalances] = useState({ spot:{ usdt:0, locked:0, total:0 }, futures:{ usdt:0, locked:0, total:0 } });
  const [txns, setTxns]         = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState<ModalType>(null);

  // Deposit
  const [depAmt, setDepAmt]     = useState("");
  const [depAcc, setDepAcc]     = useState<"SPOT"|"FUTURES">("FUTURES");
  const [depCurrency, setDepCurrency] = useState<"USDT"|"INR">("USDT");
  const [depMsg, setDepMsg]     = useState("");
  const [depLoading, setDepLoading] = useState(false);

  // Withdraw
  const [wdMethod, setWdMethod] = useState<"UPI"|"CRYPTO">("UPI");
  const [wdAmt, setWdAmt] = useState("");
  const [wdAcc, setWdAcc] = useState<"SPOT"|"FUTURES">("FUTURES");
  const [wdUpiId, setWdUpiId] = useState("");
  const [wdAddress, setWdAddress] = useState("");
  const [wdNetwork, setWdNetwork] = useState("BEP20");
  const [wdMsg, setWdMsg] = useState("");
  const [wdLoading, setWdLoading] = useState(false);

  // Transfer
  const [xfKind, setXfKind] = useState<"internal"|"external">("internal");
  const [xfAmt, setXfAmt] = useState("");
  const [xfFrom, setXfFrom] = useState<"SPOT"|"FUTURES">("FUTURES");
  const [xfAcc, setXfAcc] = useState<"SPOT"|"FUTURES">("FUTURES");
  const [xfMsg, setXfMsg] = useState("");
  const [xfLoading, setXfLoading] = useState(false);

  // P2P
  const [p2pOffers, setP2pOffers] = useState<any[]>([]);
  const [p2pLoading, setP2pLoading] = useState(false);
  const [p2pAmt, setP2pAmt] = useState("");
  const [p2pPrice, setP2pPrice] = useState("");
  const [p2pMsg, setP2pMsg] = useState("");
  const [p2pBusy, setP2pBusy] = useState(false);

  const [spotAutoOn, setSpotAutoOn] = useState<boolean | null>(null);
  const [futuresAutoOn, setFuturesAutoOn] = useState<boolean | null>(null);
  const [autoTradeBusy, setAutoTradeBusy] = useState<"SPOT" | "FUTURES" | null>(null);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  const refreshWallet = useAppStore((s) => s.refreshWallet);
  const userId = useAppStore((s) => s.userId);
  const { currencyMode, summary, fetchDashboard } = useDashboardStore();
  const inrRate = summary?.inrRate || 85;
  const netPnl = (summary as any)?.netPnL ?? { total: 0, spot: 0, futures: 0 };

  const load = async () => {
    setLoading(true);
    try {
      const mode = useAppStore.getState().mode || "PAPER";
      if (userId) fetchDashboard(userId).catch(() => {});
      const [s, f, tx, status] = await Promise.all([
        getWalletBalance(mode, "SPOT").catch(() => ({ usdt:0, lockedMargin:0, totalBalance:0 })),
        getWalletBalance(mode, "FUTURES").catch(() => ({ usdt:0, lockedMargin:0, totalBalance:0 })),
        getWalletTransactions(20).catch(() => ({ transactions:[] })),
        getAutoStatus().catch(() => null),
      ]);
      setBalances({
        spot:    { usdt: s.usdt||0, locked: s.lockedMargin||0, total: s.totalBalance||s.usdt||0 },
        futures: { usdt: f.usdt||0, locked: f.lockedMargin||0, total: f.totalBalance||f.usdt||0 },
      });
      setTxns(tx.transactions ?? []);
      if (status) {
        setSpotAutoOn(!!(status as any).spot);
        setFuturesAutoOn(!!(status as any).futures);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [userId]);

  const loadP2pOffers = async () => {
    setP2pLoading(true);
    try {
      const offers = await getP2pOffers().catch(() => []);
      setP2pOffers(Array.isArray(offers) ? offers : []);
    } finally { setP2pLoading(false); }
  };

  const openModal = (m: ModalType) => {
    setModal(m);
    setDepMsg(""); setWdMsg(""); setXfMsg(""); setP2pMsg("");
    if (m === "p2p") loadP2pOffers();
  };

  const handleDeposit = async () => {
    if (!depAmt || isNaN(Number(depAmt))) return;
    setDepLoading(true);
    try {
      // Correct argument order: (amount, accountType, currency) — a prior
      // version of this call passed "USDT" as accountType and depAcc
      // (SPOT/FUTURES) as currency, silently depositing into an invalid
      // accountType="USDT" wallet instead of the account shown in the UI.
      await depositPaper(parseFloat(depAmt), depAcc, depCurrency);
      setDepMsg("Deposit successful!");
      await load(); refreshWallet();
      setTimeout(() => { setModal(null); setDepMsg(""); setDepAmt(""); }, 1500);
    } catch (e: any) { setDepMsg(e?.message || "Deposit failed"); }
    finally { setDepLoading(false); }
  };

  const handleWithdraw = async () => {
    if (!wdAmt || isNaN(Number(wdAmt))) return;
    setWdLoading(true);
    setWdMsg("");
    try {
      const amount = parseFloat(wdAmt);
      if (wdMethod === "UPI") {
        if (!wdUpiId.includes("@")) { setWdMsg("Enter a valid UPI ID (e.g. name@upi)"); return; }
        const res: any = await withdrawUpi(amount, wdUpiId, wdAcc);
        setWdMsg(res?.message || "Withdrawal submitted!");
      } else {
        if (!wdAddress) { setWdMsg("Enter a destination address"); return; }
        const res: any = await withdrawCrypto("USDT", amount, wdAddress, wdNetwork, wdAcc);
        setWdMsg(res?.message || "Withdrawal submitted!");
      }
      await load(); refreshWallet();
      setTimeout(() => { setModal(null); setWdMsg(""); setWdAmt(""); setWdUpiId(""); setWdAddress(""); }, 1800);
    } catch (e: any) { setWdMsg(e?.message || "Withdrawal failed"); }
    finally { setWdLoading(false); }
  };

  const handleTransfer = async () => {
    if (!xfAmt || isNaN(Number(xfAmt))) return;
    setXfLoading(true);
    setXfMsg("");
    try {
      const amount = parseFloat(xfAmt);
      const res: any = xfKind === "internal"
        ? await transferWallet("internal", amount, { from: xfFrom })
        : await transferWallet("external", amount, { accountType: xfAcc });
      setXfMsg(res?.message || "Transfer complete!");
      await load(); refreshWallet();
      setTimeout(() => { setModal(null); setXfMsg(""); setXfAmt(""); }, 1800);
    } catch (e: any) { setXfMsg(e?.message || "Transfer failed"); }
    finally { setXfLoading(false); }
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
    if (!resetConfirming) { setResetConfirming(true); return; }
    setResetBusy(true);
    setResetMsg("");
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

  return (
    <div style={{ background:BG, minHeight:"100%", padding:16, display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:`${B}18`, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Wallet size={18} color={B} />
          </div>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:"var(--ds-text)" }}>Wallet</div>
            <div style={{ fontSize:11, color:"var(--ds-text-faint)" }}>Spot &amp; Futures · balance &amp; transactions</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button
            onClick={() => handleToggleAutoTrade("SPOT")}
            disabled={autoTradeBusy !== null || spotAutoOn === null}
            title="Toggle Spot auto-trade"
            style={{ display:"flex", alignItems:"center", gap:6, background: spotAutoOn ? `${SPOT_COLOR}18` : "rgba(255,255,255,0.04)", border:`1px solid ${spotAutoOn ? `${SPOT_COLOR}50` : BORD}`, borderRadius:8, padding:"7px 12px", color: spotAutoOn ? SPOT_COLOR : "var(--ds-text-faint)", fontSize:11, fontWeight:700, cursor:"pointer" }}
          >
            {spotAutoOn ? <Power size={14} /> : <PowerOff size={14} />}
            {autoTradeBusy === "SPOT" ? "…" : `Spot ${spotAutoOn === null ? "—" : spotAutoOn ? "ON" : "OFF"}`}
          </button>
          <button
            onClick={() => handleToggleAutoTrade("FUTURES")}
            disabled={autoTradeBusy !== null || futuresAutoOn === null}
            title="Toggle Futures auto-trade"
            style={{ display:"flex", alignItems:"center", gap:6, background: futuresAutoOn ? `${FUTURES_COLOR}18` : "rgba(255,255,255,0.04)", border:`1px solid ${futuresAutoOn ? `${FUTURES_COLOR}50` : BORD}`, borderRadius:8, padding:"7px 12px", color: futuresAutoOn ? FUTURES_COLOR : "var(--ds-text-faint)", fontSize:11, fontWeight:700, cursor:"pointer" }}
          >
            {futuresAutoOn ? <Power size={14} /> : <PowerOff size={14} />}
            {autoTradeBusy === "FUTURES" ? "…" : `Futures ${futuresAutoOn === null ? "—" : futuresAutoOn ? "ON" : "OFF"}`}
          </button>
          <button onClick={load} style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:8, padding:"7px 10px", color:"var(--ds-text-faint)", cursor:"pointer", display:"flex" }}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} />
          </button>
          <button
            onClick={handleHardReset}
            disabled={resetBusy}
            style={{ display:"flex", alignItems:"center", gap:6, background: resetConfirming ? `${R}30` : `${R}12`, border:`1px solid ${R}40`, borderRadius:8, padding:"7px 12px", color:R, fontSize:11, fontWeight:700, cursor:"pointer" }}
          >
            <AlertTriangle size={14} /> {resetBusy ? "Resetting…" : resetConfirming ? "Confirm Reset?" : "Reset"}
          </button>
          {resetConfirming && !resetBusy && (
            <button onClick={() => setResetConfirming(false)} style={{ background:"none", border:"none", color:"var(--ds-text-faint)", fontSize:11, fontWeight:700, cursor:"pointer" }}>Cancel</button>
          )}
        </div>
      </div>
      {resetMsg && (
        <div style={{ fontSize:11, color: resetMsg.toLowerCase().includes("fail") ? R : G, textAlign:"right" }}>{resetMsg}</div>
      )}

      {/* Estimated balance banner (Binance-style) */}
      <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:12, padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Estimated Balance</div>
            <div style={{ fontSize:32, fontWeight:900, color:"var(--ds-text)", fontFamily:"monospace" }}>{totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</div>
            <div style={{ fontSize:16, fontWeight:700, color:"var(--ds-text-faint)", fontFamily:"monospace", marginTop:2 }}>≈ ₹{Math.round(totalEquity * inrRate).toLocaleString("en-IN")}</div>
          </div>
          <div style={{ display:"flex", gap:20 }}>
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Daily P&L</div>
              <div style={{ fontSize:16, fontWeight:800, color: (summary.dailyPnL??0) >= 0 ? G : R, fontFamily:"monospace" }}>
                {(summary.dailyPnL??0) >= 0 ? "+" : ""}{formatCurrency(summary.dailyPnL??0, { mode: currencyMode, inrRate })}
              </div>
            </div>
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Open P&L</div>
              <div style={{ fontSize:16, fontWeight:800, color: (summary.openPnL??0) >= 0 ? G : R, fontFamily:"monospace" }}>
                {(summary.openPnL??0) >= 0 ? "+" : ""}{formatCurrency(summary.openPnL??0, { mode: currencyMode, inrRate })}
              </div>
            </div>
          </div>
        </div>

        {/* Primary wallet actions */}
        <div style={{ display:"flex", borderTop:`1px solid ${BORD}`, paddingTop:14 }}>
          <ActionButton icon={<ArrowDownCircle size={18} />} label="Deposit" onClick={() => openModal("deposit")} color={G} />
          <ActionButton icon={<ArrowUpCircle size={18} />} label="Withdraw" onClick={() => openModal("withdraw")} color={R} />
          <ActionButton icon={<Repeat size={18} />} label="Transfer" onClick={() => openModal("transfer")} color={B} />
          <ActionButton icon={<Users size={18} />} label="P2P" onClick={() => openModal("p2p")} color={A} />
        </div>
      </div>

      {/* Account balances */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap:12 }} className="bal-grid">

        <div style={{ background:CARD, border:`1px solid ${BORD}`, borderLeft:`3px solid ${SPOT_COLOR}`, borderRadius:12, padding:"16px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:SPOT_COLOR }} />
            <div style={{ fontSize:10, fontWeight:700, color:SPOT_COLOR, textTransform:"uppercase", letterSpacing:"0.08em" }}>Spot Account</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap:8 }}>
            <BalCard label="Available" value={withInr(balances.spot.usdt, inrRate, { mode: currencyMode })} color={G} />
            <BalCard label="Locked"    value={withInr(balances.spot.locked, inrRate, { mode: currencyMode })} color={A} sub="invested in open positions" />
            <BalCard label="Total"     value={withInr(balances.spot.total, inrRate, { mode: currencyMode })} />
            <BalCard label="Net P&L"   value={`${netPnl.spot >= 0 ? "+" : ""}${withInr(netPnl.spot, inrRate, { mode: currencyMode })}`} color={netPnl.spot >= 0 ? G : R} sub="realized, all time" />
          </div>
        </div>

        <div style={{ background:CARD, border:`1px solid ${BORD}`, borderLeft:`3px solid ${FUTURES_COLOR}`, borderRadius:12, padding:"16px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:FUTURES_COLOR }} />
            <div style={{ fontSize:10, fontWeight:700, color:FUTURES_COLOR, textTransform:"uppercase", letterSpacing:"0.08em" }}>Futures Account</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap:8 }}>
            <BalCard label="Available" value={withInr(balances.futures.usdt, inrRate, { mode: currencyMode })} color={G} />
            <BalCard label="Locked"    value={withInr(balances.futures.locked, inrRate, { mode: currencyMode })} color={A} sub="invested in open positions" />
            <BalCard label="Total"     value={withInr(balances.futures.total, inrRate, { mode: currencyMode })} />
            <BalCard label="Net P&L"   value={`${netPnl.futures >= 0 ? "+" : ""}${withInr(netPnl.futures, inrRate, { mode: currencyMode })}`} color={netPnl.futures >= 0 ? G : R} sub="realized, all time" />
          </div>
        </div>
      </div>

      {/* Transaction history */}
      <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:12, overflow:"hidden" }}>
        <div style={{ padding:"12px 16px", borderBottom:`1px solid ${BORD}`, display:"flex", alignItems:"center", gap:8 }}>
          <History size={14} color="var(--ds-text-faint)" />
          <span style={{ fontSize:12, fontWeight:700, color:"var(--ds-text)" }}>Transaction History</span>
        </div>
        {txns.length === 0 ? (
          <div style={{ padding:40, textAlign:"center", color:"var(--ds-text-faint)", fontSize:12 }}>No transactions yet</div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${BORD}` }}>
                  {["Type","Amount","Account","Date"].map((h) => (
                    <th key={h} style={{ padding:"9px 14px", textAlign:"left", fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txns.map((tx, i) => {
                  const isCredit = tx.type === "DEPOSIT" || tx.type === "P2P_BUY";
                  const color = TX_COLORS[tx.type] ?? B;
                  // WalletTransaction.amount is stored in whatever unit the txn
                  // settled in (INR for UPI, USDT/symbol otherwise) — normalize
                  // to a USDT-equivalent before formatting, else an INR-settled
                  // withdrawal renders its rupee amount mislabeled as USDT.
                  const rawAmount = parseFloat(tx.amount ?? 0);
                  const usdtEquivalent = tx.currency === "INR" ? rawAmount / inrRate : rawAmount;
                  return (
                    <tr key={i} style={{ borderBottom:`1px solid var(--ds-border)` }}>
                      <td style={{ padding:"10px 14px" }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4, background:`${color}18`, color, textTransform:"uppercase" }}>{tx.type}</span>
                      </td>
                      <td style={{ padding:"10px 14px", fontFamily:"monospace", fontWeight:700, color }}>
                        {isCredit ? "+" : "-"}{withInr(usdtEquivalent, inrRate, { mode: currencyMode })}
                      </td>
                      <td style={{ padding:"10px 14px", color: tx.accountType === "SPOT" ? SPOT_COLOR : tx.accountType === "FUTURES" ? FUTURES_COLOR : "var(--ds-text-faint)", fontSize:11, fontWeight:700 }}>{tx.accountType ?? "—"}</td>
                      <td style={{ padding:"10px 14px", color:"var(--ds-text-faint)", fontSize:11 }}>
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleString("en-IN", { month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit" }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deposit modal */}
      {modal === "deposit" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={() => setModal(null)}>
          <div style={{ background:"var(--ds-surface)", border:`1px solid ${BORD}`, borderRadius:16, padding:24, width:"100%", maxWidth:380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <div style={{ fontSize:15, fontWeight:800, color:"var(--ds-text)" }}>Add Funds (Dummy)</div>
              <button onClick={() => setModal(null)} style={{ background:"none", border:"none", color:"var(--ds-text-faint)", cursor:"pointer", padding:4, display:"flex" }}><X size={16} /></button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <label style={label}>Amount</label>
                <div style={{ display:"flex", gap:8 }}>
                  <input style={{ ...inp, flex:1 }} type="number" placeholder="0.00" value={depAmt} onChange={(e) => setDepAmt(e.target.value)} />
                  <div style={{ display:"flex", borderRadius:8, overflow:"hidden", border:"1px solid rgba(255,255,255,0.1)" }}>
                    {(["USDT","INR"] as const).map((c) => (
                      <button key={c} onClick={() => setDepCurrency(c)} style={{ padding:"0 12px", fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background: depCurrency === c ? G : "rgba(255,255,255,0.04)", color: depCurrency === c ? "#fff" : "var(--ds-text-faint)" }}>{c}</button>
                    ))}
                  </div>
                </div>
                {depCurrency === "INR" && depAmt && !isNaN(Number(depAmt)) && (
                  <div style={{ fontSize:10, color:"var(--ds-text-faint)", marginTop:6 }}>
                    ≈ {(Number(depAmt) / inrRate).toFixed(4)} USDT
                  </div>
                )}
              </div>
              <div>
                <label style={label}>Account</label>
                <div style={{ display:"flex", gap:8 }}>
                  {(["SPOT","FUTURES"] as const).map((a) => (
                    <button key={a} onClick={() => setDepAcc(a)} style={{ flex:1, padding:"8px", borderRadius:7, fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background: depAcc === a ? G : "rgba(255,255,255,0.04)", color: depAcc === a ? "#fff" : "var(--ds-text-faint)" }}>{a}</button>
                  ))}
                </div>
              </div>
              {depMsg && <div style={{ fontSize:11, color: depMsg.toLowerCase().includes("success") ? G : R, textAlign:"center" }}>{depMsg}</div>}
              <button
                onClick={handleDeposit}
                disabled={depLoading || !depAmt}
                style={{ width:"100%", padding:"11px", borderRadius:9, border:"none", background: depLoading ? "var(--ds-text-faint)" : G, color:"#fff", fontSize:13, fontWeight:800, cursor: depLoading ? "not-allowed" : "pointer", marginTop:4 }}
              >
                {depLoading ? "Processing…" : "Deposit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw modal */}
      {modal === "withdraw" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={() => setModal(null)}>
          <div style={{ background:"var(--ds-surface)", border:`1px solid ${BORD}`, borderRadius:16, padding:24, width:"100%", maxWidth:380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <div style={{ fontSize:15, fontWeight:800, color:"var(--ds-text)" }}>Withdraw</div>
              <button onClick={() => setModal(null)} style={{ background:"none", border:"none", color:"var(--ds-text-faint)", cursor:"pointer", padding:4, display:"flex" }}><X size={16} /></button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <label style={label}>Method</label>
                <div style={{ display:"flex", gap:8 }}>
                  {(["UPI","CRYPTO"] as const).map((m) => (
                    <button key={m} onClick={() => setWdMethod(m)} style={{ flex:1, padding:"8px", borderRadius:7, fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background: wdMethod === m ? R : "rgba(255,255,255,0.04)", color: wdMethod === m ? "#fff" : "var(--ds-text-faint)" }}>{m === "UPI" ? "UPI (INR)" : "Crypto (USDT)"}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={label}>Amount (USDT)</label>
                <input style={inp} type="number" placeholder="0.00" value={wdAmt} onChange={(e) => setWdAmt(e.target.value)} />
              </div>
              {wdMethod === "UPI" ? (
                <div>
                  <label style={label}>UPI ID</label>
                  <input style={inp} type="text" placeholder="name@upi" value={wdUpiId} onChange={(e) => setWdUpiId(e.target.value)} />
                </div>
              ) : (
                <>
                  <div>
                    <label style={label}>Destination Address</label>
                    <input style={inp} type="text" placeholder="0x… or wallet address" value={wdAddress} onChange={(e) => setWdAddress(e.target.value)} />
                  </div>
                  <div>
                    <label style={label}>Network</label>
                    <div style={{ display:"flex", gap:8 }}>
                      {(["BEP20","TRC20","ERC20"] as const).map((n) => (
                        <button key={n} onClick={() => setWdNetwork(n)} style={{ flex:1, padding:"8px", borderRadius:7, fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background: wdNetwork === n ? R : "rgba(255,255,255,0.04)", color: wdNetwork === n ? "#fff" : "var(--ds-text-faint)" }}>{n}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <div>
                <label style={label}>From Account</label>
                <div style={{ display:"flex", gap:8 }}>
                  {(["SPOT","FUTURES"] as const).map((a) => (
                    <button key={a} onClick={() => setWdAcc(a)} style={{ flex:1, padding:"8px", borderRadius:7, fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background: wdAcc === a ? R : "rgba(255,255,255,0.04)", color: wdAcc === a ? "#fff" : "var(--ds-text-faint)" }}>{a}</button>
                  ))}
                </div>
              </div>
              {wdMsg && <div style={{ fontSize:11, color: wdMsg.toLowerCase().includes("fail") || wdMsg.toLowerCase().includes("enter") || wdMsg.toLowerCase().includes("insufficient") ? R : G, textAlign:"center" }}>{wdMsg}</div>}
              <button
                onClick={handleWithdraw}
                disabled={wdLoading || !wdAmt}
                style={{ width:"100%", padding:"11px", borderRadius:9, border:"none", background: wdLoading ? "var(--ds-text-faint)" : R, color:"#fff", fontSize:13, fontWeight:800, cursor: wdLoading ? "not-allowed" : "pointer", marginTop:4 }}
              >
                {wdLoading ? "Processing…" : "Withdraw"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer modal */}
      {modal === "transfer" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={() => setModal(null)}>
          <div style={{ background:"var(--ds-surface)", border:`1px solid ${BORD}`, borderRadius:16, padding:24, width:"100%", maxWidth:380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <div style={{ fontSize:15, fontWeight:800, color:"var(--ds-text)" }}>Transfer</div>
              <button onClick={() => setModal(null)} style={{ background:"none", border:"none", color:"var(--ds-text-faint)", cursor:"pointer", padding:4, display:"flex" }}><X size={16} /></button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <label style={label}>Type</label>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => setXfKind("internal")} style={{ flex:1, padding:"8px", borderRadius:7, fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background: xfKind === "internal" ? B : "rgba(255,255,255,0.04)", color: xfKind === "internal" ? "#fff" : "var(--ds-text-faint)" }}>Spot ⇄ Futures</button>
                  <button onClick={() => setXfKind("external")} style={{ flex:1, padding:"8px", borderRadius:7, fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background: xfKind === "external" ? B : "rgba(255,255,255,0.04)", color: xfKind === "external" ? "#fff" : "var(--ds-text-faint)" }}>To Binance Main</button>
                </div>
              </div>
              <div>
                <label style={label}>Amount (USDT)</label>
                <input style={inp} type="number" placeholder="0.00" value={xfAmt} onChange={(e) => setXfAmt(e.target.value)} />
              </div>
              {xfKind === "internal" ? (
                <div>
                  <label style={label}>From</label>
                  <div style={{ display:"flex", gap:8 }}>
                    {(["SPOT","FUTURES"] as const).map((a) => (
                      <button key={a} onClick={() => setXfFrom(a)} style={{ flex:1, padding:"8px", borderRadius:7, fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background: xfFrom === a ? B : "rgba(255,255,255,0.04)", color: xfFrom === a ? "#fff" : "var(--ds-text-faint)" }}>{a}</button>
                    ))}
                  </div>
                  <div style={{ fontSize:10, color:"var(--ds-text-faint)", marginTop:6 }}>→ moves into {xfFrom === "SPOT" ? "FUTURES" : "SPOT"}</div>
                </div>
              ) : (
                <div>
                  <label style={label}>From Account</label>
                  <div style={{ display:"flex", gap:8 }}>
                    {(["SPOT","FUTURES"] as const).map((a) => (
                      <button key={a} onClick={() => setXfAcc(a)} style={{ flex:1, padding:"8px", borderRadius:7, fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background: xfAcc === a ? B : "rgba(255,255,255,0.04)", color: xfAcc === a ? "#fff" : "var(--ds-text-faint)" }}>{a}</button>
                    ))}
                  </div>
                  <div style={{ fontSize:10, color:"var(--ds-text-faint)", marginTop:6 }}>Simulated — no real transfer occurs, dummy funds only.</div>
                </div>
              )}
              {xfMsg && <div style={{ fontSize:11, color: xfMsg.toLowerCase().includes("fail") || xfMsg.toLowerCase().includes("insufficient") ? R : G, textAlign:"center" }}>{xfMsg}</div>}
              <button
                onClick={handleTransfer}
                disabled={xfLoading || !xfAmt}
                style={{ width:"100%", padding:"11px", borderRadius:9, border:"none", background: xfLoading ? "var(--ds-text-faint)" : B, color:"#fff", fontSize:13, fontWeight:800, cursor: xfLoading ? "not-allowed" : "pointer", marginTop:4 }}
              >
                {xfLoading ? "Processing…" : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* P2P modal */}
      {modal === "p2p" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={() => setModal(null)}>
          <div style={{ background:"var(--ds-surface)", border:`1px solid ${BORD}`, borderRadius:16, padding:24, width:"100%", maxWidth:440, maxHeight:"85vh", overflowY:"auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <div style={{ fontSize:15, fontWeight:800, color:"var(--ds-text)" }}>P2P Marketplace</div>
              <button onClick={() => setModal(null)} style={{ background:"none", border:"none", color:"var(--ds-text-faint)", cursor:"pointer", padding:4, display:"flex" }}><X size={16} /></button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20, padding:14, background:CARD2, borderRadius:10, border:`1px solid ${BORD}` }}>
              <div style={{ fontSize:11, fontWeight:700, color:"var(--ds-text)" }}>Create Sell Offer</div>
              <div style={{ display:"flex", gap:8 }}>
                <input style={{ ...inp, flex:1 }} type="number" placeholder="USDT amount" value={p2pAmt} onChange={(e) => setP2pAmt(e.target.value)} />
                <input style={{ ...inp, flex:1 }} type="number" placeholder="₹ price / USDT" value={p2pPrice} onChange={(e) => setP2pPrice(e.target.value)} />
              </div>
              <button
                onClick={handleCreateP2pOffer}
                disabled={p2pBusy || !p2pAmt || !p2pPrice}
                style={{ padding:"9px", borderRadius:8, border:"none", background: p2pBusy ? "var(--ds-text-faint)" : A, color:"#fff", fontSize:12, fontWeight:800, cursor: p2pBusy ? "not-allowed" : "pointer" }}
              >
                {p2pBusy ? "Working…" : "Create Offer"}
              </button>
            </div>

            {p2pMsg && <div style={{ fontSize:11, color: p2pMsg.toLowerCase().includes("fail") || p2pMsg.toLowerCase().includes("insufficient") ? R : G, textAlign:"center", marginBottom:12 }}>{p2pMsg}</div>}

            <div style={{ fontSize:11, fontWeight:700, color:"var(--ds-text)", marginBottom:8 }}>Open Sell Offers</div>
            {p2pLoading ? (
              <div style={{ padding:20, textAlign:"center", color:"var(--ds-text-faint)", fontSize:12 }}>Loading…</div>
            ) : p2pOffers.length === 0 ? (
              <div style={{ padding:20, textAlign:"center", color:"var(--ds-text-faint)", fontSize:12 }}>No open offers right now</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {p2pOffers.map((o) => (
                  <div key={o._id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", background:CARD2, borderRadius:8, border:`1px solid ${BORD}` }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:"var(--ds-text)", fontFamily:"monospace" }}>{Number(o.amount).toFixed(2)} USDT</div>
                      <div style={{ fontSize:10, color:"var(--ds-text-faint)" }}>@ ₹{o.p2pPrice}/USDT</div>
                    </div>
                    <button
                      onClick={() => handleBuyP2pOffer(o._id)}
                      disabled={p2pBusy}
                      style={{ padding:"7px 14px", borderRadius:7, border:"none", background: G, color:"#fff", fontSize:11, fontWeight:800, cursor: p2pBusy ? "not-allowed" : "pointer" }}
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
