import { useEffect, useState } from "react";

/**
 * Per-day capital and P&L, shared by the Indian and crypto dashboards:
 * invested capital each day (the most that was in the market at once, with
 * the total of trade entries as a sub-line), what closed (with net P&L after charges) and what was still held at
 * the end of the day (right now, for today). Days are IST calendar days.
 * Data: GET /api/indian-market/daily-summary or /trading/daily-summary.
 */
interface DailyRow {
  date: string;
  opened: number;
  invested: number;
  peak: number;
  closedCount: number;
  closedCost: number;
  won: number;
  lost: number;
  charges: number;
  realizedNet: number;
  holdingCount: number;
  holdingCost: number;
  unrealized: number | null;
}

interface Props {
  endpoint: string;
  currency: "₹" | "$";
  hidden?: boolean;
  title?: string;
}

const fmt = (cur: string, v: number, signed = false) => {
  const s = `${cur}${Math.abs(v).toLocaleString(cur === "₹" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return v < 0 ? `−${s}` : signed && v > 0 ? `+${s}` : s;
};
const todayIst = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const label = (d: string) => {
  if (d === todayIst()) return "Today";
  const dt = new Date(`${d}T00:00:00Z`);
  return dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};

export default function DailyCapitalTable({ endpoint, currency, hidden, title = "Day by day" }: Props) {
  const [rows, setRows] = useState<DailyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(endpoint)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => { if (alive) { setRows(Array.isArray(d?.rows) ? d.rows : []); setError(null); } })
        .catch((e) => { if (alive) setError(e?.message || "Failed to load"); });
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [endpoint]);

  const mask = "••••";
  const money = (v: number, signed = false) => (hidden ? mask : fmt(currency, v, signed));
  const pnlColor = (v: number) => (v > 0 ? "#34d399" : v < 0 ? "#f87171" : "#94a3b8");
  const shown = rows ? (showAll ? rows : rows.slice(0, 7)) : [];

  const th: React.CSSProperties = { padding: "7px 10px", fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid rgba(255,255,255,0.08)" };
  const td: React.CSSProperties = { padding: "7px 10px", fontSize: 12, fontFamily: "monospace", color: "#e2e8f0", textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid rgba(255,255,255,0.05)" };
  const sub: React.CSSProperties = { fontSize: 10, color: "#94a3b8", fontFamily: "inherit" };

  return (
    <div style={{ marginBottom: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px 6px" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
        <span style={{ fontSize: 10, color: "#64748b" }}>IST days · net P/L after charges</span>
      </div>
      {error && <div style={{ padding: "8px 14px", fontSize: 11, color: "#f87171" }}>Couldn't load daily summary ({error})</div>}
      {!error && rows === null && <div style={{ padding: "8px 14px 12px", fontSize: 11, color: "#94a3b8" }}>Loading…</div>}
      {!error && rows && rows.length === 0 && <div style={{ padding: "8px 14px 12px", fontSize: 11, color: "#94a3b8" }}>No trades in the last 30 days.</div>}
      {!error && rows && rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Day</th>
                <th style={th} title="Most money in open trades at the same time that day — the capital actually used (cash is reused across trades)">Invested capital</th>
                <th style={th} title="Trades closed that day (won / lost)">Closed</th>
                <th style={th} title="Net P/L of trades closed that day (after charges)">Closed P/L</th>
                <th style={th} title="Still open at the end of the day (right now, for today)">Holding</th>
                <th style={th} title="Current open P/L — shown for today only">Open P/L</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const isToday = r.date === todayIst();
                return (
                  <tr key={r.date} style={isToday ? { background: "rgba(56,189,248,0.06)" } : undefined}>
                    <td style={{ ...td, textAlign: "left", fontFamily: "inherit", fontWeight: isToday ? 800 : 600, color: isToday ? "#38bdf8" : "#e2e8f0" }}>{label(r.date)}</td>
                    <td style={{ ...td, fontWeight: 800 }}>
                      {money(r.peak)}
                      <div style={sub}>{r.opened} trade{r.opened === 1 ? "" : "s"}{r.opened ? ` · entries ${money(r.invested)}` : ""}</div>
                    </td>
                    <td style={{ ...td, fontFamily: "inherit" }}>{r.closedCount ? `${r.closedCount} · ${r.won}W/${r.lost}L` : "—"}</td>
                    <td style={{ ...td, color: hidden ? td.color : pnlColor(r.realizedNet), fontWeight: 800 }}>
                      {r.closedCount ? money(r.realizedNet, true) : "—"}
                      {r.charges > 0 && !hidden && <div style={sub}>charges {fmt(currency, r.charges)}</div>}
                    </td>
                    <td style={td}>{r.holdingCount ? money(r.holdingCost) : "—"}<div style={sub}>{r.holdingCount ? `${r.holdingCount} open` : ""}</div></td>
                    <td style={{ ...td, color: hidden || r.unrealized === null ? td.color : pnlColor(r.unrealized), fontWeight: 800 }}>
                      {r.unrealized === null || !r.holdingCount ? "—" : money(r.unrealized, true)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 7 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} style={{ margin: "6px 14px 10px", fontSize: 11, fontWeight: 700, color: "#38bdf8", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              {showAll ? "Show last 7 days" : `Show all ${rows.length} days`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
