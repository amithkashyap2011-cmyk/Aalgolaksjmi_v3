import React, { useState, useRef } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { useAppStore } from "../store/useAppStore";
import { useIsMobile } from "../hooks/useMediaQuery";
import { Play, RotateCcw, TrendingUp, TrendingDown, BarChart3, Target, Zap, Shield } from "lucide-react";

const STRATEGIES = [
  { id: "LAKSHMI",     label: "Lakshmi",      desc: "Master: risk allocation + Ohmkara gate",          tag: "MASTER"  },
  { id: "OHMKARA",    label: "Ohmkara",      desc: "OM octave resonance — high-precision entry",       tag: "NEW"     },
  { id: "AARYAN",     label: "Aaryan",       desc: "EMA/MACD trend-following core",                    tag: "CORE"    },
  { id: "AAYUSH",     label: "Aayush",       desc: "Online RL / PPO reinforcement agent",              tag: "RL"      },
  { id: "GAYATRI",    label: "Gayatri",      desc: "RSI + Bollinger mean-reversion signal",            tag: "SIGNAL"  },
  { id: "CNN",        label: "CNN Signal",   desc: "1-D CNN — institutional pattern recognition (V8)", tag: "AI"      },
  { id: "TRANSFORMER",label: "Transformer",  desc: "Attention micro model — multi-step prediction",    tag: "AI"      },
  { id: "MAMBA",      label: "Mamba",        desc: "State-space research model — shadow vote only",    tag: "SHADOW"  },
  { id: "ENSEMBLE",   label: "Ensemble",     desc: "Local indicator voting fusion (no quant)",         tag: "FUSION"  },
  { id: "HYBRID_AKS", label: "Hybrid AKS",  desc: "Regime-aware fusion: all named + AI models",       tag: "HYBRID"  },
];

const SYMBOLS   = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "AVAXUSDT"];
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

const S = {
  bg:      "#0B1220",
  surface: "#0f172a",
  border:  "rgba(255,255,255,0.06)",
  muted:   "#64748b",
  text:    "#f1f5f9",
  green:   "#10b981",
  red:     "#f43f5e",
  amber:   "#f59e0b",
  cyan:    "#06b6d4",
  blue:    "#3b82f6",
  purple:  "#8b5cf6",
};

const selectStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", borderRadius: "6px",
  fontSize: "12px", fontWeight: 600,
  background: S.surface, border: `1px solid ${S.border}`,
  color: S.text, marginTop: "4px", outline: "none", cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", borderRadius: "6px",
  fontSize: "12px", fontWeight: 600,
  background: S.surface, border: `1px solid ${S.border}`,
  color: S.text, outline: "none", boxSizing: "border-box",
};

