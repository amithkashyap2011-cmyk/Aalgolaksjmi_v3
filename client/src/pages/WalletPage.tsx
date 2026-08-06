/*
 * ─── WalletPage ───────────────────────────────────────
 *
 * Three‑tab wallet interface:
 *  1. Balance   – USDT balance with INR equivalent
 *  2. UPI       – Deposit / Withdraw via UPI
 *  3. P2P       – Peer‑to‑peer marketplace
 */
import { useState, useEffect, useCallback } from "react";
import {
  getWalletBalance,
  getWalletTransactions,
  depositUpi,
  withdrawUpi,
  getP2pOffers,
  createP2pOffer,
  buyP2pOffer,
} from "../lib/api";
import { useAppStore } from "../store/useAppStore";

type Tab = "balance" | "upi" | "p2p";

/* ── tiny helpers ───────────────────────────── */

function fmtINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtUSDT(n: number) {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT`;
}

/* ───────────────────────────────────────────── */

export default function WalletPage() {
  const mode = useAppStore((s) => s.mode);
  const [tab, setTab] = useState<Tab>("balance");

  return (
    <div style={{ background: "#090d16", minHeight: "100%", padding: "20px", color: "#f8fafc" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            💳 Financial Command Center
          </h1>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0 0" }}>
            Unified Portfolio Ledger for Indian Equities (₹ INR) & Crypto Perpetuals (USDT)
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: "flex", background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 3 }}>
          {(["balance", "upi", "p2p"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 800, border: "none", cursor: "pointer",
                background: tab === t ? "linear-gradient(135deg, #d4af37, #b38f24)" : "transparent",
                color: tab === t ? "#000" : "#94a3b8", transition: "all 0.15s ease"
              }}
            >
              {t === "balance" ? "📊 Portfolio Balances" : t === "upi" ? "⚡ UPI Deposit / Withdraw" : "🤝 P2P Marketplace"}
            </button>
          ))}
        </div>
      </div>

      {tab === "balance" && <BalanceTab mode={mode} />}
      {tab === "upi" && <UpiTab mode={mode} />}
      {tab === "p2p" && <P2pTab />}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Advanced Dark Glassmorphism Balance Tab
   ────────────────────────────────────────────── */

function BalanceTab({ mode }: { mode: string }) {
  const [bal, setBal] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState("50000");
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositMsg, setDepositMsg] = useState<string | null>(null);
  const [activeAccountFilter, setActiveAccountFilter] = useState<"ALL" | "INDIAN" | "CRYPTO">("ALL");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [b, t] = await Promise.all([
        getWalletBalance(mode),
        getWalletTransactions(20),
      ]);
      setBal(b);
      setTxns(t.transactions ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAddMoneyInr = async (amtInr: number) => {
    setDepositMsg("Adding funds in ₹ INR to wallet...");
    try {
      const token = localStorage.getItem("aalgo_jwt");
      const res = await fetch("/wallet/deposit/test-funds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ accountType: "FUTURES", amount: amtInr, mode, currency: "INR" }),
      });
      if (res.ok) {
        setDepositMsg(`Successfully added +₹${amtInr.toLocaleString("en-IN")} INR!`);
        refresh();
        setTimeout(() => { setShowDepositModal(false); setDepositMsg(null); }, 1500);
      } else {
        setDepositMsg("Failed to add funds.");
      }
    } catch (err: any) {
      setDepositMsg(`Error: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
        <p style={{ fontSize: 13, fontWeight: 700 }}>Synchronizing Portfolio Balances & Exchange Ledgers…</p>
      </div>
    );
  }

  const rate = bal?.inrRate ?? 83.5;
  const inrTotal = bal?.inrEquivalent ?? 0;
  const usdtTotal = bal?.usdt ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 🌟 Master Portfolio Net Worth Header Card */}
      <div style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 16, padding: 24, boxShadow: "0 8px 30px rgba(0,0,0,0.4)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 220, height: 220, background: "radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#d4af37", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
              Total Portfolio Equity (Cross-Asset)
            </span>
            <div style={{ fontSize: 34, fontWeight: 900, color: "#fff", fontFamily: "monospace", letterSpacing: "-0.02em" }}>
              {fmtINR(inrTotal)}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#60a5fa", marginTop: 4, fontFamily: "monospace" }}>
              ≈ {fmtUSDT(usdtTotal)} <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>@ ₹{rate}/USDT</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => setShowDepositModal(true)}
              style={{ padding: "10px 18px", borderRadius: 10, background: "linear-gradient(135deg, #10b981, #059669)", color: "#000", fontWeight: 900, fontSize: 12, border: "none", cursor: "pointer", boxShadow: "0 0 15px rgba(16,185,129,0.3)", transition: "all 0.15s ease" }}
            >
              ➕ Deposit Funds (₹ INR)
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, display: "block" }}>TOTAL DEPOSITED</span>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 14, fontFamily: "monospace" }}>{fmtINR((bal?.totalDeposited ?? 0) * rate)}</span>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, display: "block" }}>TOTAL WITHDRAWN</span>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 14, fontFamily: "monospace" }}>{fmtINR((bal?.totalWithdrawn ?? 0) * rate)}</span>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, display: "block" }}>REALIZED P&L (ALL TIME)</span>
            <span style={{ color: (bal?.realizedPnL ?? 0) >= 0 ? "#34d399" : "#f87171", fontWeight: 800, fontSize: 14, fontFamily: "monospace" }}>
              {(bal?.realizedPnL ?? 0) >= 0 ? "+" : ""}{fmtINR((bal?.realizedPnL ?? 0) * rate)}
            </span>
          </div>
        </div>
      </div>

      {/* 🎛️ Market Segment Selector */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setActiveAccountFilter("ALL")}
          style={{ padding: "8px 16px", borderRadius: 10, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer", background: activeAccountFilter === "ALL" ? "#3b82f6" : "#0f172a", color: activeAccountFilter === "ALL" ? "#fff" : "#94a3b8" }}
        >
          🌐 ALL ACCOUNT WALLETS
        </button>
        <button
          onClick={() => setActiveAccountFilter("INDIAN")}
          style={{ padding: "8px 16px", borderRadius: 10, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer", background: activeAccountFilter === "INDIAN" ? "#f59e0b" : "#0f172a", color: activeAccountFilter === "INDIAN" ? "#000" : "#94a3b8" }}
        >
          🇮🇳 INDIAN EQUITIES & F&O (INR)
        </button>
        <button
          onClick={() => setActiveAccountFilter("CRYPTO")}
          style={{ padding: "8px 16px", borderRadius: 10, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer", background: activeAccountFilter === "CRYPTO" ? "#10b981" : "#0f172a", color: activeAccountFilter === "CRYPTO" ? "#000" : "#94a3b8" }}
        >
          🪙 CRYPTO FUTURES & SPOT (USDT)
        </button>
      </div>

      {/* 🪙 Crypto Spot & Futures Account Breakdown */}
      {(activeAccountFilter === "ALL" || activeAccountFilter === "CRYPTO") && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {/* Crypto Futures Account */}
          <div style={{ background: "#0f172a", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 14, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#60a5fa", textTransform: "uppercase" }}>CRYPTO FUTURES ACCOUNT</span>
              <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(59,130,246,0.2)", color: "#60a5fa", padding: "2px 6px", borderRadius: 4 }}>USDT</span>
            </div>

            <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", fontFamily: "monospace", marginBottom: 14 }}>
              {fmtUSDT(usdtTotal)}
              <span style={{ fontSize: 11, color: "#94a3b8", display: "block", fontWeight: 500 }}>≈ {fmtINR(usdtTotal * rate)}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 8 }}>
                <span style={{ color: "#94a3b8", fontSize: 10, display: "block" }}>Available Margin</span>
                <span style={{ color: "#34d399", fontWeight: 800, fontFamily: "monospace" }}>{fmtUSDT(bal?.usdt ?? 0)}</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 8 }}>
                <span style={{ color: "#94a3b8", fontSize: 10, display: "block" }}>Locked Margin</span>
                <span style={{ color: "#fbbf24", fontWeight: 800, fontFamily: "monospace" }}>{fmtUSDT(bal?.lockedMargin ?? 0)}</span>
              </div>
            </div>
          </div>

          {/* Crypto Spot Account */}
          <div style={{ background: "#0f172a", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 14, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#c084fc", textTransform: "uppercase" }}>CRYPTO SPOT ACCOUNT</span>
              <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(168,85,247,0.2)", color: "#c084fc", padding: "2px 6px", borderRadius: 4 }}>SPOT</span>
            </div>

            <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", fontFamily: "monospace", marginBottom: 14 }}>
              {fmtUSDT((bal?.usdt ?? 0) * 0.95)}
              <span style={{ fontSize: 11, color: "#94a3b8", display: "block", fontWeight: 500 }}>≈ {fmtINR((bal?.usdt ?? 0) * 0.95 * rate)}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 8 }}>
                <span style={{ color: "#94a3b8", fontSize: 10, display: "block" }}>Available Spot</span>
                <span style={{ color: "#34d399", fontWeight: 800, fontFamily: "monospace" }}>{fmtUSDT((bal?.usdt ?? 0) * 0.95)}</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 8 }}>
                <span style={{ color: "#94a3b8", fontSize: 10, display: "block" }}>Savings / LDUSDT</span>
                <span style={{ color: "#c084fc", fontWeight: 800, fontFamily: "monospace" }}>{fmtUSDT(bal?.savingsUsdt ?? 0)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🇮🇳 Indian Market Dedicated Wallets */}
      {(activeAccountFilter === "ALL" || activeAccountFilter === "INDIAN") && (
        <IndianWalletsSection mode={mode} />
      )}

      {/* 💳 Add Money Modal */}
      {showDepositModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 16, padding: 24, maxWidth: 420, width: "90%", color: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "#10b981" }}>➕ Add Money (₹ INR)</h3>
              <button onClick={() => setShowDepositModal(false)} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Inject virtual testing funds in Indian Rupees (₹ INR) into your main portfolio balance.</p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", display: "block", marginBottom: 6 }}>Amount (₹ INR)</label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, fontFamily: "monospace" }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {[10000, 50000, 100000, 500000].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setDepositAmount(preset.toString())}
                  style={{ flex: 1, padding: "6px", borderRadius: 6, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  +₹{(preset / 1000).toFixed(0)}k
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowDepositModal(false)}
                style={{ flex: 1, padding: "10px", borderRadius: 8, background: "#1e293b", color: "#cbd5e1", fontWeight: 800, fontSize: 12, border: "none", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleAddMoneyInr(Number(depositAmount) || 50000)}
                style={{ flex: 1, padding: "10px", borderRadius: 8, background: "#10b981", color: "#000", fontWeight: 800, fontSize: 12, border: "none", cursor: "pointer" }}
              >
                Confirm Deposit
              </button>
            </div>
            {depositMsg && <p style={{ fontSize: 11, textAlign: "center", fontWeight: 700, color: "#34d399", marginTop: 12 }}>{depositMsg}</p>}
          </div>
        </div>
      )}

      {/* Recent Transactions Ledger */}
      <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 14px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          📜 Recent Financial Transactions Ledger
        </h3>
        {txns.length === 0 ? (
          <p style={{ fontSize: 12, color: "#94a3b8" }}>No recent deposit/withdrawal transactions recorded.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#1e293b", color: "#94a3b8", fontSize: 10, textTransform: "uppercase" }}>
                  <th style={{ padding: "8px 12px" }}>Type</th>
                  <th style={{ padding: "8px 12px" }}>Method</th>
                  <th style={{ padding: "8px 12px" }}>Amount</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((tx: any) => (
                  <tr key={tx._id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 4, background: tx.type === "DEPOSIT" || tx.type === "P2P_BUY" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: tx.type === "DEPOSIT" || tx.type === "P2P_BUY" ? "#34d399" : "#f87171" }}>
                        {tx.type}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{tx.method}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 900, fontFamily: "monospace", color: tx.type === "DEPOSIT" || tx.type === "P2P_BUY" ? "#34d399" : "#f87171" }}>
                      {tx.type === "DEPOSIT" || tx.type === "P2P_BUY" ? "+" : "−"}{fmtUSDT(tx.amount)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#94a3b8", fontSize: 11 }}>
                      {new Date(tx.createdAt).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   UPI Tab
   ────────────────────────────────────────────── */

function UpiTab({ mode }: { mode: string }) {
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [upiId, setUpiId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) return setMsg({ ok: false, text: "Enter a valid amount" });
    if (!upiId.includes("@")) return setMsg({ ok: false, text: "Enter a valid UPI ID" });

    setBusy(true);
    setMsg(null);
    try {
      if (action === "deposit") {
        const res = await depositUpi(n, upiId);
        setMsg({ ok: true, text: `Deposited ${fmtINR(n)} → ${fmtUSDT(res.credited)} credited` });
      } else {
        const res = await withdrawUpi(n, upiId);
        setMsg({ ok: true, text: `Withdrew ${fmtUSDT(n)} → ${fmtINR(res.inrAmount)} sent to ${upiId}` });
      }
      setAmount("");
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message ?? "Request failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24, color: "#fff" }}>
      {/* Deposit / Withdraw Toggle */}
      <div style={{ display: "flex", background: "#1e293b", borderRadius: 10, padding: 3, marginBottom: 20 }}>
        {(["deposit", "withdraw"] as const).map((a) => (
          <button
            key={a}
            onClick={() => { setAction(a); setMsg(null); }}
            style={{
              flex: 1, padding: "10px", borderRadius: 8, fontSize: 12, fontWeight: 800, border: "none", cursor: "pointer",
              background: action === a ? (a === "deposit" ? "#10b981" : "#ef4444") : "transparent",
              color: action === a ? (a === "deposit" ? "#000" : "#fff") : "#94a3b8", transition: "all 0.15s ease"
            }}
          >
            {a === "deposit" ? "⬇ DEPOSIT INR (VIA UPI)" : "⬆ WITHDRAW USDT (TO UPI)"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>
            {action === "deposit" ? "Amount (₹ INR)" : "Amount (USDT)"}
          </label>
          <input
            type="number"
            min="1"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={action === "deposit" ? "e.g. 5000" : "e.g. 100"}
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, fontFamily: "monospace" }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>VPA / UPI ID</label>
          <input
            type="text"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="yourname@upi"
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, fontFamily: "monospace" }}
          />
        </div>

        <button
          onClick={submit}
          disabled={busy}
          style={{
            width: "100%", padding: "12px", borderRadius: 10, fontSize: 13, fontWeight: 900, border: "none", cursor: "pointer", marginTop: 8,
            background: action === "deposit" ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #ef4444, #dc2626)",
            color: action === "deposit" ? "#000" : "#fff", opacity: busy ? 0.6 : 1
          }}
        >
          {busy ? "Processing Transaction..." : action === "deposit" ? "Deposit via UPI Instant" : "Withdraw to Bank via UPI"}
        </button>
      </div>

      {msg && (
        <p style={{ fontSize: 12, fontWeight: 700, marginTop: 14, textAlign: "center", color: msg.ok ? "#34d399" : "#f87171" }}>
          {msg.text}
        </p>
      )}

      <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 16, lineHeight: 1.5, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
        💡 Simulated Instant UPI Payment Gateway for testing. Benchmark Exchange Conversion Rate: <strong>₹83.50 / USDT</strong>.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────
   P2P Tab
   ────────────────────────────────────────────── */

function P2pTab() {
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [usdtAmt, setUsdtAmt] = useState("");
  const [price, setPrice] = useState("83.50");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getP2pOffers();
      setOffers(Array.isArray(data) ? data : []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    const amt = parseFloat(usdtAmt);
    const p = parseFloat(price);
    if (!amt || amt <= 0 || !p || p <= 0)
      return setMsg({ ok: false, text: "Enter valid amount and price" });

    setBusy(true);
    setMsg(null);
    try {
      await createP2pOffer(amt, p);
      setMsg({ ok: true, text: `Offer created: sell ${fmtUSDT(amt)} @ ₹${p}/USDT` });
      setUsdtAmt("");
      refresh();
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message ?? "Failed" });
    } finally {
      setBusy(false);
    }
  };

  const handleBuy = async (id: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await buyP2pOffer(id);
      setMsg({ ok: true, text: `Bought ${fmtUSDT(res.credited)} from P2P offer` });
      refresh();
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message ?? "Failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Create Offer */}
      <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, color: "#fff" }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24", margin: "0 0 14px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          ➕ Create P2P Sell Order
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>USDT Amount</label>
            <input
              type="number"
              min="0.01"
              step="any"
              value={usdtAmt}
              onChange={(e) => setUsdtAmt(e.target.value)}
              placeholder="e.g. 100"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, fontFamily: "monospace" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>Price (₹/USDT)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, fontFamily: "monospace" }}
            />
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={busy}
          style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#f59e0b", color: "#000", fontWeight: 900, fontSize: 12, border: "none", cursor: "pointer" }}
        >
          Post P2P Offer
        </button>

        {msg && <p style={{ fontSize: 11, fontWeight: 700, marginTop: 10, textAlign: "center", color: msg.ok ? "#34d399" : "#f87171" }}>{msg.text}</p>}
      </div>

      {/* P2P Order Book */}
      <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, color: "#fff" }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 14px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          📖 P2P Marketplace Live Order Book
        </h3>
        {loading ? (
          <p style={{ fontSize: 12, color: "#94a3b8" }}>Loading active P2P offers…</p>
        ) : offers.length === 0 ? (
          <p style={{ fontSize: 12, color: "#94a3b8" }}>No active P2P offers available right now.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {offers.map((o: any) => (
              <div key={o._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1e293b", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 16px" }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 900, color: "#34d399", fontFamily: "monospace" }}>{fmtUSDT(o.amount)}</span>
                  <span style={{ fontSize: 12, color: "#cbd5e1", marginLeft: 10 }}>@ ₹{o.pricePerUsdt || 83.5}/USDT</span>
                  <span style={{ fontSize: 11, color: "#94a3b8", display: "block", marginTop: 2 }}>Posted {new Date(o.createdAt).toLocaleString("en-IN")}</span>
                </div>
                <button
                  onClick={() => handleBuy(o._id)}
                  disabled={busy}
                  style={{ padding: "8px 16px", borderRadius: 8, background: "#10b981", color: "#000", fontWeight: 900, fontSize: 12, border: "none", cursor: "pointer" }}
                >
                  Buy USDT
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IndianWalletsSection({ mode }: { mode: string }) {
  const [nseBal, setNseBal] = useState(500000);
  const [bseBal, setBseBal] = useState(500000);
  const [nifty50Bal, setNifty50Bal] = useState(1000000);

  const [nseStats, setNseStats] = useState({ pnl: 0, winRate: 0.0, pf: 0.00, locked: 0, trades: 0 });
  const [bseStats, setBseStats] = useState({ pnl: 0, winRate: 0.0, pf: 0.00, locked: 0, trades: 0 });
  const [niftyStats, setNiftyStats] = useState({ pnl: 0, winRate: 0.0, pf: 0.00, locked: 0, trades: 0 });

  const [addingAcc, setAddingAcc] = useState<string | null>(null);
  const [amount, setAmount] = useState("100000");
  const [msg, setMsg] = useState<string | null>(null);

  const fetchWallets = useCallback(async () => {
    try {
      const token = localStorage.getItem("aalgo_jwt");
      const headers: any = token ? { Authorization: `Bearer ${token}` } : {};
      const [nseRes, bseRes, niftyRes] = await Promise.all([
        fetch(`/wallet/balance?accountType=INDIAN_NSE&mode=${mode}`, { headers }).then(r => r.json()).catch(() => null),
        fetch(`/wallet/balance?accountType=INDIAN_BSE&mode=${mode}`, { headers }).then(r => r.json()).catch(() => null),
        fetch(`/wallet/balance?accountType=INDIAN_NIFTY50&mode=${mode}`, { headers }).then(r => r.json()).catch(() => null),
      ]);
      if (nseRes?.inr !== undefined) {
        setNseBal(nseRes.inr);
        if (nseRes.realizedPnL !== undefined) setNseStats(s => ({ ...s, pnl: nseRes.realizedPnL, locked: nseRes.lockedMargin ?? s.locked }));
      }
      if (bseRes?.inr !== undefined) {
        setBseBal(bseRes.inr);
        if (bseRes.realizedPnL !== undefined) setBseStats(s => ({ ...s, pnl: bseRes.realizedPnL, locked: bseRes.lockedMargin ?? s.locked }));
      }
      if (niftyRes?.inr !== undefined) {
        setNifty50Bal(niftyRes.inr);
        if (niftyRes.realizedPnL !== undefined) setNiftyStats(s => ({ ...s, pnl: niftyRes.realizedPnL, locked: niftyRes.lockedMargin ?? s.locked }));
      }
    } catch {}
  }, [mode]);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  const handleDeposit = async () => {
    if (!addingAcc) return;
    setMsg("Adding test funds...");
    try {
      const token = localStorage.getItem("aalgo_jwt");
      const res = await fetch("/wallet/deposit/test-funds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ accountType: addingAcc, amount: Number(amount) || 100000, mode, currency: "INR" }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`Success: Added ₹${(Number(amount) || 100000).toLocaleString("en-IN")} test funds`);
        fetchWallets();
        setTimeout(() => { setAddingAcc(null); setMsg(null); }, 1500);
      } else {
        setMsg(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    }
  };

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-md">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
            🇮🇳 Indian Market Dedicated Wallets (₹ INR)
          </h3>
          <p className="text-[11px] text-slate-400">Separate wallets for NSE, BSE &amp; NIFTY 50 trading with real-time P&amp;L and AI Win Rate</p>
        </div>
        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full font-semibold">
          NATIVE INR
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* NSE */}
        <div className="bg-slate-800/80 border border-emerald-500/30 rounded-xl p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-bold text-emerald-400 uppercase">NSE EQUITIES</span>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono font-bold">NSE</span>
            </div>
            <p className="text-xl font-black font-mono text-white mb-2">{fmtINR(nseBal)}</p>

            {/* P&L & Win Rate Grid */}
            <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50 text-[11px]">
              <div>
                <span className="text-[9px] font-bold text-slate-400 block uppercase">REALIZED P&amp;L</span>
                <span className={`font-mono font-black ${nseStats.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {nseStats.pnl >= 0 ? "+" : ""}{fmtINR(nseStats.pnl)}
                </span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 block uppercase">AI WIN RATE</span>
                <span className="font-mono font-bold text-amber-400">
                  {nseStats.winRate}% <span className="text-[9px] text-slate-400 font-normal">(PF {nseStats.pf})</span>
                </span>
              </div>
              <div className="col-span-2 pt-1 border-t border-slate-800 flex justify-between text-[10px] text-slate-400">
                <span>Locked Margin: <strong className="text-white font-mono">{fmtINR(nseStats.locked)}</strong></span>
                <span>Trades: <strong className="text-white font-mono">{nseStats.trades}</strong></span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setAddingAcc("INDIAN_NSE")}
            className="w-full py-2 bg-emerald-500 text-slate-950 text-xs font-black rounded-lg hover:bg-emerald-400 transition-colors shadow-sm"
          >
            + Add Test Funds (Dummy ₹)
          </button>
        </div>

        {/* BSE */}
        <div className="bg-slate-800/80 border border-purple-500/30 rounded-xl p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-bold text-purple-400 uppercase">BSE EQUITIES</span>
              <span className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded font-mono font-bold">BSE</span>
            </div>
            <p className="text-xl font-black font-mono text-white mb-2">{fmtINR(bseBal)}</p>

            {/* P&L & Win Rate Grid */}
            <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50 text-[11px]">
              <div>
                <span className="text-[9px] font-bold text-slate-400 block uppercase">REALIZED P&amp;L</span>
                <span className={`font-mono font-black ${bseStats.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {bseStats.pnl >= 0 ? "+" : ""}{fmtINR(bseStats.pnl)}
                </span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 block uppercase">AI WIN RATE</span>
                <span className="font-mono font-bold text-amber-400">
                  {bseStats.winRate}% <span className="text-[9px] text-slate-400 font-normal">(PF {bseStats.pf})</span>
                </span>
              </div>
              <div className="col-span-2 pt-1 border-t border-slate-800 flex justify-between text-[10px] text-slate-400">
                <span>Locked Margin: <strong className="text-white font-mono">{fmtINR(bseStats.locked)}</strong></span>
                <span>Trades: <strong className="text-white font-mono">{bseStats.trades}</strong></span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setAddingAcc("INDIAN_BSE")}
            className="w-full py-2 bg-purple-500 text-white text-xs font-black rounded-lg hover:bg-purple-400 transition-colors shadow-sm"
          >
            + Add Test Funds (Dummy ₹)
          </button>
        </div>

        {/* NIFTY 50 */}
        <div className="bg-slate-800/80 border border-amber-500/30 rounded-xl p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-bold text-amber-400 uppercase">NIFTY 50 F&amp;O</span>
              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono font-bold">DERIVATIVES</span>
            </div>
            <p className="text-xl font-black font-mono text-white mb-2">{fmtINR(nifty50Bal)}</p>

            {/* P&L & Win Rate Grid */}
            <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50 text-[11px]">
              <div>
                <span className="text-[9px] font-bold text-slate-400 block uppercase">REALIZED P&amp;L</span>
                <span className={`font-mono font-black ${niftyStats.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {niftyStats.pnl >= 0 ? "+" : ""}{fmtINR(niftyStats.pnl)}
                </span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 block uppercase">AI WIN RATE</span>
                <span className="font-mono font-bold text-amber-400">
                  {niftyStats.winRate}% <span className="text-[9px] text-slate-400 font-normal">(PF {niftyStats.pf})</span>
                </span>
              </div>
              <div className="col-span-2 pt-1 border-t border-slate-800 flex justify-between text-[10px] text-slate-400">
                <span>Locked Margin: <strong className="text-white font-mono">{fmtINR(niftyStats.locked)}</strong></span>
                <span>Trades: <strong className="text-white font-mono">{niftyStats.trades}</strong></span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setAddingAcc("INDIAN_NIFTY50")}
            className="w-full py-2 bg-amber-500 text-slate-950 text-xs font-black rounded-lg hover:bg-amber-400 transition-colors shadow-sm"
          >
            + Add Test Funds (Dummy ₹)
          </button>
        </div>
      </div>

      {addingAcc && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-amber-400">
                Add Test Funds — {addingAcc.replace("INDIAN_", "")}
              </h4>
              <button onClick={() => setAddingAcc(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-semibold">Amount (₹ INR)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white"
              />
            </div>
            <div className="flex gap-2">
              {[100000, 500000, 1000000].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(preset.toString())}
                  className="flex-1 py-1 bg-slate-800 border border-slate-700 rounded text-[11px] font-bold text-slate-300 hover:bg-slate-700"
                >
                  +₹{(preset / 100000).toFixed(0)}L
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setAddingAcc(null)}
                className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDeposit}
                className="flex-1 py-2 bg-amber-500 text-slate-950 text-xs font-bold rounded-lg"
              >
                Deposit
              </button>
            </div>
            {msg && <p className="text-xs text-center font-semibold text-emerald-400">{msg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
