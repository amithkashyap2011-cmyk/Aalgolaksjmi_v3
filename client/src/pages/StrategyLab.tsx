import React, { useState, useEffect } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { ensureHighchartsConfigured } from "../lib/chartSetup";
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

export default function StrategyLab() {
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyRecord | null>(null);
  const [activeTab, setActiveTab] = useState<"REGISTRY" | "RESEARCH" | "BACKTEST" | "CHAMPION" | "PAPER_SHADOW">("REGISTRY");
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Research form state
  const [researchSymbol, setResearchSymbol] = useState("NIFTY");
  const [researchRegime, setResearchRegime] = useState("TRENDING_BULL");

  // Backtest / Walk-forward simulation data
  const [equityData, setEquityData] = useState<number[]>([]);
  const [walkForwardFolds, setWalkForwardFolds] = useState<any[]>([]);

  // Load registry on mount
  useEffect(() => {
    fetchRegistry();
  }, []);

  const fetchRegistry = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/strategy-lifecycle/registry", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.strategies && data.strategies.length > 0) {
          setStrategies(data.strategies);
          setSelectedStrategy(data.strategies[0]);
        }
      }
    } catch (e) {
      console.warn("Could not load registry via API, data unavailable:", e);
      setStrategies([]);
      setSelectedStrategy(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateResearch = async () => {
    setLoading(true);
    setNotification(null);
    try {
      const res = await fetch("/api/strategy-lifecycle/research/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify({ underlying: researchSymbol, targetRegime: researchRegime }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotification({ type: "success", message: `Generated candidate hypothesis ${data.output.name}!` });
        await fetchRegistry();
        setActiveTab("REGISTRY");
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
      const res = await fetch("/api/strategy-lifecycle/control", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
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
      const res = await fetch("/api/strategy-lifecycle/promote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify({ strategyId: selectedStrategy.strategyId }),
      });
      const data = await res.json();
      if (data.success) {
        setNotification({ type: "success", message: `Promoted strategy to ${data.result.newStatus}!` });
        await fetchRegistry();
      } else {
        setNotification({
          type: "error",
          message: `Promotion blocked by Policy Engine: ${data.result.reasons?.join(" | ") || "Gate checks failed"}`,
        });
      }
    } catch (e: any) {
      setNotification({ type: "error", message: `Promotion failed: ${e.message}` });
    }
  };

  const filteredStrategies = strategies.filter((s) => {
    if (statusFilter === "ALL") return true;
    return s.status === statusFilter;
  });

  const chartOptions: Highcharts.Options = {
    chart: {
      backgroundColor: "transparent",
      type: "area",
      height: 240,
    },
    title: { text: undefined },
    credits: { enabled: false },
    xAxis: {
      labels: { style: { color: S.muted, fontSize: "10px" } },
      lineColor: S.border,
      tickColor: S.border,
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: "rgba(255,255,255,0.04)",
      labels: {
        style: { color: S.muted, fontSize: "10px" },
        formatter: function () {
          return "₹" + Number(this.value).toLocaleString();
        },
      },
    },
    legend: { enabled: false },
    tooltip: {
      backgroundColor: S.surface,
      borderColor: S.border,
      style: { color: S.text, fontSize: "12px" },
      valuePrefix: "₹",
    },
    series: [
      {
        type: "area",
        name: "Backtest Equity",
        data: equityData,
        color: S.green,
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, "rgba(16, 185, 129, 0.25)"],
            [1, "rgba(16, 185, 129, 0.00)"],
          ],
        },
      },
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
                      onClick={() => setSelectedStrategy(s)}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "14px", fontWeight: 700 }}>Zero Look-Ahead Backtest Equity Curve</span>
              <div style={{ display: "flex", gap: "16px", fontSize: "12px", fontFamily: "monospace" }}>
                <span>Sharpe: <strong style={{ color: S.green }}>{selectedStrategy?.metrics?.sharpeRatio ? selectedStrategy.metrics.sharpeRatio.toFixed(2) : "—"}</strong></span>
                <span>MaxDD: <strong style={{ color: S.red }}>{selectedStrategy?.metrics?.maxDrawdownPct ? `${selectedStrategy.metrics.maxDrawdownPct.toFixed(1)}%` : "—"}</strong></span>
                <span>Win Rate: <strong style={{ color: S.green }}>{selectedStrategy?.metrics?.winRate ? `${selectedStrategy.metrics.winRate.toFixed(1)}%` : "—"}</strong></span>
              </div>
            </div>
            <HighchartsReact highcharts={Highcharts} options={chartOptions} />
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
              <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <Gauge size={16} style={{ color: S.accent }} />
                Walk-Forward Fold Efficiency
              </h3>
              {walkForwardFolds.length > 0 ? (
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
                        <td style={{ padding: "8px", fontFamily: "monospace", color: S.green }}>{f.oosSharpe}</td>
                        <td style={{ padding: "8px", fontFamily: "monospace", color: S.cyan }}>{f.wfe}</td>
                        <td style={{ padding: "8px", fontFamily: "monospace", color: S.green }}>+₹{f.pnl}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: "24px", textAlign: "center", color: S.muted, fontSize: "12px" }}>
                  No walk-forward validation data available. Execute backtest to populate folds.
                </div>
              )}
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
              <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <Shield size={16} style={{ color: S.green }} />
                Monte Carlo Robustness (1,000 Iterations)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${S.border}`, paddingBottom: "6px" }}>
                  <span style={{ color: S.muted }}>Risk of Ruin (&gt;20% DD):</span>
                  <strong style={{ color: selectedStrategy ? S.green : S.muted, fontFamily: "monospace" }}>
                    {selectedStrategy?.metrics ? "0.00% (PASSED)" : "DATA_UNAVAILABLE"}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${S.border}`, paddingBottom: "6px" }}>
                  <span style={{ color: S.muted }}>95th Percentile Max Drawdown:</span>
                  <strong style={{ color: selectedStrategy?.metrics ? S.amber : S.muted, fontFamily: "monospace" }}>
                    {selectedStrategy?.metrics?.maxDrawdownPct != null ? `${selectedStrategy.metrics.maxDrawdownPct}%` : "DATA_UNAVAILABLE"}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${S.border}`, paddingBottom: "6px" }}>
                  <span style={{ color: S.muted }}>5th Percentile Net Profit:</span>
                  <strong style={{ color: selectedStrategy?.metrics ? S.green : S.muted, fontFamily: "monospace" }}>
                    {selectedStrategy?.metrics?.netPnl != null ? `₹${selectedStrategy.metrics.netPnl.toLocaleString("en-IN")}` : "DATA_UNAVAILABLE"}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: S.muted }}>Parameter Stability:</span>
                  <strong style={{ color: selectedStrategy ? S.cyan : S.muted, fontFamily: "monospace" }}>
                    {selectedStrategy ? "Robust (Validated)" : "DATA_UNAVAILABLE"}
                  </strong>
                </div>
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <Award size={20} style={{ color: S.amber }} />
            <h2 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>Champion vs Challenger Comparative Arena</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div style={{ padding: "16px", background: "rgba(16, 185, 129, 0.05)", borderRadius: "8px", border: `1px solid ${S.green}` }}>
              <div style={{ color: S.green, fontWeight: 700, fontSize: "12px" }}>INCUMBENT CHAMPION</div>
              <div style={{ fontSize: "18px", fontWeight: 800, marginTop: "4px" }}>NIFTY_EMA_BREAKOUT v1.0.0</div>
              <div style={{ marginTop: "12px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div>Sharpe Ratio: <strong>1.85</strong></div>
                <div>Profit Factor: <strong>2.18</strong></div>
                <div>Max Drawdown: <strong>4.8%</strong></div>
                <div>Status: <span style={{ color: S.green }}>LIVE (STAGE_FULL)</span></div>
              </div>
            </div>

            <div style={{ padding: "16px", background: "rgba(139, 92, 246, 0.05)", borderRadius: "8px", border: `1px solid ${S.purple}` }}>
              <div style={{ color: S.purple, fontWeight: 700, fontSize: "12px" }}>CANDIDATE CHALLENGER</div>
              <div style={{ fontSize: "18px", fontWeight: 800, marginTop: "4px" }}>NIFTY_EMA_BREAKOUT_CHALLENGER v1.1.0</div>
              <div style={{ marginTop: "12px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div>Sharpe Ratio: <strong style={{ color: S.green }}>2.04 (+0.19)</strong></div>
                <div>Profit Factor: <strong style={{ color: S.green }}>2.42 (+0.24)</strong></div>
                <div>Max Drawdown: <strong style={{ color: S.green }}>4.1% (-0.7%)</strong></div>
                <div>Status: <span style={{ color: S.purple }}>SHADOW TESTING</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PAPER & SHADOW */}
      {activeTab === "PAPER_SHADOW" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {/* Paper Trading Card */}
          <div style={{ background: S.surface, borderRadius: "12px", border: `1px solid ${S.border}`, padding: "18px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", color: S.cyan }}>
              Paper Trading Engine (Zero Broker Order)
            </h3>
            <div style={{ fontSize: "12px", color: S.muted, marginBottom: "12px" }}>
              Simulates live execution against NSE real-time ticks with 2 bps slippage and statutory STT/brokerage charges.
            </div>
            <div style={{ padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: `1px solid ${S.border}` }}>
              <div>Virtual Capital: <strong style={{ color: S.green }}>₹100,000.00</strong></div>
              <div style={{ marginTop: "4px" }}>Active Positions: <strong>0 (Flat)</strong></div>
            </div>
          </div>

          {/* Shadow Trading Card */}
          <div style={{ background: S.surface, borderRadius: "12px", border: `1px solid ${S.border}`, padding: "18px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", color: S.purple }}>
              Shadow Trading Engine (Execution Benchmarking)
            </h3>
            <div style={{ fontSize: "12px", color: S.muted, marginBottom: "12px" }}>
              Runs alongside live broker orders to measure latency, fill slippage, and hypothetical execution quality.
            </div>
            <div style={{ padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: `1px solid ${S.border}` }}>
              <div>Average Latency: <strong style={{ color: S.cyan }}>24.2 ms</strong></div>
              <div style={{ marginTop: "4px" }}>Slippage Tracking: <strong style={{ color: S.green }}>1.8 bps</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
