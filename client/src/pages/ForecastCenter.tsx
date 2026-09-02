import React, { useEffect, useState, useCallback } from "react";
import { useAppStore } from "../store/useAppStore";
import { useIsMobile } from "../hooks/useMediaQuery";
import {
  Brain, RefreshCw, TrendingUp, TrendingDown, Minus,
  Zap, Shield, Activity, BarChart3, AlertTriangle, CheckCircle, Target
} from "lucide-react";

const SYMBOLS   = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "AVAXUSDT", "XRPUSDT"];
const INTERVALS = ["1m", "5m", "15m", "1h", "4h"];

const S = {
  bg:      "#0B1220",
  surface: "#0f172a",
  card:    "#111827",
  border:  "rgba(255,255,255,0.06)",
  muted:   "#64748b",
  text:    "#f1f5f9",
  green:   "#10b981",
  red:     "#f43f5e",
  amber:   "#f59e0b",
  cyan:    "#06b6d4",
  purple:  "#8b5cf6",
  blue:    "#3b82f6",
};

const MODEL_COLORS: Record<string, string> = {
  XGBoost:         S.cyan,
  LightGBM:        S.blue,
  "transformer-v1": S.purple,
  "xlstm-v1":      "#ec4899",
  "cnn-lstm-v1":   S.amber,
  "mamba-v2-research": "#f97316",
  "mamba-hybrid":  "#14b8a6",
  PPO:             S.green,
  "micro-cnn":     "#a78bfa",
};

function modelColor(name: string) {
  for (const [k, v] of Object.entries(MODEL_COLORS)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return S.cyan;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: "9px", fontWeight: 700, color: S.muted, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "6px" }}>{children}</div>;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: "10px", padding: "14px", ...style }}>
      {children}
    </div>
  );
}

function ProbArc({ prob, color, size = 100 }: { prob: number; color: string; size?: number }) {
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const fill = circ * Math.min(Math.max(prob, 0), 1);
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size * 0.08} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.08}
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={size * 0.18} fontWeight={900} fontFamily="monospace">
        {Math.round(prob * 100)}%
      </text>
    </svg>
  );
}

function Bar({ fill, color, height = 6 }: { fill: number; color: string; height?: number }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "999px", overflow: "hidden", height }}>
      <div style={{ width: `${Math.min(Math.max(fill * 100, 0), 100)}%`, height: "100%", background: color, transition: "width 0.6s ease", borderRadius: "999px" }} />
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: ok ? S.green : S.red, boxShadow: ok ? "0 0 6px rgba(16,185,129,0.5)" : "0 0 6px rgba(244,63,94,0.5)", flexShrink: 0 }} />;
}

