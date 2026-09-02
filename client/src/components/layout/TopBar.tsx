import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { INITIAL_SUMMARY, useDashboardStore } from "../../store/useDashboardStore";
import { useAppStore, type Mode, type AccountType } from "../../store/useAppStore";
import { formatCurrency } from "../../lib/currency";
import { hardReset } from "../../lib/api";
import { Menu, Settings, Wifi, WifiOff, RotateCcw } from "lucide-react";

const MODES: { value: Mode; label: string; color: string }[] = [
  { value: "PAPER",    label: "Paper",    color: "#10b981" },
  { value: "LIVE",     label: "Live",     color: "#ef4444" },
  { value: "BACKTEST", label: "Backtest", color: "#f59e0b" },
];

const ACCOUNT_TYPES: { value: AccountType; label: string; color: string }[] = [
  { value: "FUTURES", label: "Futures", color: "#f59e0b" },
  { value: "SPOT",    label: "Spot",    color: "#3b82f6" },
  { value: "BOTH",    label: "Both",    color: "#22c55e" },
];

interface Props { onMenuClick: () => void; }

export default function TopBar({ onMenuClick }: Props) {
  const { mode, setMode, connected, accountType, setAccountType } = useAppStore();
  const { userId } = useAppStore();
  const { currencyMode, fetchDashboard } = useDashboardStore();
  const summary = useDashboardStore((s) => s.summary) ?? INITIAL_SUMMARY;
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) return;
    const go = () => fetchDashboard(userId, accountType).catch(() => {});
    go();
    const t = setInterval(go, 15000);
    return () => clearInterval(t);
  }, [userId, accountType]);

  const inrRate = summary.inrRate || 85.0;
  const activeMode = MODES.find((m) => m.value === mode) ?? MODES[0];
  const dailyPnl = summary.dailyPnL ?? 0;

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState("");

  const handleReset = async () => {
    setResetLoading(true);
    try {
      await hardReset();
      await useAppStore.getState().boot();
      if (userId) await fetchDashboard(userId, accountType);
      setResetSuccess("Reset successful! All old data purged.");
      setTimeout(() => {
        setResetSuccess("");
        setResetModalOpen(false);
      }, 1400);
    } catch (err: any) {
      alert("Reset failed: " + (err?.message || err));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <header style={{ height:48, background:"linear-gradient(180deg,#16213c,#101a30)", borderBottom:"2px solid #3b82f6", boxShadow:"0 2px 10px rgba(0,0,0,0.4)", display:"flex", alignItems:"center", paddingLeft:12, paddingRight:12, gap:12, flexShrink:0, zIndex:20 }}>

      {/* Hamburger — mobile */}
      <button
        onClick={onMenuClick}
        className="flex lg:hidden"
        style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", padding:4, borderRadius:6, flexShrink:0 }}
      >
        <Menu size={18} />
      </button>

      {/* Connection badge */}
      <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
        {connected
          ? <Wifi size={13} style={{ color:"#10b981" }} />
          : <WifiOff size={13} style={{ color:"#ef4444" }} />}
        <span style={{ fontSize:10, fontWeight:700, color: connected ? "#10b981" : "#ef4444", letterSpacing:"0.06em", textTransform:"uppercase" }} className="hidden sm:block">
          {connected ? "Online" : "Offline"}
        </span>
      </div>

      {/* Mode switcher */}
      <div style={{ display:"flex", gap:4, flexShrink:0 }}>
        {MODES.map((m) => {
          const active = mode === m.value;
          return (
            <button
              key={m.value}
              onClick={() => { setMode(m.value); if (m.value === "BACKTEST") navigate("/backtest"); else navigate("/"); }}
              style={{
                padding: "3px 9px", borderRadius:5,
                fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em",
                border:"none", cursor:"pointer",
                background: active ? m.color : "rgba(255,255,255,0.05)",
                color: active ? "#fff" : "#94a3b8",
                transition:"all 0.15s",
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Account type: Spot / Futures */}
      <div style={{ display:"flex", gap:4, flexShrink:0 }} title="Market type">
        {ACCOUNT_TYPES.map((a) => {
          const active = accountType === a.value;
          return (
            <button
              key={a.value}
              onClick={() => setAccountType(a.value)}
              style={{
                padding: "3px 9px", borderRadius:5,
                fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em",
                border: active ? `1px solid ${a.color}` : "1px solid transparent", cursor:"pointer",
                background: active ? `${a.color}22` : "rgba(255,255,255,0.05)",
                color: active ? a.color : "#94a3b8",
                transition:"all 0.15s",
              }}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Metrics — hide on small screens. */}
      <div style={{ flex:1, minWidth:0, alignItems:"center", gap:14, overflowX:"auto", justifyContent:"flex-start", padding:"0 8px" }} className="hidden lg:flex no-scrollbar">
        <Metric label="Equity" value={formatCurrency(summary.totalEquity, { mode: currencyMode, inrRate, compact: true })} title={`Total Equity: ${formatCurrency(summary.totalEquity, { mode: currencyMode, inrRate })}`} />
        <Metric
          label="Daily P&L"
          value={`${dailyPnl >= 0 ? "+" : ""}${formatCurrency(dailyPnl, { mode: currencyMode, inrRate, compact: true })}`}
          color={dailyPnl >= 0 ? "#10b981" : "#ef4444"}
          title={`Daily P&L: ${formatCurrency(dailyPnl, { mode: currencyMode, inrRate })}`}
        />
        {(() => {
          const totP = summary.totalAllTimePnL ?? (((summary as any).netPnL?.total ?? 0) + (summary.openPnL ?? 0));
          return (
            <Metric
              label="Total All-Time P&L"
              value={`${totP >= 0 ? "+" : ""}${formatCurrency(totP, { mode: currencyMode, inrRate, compact: true })}`}
              color={totP >= 0 ? "#10b981" : "#ef4444"}
              title={`Total All-Time P&L: ${formatCurrency(totP, { mode: currencyMode, inrRate })}`}
            />
          );
        })()}
        <Metric label="Win Rate" value={`${((summary as any).realizedWinRate ?? (summary as any).winRate ?? 0).toFixed(1)}%`} title="Realized Win Rate across closed trades" />
        <Metric label="Overall Win Rate" value={`${((summary as any).overallWinRate ?? (summary as any).winRate ?? 0).toFixed(1)}%`} title="Overall Win Rate including open positions" />
      </div>

      {/* Right — Settings & Active Mode */}
      <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>

        <div
          style={{ width:28, height:28, borderRadius:8, background:activeMode.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:12, color:"#fff" }}
          title={activeMode.label}
        >
          {activeMode.label[0]}
        </div>
        <button
          onClick={() => navigate("/settings")}
          style={{ background:"none", border:"none", color:"#94a3b8", cursor:"pointer", padding:4, display:"flex", borderRadius:6 }}
          title="Settings"
        >
          <Settings size={15} />
        </button>
      </div>

      {/* Reset Testing Data Confirmation Modal */}
      {resetModalOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99999
        }}>
          <div style={{
            background: "#0f172a", border: "1px solid rgba(239,68,68,0.4)",
            borderRadius: 16, padding: 24, maxWidth: 420, width: "90%",
            boxShadow: "0 20px 50px rgba(0,0,0,0.6)", color: "#f8fafc"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <RotateCcw size={18} color="#f87171" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#ffffff" }}>Full Testing Reset</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Purge old history &amp; reset testing baseline</div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5, marginBottom: 18, background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              This action will permanently purge:
              <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                <li>All past trade history &amp; realized P&amp;L records</li>
                <li>All active open positions &amp; floating P&amp;L</li>
                <li>All AI decision logs, alerts &amp; audit history</li>
                <li>Resets paper wallet to zero baseline (0 USDT / ₹0 INR)</li>
              </ul>
            </div>

            {resetSuccess ? (
              <div style={{ color: "#34d399", fontWeight: 800, fontSize: 13, textAlign: "center", padding: 10 }}>
                ✓ {resetSuccess}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setResetModalOpen(false)}
                  disabled={resetLoading}
                  style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#cbd5e1", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetLoading}
                  style={{ padding: "8px 16px", borderRadius: 8, background: "#ef4444", border: "none", color: "#ffffff", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  {resetLoading ? "Purging State..." : "Confirm Full Reset"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function Metric({ label, value, color = "#f1f5f9", title }: { label: string; value: string; color?: string; title?: string }) {
  const isLongValue = value.length > 20;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1, flexShrink:0 }} title={title}>
      <span style={{ fontSize:9, color:"#94a3b8", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", whiteSpace:"nowrap" }}>{label}</span>
      <span style={{ fontSize: isLongValue ? 10.5 : 12, fontWeight:700, color, fontFamily:"monospace", whiteSpace:"nowrap" }}>{value}</span>
    </div>
  );
}
