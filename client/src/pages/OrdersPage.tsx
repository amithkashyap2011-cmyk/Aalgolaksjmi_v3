import React, { useEffect, useMemo, useState, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { useDashboardStore } from '../store/useDashboardStore';
import { formatCurrency, withInr } from '../lib/currency';
import {
  ClipboardList, ChevronDown, ChevronRight, RefreshCw,
  Archive, Trash2, ArchiveRestore, Eye, EyeOff, AlertTriangle, X, XCircle,
} from 'lucide-react';
import {
  archiveTrade, archiveAllTrades, clearArchivedTrades, closePosition,
} from '../lib/api';

const BG = "var(--ds-bg)", CARD = "var(--ds-surface)", BORD = "var(--ds-border)";
const G = "var(--ds-buy)", R = "var(--ds-sell)", B = "var(--ds-primary)", A = "var(--ds-warning)";

type Market = "CRYPTO" | "INDIA";
type Tab = "OPEN" | "HISTORY" | "TRADES" | "HOLDINGS";

function statusColor(s: string) {
  if (s === "OPEN" || s?.includes("PENDING") || s?.includes("TRIGGERED")) return B;
  if (s === "CLOSED")                 return G;
  if (s === "CANCELLED" || s === "REJECTED") return R;
  return "var(--ds-text-muted)";
}

function isLongSide(side: string) {
  return side === "BUY" || side === "LONG";
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

function Pill({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: 7, fontSize: 11, fontWeight: 800, cursor: "pointer",
        border: `1px solid ${active ? color : BORD}`,
        background: active ? `${color}18` : "transparent",
        color: active ? color : "var(--ds-text-faint)",
        letterSpacing: "0.03em",
      }}
    >
      {children}
    </button>
  );
}

/* Binance-style underline tab: active tab gets a colored bar under just its own label */
function TabBtn({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative", background: "none", border: "none", cursor: "pointer",
        padding: "10px 2px 12px", fontSize: 14, fontWeight: active ? 800 : 600,
        color: active ? "var(--ds-text)" : "var(--ds-text-faint)",
      }}
    >
      {children}
      {active && <div style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2, borderRadius: 2, background: color }} />}
    </button>
  );
}