function Row({ label, value, color = S.text }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", padding: "3px 0" }}>
      <span style={{ color: S.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

export default function ForecastCenter() {
  const { userId, selectedSymbol } = useAppStore();
  const isMobile = useIsMobile();
  const twoCol = isMobile ? "1fr" : "1fr 1fr";
  const [symbol, setSymbol]     = useState(selectedSymbol || "BTCUSDT");
  const [interval, setInterval] = useState("5m");
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetch_ = useCallback(async (silent = false) => {
    if (!silent && !data) setLoading(true);
    setError(null);
    try {
      const url = userId
        ? `/trading/ensemble-report?symbol=${symbol}&interval=${interval}&limit=200&userId=${userId}`
        : `/trading/ensemble-report?symbol=${symbol}&interval=${interval}&limit=200`;
      const res = await fetch(url);
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `Server error ${res.status}`); }
      setData(await res.json());
      setLastFetch(new Date());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [symbol, interval, userId, data]);

  useEffect(() => { 
    fetch_();
    const timer = window.setInterval(() => {
      void fetch_(true);
    }, 15000);
    return () => {
      window.clearInterval(timer);
    };
  }, [fetch_]);

  const models: any[]   = data?.models ?? [];
  const pulse: any      = data?.marketPulse ?? {};
  const risk: any       = data?.riskSizing ?? {};
  const sl: any         = data?.selfLearning ?? null;
  const regime: string  = data?.regime ?? "Unknown";
  const longP: number   = data?.longProbability ?? 0;
  const shortP: number  = data?.shortProbability ?? 0;
  const conf: number    = data?.confidence ?? 0;
  const expRet: number  = data?.expectedReturn ?? 0;
  const expDD: number   = data?.expectedDrawdown ?? 0;

  const verdict = longP > 0.55 ? "LONG" : shortP > 0.55 ? "SHORT" : "NEUTRAL";
  const verdictColor = verdict === "LONG" ? S.green : verdict === "SHORT" ? S.red : S.amber;

  const formatPct = (n: number, dp = 2) => `${(n * 100).toFixed(dp)}%`;
  const formatNum = (n: number, dp = 4) => (n == null ? "—" : n.toFixed(dp));

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: S.bg, overflowY: "auto", minHeight: "100%" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>

      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${S.border}`, display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", background: S.surface, flexShrink: 0, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Brain size={16} color={S.purple} />
          <span style={{ fontSize: "12px", fontWeight: 800, color: S.text, textTransform: "uppercase", letterSpacing: "0.08em" }}>AI Prediction Engine</span>
        </div>

        {/* Symbol */}
        <select value={symbol} onChange={(e) => { setSymbol(e.target.value); setData(null); }} style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "#1e293b", border: `1px solid ${S.border}`, color: S.text, outline: "none", cursor: "pointer" }}>
          {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
        </select>

        {/* Interval */}
        <div style={{ display: "flex", gap: "3px" }}>
          {INTERVALS.map((iv) => (
            <button key={iv} onClick={() => { setInterval(iv); setData(null); }} style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, border: "none", cursor: "pointer", background: interval === iv ? S.purple : "rgba(255,255,255,0.05)", color: interval === iv ? "#fff" : S.muted }}>
              {iv}
            </button>
          ))}
        </div>

        <button onClick={() => fetch_(false)} disabled={loading} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "6px", border: "none", background: S.purple, color: "#fff", fontSize: "11px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }} />
          {loading ? "Fetching..." : "Refresh"}
        </button>

        {lastFetch && <span style={{ fontSize: "10px", color: S.muted }}>Updated {lastFetch.toLocaleTimeString()}</span>}
      </div>

      {error && (
        <div style={{ margin: "12px 16px", padding: "10px 14px", background: "rgba(244,63,94,0.1)", border: `1px solid ${S.red}`, borderRadius: "8px", color: S.red, fontSize: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {!data && !loading && !error && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px", padding: "60px" }}>
          <Brain size={40} color="rgba(255,255,255,0.08)" />
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.18)" }}>Loading AI predictions...</div>
        </div>
      )}

      {data && (
        <div style={{ padding: "16px", display: "grid", gridTemplateColumns: twoCol, gap: "12px" }}>

          {/* Row 1: Verdict + Regime */}
          <Card>
            <Label>AI Consensus Verdict</Label>
            <div style={{ display: "flex", alignItems: "center", gap: "20px", margin: "8px 0" }}>
              <ProbArc prob={longP} color={S.green} size={96} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "28px", fontWeight: 900, color: verdictColor, lineHeight: 1, marginBottom: "4px" }}>{verdict}</div>
                <div style={{ fontSize: "11px", color: S.muted, marginBottom: "8px" }}>
                  {models.length} model{models.length !== 1 ? "s" : ""} voting
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                    <span style={{ color: S.green }}>LONG {formatPct(longP, 0)}</span>
                    <span style={{ color: S.red }}>SHORT {formatPct(shortP, 0)}</span>
                  </div>
                  <Bar fill={longP} color={S.green} height={6} />
                </div>
                <div style={{ marginTop: "10px" }}>
                  <Row label="Confidence" value={formatPct(conf, 0)} color={conf > 0.7 ? S.green : S.amber} />
                  <Row label="Expected Return" value={formatPct(expRet, 2)} color={expRet >= 0 ? S.green : S.red} />
                  <Row label="Expected Drawdown" value={formatPct(expDD, 2)} color={S.red} />
                </div>
              </div>
            </div>
          </Card>

          {/* Regime */}
          <Card>
            <Label>Market Regime</Label>
            <div style={{ fontSize: "20px", fontWeight: 900, color: regime.toLowerCase().includes("bull") ? S.green : regime.toLowerCase().includes("bear") ? S.red : S.amber, textTransform: "uppercase", margin: "8px 0 12px", letterSpacing: "0.04em" }}>
              {regime}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginBottom: "4px" }}>
                  <span style={{ color: S.muted }}>Regime Score</span>
                  <span style={{ color: S.cyan, fontWeight: 700 }}>{formatPct(data.regimeScore ?? 0, 0)}</span>
                </div>
                <Bar fill={data.regimeScore ?? 0} color={S.cyan} height={5} />
              </div>
              <div style={{ marginTop: "8px" }}>
                <Row label="Order Book Imbalance" value={formatNum(pulse.orderBookImbalance, 3)} color={pulse.orderBookImbalance > 0 ? S.green : S.red} />
                <Row label="Volatility Score" value={formatPct(pulse.volatilityScore ?? 0, 2)} color={(pulse.volatilityScore ?? 0) > 0.05 ? S.red : S.green} />
                <Row label="Liquidity Pulse" value={formatPct(pulse.liquidityPulse ?? 0, 0)} color={S.cyan} />
                <Row label="Funding Rate" value={formatNum(pulse.fundingRate, 4)} color={(pulse.fundingRate ?? 0) > 0 ? S.green : S.red} />
              </div>
            </div>
          </Card>

          {/* Model Votes — full width */}
          <Card style={{ gridColumn: "1 / -1" }}>
            <Label>Model Vote Breakdown ({models.length} models)</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "10px", marginTop: "8px" }}>
              {models.map((m, i) => {
                const col = modelColor(m.modelName);
                const longPct = m.longProbability ?? 0.5;
                const shortPct = m.shortProbability ?? 0.5;
                const direction = longPct > 0.55 ? "LONG" : shortPct > 0.55 ? "SHORT" : "NEUTRAL";
                const dirColor = direction === "LONG" ? S.green : direction === "SHORT" ? S.red : S.amber;
                return (
                  <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${S.border}`, borderRadius: "8px", padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: col }}>{m.modelName}</div>
                        <div style={{ fontSize: "9px", color: S.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.category}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "13px", fontWeight: 900, color: dirColor }}>{direction}</div>
                        <div style={{ fontSize: "9px", color: S.muted }}>w={m.weight?.toFixed(2)}</div>
                      </div>
                    </div>
                    {/* Long/Short bar */}
                    <div style={{ display: "flex", gap: "2px", height: "8px", borderRadius: "4px", overflow: "hidden", marginBottom: "6px" }}>
                      <div style={{ width: `${longPct * 100}%`, background: S.green, transition: "width 0.5s ease" }} />
                      <div style={{ width: `${shortPct * 100}%`, background: S.red, transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: S.muted }}>
                      <span style={{ color: S.green }}>L {formatPct(longPct, 0)}</span>
                      <span>Conf {formatPct(m.confidence ?? 0, 0)}</span>
                      <span style={{ color: S.red }}>S {formatPct(shortPct, 0)}</span>
                    </div>
                    {m.notes && <div style={{ fontSize: "9px", color: S.muted, marginTop: "5px", lineHeight: 1.4, borderTop: `1px solid ${S.border}`, paddingTop: "5px" }}>{m.notes.slice(0, 80)}</div>}
                  </div>
                );
              })}
              {!models.length && (
                <div style={{ gridColumn: "1/-1", padding: "20px", textAlign: "center", color: S.muted, fontSize: "12px" }}>
                  No model data available — check Quant Engine status
                </div>
              )}
            </div>
          </Card>

          {/* Risk Sizing */}
          <Card>
            <Label>Risk Sizing Recommendation</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
              <div>
                <div style={{ fontSize: "11px", color: S.muted, marginBottom: "4px" }}>Recommended Position %</div>
                <div style={{ fontSize: "24px", fontWeight: 900, color: S.cyan, fontFamily: "monospace" }}>{formatPct(risk.recommendedPositionPct ?? 0, 1)}</div>
                <Bar fill={risk.recommendedPositionPct ?? 0} color={S.cyan} height={5} />
              </div>
              <Row label="Kelly Criterion" value={formatPct(risk.kellyPct ?? 0, 2)} color={S.amber} />
              <Row label="Volatility-Adjusted" value={formatPct(risk.volatilityAdjustedPct ?? 0, 2)} color={S.purple} />
              <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: "8px", marginTop: "4px" }}>
                <Row label="Max Daily DD" value={`${risk.maxDailyDrawdownPct ?? 3}%`} color={S.red} />
                <Row label="Max Weekly DD" value={`${risk.maxWeeklyDrawdownPct ?? 7}%`} color={S.red} />
                <Row label="Max Monthly DD" value={`${risk.maxMonthlyDrawdownPct ?? 15}%`} color={S.red} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "6px", background: risk.emergencyKillActive ? "rgba(244,63,94,0.1)" : "rgba(16,185,129,0.08)", border: `1px solid ${risk.emergencyKillActive ? S.red : S.green}`, marginTop: "4px" }}>
                <StatusDot ok={!risk.emergencyKillActive} />
                <span style={{ fontSize: "11px", fontWeight: 700, color: risk.emergencyKillActive ? S.red : S.green }}>
                  {risk.emergencyKillActive ? "KILL SWITCH ACTIVE" : "Kill Switch OK"}
                </span>
              </div>
            </div>
          </Card>

          {/* Self-Learning */}
          {sl && (
            <Card>
              <Label>Self-Learning Meta Status</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                {[
                  { label: "Weekly Retrain", ok: sl.retrainWeekly, positive: true },
                  { label: "Strategy Decay", ok: sl.strategyDecayDetected, positive: false },
                  { label: "Regime Change", ok: sl.regimeChangeDetected, positive: false },
                  { label: "Overfitting Risk", ok: sl.overfittingRisk, positive: false },
                ].map(({ label, ok, positive }) => {
                  const isGood = positive ? ok : !ok;
                  return (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <StatusDot ok={isGood} />
                      <span style={{ fontSize: "11px", color: S.text, flex: 1 }}>{label}</span>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: isGood ? S.green : S.red }}>{ok ? "YES" : "NO"}</span>
                    </div>
                  );
                })}
                {sl.notes?.length > 0 && (
                  <div style={{ marginTop: "8px", borderTop: `1px solid ${S.border}`, paddingTop: "8px" }}>
                    <Label>Notes</Label>
                    {sl.notes.slice(0, 4).map((n: string, i: number) => (
                      <div key={i} style={{ fontSize: "10px", color: S.muted, lineHeight: 1.5, display: "flex", gap: "6px", alignItems: "flex-start" }}>
                        <span style={{ color: S.purple, flexShrink: 0 }}>›</span>{n}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Market Pulse Detail */}
          <Card style={sl ? {} : { gridColumn: "1 / -1" }}>
            <Label>Market Pulse Detail</Label>
            <div style={{ display: "grid", gridTemplateColumns: twoCol, gap: "10px", marginTop: "8px" }}>
              {[
                { label: "VWAP", value: `$${(pulse.vwap ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`, color: S.text },
                { label: "Open Interest", value: pulse.openInterest ? `$${(pulse.openInterest / 1e6).toFixed(0)}M` : "—", color: S.cyan },
                { label: "Funding Rate", value: formatNum(pulse.fundingRate, 5), color: (pulse.fundingRate ?? 0) > 0 ? S.green : S.red },
                { label: "OB Imbalance", value: formatNum(pulse.orderBookImbalance, 3), color: (pulse.orderBookImbalance ?? 0) > 0 ? S.green : S.red },
                { label: "Volatility Score", value: formatPct(pulse.volatilityScore ?? 0, 2), color: (pulse.volatilityScore ?? 0) > 0.05 ? S.red : S.green },
                { label: "Liquidity Pulse", value: formatPct(pulse.liquidityPulse ?? 0, 1), color: S.cyan },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: "8px 10px", borderRadius: "6px", background: "rgba(255,255,255,0.02)", border: `1px solid ${S.border}` }}>
                  <div style={{ fontSize: "9px", color: S.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>{label}</div>
                  <div style={{ fontSize: "15px", fontWeight: 800, color, fontFamily: "monospace" }}>{value}</div>
                </div>
              ))}
            </div>
          </Card>

        </div>
      )}
    </div>
  );
}
