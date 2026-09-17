import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  TrendingUp,
  PieChart,
  Activity,
  AlertTriangle,
  RefreshCw,
  Sliders,
  DollarSign,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { useDashboardStore } from "../store/useDashboardStore";
import { useAppStore } from "../store/useAppStore";

interface ICapitalState {
  startingCapital: number;
  netEquity: number;
  availableCash: number;
  usedMargin: number;
  freeMargin: number;
  realizedPnl: number;
  unrealizedPnl: number;
  charges: number;
  marginUtilizationPct: number;
  withdrawableAmount: number;
}

interface IReserveState {
  totalReserveInr: number;
  totalReservePct: number;
  activeAllocationInr: number;
  activeAllocationPct: number;
  marginReserveInr: number;
  riskReserveInr: number;
  emergencyReserveInr: number;
}

interface IExposureState {
  grossExposure: number;
  netExposure: number;
  longExposure: number;
  shortExposure: number;
  leverageRatio: number;
  greeks: {
    portfolioDelta: number;
    portfolioGamma: number;
    portfolioTheta: number;
    portfolioVega: number;
    deltaByUnderlying: Record<string, number>;
  };
  exposureByUnderlying: Record<string, number>;
  exposureByAssetClass: Record<string, number>;
}

interface IAllocationItem {
  strategyId: string;
  strategyName: string;
  targetWeightPct: number;
  actualWeightPct: number;
  allocatedCapitalInr: number;
  utilizedCapitalInr: number;
  availableCapitalInr: number;
  riskBudgetInr: number;
  drawdownPct: number;
  sharpeRatio: number;
  status: string;
  driftPct: number;
}

interface IStressScenario {
  scenarioName: string;
  marketShockDescription: string;
  estimatedPnlImpactInr: number;
  estimatedPnlImpactPct: number;
  projectedMarginUtilizationPct: number;
  marginCallRisk: boolean;
  riskBreach: boolean;
}

