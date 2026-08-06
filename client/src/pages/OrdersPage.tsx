import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useDashboardStore } from '../store/useDashboardStore';
import { formatCurrency, withInr } from '../lib/currency';
import {
  ClipboardList, ChevronDown, ChevronRight, RefreshCw,
  Archive, Trash2, ArchiveRestore, Eye, EyeOff, AlertTriangle, X,
} from 'lucide-react';
import {
  archiveTrade, archiveAllTrades, clearArchivedTrades, getTradesWithArchived,
} from '../lib/api';

const BG = "var(--ds-bg)", CARD = "var(--ds-surface)", BORD = "var(--ds-border)";
const G = "var(--ds-buy)", R = "var(--ds-sell)", B = "var(--ds-primary)", A = "var(--ds-warning)";

function statusColor(s: string) {
  if (s === "OPEN")                   return B;
  if (s === "CLOSED")                 return G;
  if (s === "CANCELLED" || s === "REJECTED") return R;
  return "var(--ds-text-muted)";
}

/* Confirm dialog */
function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onCancel}>
      <div style={{ background:"var(--ds-surface)", border:`1px solid rgba(239,68,68,0.3)`, borderRadius:14, padding:24, maxWidth:380, width:"100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <AlertTriangle size={18} color={R} />
          <span style={{ fontSize:14, fontWeight:700, color:"var(--ds-text)" }}>Confirm Action</span>
          <button onClick={onCancel} style={{ marginLeft:"auto", background:"none", border:"none", color:"var(--ds-text-faint)", cursor:"pointer", padding:2, display:"flex" }}><X size={16} /></button>
        </div>
        <p style={{ fontSize:13, color:"var(--ds-text-muted)", marginBottom:20, lineHeight:1.5 }}>{message}</p>
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button onClick={onCancel} style={{ padding:"8px 16px", borderRadius:8, border:`1px solid ${BORD}`, background:"transparent", color:"var(--ds-text-faint)", fontSize:12, fontWeight:700, cursor:"pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding:"8px 16px", borderRadius:8, border:"none", background:R, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders]         = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivingId, setArchivingId]   = useState<string | null>(null);
  const [confirm, setConfirm]       = useState<{ action: "archive-all" | "clear" } | null>(null);
  const [actionMsg, setActionMsg]   = useState<string | null>(null);

  const { userId } = useAppStore();
  const { currencyMode, summary } = useDashboardStore();
  const inrRate = summary?.inrRate || 85;

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const url = showArchived
        ? `/aqea-ui/trades?userId=${userId}&limit=100&archived=true`
        : `/aqea-ui/trades?userId=${userId}&limit=100`;
      const res = await fetch(url);
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch { setOrders([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [userId, showArchived]);

  /* Flash a status message */
  const flash = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 3000);
  };

  /* Archive one trade */
  const handleArchive = async (id: string, currentlyArchived: boolean) => {
    setArchivingId(id);
    try {
      await archiveTrade(id, !currentlyArchived);
      flash(currentlyArchived ? "Trade restored from archive" : "Trade archived");
      await load();
    } catch { flash("Action failed — is the server running?"); }
    finally { setArchivingId(null); }
  };

  /* Archive all */
  const handleArchiveAll = async () => {
    setConfirm(null);
    try {
      const res = await archiveAllTrades(userId!);
      flash(`${res.count} trades archived`);
      await load();
    } catch { flash("Archive failed"); }
  };

  /* Permanently delete all archived */
  const handleClearArchived = async () => {
    setConfirm(null);
    try {
      const res = await clearArchivedTrades(userId!);
      flash(`${res.deleted} archived trades permanently deleted`);
      await load();
    } catch { flash("Clear failed"); }
  };

  const activeCount   = orders.filter((o) => !o.archived).length;
  const archivedCount = orders.filter((o) =>  o.archived).length;

  return (
    <div style={{ background:BG, minHeight:"100%", padding:16, display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:`${B}18`, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <ClipboardList size={18} color={B} />
          </div>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:"var(--ds-text)" }}>Orders &amp; Trades</div>
            <div style={{ fontSize:11, color:"var(--ds-text-faint)" }}>
              {activeCount} record{activeCount !== 1 ? "s" : ""}
              {archivedCount > 0 && ` · ${archivedCount} archived`}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          {/* Toggle archived view */}
          <button
            onClick={() => setShowArchived(!showArchived)}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:8, border:`1px solid ${showArchived ? A + "60" : BORD}`, background: showArchived ? `${A}12` : "transparent", color: showArchived ? A : "var(--ds-text-faint)", fontSize:11, fontWeight:700, cursor:"pointer" }}
            title={showArchived ? "Hide archived trades" : "Show archived trades"}
          >
            {showArchived ? <EyeOff size={13} /> : <Eye size={13} />}
            {showArchived ? "Hide Archive" : "Show Archive"}
          </button>

          {/* Archive all active trades */}
          <button
            onClick={() => setConfirm({ action: "archive-all" })}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:8, border:`1px solid ${BORD}`, background:"transparent", color:"var(--ds-text-faint)", fontSize:11, fontWeight:700, cursor:"pointer" }}
            title="Archive all visible trades"
          >
            <Archive size={13} />
            Archive All
          </button>

          {/* Clear archived — only when viewing archive */}
          {showArchived && (
            <button
              onClick={() => setConfirm({ action: "clear" })}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:8, border:`1px solid ${R}40`, background:`${R}0e`, color:R, fontSize:11, fontWeight:700, cursor:"pointer" }}
              title="Permanently delete all archived trades"
            >
              <Trash2 size={13} />
              Clear Archived
            </button>
          )}

          <button onClick={load} style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:8, padding:"7px 10px", color:"var(--ds-text-faint)", cursor:"pointer", display:"flex" }}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }} />
          </button>
        </div>
      </div>

      {/* Flash message */}
      {actionMsg && (
        <div style={{ background:`${G}14`, border:`1px solid ${G}30`, borderRadius:8, padding:"10px 14px", fontSize:12, color:G, fontWeight:600 }}>
          {actionMsg}
        </div>
      )}

      {/* Archive view banner */}
      {showArchived && (
        <div style={{ background:`${A}0e`, border:`1px solid ${A}30`, borderRadius:8, padding:"10px 14px", fontSize:12, color:A, display:"flex", alignItems:"center", gap:8 }}>
          <Archive size={13} />
          Showing archived trades — these are hidden from the default view. Unarchive individual rows or permanently clear them.
        </div>
      )}

      {/* Table */}
      <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:12, overflow:"hidden" }}>
        {loading ? (
          <div style={{ padding:48, textAlign:"center", color:"var(--ds-text-faint)", fontSize:12 }}>
            <div style={{ width:24, height:24, border:"2px solid #1e3a5f", borderTopColor:B, borderRadius:"50%", animation:"spin 0.7s linear infinite", margin:"0 auto 10px" }} />
            Loading…
          </div>
        ) : orders.length === 0 ? (
          <div style={{ padding:64, textAlign:"center" }}>
            <ClipboardList size={32} style={{ color:"var(--ds-text-faint)", margin:"0 auto 12px", display:"block" }} />
            <div style={{ fontSize:14, color:"var(--ds-text-faint)", fontWeight:600 }}>
              {showArchived ? "No archived trades" : "No orders yet"}
            </div>
            <div style={{ fontSize:11, color:"var(--ds-text-faint)", marginTop:4 }}>
              {showArchived ? "Archive trades from the main list to see them here" : "Closed trade records will appear here"}
            </div>
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${BORD}` }}>
                  {["","Symbol","Side","Realized PnL","AI Score","Status","Exit Reason",""].map((h, i) => (
                    <th key={i} style={{ padding:"10px 12px", textAlign:"left", fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => {
                  const id  = o._id || String(i);
                  const pnl = o.pnl ?? 0;
                  const side = o.side ?? "BUY";
                  const isOpen = expanded === id;
                  const isArchived = !!o.archived;
                  return (
                    <>
                      <tr
                        key={id}
                        style={{
                          borderBottom:`1px solid var(--ds-border)`,
                          background: isOpen ? "rgba(59,130,246,0.05)" : isArchived ? "rgba(245,158,11,0.03)" : "",
                          opacity: isArchived && !showArchived ? 0.6 : 1,
                        }}
                      >
                        {/* Expand toggle */}
                        <td
                          style={{ padding:"10px 8px 10px 12px", color:"var(--ds-text-faint)", cursor:"pointer", width:28 }}
                          onClick={() => setExpanded(isOpen ? null : id)}
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>

                        <td style={{ padding:"10px 12px", fontWeight:700, color: isArchived ? "var(--ds-text-faint)" : "var(--ds-text)", fontFamily:"monospace", cursor:"pointer" }} onClick={() => setExpanded(isOpen ? null : id)}>
                          {o.symbol}
                          {isArchived && <span style={{ marginLeft:6, fontSize:9, fontWeight:700, color:A, background:`${A}18`, padding:"1px 5px", borderRadius:3 }}>ARCHIVED</span>}
                        </td>

                        <td style={{ padding:"10px 12px", cursor:"pointer" }} onClick={() => setExpanded(isOpen ? null : id)}>
                          <span style={{ fontSize:10, fontWeight:800, padding:"2px 7px", borderRadius:4, background: side === "BUY" || side === "LONG" ? `${G}18` : `${R}18`, color: side === "BUY" || side === "LONG" ? G : R }}>
                            {side === "BUY" || side === "LONG" ? "LONG" : "SHORT"}
                          </span>
                        </td>

                        <td style={{ padding:"10px 12px", color: pnl >= 0 ? G : R, fontFamily:"monospace", fontWeight:700 }}>
                          {o.status === "OPEN" ? "—" : `${pnl >= 0 ? "+" : ""}${formatCurrency(pnl, { mode: currencyMode, inrRate })}`}
                        </td>

                        <td style={{ padding:"10px 12px", color:"var(--ds-accent)", fontFamily:"monospace", fontWeight:700 }}>
                          {o.meta?.aqea?.finalScore ?? o.finalScore ?? "—"}
                        </td>

                        <td style={{ padding:"10px 12px" }}>
                          <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background:`${statusColor(o.status)}18`, color: statusColor(o.status), textTransform:"uppercase" }}>
                            {o.status}
                          </span>
                        </td>

                        <td style={{ padding:"10px 12px", color:"var(--ds-text-faint)", fontSize:11 }}>
                          {o.meta?.closeReason ?? o.meta?.exitReason ?? o.exitReason ?? "—"}
                        </td>

                        {/* Archive / unarchive button */}
                        <td style={{ padding:"10px 12px", textAlign:"right" }}>
                          <button
                            onClick={() => handleArchive(id, isArchived)}
                            disabled={archivingId === id}
                            title={isArchived ? "Restore from archive" : "Archive this trade"}
                            style={{
                              background:"none", border:`1px solid ${BORD}`, borderRadius:6,
                              padding:"4px 8px", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4,
                              color: isArchived ? G : "var(--ds-text-faint)", fontSize:10, fontWeight:600,
                              opacity: archivingId === id ? 0.5 : 1,
                            }}
                          >
                            {isArchived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                            {isArchived ? "Restore" : "Archive"}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isOpen && (
                        <tr key={`${id}-exp`} style={{ borderBottom:`1px solid var(--ds-border)` }}>
                          <td colSpan={8} style={{ padding:0 }}>
                            <div style={{ padding:"12px 16px 16px 28px", borderLeft:"2px solid #3b82f6" }}>
                              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap:16 }} className="grid-collapse-sm">
                                <div>
                                  <div style={{ fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Trade Details</div>
                                  <Row label="Opened"    value={o.openedAt  ? new Date(o.openedAt).toLocaleString()  : "—"} />
                                  <Row label="Closed"    value={o.closedAt  ? new Date(o.closedAt).toLocaleString()  : "—"} />
                                  {o.archivedAt && <Row label="Archived" value={new Date(o.archivedAt).toLocaleString()} highlight={A} />}
                                  <Row label="Qty"       value={o.quantity  ?? o.qty ?? "—"} />
                                  <Row label="Entry"     value={o.entryPrice ? `$${parseFloat(o.entryPrice).toFixed(2)}`  : "—"} />
                                  <Row label="Exit"      value={o.exitPrice  ? `$${parseFloat(o.exitPrice).toFixed(2)}`   : "—"} />
                                  <Row label="Leverage"  value={o.leverage   ? `${o.leverage}x` : "—"} />
                                </div>
                                <div>
                                  <div style={{ fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>AI Attribution</div>
                                  <Row label="Regime"     value={o.meta?.aqea?.regime ?? o.marketRegime ?? "—"} />
                                  <Row label="Confidence" value={o.aiConfidence != null ? `${(o.aiConfidence * 100).toFixed(0)}%` : "—"} />
                                  <Row label="Strategy"   value={o.strategy ?? "AQEA"} />
                                  <Row label="Core Score" value={o.coreScore  ?? "—"} />
                                  <Row label="Final Score" value={o.finalScore ?? "—"} />
                                  <Row label="Net PnL"    value={o.netPnl != null ? withInr(parseFloat(o.netPnl), inrRate, { mode: currencyMode }) : "—"} />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirm && (
        <ConfirmModal
          message={
            confirm.action === "archive-all"
              ? `Archive all ${activeCount} visible trade${activeCount !== 1 ? "s" : ""}? They will be hidden from the default view but can be restored.`
              : `Permanently delete all ${archivedCount} archived trade${archivedCount !== 1 ? "s" : ""}? This cannot be undone.`
          }
          onConfirm={confirm.action === "archive-all" ? handleArchiveAll : handleClearArchived}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: any; highlight?: string }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0", borderBottom:"1px solid var(--ds-border)" }}>
      <span style={{ fontSize:10, color:"var(--ds-text-faint)" }}>{label}</span>
      <span style={{ fontSize:10, color: highlight ?? "var(--ds-text-muted)", fontFamily:"monospace" }}>{String(value)}</span>
    </div>
  );
}
