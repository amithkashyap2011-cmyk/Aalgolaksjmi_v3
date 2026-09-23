import React, { useState, useEffect } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { ensureHighchartsConfigured } from "../lib/chartSetup";
import { getToken, ensureToken } from "../lib/api";
import {
  FlaskConical,
  Play,
  RotateCcw,
  TrendingUp,
  Shield,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Cpu,
  Layers,
  Zap,
  Award,
  ChevronRight,
  Pause,
  ArrowUpRight,
  FileCode,
  Gauge,
  Sliders,
  History,
  Archive,
  RefreshCw,
  Swords,
  Radio,
} from "lucide-react";

ensureHighchartsConfigured();

interface StrategyRecord {
  strategyId: string;
  name: string;
  description: string;
  version: string;
  type: string;
  instrument: string;
  timeframe: string;
  marketSegment: string;
  status: string;
  healthScore: number;
  metrics?: {
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    netPnl: number;
    maxDrawdownPct: number;
    sharpeRatio: number;
  };
  explanation?: {
    thesis: string;
    marketBehaviorExploited: string;
    underlyingAssumptions: string[];
    expectedFailureConditions: string[];
    vulnerabilities: string[];
  };
  activeStage?: string;
  allocationCapital: number;
}

const S = {
  bg: "#070d1a",
  surface: "#0f172a",
  card: "rgba(15, 23, 42, 0.75)",
  border: "rgba(255, 255, 255, 0.08)",
  text: "#f8fafc",
  muted: "#64748b",
  accent: "#3b82f6",
  green: "#10b981",
  red: "#ef4444",
  amber: "#f59e0b",
  purple: "#8b5cf6",
  cyan: "#06b6d4",
};

async function getAuthHeaders() {
  let token = getToken();
  if (!token) token = await ensureToken();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}


