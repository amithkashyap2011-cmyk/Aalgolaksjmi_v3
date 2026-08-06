import React, { useState, useEffect } from "react";
import { INITIAL_SUMMARY, useDashboardStore } from "../../store/useDashboardStore";
import { ChevronLeft, ChevronRight, Activity, Zap } from "lucide-react";
import clsx from "clsx";

export default function SignalPanel() {
  const [isOpen, setIsOpen] = useState(() => {
    try { return localStorage.getItem("signalPanelOpen") !== "false"; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem("signalPanelOpen", String(isOpen)); } catch {}
  }, [isOpen]);

  const summary = useDashboardStore((s) => s.summary) ?? INITIAL_SUMMARY;
  const positions = useDashboardStore((s) => s.positions) || [];
  const logs = useDashboardStore((s) => s.logs) || [];

  const recentLogs = logs.slice(0, 5);
  const confidence = recentLogs.length > 0
    ? Math.round(recentLogs.reduce((sum: number, log: any) => sum + (log.score || 0), 0) / recentLogs.length)
    : 0;

  const regime = summary.regime || {};
  const heat = summary.currentExposure || 0;
  const direction = (regime.direction || "SIDEWAYS").replace(/_/g, " ");
  const strength = regime.strength || 0;
  const consensus = regime.consensus || 0;
  const riskState = regime.riskState || "NORMAL";
  const forecast = regime.forecast || "N/A";

  const regimeColor = direction.includes("BULL") ? "#10b981" : direction.includes("BEAR") ? "#f43f5e" : "#f59e0b";
  const riskColor = heat > 40 ? "#f43f5e" : heat > 20 ? "#f59e0b" : "#10b981";

  // Panel is a flex column sibling — width drives layout push, not overlay
  return (
    <aside
      className="d-none d-lg-flex flex-column h-screen position-sticky top-0 shrink-0 transition-all duration-300"
      style={{
        width: isOpen ? "280px" : "48px",
        backgroundColor: "#0B1220",
        borderLeft: "1px solid rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}
    >
      {/* Header / Toggle */}
      <div
        style={{
          height: "52px",
          display: "flex",
          alignItems: "center",
          justifyContent: isOpen ? "space-between" : "center",
          padding: isOpen ? "0 12px" : "0",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        {isOpen && (
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            AI Signals
          </span>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          title={isOpen ? "Collapse panel" : "Expand panel"}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: "4px", display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
        >
          {isOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Content — only visible when open */}
      {isOpen && (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>

          {/* AI Confidence */}
          <Card>
            <Label>AI Confidence</Label>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", margin: "6px 0 8px" }}>
              <span style={{ fontSize: "28px", fontWeight: 900, color: "#06b6d4", lineHeight: 1 }}>{confidence}%</span>
              <Zap size={14} color="#06b6d4" style={{ marginBottom: "2px" }} />
            </div>
            <Bar fill={confidence} color="#06b6d4" />
          </Card>

          {/* Market Regime */}
          <Card>
            <Label>Market Regime</Label>
            <div style={{ fontSize: "13px", fontWeight: 800, color: regimeColor, textTransform: "uppercase", margin: "6px 0 10px", letterSpacing: "0.05em" }}>
              {direction}
            </div>
            <Row label="Trend Strength" value={`${strength}%`} />
            <Bar fill={strength} color={regimeColor} />
            <div style={{ marginTop: "8px" }} />
            <Row label="Consensus" value={`${consensus}%`} />
            <Bar fill={consensus} color="#06b6d4" />
          </Card>

          {/* Active Signals */}
          <Card>
            <Label>Active Signals</Label>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", margin: "6px 0 4px" }}>
              <span style={{ fontSize: "24px", fontWeight: 900, color: "#06b6d4", lineHeight: 1 }}>{positions.length}</span>
              <Activity size={14} color="#06b6d4" style={{ marginBottom: "2px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>
              {positions.length === 0 ? "No open positions" : `${positions.length} position${positions.length > 1 ? "s" : ""} monitored`}
            </div>
          </Card>

          {/* Auto-Trading */}
          <Card>
            <Label>Auto-Trading</Label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#10b981", display: "inline-block", boxShadow: "0 0 6px rgba(16,185,129,0.6)" }} />
              <span style={{ fontSize: "13px", fontWeight: 800, color: "#10b981" }}>ENABLED</span>
            </div>
            <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>Live decision feed active</div>
          </Card>

          {/* Portfolio Heat */}
          <Card>
            <Label>Portfolio Heat</Label>
            <div style={{ fontSize: "24px", fontWeight: 900, color: riskColor, margin: "6px 0 8px", lineHeight: 1 }}>
              {heat.toFixed(1)}%
            </div>
            <Bar fill={Math.min(heat, 100)} color={riskColor} height={6} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
              <span style={{ fontSize: "10px", color: "#64748b" }}>Risk Level</span>
              <span style={{ fontSize: "10px", fontWeight: 700, color: riskColor }}>
                {heat > 40 ? "CRITICAL" : heat > 20 ? "ELEVATED" : "SAFE"}
              </span>
            </div>
          </Card>

          {/* System Status */}
          <Card>
            <Label>System Status</Label>
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <Row label="Risk State" value={riskState} valueColor={riskState === "ELEVATED" ? "#f59e0b" : "#10b981"} />
              <Row label="Forecast" value={forecast} />
            </div>
          </Card>

        </div>
      )}
    </aside>
  );
}

/* ── Sub-components (inline, no extra files) ── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "12px" }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
      {children}
    </div>
  );
}

function Bar({ fill, color, height = 4 }: { fill: number; color: string; height?: number }) {
  return (
    <div style={{ width: "100%", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "999px", overflow: "hidden", height: `${height}px` }}>
      <div style={{ width: `${Math.min(Math.max(fill, 0), 100)}%`, height: "100%", backgroundColor: color, transition: "width 0.5s ease", borderRadius: "999px" }} />
    </div>
  );
}

function Row({ label, value, valueColor = "#f1f5f9" }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ fontWeight: 700, color: valueColor }}>{value}</span>
    </div>
  );
}
