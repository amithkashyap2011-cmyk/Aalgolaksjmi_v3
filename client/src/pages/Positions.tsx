import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useDashboardStore } from '../store/useDashboardStore';
import { formatCurrency } from '../lib/currency';
import * as api from '../lib/api';
import { Briefcase, RefreshCw, TrendingUp, TrendingDown, X, Check } from 'lucide-react';

/* Theme-aware: structural colors come from design tokens (see design-tokens.css),
   so all 7 themes recolor this page. Trading green/red stay fixed (convention). */
const BG = "var(--ds-bg)", CARD = "var(--ds-surface)", BORD = "var(--ds-border)";
const G = "var(--ds-buy)", R = "var(--ds-sell)", A = "var(--ds-warning)";
const TXT = "var(--ds-text)", TXT_MUTED = "var(--ds-text-muted)", TXT_FAINT = "var(--ds-text-faint)";

/** Inline-editable numeric cell (used for SL / TP). */
function EditableLevel({ value, color, onSave }: { value: number; color: string; onSave: (v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!editing) setDraft(value ? String(value) : ""); }, [value, editing]);

  const commit = async () => {
    const n = parseFloat(draft);
    if (Number.isFinite(n) && n > 0 && n !== value) {
      setSaving(true);
      try { await onSave(n); } finally { setSaving(false); }
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          onBlur={commit}
          style={{ width:80, background:BG, border:`1px solid ${color}`, borderRadius:5, color:TXT, fontFamily:"monospace", fontSize:12, padding:"3px 6px" }}
        />
        {saving ? <RefreshCw size={11} style={{ animation:"spin 0.7s linear infinite", color:TXT_FAINT }} /> : <Check size={12} color={G} style={{ cursor:"pointer" }} onMouseDown={(e) => { e.preventDefault(); commit(); }} />}
      </span>
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{ cursor:"pointer", color: value ? color : TXT_FAINT, fontFamily:"monospace", borderBottom:`1px dashed ${value ? color : TXT_FAINT}`, paddingBottom:1 }}
    >
      {value ? value.toLocaleString("en-US", { maximumFractionDigits: 8 }) : "set"}
    </span>
  );
}