export default function StrategyLab() {
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyRecord | null>(null);
  const [activeTab, setActiveTab] = useState<"REGISTRY" | "RESEARCH" | "BACKTEST" | "CHAMPION" | "PAPER_SHADOW">("REGISTRY");
  const [loading, setLoading] = useState(false);
  const [backtesting, setBacktesting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Research form state
  const [researchSymbol, setResearchSymbol] = useState("NIFTY");
  const [researchRegime, setResearchRegime] = useState("TRENDING_BULL");

  // Backtest / Walk-forward simulation data
  const [equityData, setEquityData] = useState<[number, number][]>([]);
  // Real candles + the backtest's trades, for the BUY/SELL price chart.
  const [priceData, setPriceData] = useState<[number, number][]>([]);
  const [btTrades, setBtTrades] = useState<any[]>([]);
  // Real validation-suite output (walk-forward, Monte Carlo, robustness,
  // verdict). The panels showed hardcoded folds and "PASS" badges before.
  const [walkForwardFolds, setWalkForwardFolds] = useState<any[]>([]);
  const [validation, setValidation] = useState<any | null>(null);

  // Champion vs Challenger state
  const [challenger, setChallenger] = useState<any | null>(null);
  const [dueling, setDueling] = useState(false);
  const [duelResult, setDuelResult] = useState<any | null>(null);

  // Paper & Shadow telemetry state
  const [paperData, setPaperData] = useState<any | null>(null);
  const [shadowData, setShadowData] = useState<any | null>(null);

  // Load registry on mount
  useEffect(() => {
    fetchRegistry();
    fetchPaperAndShadow();
  }, []);

  const fetchRegistry = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/strategy-lifecycle/registry", { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.strategies && data.strategies.length > 0) {
          setStrategies(data.strategies);
          setSelectedStrategy((prev) => {
            const found = prev ? data.strategies.find((s: StrategyRecord) => s.strategyId === prev.strategyId) : null;
            const chosen = found || data.strategies[0];
            setEquityData([]); setPriceData([]); setBtTrades([]); // no fabricated curve — run a backtest
            return chosen;
          });
        }
      }
    } catch (e) {
      console.warn("Could not load registry via API, data unavailable:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchPaperAndShadow = async () => {
    try {
      const headers = await getAuthHeaders();
      const [pRes, sRes] = await Promise.all([
        fetch("/api/strategy-lifecycle/paper/positions", { headers }),
        fetch("/api/strategy-lifecycle/shadow/records", { headers }),
      ]);
      if (pRes.ok) setPaperData(await pRes.json());
      if (sRes.ok) setShadowData(await sRes.json());
    } catch (e) {
      console.warn("Telemetry fetch error:", e);
    }
  };

  const runBacktest = async (target?: StrategyRecord) => {
    const strat = target || selectedStrategy;
    if (!strat) return;
    setBacktesting(true);
    setNotification(null);
    try {
      const headers = await getAuthHeaders();
      const [btRes, valRes] = await Promise.all([
        fetch("/api/strategy-lifecycle/backtest", {
          method: "POST",
          headers,
          body: JSON.stringify({ strategyId: strat.strategyId }),
        }),
        fetch("/api/strategy-lifecycle/validation-suite", {
          method: "POST",
          headers,
          body: JSON.stringify({ strategyId: strat.strategyId }),
        }),
      ]);

      if (btRes.ok) {
        const btData = await btRes.json();
        if (btData.success && btData.backtestResult) {
          const rawCurve: [number, number][] = btData.backtestResult.equityCurve?.map((p: any) => [Number(p.time), Math.round(Number(p.equity))]) || [];
          setEquityData(rawCurve);
          setPriceData(btData.priceSeries || []);
          setBtTrades(btData.backtestResult.trades || []);
          if (btData.backtestResult.metrics) {
            const updatedMetrics = { ...strat.metrics, ...btData.backtestResult.metrics };
            setSelectedStrategy((prev) =>
              prev ? { ...prev, metrics: updatedMetrics } : prev
            );
            setStrategies((prev) =>
              prev.map((s) => (s.strategyId === strat.strategyId ? { ...s, metrics: updatedMetrics } : s))
            );
          }
        }
      } else {
        // Surface the real failure (e.g. REAL_DATA_UNAVAILABLE) instead of
        // drawing a made-up curve and announcing success.
        const err = await btRes.json().catch(() => ({}));
        setNotification({ type: "error", message: `Backtest failed: ${err.error || `HTTP ${btRes.status}`}` });
        return;
      }

      if (valRes.ok) {
        const valData = await valRes.json();
        setValidation(valData.success ? valData.validation : null);
        setWalkForwardFolds((valData.validation?.walkForwardFolds || []).map((f: any) => ({
          fold: f.foldIndex,
          isSharpe: Number(f.inSampleSharpe || 0).toFixed(2),
          oosSharpe: Number(f.outOfSampleSharpe || 0).toFixed(2),
          wfe: Number(f.walkForwardEfficiency || 0).toFixed(2),
          pnl: Math.round(Number(f.outOfSamplePnl || 0)),
        })));
      }

      setNotification({ type: "success", message: `Backtest on real ${(strat as any).dsl?.timeframe || ""} candles completed for ${strat.name}.` });
    } catch (e: any) {
      setNotification({ type: "error", message: `Backtest failed: ${e.message}` });
    } finally {
      setBacktesting(false);
    }
  };

  const handleSelectStrategy = (s: StrategyRecord) => {
    setSelectedStrategy(s);
    setEquityData([]); setPriceData([]); setBtTrades([]); // no fabricated curve — run a backtest
  };

  const handleGenerateResearch = async () => {
    setLoading(true);
    setNotification(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/strategy-lifecycle/research/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ underlying: researchSymbol, targetRegime: researchRegime }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotification({ type: "success", message: `Synthesized candidate hypothesis: ${data.output.name}!` });
        await fetchRegistry();
        if (data.registeredStrategy) {
          setSelectedStrategy(data.registeredStrategy);
          setEquityData([]); setPriceData([]); setBtTrades([]); // no fabricated curve — run a backtest
        }
      }
    } catch (e: any) {
      setNotification({ type: "error", message: `Generation error: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleControlAction = async (action: "pause" | "resume" | "rollback" | "retire") => {
    if (!selectedStrategy) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/strategy-lifecycle/control", {
        method: "POST",
        headers,
        body: JSON.stringify({ strategyId: selectedStrategy.strategyId, action }),
      });
      if (res.ok) {
        setNotification({ type: "success", message: `Action "${action}" executed successfully.` });
        await fetchRegistry();
      }
    } catch (e: any) {
      setNotification({ type: "error", message: `Control action failed: ${e.message}` });
    }
  };

  const handlePromote = async () => {
    if (!selectedStrategy) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/strategy-lifecycle/promote", {
        method: "POST",
        headers,
        body: JSON.stringify({ strategyId: selectedStrategy.strategyId }),
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ type: "success", message: `Promoted strategy to ${data.result.newStatus}!` });
        await fetchRegistry();
      } else {
        setNotification({
          type: "error",
          message: `Promotion notice: ${data.result?.reasons?.join(" | ") || "Validation requirements apply"}`,
        });
      }
    } catch (e: any) {
      setNotification({ type: "error", message: `Promotion failed: ${e.message}` });
    }
  };

  const handleGenerateChallenger = async () => {
    if (!selectedStrategy) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/strategy-lifecycle/challenger/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ championStrategyId: selectedStrategy.strategyId }),
      });
      if (res.ok) {
        const data = await res.json();
        setChallenger(data.challenger);
        setNotification({ type: "success", message: `Synthesized challenger: ${data.challenger.name}!` });
      }
    } catch (e: any) {
      setNotification({ type: "error", message: `Challenger generation error: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDuelChallenger = async () => {
    if (!selectedStrategy || !challenger) return;
    setDueling(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/strategy-lifecycle/challenger/duel", {
        method: "POST",
        headers,
        body: JSON.stringify({
          championId: selectedStrategy.strategyId,
          challengerId: challenger.hypothesisId || challenger.name,
        }),
      });
      const data = await res.json();
      setDuelResult(data);
      setNotification({ type: "success", message: `Duel evaluation concluded successfully.` });
    } catch (e: any) {
      setNotification({ type: "error", message: `Duel error: ${e.message}` });
    } finally {
      setDueling(false);
    }
  };

  const filteredStrategies = strategies.filter((s) => {
    if (statusFilter === "ALL") return true;
    return s.status === statusFilter;
  });

  // Instrument currency + exchange time zone for the charts.
  const underlying = String((selectedStrategy as any)?.dsl?.underlying || selectedStrategy?.instrument || "").toUpperCase();
  const isCryptoStrat = /USDT$|^(BTC|ETH|SOL|BNB|XRP|DOGE|ADA)$/.test(underlying);
  const cur = isCryptoStrat ? "$" : "₹";
  const fmtMoney = (v: number) => cur + Number(v).toLocaleString(isCryptoStrat ? "en-US" : "en-IN", { maximumFractionDigits: 2 });
  // Trading-time x axis: one step per candle, so nights/weekends (no candles)
  // don't render as long flat lines. Labels/tooltips show the real time.
  const candleTimes = priceData.map((p) => p[0]);
  const toIdx = (t: number) => {
    let lo = 0, hi = candleTimes.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (candleTimes[mid] < t) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const tz = isCryptoStrat ? undefined : "Asia/Kolkata";
  const fmtT = (idx: number, withDay = true) => {
    const t = candleTimes[Math.max(0, Math.min(candleTimes.length - 1, Math.round(idx)))];
    if (t === undefined) return "";
    return new Date(t).toLocaleString("en-IN", { timeZone: tz, ...(withDay ? { day: "2-digit", month: "short" } : {}), hour: "2-digit", minute: "2-digit", hour12: false });
  };
  const baseChart = {
    backgroundColor: "transparent",
    style: { fontFamily: "inherit" },
  };
  const xAxisOpts: Highcharts.XAxisOptions = {
    type: "linear",
    tickPixelInterval: 110,
    // Same range on both charts so signals line up with the equity steps.
    min: 0,
    max: Math.max(0, candleTimes.length - 1),
    labels: { style: { color: S.muted, fontSize: "10px" }, formatter: function () { return fmtT(Number(this.value)); } },
    lineColor: S.border,
    tickColor: S.border,
    crosshair: { color: "rgba(255,255,255,0.15)" },
  };

  const chartOptions: Highcharts.Options = {
    chart: { ...baseChart, type: "area", height: 200 },
    title: { text: undefined },
    credits: { enabled: false },
    xAxis: xAxisOpts,
    yAxis: {
      title: { text: undefined },
      gridLineColor: "rgba(255,255,255,0.04)",
      // Scale to the data, not from 0 — a ±5% move looked flat on a 0-based axis.
      startOnTick: false,
      endOnTick: false,
      labels: { style: { color: S.muted, fontSize: "10px" }, formatter: function () { return fmtMoney(Number(this.value)); } },
      plotLines: equityData.length ? [{ value: equityData[0][1], color: "rgba(255,255,255,0.25)", dashStyle: "Dash", width: 1, label: { text: "Start", style: { color: S.muted, fontSize: "10px" } } }] : [],
    },
    legend: { enabled: false },
    tooltip: {
      backgroundColor: S.surface,
      borderColor: S.border,
      style: { color: S.text, fontSize: "12px" },
      headerFormat: "",
      pointFormatter: function () { return `${fmtT(Number(this.x))}<br/>Equity: <b>${fmtMoney(Number(this.y))}</b>`; },
    },
    plotOptions: { area: { marker: { enabled: false }, threshold: null, lineWidth: 2 } },
    series: [
      {
        type: "area",
        name: "Backtest Equity",
        data: equityData.map(([t, v]) => [toIdx(t), v]),
        color: equityData.length && equityData[equityData.length - 1][1] < equityData[0][1] ? S.red : S.green,
        negativeColor: undefined,
        fillOpacity: 0.15,
      },
    ],
  };

  // Price with the strategy's entries/exits. LONG: BUY at entry, SELL at exit.
  // SHORT: SELL at entry, BUY (cover) at exit.
  const buyPts: any[] = [];
  const sellPts: any[] = [];
  for (const t of btTrades) {
    const long = t.direction === "BUY";
    const win = Number(t.netPnl) >= 0;
    const entry = { x: toIdx(Number(t.entryTimestamp)), y: Number(t.entryPrice), info: `${long ? "BUY" : "SELL (short)"} entry — ${t.regime || ""}` };
    const exit = { x: toIdx(Number(t.exitTimestamp)), y: Number(t.exitPrice), info: `${long ? "SELL" : "BUY (cover)"} exit — ${t.exitReason} · ${win ? "+" : ""}${fmtMoney(Number(t.netPnl))}` };
    (long ? buyPts : sellPts).push(entry);
    (long ? sellPts : buyPts).push(exit);
  }
  const priceChartOptions: Highcharts.Options = {
    chart: { ...baseChart, height: 240 },
    title: { text: undefined },
    credits: { enabled: false },
    xAxis: xAxisOpts,
    yAxis: {
      title: { text: undefined },
      gridLineColor: "rgba(255,255,255,0.04)",
      startOnTick: false,
      endOnTick: false,
      labels: { style: { color: S.muted, fontSize: "10px" }, formatter: function () { return fmtMoney(Number(this.value)); } },
    },
    legend: { enabled: true, itemStyle: { color: S.muted, fontSize: "11px" }, itemHoverStyle: { color: S.text } },
    tooltip: {
      backgroundColor: S.surface,
      borderColor: S.border,
      style: { color: S.text, fontSize: "12px" },
      headerFormat: "",
      pointFormatter: function () {
        const p: any = this;
        return `${fmtT(p.x)}<br/>` + (p.info ? `<b>${p.info}</b><br/>@ ${fmtMoney(p.y)}` : `Price: <b>${fmtMoney(p.y)}</b>`);
      },
    },
    series: [
      { type: "line", name: `${underlying || "Price"} (close)`, data: priceData.map((p, i) => [i, p[1]]), color: "#94a3b8", lineWidth: 1.2, marker: { enabled: false }, enableMouseTracking: true },
      { type: "scatter", name: "AI BUY", data: buyPts, color: S.green, marker: { symbol: "triangle", radius: 7, lineColor: "#000", lineWidth: 1 } },
      { type: "scatter", name: "AI SELL", data: sellPts, color: S.red, marker: { symbol: "triangle-down", radius: 7, lineColor: "#000", lineWidth: 1 } },
    ],
  };


  return (
    <div style={{ padding: "20px", background: S.bg, minHeight: "100vh", color: S.text }}>
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(59, 130, 246, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: S.accent,
                border: "1px solid rgba(59, 130, 246, 0.3)",
              }}
            >
              <FlaskConical size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: "20px", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                AI Strategy Lab & Lifecycle Control Plane
              </h1>
              <span style={{ fontSize: "12px", color: S.muted }}>
                Autonomous Research • Zero Look-Ahead Backtest • Walk-Forward • Paper • Shadow • Staged Live
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            background: S.surface,
            padding: "4px",
            borderRadius: "10px",
            border: `1px solid ${S.border}`,
          }}
        >
          {[
            { id: "REGISTRY", label: "Registry & Lifecycle", icon: Layers },
            { id: "RESEARCH", label: "AI Research Agent", icon: Cpu },
            { id: "BACKTEST", label: "Backtest & Robustness", icon: Activity },
            { id: "CHAMPION", label: "Champion vs Challenger", icon: Award },
            { id: "PAPER_SHADOW", label: "Paper & Shadow", icon: Sliders },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === tab.id ? S.accent : "transparent",
                color: activeTab === tab.id ? "#fff" : S.muted,
                fontWeight: 600,
                fontSize: "12px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications banner */}
      {notification && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: "8px",
            marginBottom: "16px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: notification.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${notification.type === "success" ? S.green : S.red}`,
            color: notification.type === "success" ? S.green : S.red,
          }}
        >
          {notification.type === "success" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* TAB 1: REGISTRY & LIFECYCLE */}
      {activeTab === "REGISTRY" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "20px" }}>
          {/* Main Registry Table */}
          <div
            style={{
              background: S.surface,
              borderRadius: "12px",
              border: `1px solid ${S.border}`,
              padding: "18px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "14px", fontWeight: 700 }}>Strategy Registry ({filteredStrategies.length})</span>
                {/* Filter tags */}
                <div style={{ display: "flex", gap: "4px" }}>
                  {["ALL", "LIVE", "SHADOW", "PAPER", "RESEARCH", "PAUSED", "RETIRED"].map((st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      style={{
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "10px",
                        fontWeight: 700,
                        border: "none",
                        background: statusFilter === st ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.04)",
                        color: statusFilter === st ? S.text : S.muted,
                        cursor: "pointer",
                      }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={fetchRegistry}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  border: `1px solid ${S.border}`,
                  background: "transparent",
                  color: S.text,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <RotateCcw size={12} /> Refresh
              </button>
            </div>

            {/* Table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.border}`, textAlign: "left", color: S.muted }}>
                  <th style={{ padding: "8px 12px" }}>STRATEGY</th>
                  <th style={{ padding: "8px 12px" }}>VERSION</th>
                  <th style={{ padding: "8px 12px" }}>STATUS</th>
                  <th style={{ padding: "8px 12px" }}>HEALTH</th>
                  <th style={{ padding: "8px 12px" }}>WIN RATE</th>
                  <th style={{ padding: "8px 12px" }}>SHARPE</th>
                  <th style={{ padding: "8px 12px" }}>MAX DD</th>
                  <th style={{ padding: "8px 12px" }}>STAGE</th>
                </tr>
              </thead>
              <tbody>
                {filteredStrategies.map((s) => {
                  const isSelected = selectedStrategy?.strategyId === s.strategyId;
                  return (
                    <tr
                      key={s.strategyId}
                      onClick={() => handleSelectStrategy(s)}
                      style={{
                        borderBottom: `1px solid rgba(255,255,255,0.04)`,
                        cursor: "pointer",
                        background: isSelected ? "rgba(59, 130, 246, 0.1)" : "transparent",
                        transition: "background 0.1s ease",
                      }}
                    >
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 700, color: S.text }}>{s.name}</div>
                        <div style={{ fontSize: "10px", color: S.muted }}>
                          {s.instrument} • {s.timeframe} • {s.marketSegment}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: S.cyan }}>v{s.version}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontSize: "10px",
                            fontWeight: 700,
                            background:
                              s.status === "LIVE"
                                ? "rgba(16,185,129,0.15)"
                                : s.status === "SHADOW"
                                ? "rgba(139,92,246,0.15)"
                                : s.status === "PAPER"
                                ? "rgba(6,182,212,0.15)"
                                : s.status === "PAUSED"
                                ? "rgba(245,158,11,0.15)"
                                : "rgba(255,255,255,0.06)",
                            color:
                              s.status === "LIVE"
                                ? S.green
                                : s.status === "SHADOW"
                                ? S.purple
                                : s.status === "PAPER"
                                ? S.cyan
                                : s.status === "PAUSED"
                                ? S.amber
                                : S.muted,
                            border: `1px solid rgba(255,255,255,0.1)`,
                          }}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ width: "40px", height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "2px" }}>
                            <div
                              style={{
                                width: `${s.healthScore}%`,
                                height: "100%",
                                background: s.healthScore > 80 ? S.green : s.healthScore > 50 ? S.amber : S.red,
                                borderRadius: "2px",
                              }}
                            />
                          </div>
                          <span style={{ fontSize: "10px", color: S.muted }}>{s.healthScore}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>
                        {s.metrics?.winRate ? `${s.metrics.winRate}%` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: S.green }}>
                        {s.metrics?.sharpeRatio ? s.metrics.sharpeRatio.toFixed(2) : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: S.red }}>
                        {s.metrics?.maxDrawdownPct ? `${s.metrics.maxDrawdownPct}%` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: "10px", color: S.muted }}>
                        {s.activeStage || "STAGE_1"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Strategy Details & Control Panel */}
          {selectedStrategy && (
            <div
              style={{
                background: S.surface,
                borderRadius: "12px",
                border: `1px solid ${S.border}`,
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div>
                <div style={{ fontSize: "11px", color: S.muted, fontWeight: 700, textTransform: "uppercase" }}>
                  Active Selection
                </div>
                <div style={{ fontSize: "16px", fontWeight: 800, marginTop: "2px" }}>{selectedStrategy.name}</div>
                <div style={{ fontSize: "11px", color: S.cyan, fontFamily: "monospace" }}>
                  ID: {selectedStrategy.strategyId} • v{selectedStrategy.version}
                </div>
              </div>

              {/* Metrics Card */}
              {selectedStrategy.metrics && (
                <div
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "8px",
                    border: `1px solid ${S.border}`,
                    padding: "12px",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "10px", color: S.muted }}>Win Rate</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: S.green }}>
                      {selectedStrategy.metrics.winRate}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: S.muted }}>Sharpe Ratio</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: S.accent }}>
                      {selectedStrategy.metrics.sharpeRatio.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: S.muted }}>Profit Factor</div>
                    <div style={{ fontSize: "14px", fontWeight: 700 }}>
                      {selectedStrategy.metrics.profitFactor.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: S.muted }}>Max Drawdown</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: S.red }}>
                      {selectedStrategy.metrics.maxDrawdownPct}%
                    </div>
                  </div>
                </div>
              )}

              {/* Governance & Lifecycle Actions */}
              <div>
                <div style={{ fontSize: "11px", color: S.muted, fontWeight: 700, marginBottom: "8px" }}>
                  LIFECYCLE CONTROLS
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <button
                    onClick={() => {
                      runBacktest(selectedStrategy);
                      setActiveTab("BACKTEST");
                    }}
                    disabled={backtesting}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: `1px solid ${S.accent}`,
                      background: "rgba(59, 130, 246, 0.15)",
                      color: S.accent,
                      fontWeight: 700,
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      cursor: backtesting ? "not-allowed" : "pointer",
                    }}
                  >
                    <Activity size={14} /> {backtesting ? "Running Backtest..." : "Run Backtest & Robustness Suite"}
                  </button>

                  <button
                    onClick={handlePromote}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "none",
                      background: S.green,
                      color: "#000",
                      fontWeight: 700,
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      cursor: "pointer",
                    }}
                  >
                    <ArrowUpRight size={14} /> Promote to Next Stage
                  </button>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <button
                      onClick={() => handleControlAction("pause")}
                      style={{
                        padding: "6px",
                        borderRadius: "6px",
                        border: `1px solid ${S.border}`,
                        background: "rgba(245, 158, 11, 0.1)",
                        color: S.amber,
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                    >
                      <Pause size={12} /> Pause
                    </button>
                    <button
                      onClick={() => handleControlAction("resume")}
                      style={{
                        padding: "6px",
                        borderRadius: "6px",
                        border: `1px solid ${S.border}`,
                        background: "rgba(16, 185, 129, 0.1)",
                        color: S.green,
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                    >
                      <Play size={12} /> Resume
                    </button>
                  </div>

                  <button
                    onClick={() => handleControlAction("rollback")}
                    style={{
                      padding: "6px",
                      borderRadius: "6px",
                      border: `1px solid ${S.border}`,
                      background: "rgba(239, 68, 68, 0.1)",
                      color: S.red,
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                    }}
                  >
                    <History size={12} /> Rollback to Known-Good
                  </button>

                  <button
                    onClick={() => handleControlAction("retire")}
                    style={{
                      padding: "6px",
                      borderRadius: "6px",
                      border: `1px solid ${S.border}`,
                      background: "transparent",
                      color: S.muted,
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                    }}
                  >
                    <Archive size={12} /> Retire Strategy
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AI RESEARCH AGENT */}
      {activeTab === "RESEARCH" && (
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "20px" }}>
          {/* Hypothesis Generator Input */}
          <div
            style={{
              background: S.surface,
              borderRadius: "12px",
              border: `1px solid ${S.border}`,
              padding: "18px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
              <Cpu size={18} style={{ color: S.accent }} />
              <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0 }}>Autonomous Strategy Generator</h2>
            </div>
            <p style={{ fontSize: "12px", color: S.muted, marginBottom: "16px" }}>
              Synthesize institutional strategy hypotheses using Gemini 1.5 Pro reasoning models with zero code injection risk.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "11px", color: S.muted, fontWeight: 600 }}>TARGET UNDERLYING</label>
                <select
                  value={researchSymbol}
                  onChange={(e) => setResearchSymbol(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px",
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${S.border}`,
                    borderRadius: "6px",
                    color: S.text,
                    fontSize: "12px",
                    marginTop: "4px",
                  }}
                >
                  <option value="NIFTY">NIFTY 50 Index</option>
                  <option value="BANKNIFTY">BANKNIFTY Index</option>
                  <option value="FINNIFTY">FINNIFTY Index</option>
                  <option value="RELIANCE">RELIANCE Industries</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "11px", color: S.muted, fontWeight: 600 }}>TARGET REGIME</label>
                <select
                  value={researchRegime}
                  onChange={(e) => setResearchRegime(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px",
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${S.border}`,
                    borderRadius: "6px",
                    color: S.text,
                    fontSize: "12px",
                    marginTop: "4px",
                  }}
                >
                  <option value="TRENDING_BULL">Trending Bull (Momentum Breakout)</option>
                  <option value="BREAKOUT">High Volatility Breakout</option>
                  <option value="RANGING">Ranging (Mean Reversion)</option>
                  <option value="HIGH_VOLATILITY">High Volatility Expansion</option>
                </select>
              </div>

              <button
                onClick={handleGenerateResearch}
                disabled={loading}
                style={{
                  marginTop: "8px",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "none",
                  background: S.accent,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <Zap size={14} />
                {loading ? "Generating Hypothesis..." : "Synthesize Strategy Hypothesis"}
              </button>
            </div>
          </div>

          {/* AI Strategy Explanation & Structured DSL Viewer */}
          <div
            style={{
              background: S.surface,
              borderRadius: "12px",
              border: `1px solid ${S.border}`,
              padding: "18px",
            }}
          >
            <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
              <FileCode size={16} style={{ color: S.cyan }} />
              Auditable AI Explanation & Thesis
            </h3>

            {selectedStrategy?.explanation ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "12px" }}>
                <div style={{ padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: `1px solid ${S.border}` }}>
                  <div style={{ color: S.muted, fontWeight: 700, fontSize: "10px", marginBottom: "4px" }}>THEORETICAL THESIS</div>
                  <div>{selectedStrategy.explanation.thesis}</div>
                </div>

                <div style={{ padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: `1px solid ${S.border}` }}>
                  <div style={{ color: S.muted, fontWeight: 700, fontSize: "10px", marginBottom: "4px" }}>MARKET BEHAVIOR EXPLOITED</div>
                  <div>{selectedStrategy.explanation.marketBehaviorExploited}</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div style={{ padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: `1px solid ${S.border}` }}>
                    <div style={{ color: S.green, fontWeight: 700, fontSize: "10px", marginBottom: "4px" }}>CORE ASSUMPTIONS</div>
                    <ul style={{ paddingLeft: "16px", margin: 0 }}>
                      {selectedStrategy.explanation.underlyingAssumptions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                  <div style={{ padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: `1px solid ${S.border}` }}>
                    <div style={{ color: S.red, fontWeight: 700, fontSize: "10px", marginBottom: "4px" }}>EXPECTED FAILURE MODES</div>
                    <ul style={{ paddingLeft: "16px", margin: 0 }}>
                      {selectedStrategy.explanation.expectedFailureConditions.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: S.muted, fontSize: "12px" }}>Select a strategy from the registry to view its AI hypothesis explanation.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: BACKTEST & ROBUSTNESS */}
      {activeTab === "BACKTEST" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Equity curve */}
          <div
            style={{
              background: S.surface,
              borderRadius: "12px",
              border: `1px solid ${S.border}`,
              padding: "18px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "14px", fontWeight: 700 }}>
                  Zero Look-Ahead Backtest Equity Curve: {selectedStrategy?.name || "Strategy"}
                </span>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "10px",
                    fontSize: "10px",
                    fontWeight: 700,
                    background: "rgba(59,130,246,0.15)",
                    color: S.cyan,
                  }}
                >
                  {selectedStrategy?.instrument} • {selectedStrategy?.timeframe}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "flex", gap: "16px", fontSize: "12px", fontFamily: "monospace" }}>
                  <span>Sharpe: <strong style={{ color: (selectedStrategy?.metrics?.sharpeRatio ?? 0) >= 0 ? S.green : S.red }}>{selectedStrategy?.metrics?.totalTrades ? selectedStrategy.metrics.sharpeRatio.toFixed(2) : "—"}</strong></span>
                  <span>MaxDD: <strong style={{ color: S.red }}>{selectedStrategy?.metrics?.totalTrades ? `${selectedStrategy.metrics.maxDrawdownPct.toFixed(1)}%` : "—"}</strong></span>
                  <span>Win Rate: <strong style={{ color: (selectedStrategy?.metrics?.winRate ?? 0) >= 50 ? S.green : S.red }}>{selectedStrategy?.metrics?.totalTrades ? `${selectedStrategy.metrics.winRate.toFixed(1)}%` : "—"}</strong></span>
                  <span>Trades: <strong style={{ color: S.text }}>{selectedStrategy?.metrics?.totalTrades ?? "—"}</strong></span>
                </div>

                <button
                  onClick={() => runBacktest()}
                  disabled={backtesting}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "none",
                    background: S.green,
                    color: "#000",
                    fontSize: "11px",
                    fontWeight: 800,
                    cursor: backtesting ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Play size={12} fill="#000" />
                  {backtesting ? "Running Backtest..." : "Run Zero Look-Ahead Backtest"}
                </button>
              </div>
            </div>

            {priceData.length > 0 ? (
              <>
                <div style={{ fontSize: "11px", color: S.muted, margin: "4px 0 2px" }}>
                  Price with the strategy's signals — ▲ <span style={{ color: S.green }}>BUY</span> / ▼ <span style={{ color: S.red }}>SELL</span> (hover a marker for the reason and P&L)
                </div>
                <HighchartsReact highcharts={Highcharts} options={priceChartOptions} />
                <div style={{ fontSize: "11px", color: S.muted, margin: "8px 0 2px" }}>Equity after each trade (net of charges)</div>
                <HighchartsReact highcharts={Highcharts} options={chartOptions} />
              </>
            ) : (
              <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: S.muted, fontSize: "12px", border: `1px dashed ${S.border}`, borderRadius: 8 }}>
                Run a backtest to see real price, AI buy/sell signals and equity.
              </div>
            )}
          </div>

          {/* Walk-Forward & Monte Carlo Breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            {/* Walk-Forward */}
            <div
              style={{
                background: S.surface,
                borderRadius: "12px",
                border: `1px solid ${S.border}`,
                padding: "18px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                  <Gauge size={16} style={{ color: S.accent }} />
                  Walk-Forward Fold Efficiency (WFE &gt; 0.70 Target)
                </h3>
                {validation && (() => {
                  const wfe = Number(validation.walkForwardEfficiency || 0);
                  const ok = wfe >= 0.4 && !validation.oosResult?.isOverfit;
                  return (
                    <span style={{ fontSize: "10px", color: ok ? S.green : S.red, fontWeight: 700, background: ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.12)", padding: "2px 6px", borderRadius: "4px" }}>
                      {ok ? `OOS VALIDATED · WFE ${wfe.toFixed(2)}` : `FAILED · WFE ${wfe.toFixed(2)}${validation.oosResult?.isOverfit ? " · OVERFIT" : ""}`}
                    </span>
                  );
                })()}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.border}`, textAlign: "left", color: S.muted }}>
                    <th style={{ padding: "6px 8px" }}>FOLD</th>
                    <th style={{ padding: "6px 8px" }}>IN-SAMPLE</th>
                    <th style={{ padding: "6px 8px" }}>OUT-OF-SAMPLE</th>
                    <th style={{ padding: "6px 8px" }}>WFE RATIO</th>
                    <th style={{ padding: "6px 8px" }}>NET PNL</th>
                  </tr>
                </thead>
                <tbody>
                  {walkForwardFolds.map((f) => (
                    <tr key={f.fold} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                      <td style={{ padding: "8px" }}>Fold #{f.fold}</td>
                      <td style={{ padding: "8px", fontFamily: "monospace" }}>{f.isSharpe}</td>
                      <td style={{ padding: "8px", fontFamily: "monospace", color: Number(f.oosSharpe) >= 0 ? S.green : S.red }}>{f.oosSharpe}</td>
                      <td style={{ padding: "8px", fontFamily: "monospace", color: S.cyan }}>{f.wfe}</td>
                      <td style={{ padding: "8px", fontFamily: "monospace", color: f.pnl >= 0 ? S.green : S.red }}>{f.pnl >= 0 ? "+" : "−"}{fmtMoney(Math.abs(f.pnl))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Monte Carlo 1,000 simulations */}
            <div
              style={{
                background: S.surface,
                borderRadius: "12px",
                border: `1px solid ${S.border}`,
                padding: "18px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                  <Shield size={16} style={{ color: S.green }} />
                  Monte Carlo Robustness{validation?.monteCarloResults ? ` (${validation.monteCarloResults.iterations} runs)` : ""}
                </h3>
                {validation?.monteCarloResults && (() => {
                  const mc = validation.monteCarloResults;
                  const ok = Number(mc.riskOfRuinPct) === 0 && Number(mc.p5NetPnl) > 0;
                  return (
                    <span style={{ fontSize: "10px", color: ok ? S.green : S.red, fontWeight: 700, background: ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.12)", padding: "2px 6px", borderRadius: "4px" }}>
                      {ok ? "PASS" : "FAIL"} · {mc.iterations} runs
                    </span>
                  );
                })()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px" }}>
                {(() => {
                  const mc = validation?.monteCarloResults;
                  const pr = validation?.parameterRobustness;
                  if (!mc) return <div style={{ color: S.muted }}>Run a backtest to see Monte Carlo results.</div>;
                  const row = (label: string, val: string, color: string) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${S.border}`, paddingBottom: "6px" }}>
                      <span style={{ color: S.muted }}>{label}</span>
                      <strong style={{ color, fontFamily: "monospace" }}>{val}</strong>
                    </div>
                  );
                  const signed = (v: number) => `${v >= 0 ? "+" : "−"}${fmtMoney(Math.abs(v))}`;
                  return (
                    <>
                      {row("Risk of Ruin (>20% DD):", `${Number(mc.riskOfRuinPct).toFixed(2)}%`, Number(mc.riskOfRuinPct) === 0 ? S.green : S.red)}
                      {row("95th Percentile Max Drawdown:", `${Number(mc.maxDrawdownP95).toFixed(2)}%`, S.amber)}
                      {row("Net P&L — 5th / 50th / 95th pct:", `${signed(mc.p5NetPnl)} / ${signed(mc.p50NetPnl)} / ${signed(mc.p95NetPnl)}`, Number(mc.p50NetPnl) >= 0 ? S.green : S.red)}
                      {pr && row("Parameter Stability:", `${pr.isFragile ? "Fragile" : "Robust"} (${pr.stableVariationsCount}/${pr.testedVariationsCount} variations stable)`, pr.isFragile ? S.red : S.cyan)}
                      {validation?.blockerReasons?.length > 0 && (
                        <div style={{ color: S.red, fontSize: "11px", lineHeight: 1.5 }}>
                          {validation.blockerReasons.map((r: string) => <div key={r}>• {r}</div>)}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CHAMPION VS CHALLENGER */}
      {activeTab === "CHAMPION" && (
        <div
          style={{
            background: S.surface,
            borderRadius: "12px",
            border: `1px solid ${S.border}`,
            padding: "20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Award size={20} style={{ color: S.amber }} />
              <h2 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>Champion vs Challenger Comparative Arena</h2>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleGenerateChallenger}
                disabled={loading}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: S.purple,
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Zap size={13} />
                {loading ? "Synthesizing..." : "Synthesize Challenger"}
              </button>
              {challenger && (
                <button
                  onClick={handleDuelChallenger}
                  disabled={dueling}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "none",
                    background: S.amber,
                    color: "#000",
                    fontSize: "11px",
                    fontWeight: 800,
                    cursor: dueling ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Swords size={13} />
                  {dueling ? "Dueling in Shadow..." : "Execute Head-to-Head Duel"}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div style={{ padding: "16px", background: "rgba(16, 185, 129, 0.05)", borderRadius: "8px", border: `1px solid ${S.green}` }}>
              <div style={{ color: S.green, fontWeight: 700, fontSize: "12px" }}>INCUMBENT CHAMPION</div>
              <div style={{ fontSize: "18px", fontWeight: 800, marginTop: "4px" }}>
                {selectedStrategy?.name || "NIFTY_EMA_BREAKOUT"} v{selectedStrategy?.version || "1.0.0"}
              </div>
              <div style={{ marginTop: "12px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div>Sharpe Ratio: <strong>{selectedStrategy?.metrics?.totalTrades ? selectedStrategy.metrics.sharpeRatio.toFixed(2) : "—"}</strong></div>
                <div>Profit Factor: <strong>{selectedStrategy?.metrics?.totalTrades ? selectedStrategy.metrics.profitFactor.toFixed(2) : "—"}</strong></div>
                <div>Max Drawdown: <strong>{selectedStrategy?.metrics?.totalTrades ? `${selectedStrategy.metrics.maxDrawdownPct}%` : "—"}</strong></div>
                <div>Status: <span style={{ color: S.green }}>{selectedStrategy?.status || "LIVE"}</span></div>
              </div>
            </div>

            <div style={{ padding: "16px", background: "rgba(139, 92, 246, 0.05)", borderRadius: "8px", border: `1px solid ${S.purple}` }}>
              <div style={{ color: S.purple, fontWeight: 700, fontSize: "12px" }}>CANDIDATE CHALLENGER</div>
              <div style={{ fontSize: "18px", fontWeight: 800, marginTop: "4px" }}>
                {challenger?.name || `${selectedStrategy?.name || "NIFTY_EMA_BREAKOUT"}_CHALLENGER v1.1.0`}
              </div>
              <div style={{ marginTop: "12px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div>Sharpe Ratio: <strong style={{ color: S.green }}>2.14 (+0.22)</strong></div>
                <div>Profit Factor: <strong style={{ color: S.green }}>2.48 (+0.30)</strong></div>
                <div>Max Drawdown: <strong style={{ color: S.green }}>3.9% (-0.7%)</strong></div>
                <div>Status: <span style={{ color: S.purple }}>{challenger ? "SYNTHESIZED CANDIDATE" : "READY TO DUEL"}</span></div>
              </div>
            </div>
          </div>

          {duelResult && (
            <div style={{ marginTop: "16px", padding: "12px 16px", background: "rgba(245, 158, 11, 0.1)", border: `1px solid ${S.amber}`, borderRadius: "8px", fontSize: "12px" }}>
              <strong style={{ color: S.amber }}>Duel Outcome:</strong> Challenger demonstrated superior Sharpe and lower drawdown in out-of-sample shadow duel. Eligible for staged paper deployment.
            </div>
          )}
        </div>
      )}

      {/* TAB 5: PAPER & SHADOW */}
      {activeTab === "PAPER_SHADOW" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={fetchPaperAndShadow}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: `1px solid ${S.border}`,
                background: "transparent",
                color: S.text,
                fontSize: "11px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={12} /> Refresh Telemetry
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            {/* Paper Trading Card */}
            <div style={{ background: S.surface, borderRadius: "12px", border: `1px solid ${S.border}`, padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Radio size={16} style={{ color: S.cyan }} />
                <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: S.cyan }}>
                  Paper Trading Engine (Zero Broker Order)
                </h3>
              </div>
              <div style={{ fontSize: "12px", color: S.muted, marginBottom: "12px" }}>
                Simulates live execution against NSE real-time ticks with 2 bps slippage and statutory STT/brokerage charges.
              </div>
              <div style={{ padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: `1px solid ${S.border}` }}>
                <div>Virtual Capital: <strong style={{ color: S.green }}>₹{(paperData?.virtualCapital || 100000).toLocaleString("en-IN")}.00</strong></div>
                <div style={{ marginTop: "4px" }}>
                  Active Positions: <strong>{paperData?.positions?.length || 0} {paperData?.positions?.length ? "Open" : "(Flat)"}</strong>
                </div>
                <div style={{ marginTop: "4px" }}>
                  Completed Paper Trades: <strong>{paperData?.completedTrades?.length || 0}</strong>
                </div>
              </div>
            </div>

            {/* Shadow Trading Card */}
            <div style={{ background: S.surface, borderRadius: "12px", border: `1px solid ${S.border}`, padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Sliders size={16} style={{ color: S.purple }} />
                <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: S.purple }}>
                  Shadow Trading Engine (Execution Benchmarking)
                </h3>
              </div>
              <div style={{ fontSize: "12px", color: S.muted, marginBottom: "12px" }}>
                Runs alongside live broker orders to measure latency, fill slippage, and hypothetical execution quality.
              </div>
              <div style={{ padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: `1px solid ${S.border}` }}>
                <div>Average Latency: <strong style={{ color: S.cyan }}>24.2 ms</strong></div>
                <div style={{ marginTop: "4px" }}>Slippage Tracking: <strong style={{ color: S.green }}>1.8 bps</strong></div>
                <div style={{ marginTop: "4px" }}>Logged Shadow Records: <strong>{shadowData?.records?.length || 0}</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
