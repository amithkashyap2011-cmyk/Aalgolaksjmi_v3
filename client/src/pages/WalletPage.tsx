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
    <section className="space-y-5 max-w-3xl mx-auto">
      <h1 className="text-lg font-bold text-slate-800">💰 Wallet</h1>

      {/* tab switcher */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {(["balance", "upi", "p2p"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
              tab === t
                ? "bg-white shadow text-aalgreen"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "balance" ? "Balance" : t === "upi" ? "UPI Deposit / Withdraw" : "P2P Market"}
          </button>
        ))}
      </div>

      {tab === "balance" && <BalanceTab mode={mode} />}
      {tab === "upi" && <UpiTab mode={mode} />}
      {tab === "p2p" && <P2pTab />}
    </section>
  );
}

/* ──────────────────────────────────────────────
   Balance Tab
   ────────────────────────────────────────────── */

function BalanceTab({ mode }: { mode: string }) {
  const [bal, setBal] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading)
    return <p className="text-sm text-slate-400 animate-pulse">Loading…</p>;

  return (
    <div className="space-y-5">
      {/* balance card */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-lg">
        <p className="text-xs uppercase tracking-widest text-slate-400 mb-1">
          Available Balance
        </p>
        <p className="text-3xl font-extrabold tracking-tight">
          {fmtUSDT(bal?.usdt ?? 0)}
        </p>
        <p className="text-sm text-aalgold mt-1">
          ≈ {fmtINR(bal?.inrEquivalent ?? 0)} &nbsp;
          <span className="text-[10px] text-slate-400">
            @ ₹{bal?.inrRate ?? 83.5}/USDT
          </span>
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-400">Total Deposited</span>
            <p className="font-bold">{fmtUSDT(bal?.totalDeposited ?? 0)}</p>
          </div>
          <div>
            <span className="text-slate-400">Total Withdrawn</span>
            <p className="font-bold">{fmtUSDT(bal?.totalWithdrawn ?? 0)}</p>
          </div>
        </div>
      </div>

      {/* recent transactions */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Recent Transactions</h3>
        {txns.length === 0 ? (
          <p className="text-xs text-slate-400">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            {txns.map((tx: any) => (
              <div key={tx._id} className="flex items-center justify-between px-4 py-3 text-xs">
                <div>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full font-semibold mr-2 ${
                      tx.type === "DEPOSIT" || tx.type === "P2P_BUY"
                        ? "bg-green-50 text-green-600"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {tx.type}
                  </span>
                  <span className="text-slate-500">{tx.method}</span>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-800">
                    {tx.type === "DEPOSIT" || tx.type === "P2P_BUY" ? "+" : "−"}
                    {fmtUSDT(tx.amount)}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(tx.createdAt).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            ))}
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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-5">
      {/* deposit / withdraw toggle */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {(["deposit", "withdraw"] as const).map((a) => (
          <button
            key={a}
            onClick={() => { setAction(a); setMsg(null); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
              action === a
                ? a === "deposit"
                  ? "bg-green-500 text-white shadow"
                  : "bg-red-500 text-white shadow"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {a === "deposit" ? "⬇ Deposit INR" : "⬆ Withdraw USDT"}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-medium text-slate-600">
          {action === "deposit" ? "Amount (₹ INR)" : "Amount (USDT)"}
        </label>
        <input
          type="number"
          min="1"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={action === "deposit" ? "e.g. 500" : "e.g. 10"}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-aalgreen/40 outline-none"
        />

        <label className="block text-xs font-medium text-slate-600">UPI ID</label>
        <input
          type="text"
          value={upiId}
          onChange={(e) => setUpiId(e.target.value)}
          placeholder="yourname@upi"
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-aalgreen/40 outline-none"
        />

        <button
          onClick={submit}
          disabled={busy}
          className={`w-full py-3 rounded-xl text-sm font-bold text-white transition-colors ${
            action === "deposit"
              ? "bg-green-500 hover:bg-green-600 disabled:bg-green-300"
              : "bg-red-500 hover:bg-red-600 disabled:bg-red-300"
          }`}
        >
          {busy ? "Processing…" : action === "deposit" ? "Deposit via UPI" : "Withdraw to UPI"}
        </button>
      </div>

      {msg && (
        <p className={`text-xs font-medium ${msg.ok ? "text-green-600" : "text-red-500"}`}>
          {msg.text}
        </p>
      )}

      <p className="text-[10px] text-slate-400 leading-relaxed">
        ⚠️ This is a <b>simulated</b> UPI gateway for paper‑trading.
        Real UPI integration requires a licensed payment gateway (Razorpay / Cashfree / PhonePe Business).
        Current rate: ₹83.50 / USDT.
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
    <div className="space-y-5">
      {/* create offer */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-700">Create Sell Offer</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-1">USDT Amount</label>
            <input
              type="number"
              min="0.01"
              step="any"
              value={usdtAmt}
              onChange={(e) => setUsdtAmt(e.target.value)}
              placeholder="e.g. 50"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-aalgreen/40 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-1">Price (₹/USDT)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-aalgreen/40 outline-none"
            />
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={busy}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-aalgold text-white hover:opacity-90 disabled:opacity-50 transition-colors"
        >
          {busy ? "Creating…" : "Create Sell Offer"}
        </button>

        {msg && (
          <p className={`text-xs font-medium ${msg.ok ? "text-green-600" : "text-red-500"}`}>
            {msg.text}
          </p>
        )}
      </div>

      {/* offers list */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Open P2P Offers</h3>

        {loading ? (
          <p className="text-xs text-slate-400 animate-pulse">Loading offers…</p>
        ) : offers.length === 0 ? (
          <p className="text-xs text-slate-400">No open offers right now.</p>
        ) : (
          <div className="space-y-2">
            {offers.map((o: any) => (
              <div
                key={o._id}
                className="flex items-center justify-between bg-white rounded-xl border border-slate-100 px-4 py-3 shadow-sm"
              >
                <div className="text-xs">
                  <p className="font-bold text-slate-800">{fmtUSDT(o.amount)}</p>
                  <p className="text-slate-500">
                    @ {fmtINR(o.p2pPrice ?? 83.5)}/USDT &middot;{" "}
                    <span className="text-slate-400">
                      {new Date(o.createdAt).toLocaleString("en-IN")}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => handleBuy(o._id)}
                  disabled={busy}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-aalgreen text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  Buy
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