export default function Positions() {
  const [tab, setTab] = useState<"OPEN" | "CLOSED">("OPEN");
  const [positions, setPositions] = useState<any[]>([]);
  const [closed, setClosed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const { userId, mode } = useAppStore();
  const { currencyMode, summary } = useDashboardStore();
  const inrRate = summary?.inrRate || 85;

  // ₹ sub-line for any USDT value (keeps precision on tiny prices).
  // Hidden when the global currency toggle is set to USDT-only.
  const showInr = currencyMode !== "USDT_ONLY";
  const inrText = (v: number) => {
    const inr = (isFinite(v) ? v : 0) * inrRate;
    return `₹${inr.toLocaleString(undefined, { maximumFractionDigits: Math.abs(inr) < 100 ? 4 : 0 })}`;
  };

  const load = async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    try {
      if (tab === "OPEN") {
        const data = await api.getOpenPositions(mode);
        setPositions(Array.isArray(data) ? data : []);
      } else {
        const res = await api.getTradeHistory(mode, 50, 0, "CLOSED");
        setClosed(Array.isArray(res?.trades) ? res.trades : []);
      }
      setLoadError(null);
    } catch (e: any) {
      if (tab === "OPEN") setPositions([]); else setClosed([]);
      setLoadError(
        e?.body?.code === "SYSTEM_NOT_READY"
          ? `Trading services are not ready (${e.body.state ?? "starting up"}) — positions can't be loaded yet. Data shown may be empty, not closed.`
          : e?.message || "Failed to load positions",
      );
    } finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { load(false); }, [userId, mode, tab]);
  useEffect(() => {
    if (!userId || tab !== "OPEN") return;
    const t = setInterval(() => load(true), 5000); // live PnL refresh (silent)
    return () => clearInterval(t);
  }, [userId, mode, tab]);

  const handleSaveLevel = async (tradeId: string, patch: { sl?: number; tp?: number }) => {
    await api.updateSlTp({ tradeId, ...patch }).catch(console.error);
    await load();
  };

  const handleClose = async (tradeId: string) => {
    if (!tradeId) return;
    setClosingId(tradeId);
    try {
      await api.closePosition(tradeId, mode);
      await load();
    } catch (e) { console.error(e); }
    finally { setClosingId(null); }
  };

  // Close every open position at market. Sequential so paper-wallet updates
  // don't race each other; reuses the same close endpoint as the per-row button.
  const handleCloseAll = async () => {
    if (!positions.length || closingAll) return;
    if (!window.confirm(`Close all ${positions.length} open position${positions.length !== 1 ? "s" : ""} at market?`)) return;
    setClosingAll(true);
    try {
      for (const p of positions) {
        const tradeId = p._id ?? p.tradeId;
        if (!tradeId) continue;
        try { await api.closePosition(tradeId, mode); }
        catch (e) { console.error(`Failed to close ${p.symbol}`, e); }
      }
      await load();
    } finally { setClosingAll(false); }
  };

  const totalPnl = positions.reduce((s, p) => s + (p.pnl ?? p.unrealisedPnl ?? p.unrealizedPnl ?? 0), 0);

  return (
    <div style={{ background:BG, minHeight:"100%", padding:16, display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:"rgba(59,130,246,0.12)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Briefcase size={18} color="var(--ds-primary)" />
          </div>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:TXT }}>Positions &amp; Orders</div>
            <div style={{ fontSize:11, color:TXT_FAINT }}>{positions.length} open · {mode} mode</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:9, fontWeight:700, color:TXT_FAINT, textTransform:"uppercase", letterSpacing:"0.08em" }}>Open P&L (Unrealised)</div>
            <div style={{ fontSize:16, fontWeight:800, color: totalPnl >= 0 ? G : R, fontFamily:"monospace" }}>
              {totalPnl >= 0 ? "+" : ""}{formatCurrency(totalPnl, { mode: currencyMode, inrRate })}
            </div>
          </div>
          {tab === "OPEN" && positions.length > 0 && (
            <button
              onClick={handleCloseAll}
              disabled={closingAll}
              title="Close every open position at market"
              style={{ background:`${A}18`, border:`1px solid ${A}`, borderRadius:8, padding:"7px 12px", color:A, fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.04em", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6, opacity: closingAll ? 0.6 : 1 }}>
              {closingAll ? <RefreshCw size={13} style={{ animation:"spin 0.7s linear infinite" }} /> : <X size={13} />}
              Close All
            </button>
          )}
          <button onClick={() => load(false)} style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:8, padding:"7px 10px", color:TXT_FAINT, cursor:"pointer", display:"flex" }}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:8 }}>
        {(["OPEN", "CLOSED"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? "rgba(59,130,246,0.15)" : CARD,
              border:`1px solid ${tab === t ? "var(--ds-primary)" : BORD}`,
              borderRadius:8, padding:"7px 16px", cursor:"pointer",
              color: tab === t ? "var(--ds-primary)" : TXT_FAINT, fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.06em",
            }}>
            {t === "OPEN" ? "Open Orders" : "Closed Orders"}
          </button>
        ))}
      </div>

      {/* Load error / system-not-ready banner */}
      {loadError && (
        <div style={{ background:`${A}14`, border:`1px solid ${A}`, borderRadius:10, padding:"10px 14px", color:A, fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:8 }}>
          <RefreshCw size={13} />
          {loadError}
        </div>
      )}

      {/* Table */}
      <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:12, overflow:"hidden" }}>
        {loading ? (
          <div style={{ padding:48, textAlign:"center", color:TXT_FAINT, fontSize:12 }}>Loading…</div>
        ) : tab === "OPEN" ? (
          positions.length === 0 ? (
            <div style={{ padding:64, textAlign:"center" }}>
              <Briefcase size={32} style={{ color:TXT_FAINT, margin:"0 auto 12px" }} />
              <div style={{ fontSize:14, color:TXT_FAINT, fontWeight:600 }}>No open positions</div>
              <div style={{ fontSize:11, color:TXT_FAINT, marginTop:4 }}>The AQEA engine will open positions when conditions are met</div>
            </div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${BORD}` }}>
                    {["Symbol","Side","Size","Entry","Mark","Invested","SL","TP","Unreal PnL","PnL %","Lev","Action"].map((h) => {
                      const sticky = h === "Action"; // pin so CLOSE stays visible while the wide table scrolls
                      return (
                        <th key={h} style={{ padding:"10px 14px", textAlign: sticky ? "center" : "left", fontSize:9, fontWeight:700, color:TXT_FAINT, textTransform:"uppercase", letterSpacing:"0.08em", whiteSpace:"nowrap", position: sticky ? "sticky" : undefined, right: sticky ? 0 : undefined, zIndex: sticky ? 2 : undefined, background: sticky ? CARD : undefined, borderLeft: sticky ? `1px solid ${BORD}` : undefined }}>{h}</th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => {
                    const pnl    = parseFloat(p.pnl ?? p.unrealisedPnl ?? p.unrealizedPnl ?? 0);
                    const pnlPct = parseFloat(p.unrealisedPnlPct ?? p.unrealizedPnlPct ?? 0);
                    const isLong = (p.side ?? "BUY") === "BUY" || p.side === "LONG";
                    const tradeId = p._id ?? p.tradeId;
                    const qty    = parseFloat(p.quantity ?? p.positionAmt ?? p.size ?? 0);
                    const entry  = parseFloat(p.entryPrice ?? 0);
                    const lev    = parseFloat(p.leverage ?? 1) || 1;
                    const invested = p.margin ? parseFloat(p.margin) : (qty * entry) / lev;
                    return (
                      <tr key={tradeId ?? i} style={{ borderBottom:`1px solid ${BORD}` }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59,130,246,0.04)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        <td style={{ padding:"12px 14px", fontWeight:700, color:TXT, fontFamily:"monospace", fontSize:13 }}>{p.symbol}</td>
                        <td style={{ padding:"12px 14px" }}>
                          <span style={{ fontSize:10, fontWeight:800, padding:"3px 8px", borderRadius:5, background: isLong ? `${G}20` : `${R}20`, color: isLong ? G : R, display:"inline-flex", alignItems:"center", gap:3 }}>
                            {isLong ? <TrendingUp size={10} /> : <TrendingDown size={10} />} {isLong ? "LONG" : "SHORT"}
                          </span>
                        </td>
                        <td style={{ padding:"12px 14px", color:TXT_MUTED, fontFamily:"monospace" }}>{p.quantity ?? p.positionAmt ?? p.size ?? "—"}</td>
                        <td style={{ padding:"12px 14px", color:TXT_MUTED, fontFamily:"monospace" }}>
                          ${entry.toLocaleString("en-US", { maximumFractionDigits:8 })}
                          {showInr && <div style={{ fontSize:9, color:TXT_FAINT }}>{inrText(entry)}</div>}
                        </td>
                        <td style={{ padding:"12px 14px", color:TXT, fontFamily:"monospace" }}>
                          ${parseFloat(p.markPrice ?? p.currentPrice ?? 0).toLocaleString("en-US", { maximumFractionDigits:8 })}
                          {showInr && <div style={{ fontSize:9, color:TXT_FAINT }}>{inrText(parseFloat(p.markPrice ?? p.currentPrice ?? 0))}</div>}
                        </td>
                        <td style={{ padding:"12px 14px", color:TXT, fontFamily:"monospace", fontWeight:600 }}>
                          ${invested.toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 })}
                          {showInr && <div style={{ fontSize:9, color:TXT_FAINT, fontWeight:400 }}>{inrText(invested)}</div>}
                        </td>
                        <td style={{ padding:"12px 14px" }}>
                          <EditableLevel value={parseFloat(p.sl ?? 0)} color={R} onSave={(v) => handleSaveLevel(tradeId, { sl: v })} />
                        </td>
                        <td style={{ padding:"12px 14px" }}>
                          <EditableLevel value={parseFloat(p.tp ?? p.tp1 ?? 0)} color={G} onSave={(v) => handleSaveLevel(tradeId, { tp: v })} />
                        </td>
                        <td style={{ padding:"12px 14px", color: pnl >= 0 ? G : R, fontFamily:"monospace", fontWeight:700 }}>
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} USDT
                          {showInr && <div style={{ fontSize:9, color:TXT_FAINT, fontWeight:400 }}>{pnl >= 0 ? "+" : ""}{inrText(pnl)}</div>}
                        </td>
                        <td style={{ padding:"12px 14px", color: pnlPct >= 0 ? G : R, fontFamily:"monospace" }}>
                          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                        </td>
                        <td style={{ padding:"12px 14px", color:TXT_FAINT, fontFamily:"monospace" }}>{p.leverage ?? "—"}x</td>
                        <td style={{ padding:"12px 14px", textAlign:"center", position:"sticky", right:0, zIndex:1, background:CARD, borderLeft:`1px solid ${BORD}`, boxShadow:"-8px 0 8px -8px rgba(0,0,0,0.45)" }}>
                          <button
                            onClick={() => handleClose(tradeId)}
                            disabled={closingId === tradeId}
                            style={{ background:`${R}18`, border:`1px solid ${R}50`, borderRadius:6, padding:"5px 10px", color:R, fontSize:10, fontWeight:800, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4, opacity: closingId === tradeId ? 0.5 : 1 }}>
                            {closingId === tradeId ? <RefreshCw size={11} style={{ animation:"spin 0.7s linear infinite" }} /> : <X size={11} />} CLOSE
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* CLOSED ORDERS */
          closed.length === 0 ? (
            <div style={{ padding:64, textAlign:"center" }}>
              <Briefcase size={32} style={{ color:TXT_FAINT, margin:"0 auto 12px" }} />
              <div style={{ fontSize:14, color:TXT_FAINT, fontWeight:600 }}>No closed orders yet</div>
            </div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${BORD}` }}>
                    {["Symbol","Side","Entry","Exit","Realised PnL","PnL %","Reason","Closed"].map((h) => (
                      <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:9, fontWeight:700, color:TXT_FAINT, textTransform:"uppercase", letterSpacing:"0.08em", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {closed.map((t, i) => {
                    const pnl = parseFloat(t.pnl ?? 0);
                    const entry = parseFloat(t.entryPrice ?? 0);
                    const exit = parseFloat(t.exitPrice ?? 0);
                    const margin = entry * (t.quantity ?? 0) / (t.leverage || 1);
                    const pnlPct = margin > 0 ? (pnl / margin) * 100 : 0;
                    const isLong = (t.side ?? "BUY") === "BUY" || t.side === "LONG";
                    const reason = t.meta?.exitReason ?? t.exitReason ?? "—";
                    return (
                      <tr key={t._id ?? i} style={{ borderBottom:`1px solid ${BORD}` }}>
                        <td style={{ padding:"12px 14px", fontWeight:700, color:TXT, fontFamily:"monospace", fontSize:13 }}>{t.symbol}</td>
                        <td style={{ padding:"12px 14px" }}>
                          <span style={{ fontSize:10, fontWeight:800, padding:"3px 8px", borderRadius:5, background: isLong ? `${G}20` : `${R}20`, color: isLong ? G : R }}>{isLong ? "LONG" : "SHORT"}</span>
                        </td>
                        <td style={{ padding:"12px 14px", color:TXT_MUTED, fontFamily:"monospace" }}>
                          ${entry.toLocaleString("en-US", { maximumFractionDigits:8 })}
                          {showInr && <div style={{ fontSize:9, color:TXT_FAINT }}>{inrText(entry)}</div>}
                        </td>
                        <td style={{ padding:"12px 14px", color:TXT_MUTED, fontFamily:"monospace" }}>
                          ${exit.toLocaleString("en-US", { maximumFractionDigits:8 })}
                          {showInr && <div style={{ fontSize:9, color:TXT_FAINT }}>{inrText(exit)}</div>}
                        </td>
                        <td style={{ padding:"12px 14px", color: pnl >= 0 ? G : R, fontFamily:"monospace", fontWeight:700 }}>
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} USDT
                          {showInr && <div style={{ fontSize:9, color:TXT_FAINT, fontWeight:400 }}>{pnl >= 0 ? "+" : ""}{inrText(pnl)}</div>}
                        </td>
                        <td style={{ padding:"12px 14px", color: pnlPct >= 0 ? G : R, fontFamily:"monospace" }}>
                          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                        </td>
                        <td style={{ padding:"12px 14px" }}>
                          <span style={{ fontSize:9, fontWeight:700, color:A, fontFamily:"monospace" }}>{reason}</span>
                        </td>
                        <td style={{ padding:"12px 14px", color:TXT_FAINT, fontSize:11 }}>{t.closedAt ? new Date(t.closedAt).toLocaleString() : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