export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { userId, activeMarket, setActiveMarket } = useAppStore();
  const { currencyMode, summary } = useDashboardStore();
  const inrRate = summary?.inrRate || 85;

  // Deep-link (e.g. the sidebar's "Orders" link) picks the initial market via
  // the URL. After that, this page follows the app-wide market switcher (top
  // bar) — without this, switching markets there while already on this page
  // left the market pill below pointing at whichever market you arrived from.
  const [market, setMarketState] = useState<Market>(
    () => (searchParams.get("market")?.toUpperCase() as Market) || (activeMarket === "INDIA" ? "INDIA" : "CRYPTO")
  );
  const marketSynced = React.useRef(false);
  useEffect(() => {
    if (!marketSynced.current) { marketSynced.current = true; return; }
    if (activeMarket === "INDIA" || activeMarket === "CRYPTO") setMarketState(activeMarket);
  }, [activeMarket]);

  const tab: Tab = (searchParams.get("tab")?.toUpperCase() as Tab) || "OPEN";
  const [openOrdersCount, setOpenOrdersCount] = useState(0);

  const setMarket = (m: Market) => {
    setMarketState(m);
    setActiveMarket(m);
    setSearchParams((p) => { p.set("market", m); return p; }, { replace: true });
  };
  const setTab = (t: Tab) => setSearchParams((p) => { p.set("tab", t); return p; }, { replace: true });

  // Keep the URL's ?market= in step too, including when `market` changed
  // because the top-bar switcher was used (not just a click on this page) —
  // so a refresh or bookmark still lands on the right market.
  useEffect(() => {
    if (searchParams.get("market")?.toUpperCase() !== market) {
      setSearchParams((p) => { p.set("market", market); return p; }, { replace: true });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [market]);

  const [rows, setRows]             = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivingId, setArchivingId]   = useState<string | null>(null);
  const [closingId, setClosingId]       = useState<string | null>(null);
  const [confirm, setConfirm]       = useState<{ action: "archive-all" | "clear" } | null>(null);
  const [actionMsg, setActionMsg]   = useState<string | null>(null);

  const activeUserId = userId || "000000000000000000000000";

  // userId/market settle across a few renders on mount (auth resolving,
  // the top-bar market switcher, etc.), each re-triggering the effect
  // below — with nothing to say "this response is stale," whichever
  // request happened to *resolve* last won, not whichever was *requested*
  // last. An earlier in-flight call for a not-yet-resolved userId (the
  // "000...guest" fallback) could return empty and overwrite a later,
  // correct response that had already landed. This ref makes only the
  // most-recently-initiated call allowed to write state.
  const loadSeq = React.useRef(0);

  const load = async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const url =
        tab === "OPEN"     ? `/aqea-ui/trades?userId=${encodeURIComponent(activeUserId)}&limit=100&market=${market}&status=PENDING` :
        tab === "HOLDINGS" ? `/aqea-ui/positions?userId=${encodeURIComponent(activeUserId)}&market=${market}` :
                              `/aqea-ui/trades?userId=${encodeURIComponent(activeUserId)}&limit=100&market=${market}&status=ALL${showArchived ? "&archived=true" : ""}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (seq !== loadSeq.current) return; // a newer load() has since started; drop this stale result
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("[OrdersPage] Failed to fetch:", err);
      if (seq === loadSeq.current) setRows([]);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId, showArchived, tab, market]);

  /* Open-orders count for the tab label — kept live regardless of which tab is active */
  useEffect(() => {
    let cancelled = false;
    fetch(`/aqea-ui/trades?userId=${encodeURIComponent(activeUserId)}&limit=200&market=${market}&status=PENDING`, { signal: AbortSignal.timeout(15000) })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setOpenOrdersCount(Array.isArray(d) ? d.length : 0); })
      .catch(() => { if (!cancelled) setOpenOrdersCount(0); });
    return () => { cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [market, userId]);

  /* One row per fill: an entry fill for every order, plus an exit fill once it's closed */
  const fills = useMemo(() => {
    const out: any[] = [];
    for (const o of rows) {
      const entrySide = isLongSide(o.side) ? "BUY" : "SELL";
      out.push({
        id: `${o._id}-entry`, orderId: o._id, symbol: o.symbol, type: "ENTRY",
        side: entrySide, price: o.entryPrice, qty: o.quantity, time: o.openedAt, accountType: o.accountType,
      });
      if (o.exitPrice != null && o.closedAt) {
        out.push({
          id: `${o._id}-exit`, orderId: o._id, symbol: o.symbol, type: "EXIT",
          side: entrySide === "BUY" ? "SELL" : "BUY", price: o.exitPrice, qty: o.quantity, time: o.closedAt,
          pnl: o.pnl, accountType: o.accountType,
        });
      }
    }
    return out.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [rows]);

  const flash = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(null), 3000); };

  const handleArchive = async (id: string, currentlyArchived: boolean) => {
    setArchivingId(id);
    try {
      await archiveTrade(id, !currentlyArchived);
      flash(currentlyArchived ? "Trade restored from archive" : "Trade archived");
      await load();
    } catch { flash("Action failed — is the server running?"); }
    finally { setArchivingId(null); }
  };

  const handleArchiveAll = async () => {
    setConfirm(null);
    try {
      const res = await archiveAllTrades(activeUserId);
      flash(`${res?.count || 0} trades archived`);
      await load();
    } catch { flash("Archive failed"); }
  };

  const handleClearArchived = async () => {
    setConfirm(null);
    try {
      const res = await clearArchivedTrades(activeUserId);
      flash(`${res?.deleted || 0} archived trades permanently deleted`);
      await load();
    } catch { flash("Clear failed"); }
  };

  const handleClose = async (id: string) => {
    setClosingId(id);
    try {
      if (market === "INDIA") {
        const res = await fetch("/api/indian-market/close-position", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tradeId: id, userId: activeUserId }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "close failed");
      } else {
        await closePosition(id, "PAPER");
      }
      flash("Position closed");
      await load();
    } catch { flash("Close failed — is the server running?"); }
    finally { setClosingId(null); }
  };

  const activeCount   = rows.filter((o) => !o.archived).length;
  const archivedCount = rows.filter((o) =>  o.archived).length;
  const marketColor = market === "INDIA" ? "#ea580c" : "#3b82f6";
  const isHistoryLike = tab === "HISTORY" || tab === "TRADES";

  const emptyCopy =
    tab === "OPEN"     ? { title: "No open orders", sub: "Pending orders appear here — this engine fills at market price instantly, so orders rarely sit open" } :
    tab === "HOLDINGS" ? { title: "No holdings yet", sub: "Positions you open will appear here" } :
    tab === "TRADES"   ? { title: "No trades yet", sub: "Individual buy/sell fills will appear here" } :
                          { title: showArchived ? "No archived orders" : "No orders yet", sub: showArchived ? "Archive orders from the main list to see them here" : "Every order you place will appear here" };

  return (
    <div style={{ background:BG, minHeight:"100%", padding:16, display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:`${marketColor}18`, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <ClipboardList size={18} color={marketColor} />
          </div>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:"var(--ds-text)" }}>Orders &amp; Trades</div>
            <div style={{ fontSize:11, color:"var(--ds-text-faint)" }}>
              {tab === "TRADES" ? fills.length : activeCount} record{(tab === "TRADES" ? fills.length : activeCount) !== 1 ? "s" : ""}
              {isHistoryLike && archivedCount > 0 && ` · ${archivedCount} archived`}
            </div>
          </div>
        </div>

        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          {isHistoryLike && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:8, border:`1px solid ${showArchived ? A + "60" : BORD}`, background: showArchived ? `${A}12` : "transparent", color: showArchived ? A : "var(--ds-text-faint)", fontSize:11, fontWeight:700, cursor:"pointer" }}
              title={showArchived ? "Hide archived" : "Show archived"}
            >
              {showArchived ? <EyeOff size={13} /> : <Eye size={13} />}
              {showArchived ? "Hide Archive" : "Show Archive"}
            </button>
          )}

          {tab === "HISTORY" && (
            <button
              onClick={() => setConfirm({ action: "archive-all" })}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:8, border:`1px solid ${BORD}`, background:"transparent", color:"var(--ds-text-faint)", fontSize:11, fontWeight:700, cursor:"pointer" }}
              title="Archive all visible orders"
            >
              <Archive size={13} />
              Archive All
            </button>
          )}

          {tab === "HISTORY" && showArchived && (
            <button
              onClick={() => setConfirm({ action: "clear" })}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:8, border:`1px solid ${R}40`, background:`${R}0e`, color:R, fontSize:11, fontWeight:700, cursor:"pointer" }}
              title="Permanently delete all archived orders"
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

      {/* Market switcher */}
      <div style={{ display:"flex", gap:6 }}>
        <Pill active={market === "CRYPTO"} color="#3b82f6" onClick={() => setMarket("CRYPTO")}>₿ CRYPTO</Pill>
        <Pill active={market === "INDIA"}  color="#ea580c" onClick={() => setMarket("INDIA")}>🇮🇳 INDIA</Pill>
      </div>

      {/* Binance-style underline tabs */}
      <div style={{ display:"flex", gap:24, borderBottom:`1px solid ${BORD}` }}>
        <TabBtn active={tab === "OPEN"}     color={marketColor} onClick={() => setTab("OPEN")}>Open Orders({openOrdersCount})</TabBtn>
        <TabBtn active={tab === "HISTORY"}  color={marketColor} onClick={() => setTab("HISTORY")}>Order History</TabBtn>
        <TabBtn active={tab === "TRADES"}   color={marketColor} onClick={() => setTab("TRADES")}>Trade History</TabBtn>
        <TabBtn active={tab === "HOLDINGS"} color={marketColor} onClick={() => setTab("HOLDINGS")}>Holdings</TabBtn>
      </div>

      {actionMsg && (
        <div style={{ background:`${G}14`, border:`1px solid ${G}30`, borderRadius:8, padding:"10px 14px", fontSize:12, color:G, fontWeight:600 }}>
          {actionMsg}
        </div>
      )}

      {isHistoryLike && showArchived && (
        <div style={{ background:`${A}0e`, border:`1px solid ${A}30`, borderRadius:8, padding:"10px 14px", fontSize:12, color:A, display:"flex", alignItems:"center", gap:8 }}>
          <Archive size={13} />
          Showing archived orders — hidden from the default view. Unarchive individual rows or permanently clear them.
        </div>
      )}

      {/* Table */}
      <div style={{ background:CARD, border:`1px solid ${BORD}`, borderRadius:12, overflow:"hidden" }}>
        {loading ? (
          <div style={{ padding:48, textAlign:"center", color:"var(--ds-text-faint)", fontSize:12 }}>
            <div style={{ width:24, height:24, border:"2px solid #1e3a5f", borderTopColor:B, borderRadius:"50%", animation:"spin 0.7s linear infinite", margin:"0 auto 10px" }} />
            Loading…
          </div>
        ) : tab === "OPEN" ? (
          rows.length === 0 ? (
            <EmptyState title={emptyCopy.title} sub={emptyCopy.sub} />
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${BORD}` }}>
                    {["Symbol","Side","Qty","Price","Status","Placed"].map((h, i) => (
                      <th key={i} style={{ padding:"10px 12px", textAlign:"left", fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o, i) => {
                    const id = o._id || String(i);
                    return (
                      <tr key={id} style={{ borderBottom:`1px solid var(--ds-border)` }}>
                        <td style={{ padding:"10px 12px", fontWeight:700, color:"var(--ds-text)", fontFamily:"monospace" }}>{o.symbol}</td>
                        <td style={{ padding:"10px 12px" }}>
                          <span style={{ fontSize:10, fontWeight:800, padding:"2px 7px", borderRadius:4, background: isLongSide(o.side) ? `${G}18` : `${R}18`, color: isLongSide(o.side) ? G : R }}>
                            {isLongSide(o.side) ? "BUY" : "SELL"}
                          </span>
                        </td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace" }}>{o.quantity ?? o.qty ?? "—"}</td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace" }}>{o.entryPrice ? `$${parseFloat(o.entryPrice).toFixed(2)}` : "—"}</td>
                        <td style={{ padding:"10px 12px" }}>
                          <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background:`${statusColor(o.status)}18`, color: statusColor(o.status), textTransform:"uppercase" }}>{o.status}</span>
                        </td>
                        <td style={{ padding:"10px 12px", color:"var(--ds-text-faint)", fontSize:11 }}>{o.openedAt ? new Date(o.openedAt).toLocaleString() : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "HOLDINGS" ? (
          rows.length === 0 ? (
            <EmptyState title={emptyCopy.title} sub={emptyCopy.sub} />
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${BORD}` }}>
                    {["Symbol","Side","Qty","Entry","Mark","Unrealized PnL","Opened",""].map((h, i) => (
                      <th key={i} style={{ padding:"10px 12px", textAlign:"left", fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o, i) => {
                    const id = o._id || String(i);
                    const pnl = o.unrealisedPnl ?? o.pnl ?? 0;
                    return (
                      <tr key={id} style={{ borderBottom:`1px solid var(--ds-border)` }}>
                        <td style={{ padding:"10px 12px", fontWeight:700, color:"var(--ds-text)", fontFamily:"monospace" }}>{o.symbol}</td>
                        <td style={{ padding:"10px 12px" }}>
                          <span style={{ fontSize:10, fontWeight:800, padding:"2px 7px", borderRadius:4, background: isLongSide(o.side) ? `${G}18` : `${R}18`, color: isLongSide(o.side) ? G : R }}>
                            {isLongSide(o.side) ? "LONG" : "SHORT"}
                          </span>
                        </td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace" }}>{o.quantity ?? o.qty ?? "—"}</td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace" }}>{o.entryPrice ? `$${parseFloat(o.entryPrice).toFixed(2)}` : "—"}</td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace" }}>{o.markPrice ? `$${parseFloat(o.markPrice).toFixed(2)}` : "—"}</td>
                        <td style={{ padding:"10px 12px", color: pnl >= 0 ? G : R, fontFamily:"monospace", fontWeight:700 }}>
                          {pnl >= 0 ? "+" : ""}{formatCurrency(pnl, { mode: currencyMode, inrRate })}
                          {o.unrealisedPnlPct != null && <span style={{ opacity:0.7, marginLeft:4 }}>({o.unrealisedPnlPct >= 0 ? "+" : ""}{Number(o.unrealisedPnlPct).toFixed(2)}%)</span>}
                        </td>
                        <td style={{ padding:"10px 12px", color:"var(--ds-text-faint)", fontSize:11 }}>{o.openedAt ? new Date(o.openedAt).toLocaleString() : "—"}</td>
                        <td style={{ padding:"10px 12px", textAlign:"right" }}>
                          <button
                            onClick={() => handleClose(id)}
                            disabled={closingId === id}
                            title="Close this position"
                            style={{ background:"none", border:`1px solid ${R}40`, borderRadius:6, padding:"4px 8px", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4, color:R, fontSize:10, fontWeight:700, opacity: closingId === id ? 0.5 : 1 }}
                          >
                            <XCircle size={12} />
                            Close
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "TRADES" ? (
          fills.length === 0 ? (
            <EmptyState title={emptyCopy.title} sub={emptyCopy.sub} />
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${BORD}` }}>
                    {["Symbol","Type","Side","Price","Qty","Realized PnL","Time"].map((h, i) => (
                      <th key={i} style={{ padding:"10px 12px", textAlign:"left", fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fills.map((f) => (
                    <tr key={f.id} style={{ borderBottom:`1px solid var(--ds-border)` }}>
                      <td style={{ padding:"10px 12px", fontWeight:700, color:"var(--ds-text)", fontFamily:"monospace" }}>{f.symbol}</td>
                      <td style={{ padding:"10px 12px" }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background:`${B}18`, color:B }}>{f.type}</span>
                      </td>
                      <td style={{ padding:"10px 12px" }}>
                        <span style={{ fontSize:10, fontWeight:800, padding:"2px 7px", borderRadius:4, background: isLongSide(f.side) ? `${G}18` : `${R}18`, color: isLongSide(f.side) ? G : R }}>
                          {isLongSide(f.side) ? "BUY" : "SELL"}
                        </span>
                      </td>
                      <td style={{ padding:"10px 12px", fontFamily:"monospace" }}>{f.price ? `$${parseFloat(f.price).toFixed(2)}` : "—"}</td>
                      <td style={{ padding:"10px 12px", fontFamily:"monospace" }}>{f.qty ?? "—"}</td>
                      <td style={{ padding:"10px 12px", color: f.pnl == null ? "var(--ds-text-faint)" : f.pnl >= 0 ? G : R, fontFamily:"monospace", fontWeight:700 }}>
                        {f.pnl == null ? "—" : `${f.pnl >= 0 ? "+" : ""}${formatCurrency(f.pnl, { mode: currencyMode, inrRate })}`}
                      </td>
                      <td style={{ padding:"10px 12px", color:"var(--ds-text-faint)", fontSize:11 }}>{f.time ? new Date(f.time).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          rows.length === 0 ? (
            <EmptyState title={emptyCopy.title} sub={emptyCopy.sub} />
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${BORD}` }}>
                    {["","Symbol","Side","Realized PnL","Status","Exit Reason","Time",""].map((h, i) => (
                      <th key={i} style={{ padding:"10px 12px", textAlign:"left", fontSize:9, fontWeight:700, color:"var(--ds-text-faint)", textTransform:"uppercase", letterSpacing:"0.08em", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o, i) => {
                    const id  = o._id || String(i);
                    const pnl = o.pnl ?? 0;
                    const isOpenRow = expanded === id;
                    const isArchived = !!o.archived;
                    return (
                      <Fragment key={id}>
                        <tr
                          style={{
                            borderBottom:`1px solid var(--ds-border)`,
                            background: isOpenRow ? "rgba(59,130,246,0.05)" : isArchived ? "rgba(245,158,11,0.03)" : "",
                            opacity: isArchived && !showArchived ? 0.6 : 1,
                          }}
                        >
                          <td style={{ padding:"10px 8px 10px 12px", color:"var(--ds-text-faint)", cursor:"pointer", width:28 }} onClick={() => setExpanded(isOpenRow ? null : id)}>
                            {isOpenRow ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>

                          <td style={{ padding:"10px 12px", fontWeight:700, color: isArchived ? "var(--ds-text-faint)" : "var(--ds-text)", fontFamily:"monospace", cursor:"pointer" }} onClick={() => setExpanded(isOpenRow ? null : id)}>
                            {o.symbol}
                            {isArchived && <span style={{ marginLeft:6, fontSize:9, fontWeight:700, color:A, background:`${A}18`, padding:"1px 5px", borderRadius:3 }}>ARCHIVED</span>}
                          </td>

                          <td style={{ padding:"10px 12px", cursor:"pointer" }} onClick={() => setExpanded(isOpenRow ? null : id)}>
                            <span style={{ fontSize:10, fontWeight:800, padding:"2px 7px", borderRadius:4, background: isLongSide(o.side) ? `${G}18` : `${R}18`, color: isLongSide(o.side) ? G : R }}>
                              {isLongSide(o.side) ? "LONG" : "SHORT"}
                            </span>
                          </td>

                          <td style={{ padding:"10px 12px", color: pnl >= 0 ? G : R, fontFamily:"monospace", fontWeight:700 }}>
                            {o.status === "OPEN" ? "—" : `${pnl >= 0 ? "+" : ""}${formatCurrency(pnl, { mode: currencyMode, inrRate })}`}
                          </td>

                          <td style={{ padding:"10px 12px" }}>
                            <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background:`${statusColor(o.status)}18`, color: statusColor(o.status), textTransform:"uppercase" }}>
                              {o.status}
                            </span>
                          </td>

                          <td style={{ padding:"10px 12px", color:"var(--ds-text-faint)", fontSize:11 }}>
                            {o.meta?.closeReason ?? o.meta?.exitReason ?? o.exitReason ?? "—"}
                          </td>

                          <td style={{ padding:"10px 12px", color:"var(--ds-text-faint)", fontSize:11 }}>
                            {(o.closedAt || o.openedAt) ? new Date(o.closedAt || o.openedAt).toLocaleString() : "—"}
                          </td>

                          <td style={{ padding:"10px 12px", textAlign:"right" }}>
                            <button
                              onClick={() => handleArchive(id, isArchived)}
                              disabled={archivingId === id}
                              title={isArchived ? "Restore from archive" : "Archive this order"}
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

                        {isOpenRow && (
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
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {confirm && (
        <ConfirmModal
          message={
            confirm.action === "archive-all"
              ? `Archive all ${activeCount} visible order${activeCount !== 1 ? "s" : ""}? They will be hidden from the default view but can be restored.`
              : `Permanently delete all ${archivedCount} archived order${archivedCount !== 1 ? "s" : ""}? This cannot be undone.`
          }
          onConfirm={confirm.action === "archive-all" ? handleArchiveAll : handleClearArchived}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ padding:64, textAlign:"center" }}>
      <ClipboardList size={32} style={{ color:"var(--ds-text-faint)", margin:"0 auto 12px", display:"block" }} />
      <div style={{ fontSize:14, color:"var(--ds-text-faint)", fontWeight:600 }}>{title}</div>
      <div style={{ fontSize:11, color:"var(--ds-text-faint)", marginTop:4 }}>{sub}</div>
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