export default function PortfolioCommandCenter() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "ALLOCATIONS" | "EXPOSURE" | "STRESS" | "AUDITS">("OVERVIEW");
  const summary = useDashboardStore((s) => s.summary);
  const domains = useDashboardStore((s) => s.domains);
  const userId = useAppStore((s) => s.userId);
  const mode = useAppStore((s) => s.mode);
  const inrRate = summary?.inrRate || 85.0;
  const cryptoEquity = domains?.crypto?.totalEquity ?? 0;
  const cryptoDailyPnl = domains?.crypto?.dailyPnL || 0;

  const [capital, setCapital] = useState<ICapitalState>({
    startingCapital: 0,
    netEquity: 0,
    availableCash: 0,
    usedMargin: 0,
    freeMargin: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    charges: 0,
    marginUtilizationPct: 0,
    withdrawableAmount: 0,
  });

  const [reserves, setReserves] = useState<IReserveState>({
    totalReserveInr: 0,
    totalReservePct: 25.0,
    activeAllocationInr: 0,
    activeAllocationPct: 75.0,
    marginReserveInr: 0,
    riskReserveInr: 0,
    emergencyReserveInr: 0,
  });

  const [exposure, setExposure] = useState<IExposureState>({
    grossExposure: 0,
    netExposure: 0,
    longExposure: 0,
    shortExposure: 0,
    leverageRatio: 0,
    greeks: {
      portfolioDelta: 0,
      portfolioGamma: 0,
      portfolioTheta: 0,
      portfolioVega: 0,
      deltaByUnderlying: {},
    },
    exposureByUnderlying: {},
    exposureByAssetClass: { OPTIONS: 0, FUTURES: 0, EQUITY: 0, CASH: 0 },
  });

  const [allocations, setAllocations] = useState<IAllocationItem[]>([]);
  const [stressScenarios, setStressScenarios] = useState<IStressScenario[]>([]);

  const [drawdownState, setDrawdownState] = useState<string>("NORMAL");
  const [volatilityRegime, setVolatilityRegime] = useState<string>("NORMAL");
  const [emergencyHalted, setEmergencyHalted] = useState<boolean>(false);
  const [aiExplanation, setAiExplanation] = useState<string>("");

  const fetchSnapshot = async () => {
    try {
      setLoading(true);
      const uid = userId || "";
      const res = await fetch(`/api/portfolio-intelligence/snapshot?userId=${uid}&mode=${mode || "PAPER"}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setCapital(json.data.capital || capital);
          setReserves(json.data.reserves || reserves);
          setExposure(json.data.exposure || exposure);
          if (json.data.allocations?.length) setAllocations(json.data.allocations);
          if (json.data.stressResults?.length) setStressScenarios(json.data.stressResults);
          setDrawdownState(json.data.drawdownState || "NORMAL");
          setVolatilityRegime(json.data.volatilityRegime || "NORMAL");
        }
      }
    } catch (err: any) {
      // Retain baseline state if offline
    } finally {
      setLoading(false);
    }
  };

  const askAiExplainer = async (question: string) => {
    try {
      const res = await fetch("/api/portfolio-intelligence/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (res.ok) {
        const json = await res.json();
        setAiExplanation(json.explanation);
      }
    } catch {
      setAiExplanation("Portfolio operates under deterministic risk budget and reserve bounds.");
    }
  };

  const handleEmergencyHalt = async () => {
    if (window.confirm("CONFIRM EMERGENCY HALT: Are you sure you want to HALT all autonomous portfolio entries?")) {
      try {
        await fetch("/api/portfolio-intelligence/emergency-halt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Operator Emergency Button Triggered" }),
        });
        setEmergencyHalted(true);
        setDrawdownState("EMERGENCY");
      } catch { }
    }
  };

  const handleResetHalt = async () => {
    try {
      await fetch("/api/portfolio-intelligence/reset-emergency-halt", { method: "POST" });
      setEmergencyHalted(false);
      setDrawdownState("NORMAL");
    } catch { }
  };

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 10000);
    return () => clearInterval(interval);
  }, [userId, mode]);

  return (
    <div style={{ padding: 24, background: "#070d1a", minHeight: "100%", color: "#f8fafc" }}>
      {/* Header Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
              Portfolio Intelligence & Capital Allocation
            </h1>
            <span
              style={{
                background: emergencyHalted ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.15)",
                color: emergencyHalted ? "#f87171" : "#4ade80",
                border: `1px solid ${emergencyHalted ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.3)"}`,
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {emergencyHalted ? "EMERGENCY HALTED" : `STATE: ${drawdownState}`}
            </span>
            <span
              style={{
                background: "rgba(59,130,246,0.12)",
                color: "#60a5fa",
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              VOLATILITY: {volatilityRegime}
            </span>
          </div>
          <p style={{ color: "#94a3b8", fontSize: 13, margin: "4px 0 0" }}>
            Institutional capital governor, Greek exposure aggregation, multi-strategy allocation & reserve preservation
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={fetchSnapshot}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#1e293b",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e2e8f0",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
          </button>

          {emergencyHalted ? (
            <button
              onClick={handleResetHalt}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#059669",
                border: "none",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <PlayCircle size={15} /> Resume Autonomous Execution
            </button>
          ) : (
            <button
              onClick={handleEmergencyHalt}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#dc2626",
                border: "none",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <PauseCircle size={15} /> Emergency Halt
            </button>
          )}
        </div>
      </div>

      {/* 🌐 SECTION 7: GLOBAL CONSOLIDATED PORTFOLIO (INDIA + CRYPTO) */}
      <div style={{ marginBottom: 24, background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 900, color: "#f8fafc", letterSpacing: "0.02em" }}>
              GLOBAL CONSOLIDATED PORTFOLIO
            </span>
            <span style={{ fontSize: 10, background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
              DUAL-MARKET ISOLATION ACTIVE
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
            FX Benchmark: <span style={{ color: "#f8fafc", fontFamily: "monospace" }}>1 USD = ₹{inrRate.toFixed(2)} INR</span> (RBI Reference)
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {/* INDIA PORTFOLIO */}
          {/* INDIA PORTFOLIO */}
          <div style={{ background: "linear-gradient(135deg, rgba(234, 88, 12, 0.08), rgba(15, 23, 42, 0.9))", border: "1px solid rgba(234, 88, 12, 0.25)", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#fb923c", display: "flex", alignItems: "center", gap: 5 }}>
                <span>🇮🇳</span> INDIAN MARKET (NSE / BSE)
              </span>
              <span style={{ fontSize: 9.5, color: mode === "LIVE" ? "#f87171" : "#38bdf8", fontWeight: 800, background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>
                {mode === "LIVE" ? "LIVE (ANGEL / KITE)" : "PAPER (SIMULATED)"}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc", fontFamily: "monospace" }}>
              ₹{capital.netEquity.toLocaleString("en-IN")}
            </div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: 600 }}>
              Source: {mode === "LIVE" ? "Angel One Broker" : "Paper Initial Capital (₹20,000 INR)"}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
              <span>Used Margin: ₹{capital.usedMargin.toLocaleString("en-IN")}</span>
              <span style={{ color: (capital.realizedPnl + capital.unrealizedPnl) >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                P&L: {(capital.realizedPnl + capital.unrealizedPnl) >= 0 ? "+₹" : "-₹"}{Math.abs(capital.realizedPnl + capital.unrealizedPnl).toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* CRYPTO PORTFOLIO */}
          <div style={{ background: "linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(15, 23, 42, 0.9))", border: "1px solid rgba(37, 99, 235, 0.25)", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#60a5fa", display: "flex", alignItems: "center", gap: 5 }}>
                <span>₿</span> CRYPTO MARKET (BINANCE)
              </span>
              <span style={{ fontSize: 9.5, color: mode === "LIVE" ? "#f87171" : "#38bdf8", fontWeight: 800, background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>
                {mode === "LIVE" ? "LIVE (BINANCE)" : "PAPER (SIMULATED)"}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc", fontFamily: "monospace" }}>
              ${cryptoEquity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
            </div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: 600 }}>
              Source: {mode === "LIVE" ? "Binance API" : "Paper Ledger"}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
              <span>Equivalent: ₹{Math.round(cryptoEquity * inrRate).toLocaleString("en-IN")}</span>
              <span style={{ color: cryptoDailyPnl >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                Daily P&L: {cryptoDailyPnl >= 0 ? "+" : ""}${cryptoDailyPnl.toFixed(2)}
              </span>
            </div>
          </div>

          {/* CONSOLIDATED TOTAL */}
          <div style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(15, 23, 42, 0.9))", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#34d399", display: "flex", alignItems: "center", gap: 5 }}>
                <span>🌐</span> GLOBAL EQUITY — USD EQUIVALENT
              </span>
              <span style={{ fontSize: 9.5, color: "#34d399", fontWeight: 700, background: "rgba(52,211,153,0.12)", padding: "2px 6px", borderRadius: 4 }}>
                DISPLAY AGGREGATION ONLY
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc", fontFamily: "monospace" }}>
              ${((capital.netEquity / (inrRate || 95.613964)) + cryptoEquity).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: 600 }}>
              ≈ ₹{(capital.netEquity + Math.round(cryptoEquity * inrRate)).toLocaleString("en-IN")} INR · FX: ₹{inrRate.toFixed(2)}/USD (RBI Reference)
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
              <span>India Equity: ₹{capital.netEquity.toLocaleString("en-IN")}</span>
              <span>Crypto Equity: ${cryptoEquity.toFixed(2)} USDT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 4 Primary Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 24 }}>
        {/* Total Equity */}
        <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
            <span>NET ACCOUNT EQUITY</span>
            <DollarSign size={16} color="#38bdf8" />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#f8fafc", margin: "8px 0 4px" }}>
            ₹{capital.netEquity.toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 11, color: (capital.realizedPnl + capital.unrealizedPnl) >= 0 ? "#34d399" : "#ef4444", display: "flex", alignItems: "center", gap: 4 }}>
            <ArrowUpRight size={13} /> {(capital.realizedPnl + capital.unrealizedPnl) >= 0 ? "+₹" : "-₹"}{Math.abs(capital.realizedPnl + capital.unrealizedPnl).toLocaleString("en-IN")} Total P&L
          </div>
        </div>

        {/* Free Margin & Utilization */}
        <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
            <span>FREE MARGIN / USED</span>
            <PieChart size={16} color="#818cf8" />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#f8fafc", margin: "8px 0 4px" }}>
            ₹{capital.freeMargin.toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 11, color: capital.marginUtilizationPct > 65 ? "#f87171" : "#94a3b8" }}>
            Used: ₹{capital.usedMargin.toLocaleString("en-IN")} ({capital.marginUtilizationPct}% utilization)
          </div>
        </div>

        {/* Reserve Capital */}
        <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
            <span>MANDATORY RESERVES</span>
            <Lock size={16} color="#f59e0b" />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fbbf24", margin: "8px 0 4px" }}>
            ₹{reserves.totalReserveInr.toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            {reserves.totalReservePct}% Locked (Active: ₹{reserves.activeAllocationInr.toLocaleString("en-IN")})
          </div>
        </div>

        {/* Gross & Greek Delta */}
        <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
            <span>GROSS EXPOSURE / DELTA</span>
            <Activity size={16} color="#a78bfa" />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#f8fafc", margin: "8px 0 4px" }}>
            ₹{exposure.grossExposure.toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 11, color: "#c084fc" }}>
            Net Delta: {exposure.greeks.portfolioDelta > 0 ? "+" : ""}{exposure.greeks.portfolioDelta} | Lev: {exposure.leverageRatio}x
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 20 }}>
        {[
          { id: "OVERVIEW", label: "Portfolio Intelligence" },
          { id: "ALLOCATIONS", label: "Strategy Allocations & Drift" },
          { id: "EXPOSURE", label: "Exposure Map & Greeks" },
          { id: "STRESS", label: "Stress Test Matrix" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent",
              color: activeTab === tab.id ? "#60a5fa" : "#94a3b8",
              padding: "10px 16px",
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "OVERVIEW" && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
          {/* Reserve Breakdown & Health */}
          <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Tiered Reserve & Capital Distribution</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: "#94a3b8" }}>Active Deployment Capital</span>
                  <span style={{ fontWeight: 700, color: "#38bdf8" }}>
                    ₹{reserves.activeAllocationInr.toLocaleString("en-IN")} ({reserves.activeAllocationPct}%)
                  </span>
                </div>
                <div style={{ width: "100%", height: 8, background: "#1e293b", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${reserves.activeAllocationPct}%`, height: "100%", background: "#38bdf8" }} />
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: "#94a3b8" }}>Margin Shock Reserve</span>
                  <span style={{ fontWeight: 700, color: "#f59e0b" }}>
                    ₹{reserves.marginReserveInr.toLocaleString("en-IN")} (10.0%)
                  </span>
                </div>
                <div style={{ width: "100%", height: 8, background: "#1e293b", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `10%`, height: "100%", background: "#f59e0b" }} />
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: "#94a3b8" }}>Risk Drawdown Reserve</span>
                  <span style={{ fontWeight: 700, color: "#f97316" }}>
                    ₹{reserves.riskReserveInr.toLocaleString("en-IN")} (10.0%)
                  </span>
                </div>
                <div style={{ width: "100%", height: 8, background: "#1e293b", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `10%`, height: "100%", background: "#f97316" }} />
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: "#94a3b8" }}>Emergency Circuit Breaker Reserve</span>
                  <span style={{ fontWeight: 700, color: "#ef4444" }}>
                    ₹{reserves.emergencyReserveInr.toLocaleString("en-IN")} (5.0%)
                  </span>
                </div>
                <div style={{ width: "100%", height: 8, background: "#1e293b", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `5%`, height: "100%", background: "#ef4444" }} />
                </div>
              </div>
            </div>

            <div style={{ marginTop: 24, padding: 14, background: "#1e293b", borderRadius: 8, borderLeft: "4px solid #3b82f6" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", marginBottom: 4 }}>
                INSTITUTIONAL GOVERNANCE INVARIANT
              </div>
              <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5 }}>
                Under no circumstances can active strategies consume more than 75% of net equity. The remaining 25% is
                strictly segregated to insulate against overnight gap risk, exchange margin expansion, and sudden volatility spikes.
              </div>
            </div>
          </div>

          {/* AI Explainer Panel */}
          <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={18} color="#eab308" /> AI Portfolio Reasoning
            </h3>
            <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14 }}>
              Query authoritative explanations directly from the ground-truth Portfolio Intelligence layer:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              <button
                onClick={() => askAiExplainer("WHY_ALLOCATED")}
                style={{
                  textAlign: "left",
                  background: "#1e293b",
                  border: "1px solid rgba(255,255,255,0.05)",
                  color: "#e2e8f0",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Why is capital allocated this way?
              </button>
              <button
                onClick={() => askAiExplainer("WHY_RESERVE_HIGH")}
                style={{
                  textAlign: "left",
                  background: "#1e293b",
                  border: "1px solid rgba(255,255,255,0.05)",
                  color: "#e2e8f0",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Why is reserve capital maintained at 25%?
              </button>
              <button
                onClick={() => askAiExplainer("WHY_REJECTED")}
                style={{
                  textAlign: "left",
                  background: "#1e293b",
                  border: "1px solid rgba(255,255,255,0.05)",
                  color: "#e2e8f0",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Why would a trade be rejected by simulation?
              </button>
            </div>

            {aiExplanation && (
              <div style={{ padding: 12, background: "rgba(30,41,59,0.7)", borderRadius: 8, border: "1px solid rgba(59,130,246,0.3)", fontSize: 12, color: "#e2e8f0", lineHeight: 1.5 }}>
                {aiExplanation}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ALLOCATIONS */}
      {activeTab === "ALLOCATIONS" && (
        <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Active Strategy Allocations & Drift Tracking</h3>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Rebalance Trigger Threshold: 15% Drift</span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "10px 8px" }}>Strategy</th>
                <th style={{ padding: "10px 8px" }}>Target %</th>
                <th style={{ padding: "10px 8px" }}>Actual %</th>
                <th style={{ padding: "10px 8px" }}>Drift %</th>
                <th style={{ padding: "10px 8px" }}>Allocated Capital</th>
                <th style={{ padding: "10px 8px" }}>Utilized</th>
                <th style={{ padding: "10px 8px" }}>Risk Budget</th>
                <th style={{ padding: "10px 8px" }}>Sharpe</th>
                <th style={{ padding: "10px 8px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.strategyId} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "12px 8px", fontWeight: 700, color: "#f8fafc" }}>{a.strategyName}</td>
                  <td style={{ padding: "12px 8px" }}>{a.targetWeightPct}%</td>
                  <td style={{ padding: "12px 8px" }}>{a.actualWeightPct}%</td>
                  <td style={{ padding: "12px 8px", color: Math.abs(a.driftPct) > 10 ? "#f87171" : "#34d399" }}>
                    {a.driftPct > 0 ? `+${a.driftPct}` : a.driftPct}%
                  </td>
                  <td style={{ padding: "12px 8px" }}>₹{a.allocatedCapitalInr.toLocaleString("en-IN")}</td>
                  <td style={{ padding: "12px 8px" }}>₹{a.utilizedCapitalInr.toLocaleString("en-IN")}</td>
                  <td style={{ padding: "12px 8px" }}>₹{a.riskBudgetInr.toLocaleString("en-IN")}</td>
                  <td style={{ padding: "12px 8px", color: "#38bdf8" }}>{a.sharpeRatio}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 11, background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: EXPOSURE & GREEKS */}
      {activeTab === "EXPOSURE" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Options Greeks */}
          <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Aggregated Options Greeks</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ background: "#1e293b", padding: 14, borderRadius: 8 }}>
                <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>PORTFOLIO DELTA (Δ)</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#38bdf8", marginTop: 4 }}>
                  {exposure.greeks.portfolioDelta}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Directional index equivalent</div>
              </div>

              <div style={{ background: "#1e293b", padding: 14, borderRadius: 8 }}>
                <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>PORTFOLIO GAMMA (Γ)</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#818cf8", marginTop: 4 }}>
                  {exposure.greeks.portfolioGamma}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Delta sensitivity per pt</div>
              </div>

              <div style={{ background: "#1e293b", padding: 14, borderRadius: 8 }}>
                <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>PORTFOLIO THETA (Θ)</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#f43f5e", marginTop: 4 }}>
                  ₹{exposure.greeks.portfolioTheta}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Daily time decay</div>
              </div>

              <div style={{ background: "#1e293b", padding: 14, borderRadius: 8 }}>
                <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>PORTFOLIO VEGA (ν)</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#34d399", marginTop: 4 }}>
                  ₹{exposure.greeks.portfolioVega}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>P&L per 1% IV shift</div>
              </div>
            </div>
          </div>

          {/* Underlying Breakdown */}
          <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Exposure by Underlying</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Object.entries(exposure.exposureByUnderlying).map(([underlying, amount]) => (
                <div key={underlying}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{underlying}</span>
                    <span style={{ color: "#38bdf8" }}>₹{amount.toLocaleString("en-IN")}</span>
                  </div>
                  <div style={{ width: "100%", height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min(100, (amount / capital.netEquity) * 100)}%`,
                        height: "100%",
                        background: "#38bdf8",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: STRESS TEST MATRIX */}
      {activeTab === "STRESS" && (
        <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Macroeconomic & Volatility Stress Test Matrix</h3>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Black-Scholes Greek Sensitivities Model</span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "10px 8px" }}>Scenario</th>
                <th style={{ padding: "10px 8px" }}>Description</th>
                <th style={{ padding: "10px 8px" }}>P&L Impact (₹)</th>
                <th style={{ padding: "10px 8px" }}>P&L Impact (%)</th>
                <th style={{ padding: "10px 8px" }}>Projected Margin Utilization</th>
                <th style={{ padding: "10px 8px" }}>Margin Call Risk</th>
                <th style={{ padding: "10px 8px" }}>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {stressScenarios.map((sc) => (
                <tr key={sc.scenarioName} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "12px 8px", fontWeight: 700, color: "#f8fafc" }}>{sc.scenarioName}</td>
                  <td style={{ padding: "12px 8px", color: "#94a3b8" }}>{sc.marketShockDescription}</td>
                  <td style={{ padding: "12px 8px", color: sc.estimatedPnlImpactInr < 0 ? "#f87171" : "#34d399", fontWeight: 700 }}>
                    ₹{sc.estimatedPnlImpactInr.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px 8px", color: sc.estimatedPnlImpactPct < -5 ? "#f87171" : "#e2e8f0" }}>
                    {sc.estimatedPnlImpactPct}%
                  </td>
                  <td style={{ padding: "12px 8px" }}>{sc.projectedMarginUtilizationPct}%</td>
                  <td style={{ padding: "12px 8px" }}>
                    {sc.marginCallRisk ? (
                      <span style={{ color: "#f87171", fontWeight: 700 }}>YES (MARGIN CALL)</span>
                    ) : (
                      <span style={{ color: "#34d399" }}>NO</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        background: sc.riskBreach ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.15)",
                        color: sc.riskBreach ? "#f87171" : "#4ade80",
                      }}
                    >
                      {sc.riskBreach ? "BREACH" : "SAFE"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