function fmt$(n: number) {
  const abs = `$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return n >= 0 ? `+${abs}` : `-${abs}`;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "9px", fontWeight: 700, color: S.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>
      {children}
    </div>
  );
}

function MetricCell({ label, value, color, icon }: { label: string; value: string; color: string; icon?: React.ReactNode }) {
  return (
    <div style={{ padding: "12px 20px", borderRight: `1px solid ${S.border}`, flexShrink: 0 }}>
      <div style={{ fontSize: "9px", fontWeight: 700, color: S.muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
        {icon && <span style={{ color }}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize: "18px", fontWeight: 900, color, fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function Spinner() {
  return <div style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid rgba(0,0,0,0.25)", borderTopColor: "#000", animation: "spin 0.6s linear infinite" }} />;
}

export default function BacktestPage() {
  const { selectedSymbol } = useAppStore();
  const isMobile = useIsMobile();
  const [symbol, setSymbol] = useState(selectedSymbol || "BTCUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2024-12-31");
  const [capital, setCapital] = useState(10000);
  const [strategies, setStrategies] = useState<Set<string>>(new Set(["LAKSHMI"]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  const toggleStrategy = (id: string) => {
    setStrategies((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const run = async () => {
    if (!strategies.size) { setError("Select at least one strategy"); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe, startDate, endDate, strategies: Array.from(strategies), initialCapital: capital }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `Error ${res.status}`); }
      setResult(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const metrics: any = result?.metrics ?? null;
  const curve: { ts: number; value: number }[] = result?.equityCurve ?? [];
  const trades: any[] = result?.trades ?? [];
  const finalEquity = curve.length ? curve[curve.length - 1].value : capital;
  const netPnl = finalEquity - capital;

  const chartOptions: Highcharts.Options = {
    chart: { type: "area", backgroundColor: S.surface, height: 260, animation: { duration: 700 } },
    title: { text: undefined }, credits: { enabled: false }, legend: { enabled: false },
    xAxis: {
      type: "datetime",
      labels: { style: { color: S.muted, fontSize: "10px" } },
      lineColor: S.border, tickColor: S.border,
    },
    yAxis: {
      title: { text: undefined },
      labels: { style: { color: S.muted, fontSize: "10px" }, formatter() { return `$${(this.value as number).toLocaleString()}`; } },
      gridLineColor: S.border,
    },
    tooltip: {
      backgroundColor: "#1e293b", borderColor: S.border, style: { color: S.text, fontSize: "11px" },
      formatter() { return `<b>${fmtDate(this.x as number)}</b><br/>Equity: <b>$${(this.y as number).toLocaleString("en-US", { maximumFractionDigits: 0 })}</b>`; },
    },
    series: [{
      type: "area", name: "Equity",
      data: curve.map((p) => [p.ts, p.value]),
      color: S.cyan,
      fillColor: { linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 }, stops: [[0, "rgba(6,182,212,0.18)"], [1, "rgba(6,182,212,0)"]] },
      lineWidth: 2, marker: { enabled: false },
    }],
  };

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: isMobile ? "auto" : "100%", minHeight: isMobile ? "100%" : undefined, background: S.bg, overflow: isMobile ? "visible" : "hidden" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>

      {/* Left Config */}
      <div style={{ width: isMobile ? "100%" : "256px", flexShrink: 0, borderRight: isMobile ? "none" : `1px solid ${S.border}`, borderBottom: isMobile ? `1px solid ${S.border}` : "none", display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden" }}>
        {/* Header */}
        <div style={{ padding: "13px 14px", borderBottom: `1px solid ${S.border}`, display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <BarChart3 size={15} color={S.amber} />
          <span style={{ fontSize: "11px", fontWeight: 800, color: S.text, textTransform: "uppercase", letterSpacing: "0.08em" }}>Backtest Engine</span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Symbol */}
          <div>
            <FieldLabel>Symbol</FieldLabel>
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={selectStyle}>
              {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Timeframe */}
          <div>
            <FieldLabel>Timeframe</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
              {TIMEFRAMES.map((tf) => (
                <button key={tf} onClick={() => setTimeframe(tf)} style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, cursor: "pointer", border: "none", background: timeframe === tf ? S.amber : "rgba(255,255,255,0.05)", color: timeframe === tf ? "#000" : S.muted }}>
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div>
            <FieldLabel>Date Range</FieldLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Capital */}
          <div>
            <FieldLabel>Initial Capital (USD)</FieldLabel>
            <input type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value))} style={{ ...inputStyle, marginTop: "6px" }} min={100} step={1000} />
          </div>

          {/* Strategies */}
          <div>
            <FieldLabel>AI Strategies</FieldLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginTop: "6px" }}>
              {STRATEGIES.map((s) => {
                const on = strategies.has(s.id);
                const tagColor: Record<string, string> = { MASTER: S.cyan, NEW: S.purple, CORE: S.blue, RL: S.green, SIGNAL: S.amber, FUSION: "#f97316", HYBRID: "#ec4899", AI: "#06b6d4", SHADOW: "#475569" };
                const tc = tagColor[s.tag] ?? S.muted;
                return (
                  <button key={s.id} onClick={() => toggleStrategy(s.id)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "7px 10px", borderRadius: "6px", cursor: "pointer", textAlign: "left", border: `1px solid ${on ? S.amber : S.border}`, background: on ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.02)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: on ? S.amber : S.text, flex: 1 }}>{s.label}</span>
                      <span style={{ fontSize: "8px", fontWeight: 800, color: tc, background: `${tc}18`, padding: "1px 5px", borderRadius: "3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.tag}</span>
                    </div>
                    <span style={{ fontSize: "9px", color: S.muted, marginTop: "2px" }}>{s.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Run */}
        <div style={{ padding: "12px", borderTop: `1px solid ${S.border}`, flexShrink: 0 }}>
          <button onClick={run} disabled={loading} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "none", background: loading ? "rgba(245,158,11,0.4)" : S.amber, color: "#000", fontWeight: 800, fontSize: "12px", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {loading ? <><Spinner /> Running...</> : <><Play size={13} /> Run Backtest</>}
          </button>
          {result && (
            <button onClick={() => setResult(null)} style={{ width: "100%", marginTop: "6px", padding: "6px", borderRadius: "6px", border: `1px solid ${S.border}`, background: "none", color: S.muted, fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
              <RotateCcw size={11} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Right Results */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden", minHeight: isMobile ? "70vh" : undefined }}>

        {error && (
          <div style={{ margin: "12px 16px 0", padding: "10px 14px", background: "rgba(244,63,94,0.1)", border: `1px solid ${S.red}`, borderRadius: "8px", color: S.red, fontSize: "12px" }}>
            {error}
          </div>
        )}

        {!result && !loading && !error && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px" }}>
            <BarChart3 size={44} color="rgba(255,255,255,0.08)" />
            <div style={{ fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.18)" }}>Configure &amp; Run a Backtest</div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.1)", textAlign: "center", maxWidth: "260px" }}>
              Select symbol · timeframe · date range · strategy, then click Run Backtest.
            </div>
          </div>
        )}

        {loading && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "14px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "50%", border: `3px solid ${S.border}`, borderTopColor: S.amber, animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: "12px", color: S.muted }}>Fetching historical data &amp; running strategy...</div>
          </div>
        )}

        {result && (
          <>
            {/* Metrics Strip */}
            <div style={{ display: "flex", borderBottom: `1px solid ${S.border}`, flexShrink: 0, overflowX: "auto" }}>
              <MetricCell label="Net PnL" value={fmt$(netPnl)} color={netPnl >= 0 ? S.green : S.red} icon={netPnl >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} />
              <MetricCell label="CAGR" value={`${metrics.cagr}%`} color={metrics.cagr >= 0 ? S.green : S.red} />
              <MetricCell label="Win Rate" value={`${metrics.winRate}%`} color={metrics.winRate >= 50 ? S.green : S.amber} icon={<Target size={13} />} />
              <MetricCell label="Profit Factor" value={metrics.profitFactor >= 999 ? "∞" : String(metrics.profitFactor)} color={metrics.profitFactor >= 1.5 ? S.green : S.amber} />
              <MetricCell label="Max Drawdown" value={`-${metrics.maxDD}%`} color={S.red} icon={<Shield size={13} />} />
              <MetricCell label="Sharpe" value={String(metrics.sharpeEst)} color={metrics.sharpeEst >= 1 ? S.green : S.amber} icon={<Zap size={13} />} />
              <MetricCell label="Trades" value={String(metrics.totalTrades)} color={S.cyan} />
            </div>

            {/* Equity Curve */}
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${S.border}`, flexShrink: 0 }}>
              <div style={{ fontSize: "9px", fontWeight: 700, color: S.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                Equity Curve · {symbol} · {timeframe} · {Array.from(strategies).join(" + ")}
              </div>
              <HighchartsReact highcharts={Highcharts} options={chartOptions} ref={chartRef} />
            </div>

            {/* Trade Log */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 16px", borderBottom: `1px solid ${S.border}`, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "9px", fontWeight: 700, color: S.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Trade Log ({trades.length})</span>
                <span style={{ fontSize: "10px", color: S.muted }}>
                  {trades.filter((t) => t.pnl > 0).length}W · {trades.filter((t) => t.pnl <= 0).length}L
                </span>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${S.border}` }}>
                      {["Time", "Side", "Entry", "Exit", "P&L", ""].map((h, i) => (
                        <th key={i} style={{ padding: "6px 14px", textAlign: "left", fontSize: "9px", fontWeight: 700, color: S.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trades.slice(0, 200).map((t, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <td style={{ padding: "5px 14px", color: S.muted, fontFamily: "monospace", fontSize: "10px" }}>{fmtTime(t.openedAt)}</td>
                        <td style={{ padding: "5px 14px" }}>
                          <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "9px", fontWeight: 700, background: t.side === "BUY" ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)", color: t.side === "BUY" ? S.green : S.red }}>
                            {t.side}
                          </span>
                        </td>
                        <td style={{ padding: "5px 14px", color: S.text, fontFamily: "monospace" }}>${Number(t.entry).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: "5px 14px", color: S.text, fontFamily: "monospace" }}>${Number(t.exit).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: "5px 14px", fontFamily: "monospace", fontWeight: 700, color: t.pnl >= 0 ? S.green : S.red }}>
                          {t.pnl >= 0 ? "+" : "−"}${Math.abs(t.pnl).toFixed(2)}
                        </td>
                        <td style={{ padding: "5px 14px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.pnl >= 0 ? S.green : S.red }} />
                        </td>
                      </tr>
                    ))}
                    {!trades.length && (
                      <tr>
                        <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: S.muted, fontSize: "12px" }}>
                          No trades generated for this configuration
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
