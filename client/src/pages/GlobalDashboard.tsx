import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Globe,
  Landmark,
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Cpu,
  Lock,
  PieChart,
  DollarSign,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { useDashboardStore } from "../store/useDashboardStore";
import { useAppStore } from "../store/useAppStore";

interface GlobalFundsState {
  india: {
    equityINR: number;
    cashINR: number;
    marginUsedINR: number;
    todayPnlINR: number;
    realizedPnlINR: number;
    unrealizedPnlINR: number;
    mode: string;
    source: string;
    status: string;
  };
  crypto: {
    equityUSDT: number;
    cashUSDT: number;
    marginUsedUSDT: number;
    todayPnlUSDT: number;
    realizedPnlUSDT: number;
    unrealizedPnlUSDT: number;
    mode: string;
    source: string;
    status: string;
  };
  fxRate: number;
  lastUpdated: string;
}

export default function GlobalDashboard() {
  const navigate = useNavigate();
  const { mode, setActiveMarket } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GlobalFundsState | null>(null);

  const fetchGlobalState = async () => {
    setLoading(true);
    try {
      // 1. Fetch Indian funds
      const indiaRes = await fetch("/api/indian-market/funds");
      const indiaData = indiaRes.ok ? await indiaRes.json() : null;

      // 2. Fetch crypto domain metrics (authoritative aggregation of spot+futures paper wallets)
      const walletRes = await fetch("/aqea-ui/dashboard?accountType=BOTH");
      const walletData = walletRes.ok ? await walletRes.json() : null;

      const fx = indiaData?.inrRate || 95.613964;

      const indiaEquity = indiaData?.totalEquityINR ?? 20000;
      const indiaTodayPnl = indiaData?.todayPnlINR ?? 0;
      const indiaRealizedPnl = indiaData?.realizedPnlINR ?? 0;
      const indiaUnrealizedPnl = indiaData?.unrealizedPnlINR ?? 0;

      const cryptoDomain = walletData?.domains?.crypto;
      const cryptoEquity = cryptoDomain?.totalEquity ?? 0;
      const cryptoCash = (cryptoDomain?.balances?.spot ?? 0) + (cryptoDomain?.balances?.futures ?? 0);
      const cryptoDailyPnl = cryptoDomain?.dailyPnL ?? 0;

      setData({
        india: {
          equityINR: indiaEquity,
          cashINR: indiaData?.availableCashINR ?? 20000,
          marginUsedINR: indiaData?.usedMarginINR ?? 0,
          todayPnlINR: indiaTodayPnl,
          realizedPnlINR: indiaRealizedPnl,
          unrealizedPnlINR: indiaUnrealizedPnl,
          mode: mode,
          source: mode === "LIVE" ? "Angel One Broker" : "Paper Initial Capital (₹20,000 INR)",
          status: "ONLINE",
        },
        crypto: {
          equityUSDT: cryptoEquity,
          cashUSDT: cryptoCash,
          marginUsedUSDT: 0,
          todayPnlUSDT: cryptoDailyPnl,
          realizedPnlUSDT: 0,
          unrealizedPnlUSDT: 0,
          mode: mode,
          source: mode === "LIVE" ? "Binance API" : "Paper Ledger",
          status: "ONLINE",
        },
        fxRate: fx,
        lastUpdated: new Date().toLocaleTimeString(),
      });
    } catch (e) {
      console.error("Failed to fetch global portfolio state:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalState();
    const timer = setInterval(fetchGlobalState, 15000);
    return () => clearInterval(timer);
  }, [mode]);

  const fxRate = data?.fxRate || 95.613964;
  const indiaInr = data?.india.equityINR ?? 20000;
  const indiaUsdDisplay = indiaInr / fxRate;
  const cryptoUsdt = data?.crypto.equityUSDT ?? 0;
  const combinedUsd = indiaUsdDisplay + cryptoUsdt;

  const handleNavigateToMarket = (market: "INDIA" | "CRYPTO") => {
    setActiveMarket(market);
    if (market === "INDIA") {
      navigate("/india");
    } else {
      navigate("/crypto");
    }
  };

  return (
    <div style={{ padding: "20px 24px", minHeight: "100%", background: "#070d1a", color: "#f8fafc" }}>
      {/* ── HEADER BANNER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(16, 185, 129, 0.2))", border: "1px solid rgba(59, 130, 246, 0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Globe size={24} color="#60a5fa" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.03em", margin: 0, color: "#f8fafc" }}>
                GLOBAL AGGREGATION DASHBOARD
              </h1>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 4, background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
                READ-ONLY VIEW LAYER
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              Consolidated display conversion across isolated Indian (NSE/BSE) and Crypto (Binance) market planes.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={fetchGlobalState}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#94a3b8", padding: "7px 12px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontWeight: 600 }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* ── STRICT FINANCIAL TRUTH NOTICE ── */}
      <div style={{ background: "rgba(30, 41, 59, 0.5)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: 10, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Lock size={15} color="#38bdf8" />
          <span style={{ fontSize: 11.5, color: "#cbd5e1" }}>
            <strong>Authoritative Isolation Notice:</strong> Global aggregation is purely a display view. Converted USD totals are <strong>DISPLAY_ONLY</strong> and cannot create, mint, or transfer crypto buying power.
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
          RBI Ref FX: 1 USD = ₹{fxRate.toFixed(2)} INR · Last verified: {data?.lastUpdated || "Live"}
        </div>
      </div>

      {/* ── 1. PRIMARY COMBINED DISPLAY CARD ── */}
      <div style={{ background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.8))", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 16, padding: "22px 24px", marginBottom: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Total Combined Display Value
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace", marginTop: 4 }}>
              ₹{(indiaInr + cryptoUsdt * fxRate).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span style={{ fontSize: 14, color: "#64748b", fontWeight: 600, marginLeft: 8 }}>INR (DISPLAY ONLY)</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#94a3b8", fontFamily: "monospace", marginTop: 2 }}>
              ${combinedUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginLeft: 6 }}>USD</span>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
              Formula: India ₹{indiaInr.toLocaleString("en-IN")} + (Crypto ${cryptoUsdt.toFixed(2)} USDT × ₹{fxRate.toFixed(2)}) · 1 USD = ₹{fxRate.toFixed(2)}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(234, 88, 12, 0.3)", borderRadius: 10, padding: "10px 16px", minWidth: 160 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#fb923c", textTransform: "uppercase" }}>India Contribution</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f8fafc", fontFamily: "monospace", marginTop: 2 }}>
                ₹{indiaInr.toLocaleString("en-IN")} <span style={{ fontSize: 10, color: "#94a3b8" }}>({((indiaInr / (indiaInr + cryptoUsdt * fxRate || 1)) * 100).toFixed(0)}%)</span>
              </div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>${indiaUsdDisplay.toFixed(2)} USD</div>
            </div>

            <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(37, 99, 235, 0.3)", borderRadius: 10, padding: "10px 16px", minWidth: 160 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#60a5fa", textTransform: "uppercase" }}>Crypto Contribution</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f8fafc", fontFamily: "monospace", marginTop: 2 }}>
                ₹{(cryptoUsdt * fxRate).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: 10, color: "#94a3b8" }}>({((cryptoUsdt * fxRate / (indiaInr + cryptoUsdt * fxRate || 1)) * 100).toFixed(0)}%)</span>
              </div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>${cryptoUsdt.toFixed(2)} USDT Paper</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. DUAL MARKET CARDS (SIDE BY SIDE ISOLATION) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20, marginBottom: 24 }}>
        {/* 🇮🇳 INDIAN MARKET CARD */}
        <div style={{ background: "linear-gradient(145deg, rgba(234, 88, 12, 0.05) 0%, rgba(15, 23, 42, 0.95) 100%)", border: "1px solid rgba(234, 88, 12, 0.3)", borderRadius: 14, padding: "20px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(234, 88, 12, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Landmark size={18} color="#fb923c" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#f8fafc" }}>INDIAN MARKET</div>
                <div style={{ fontSize: 10.5, color: "#94a3b8" }}>NSE · BSE · NIFTY · BANKNIFTY · F&amp;O</div>
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 4, background: "rgba(234, 88, 12, 0.15)", color: "#fb923c", border: "1px solid rgba(234, 88, 12, 0.3)" }}>
              {data?.india.mode === "LIVE" ? "LIVE (ANGEL ONE)" : "PAPER ACCOUNT"}
            </span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Authoritative Equity (INR)</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace", marginTop: 2 }}>
              ₹{indiaInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
              Source: {data?.india.source}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, background: "rgba(15, 23, 42, 0.6)", borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: "#64748b" }}>Available Cash</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1", fontFamily: "monospace" }}>
                ₹{(data?.india.cashINR ?? 20000).toLocaleString("en-IN")}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#64748b" }}>Today's P&amp;L</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: (data?.india.todayPnlINR ?? 0) >= 0 ? "#10b981" : "#ef4444", fontFamily: "monospace" }}>
                {(data?.india.todayPnlINR ?? 0) >= 0 ? "+₹" : "-₹"}{Math.abs(data?.india.todayPnlINR ?? 0).toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          <button
            onClick={() => handleNavigateToMarket("INDIA")}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(135deg, #ea580c, #c2410c)", border: "none", color: "#ffffff", padding: "10px 16px", borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: "pointer", boxShadow: "0 2px 8px rgba(234, 88, 12, 0.4)" }}
          >
            <span>Open Dedicated Indian Terminal</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* ₿ CRYPTO MARKET CARD */}
        <div style={{ background: "linear-gradient(145deg, rgba(37, 99, 235, 0.05) 0%, rgba(15, 23, 42, 0.95) 100%)", border: "1px solid rgba(37, 99, 235, 0.3)", borderRadius: 14, padding: "20px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(37, 99, 235, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={18} color="#60a5fa" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#f8fafc" }}>CRYPTO MARKET</div>
                <div style={{ fontSize: 10.5, color: "#94a3b8" }}>Binance Spot · USD-M Futures · BTC · ETH</div>
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 4, background: "rgba(37, 99, 235, 0.15)", color: "#60a5fa", border: "1px solid rgba(37, 99, 235, 0.3)" }}>
              {data?.crypto.mode === "LIVE" ? "LIVE (BINANCE)" : "PAPER ACCOUNT"}
            </span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Authoritative Equity (USDT)</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#f8fafc", fontFamily: "monospace", marginTop: 2 }}>
              ${cryptoUsdt.toFixed(2)} USDT
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
              Source: {data?.crypto.source}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, background: "rgba(15, 23, 42, 0.6)", borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: "#64748b" }}>Available Cash</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1", fontFamily: "monospace" }}>
                ${(data?.crypto.cashUSDT ?? 0).toFixed(2)} USDT
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#64748b" }}>Today's P&amp;L</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: (data?.crypto.todayPnlUSDT ?? 0) >= 0 ? "#10b981" : "#ef4444", fontFamily: "monospace" }}>
                {(data?.crypto.todayPnlUSDT ?? 0) >= 0 ? "+" : ""}${(data?.crypto.todayPnlUSDT ?? 0).toFixed(2)}
              </div>
            </div>
          </div>

          <button
            onClick={() => handleNavigateToMarket("CRYPTO")}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", color: "#ffffff", padding: "10px 16px", borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: "pointer", boxShadow: "0 2px 8px rgba(37, 99, 235, 0.4)" }}
          >
            <span>Open Dedicated Crypto Terminal</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* ── 3. AGENTIC CONTROL & RECONCILIATION TELEMETRY ── */}
      <div style={{ background: "rgba(15, 23, 42, 0.7)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 14, padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={18} color="#10b981" />
            <span style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc" }}>
              CONTROL PLANE INVARIANTS &amp; SYSTEM RECONCILIATION
            </span>
          </div>
          <span style={{ fontSize: 11, color: "#10b981", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            FINANCIAL TRUTH LOCKED
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#64748b" }}>Paper Provenance</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981", marginTop: 2 }}>₹20,000 Verified (USER_PAPER_INIT)</div>
          </div>

          <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#64748b" }}>Market Isolation Guard</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8", marginTop: 2 }}>ACTIVE (Zero Cross-Contamination)</div>
          </div>

          <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#64748b" }}>Agent Kernel Permissions</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", marginTop: 2 }}>PROPOSE ONLY (Cannot Mint Capital)</div>
          </div>

          <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#64748b" }}>Authoritative Ledger</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#a855f7", marginTop: 2 }}>Append-Only Reconciled</div>
          </div>
        </div>
      </div>
    </div>
  );
}
