import { useEffect, useState } from "react";

/**
 * Compact "how much did I put in today" strip for positions panels: invested
 * capital today (most money in trades at once), holding now (open capital + open P/L) and closed today (net P/L
 * after charges). Today's row of the daily-summary endpoint (IST day).
 */
interface TodayRow {
  opened: number; invested: number; peak: number;
  closedCount: number; closedCost: number; won: number; lost: number; realizedNet: number;
  holdingCount: number; holdingCost: number; unrealized: number | null;
}

const todayIst = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

export default function TodayInvestedStrip({ endpoint, currency }: { endpoint: string; currency: "₹" | "$" }) {
  const [row, setRow] = useState<TodayRow | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(endpoint)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive || !d) return;
          const today = (Array.isArray(d.rows) ? d.rows : []).find((r: any) => r.date === todayIst());
          setRow(today ?? null);
          setLoaded(true);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [endpoint]);

  const fmt = (v: number, signed = false) => {
    const s = `${currency}${Math.abs(v).toLocaleString(currency === "₹" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return v < 0 ? `−${s}` : signed && v > 0 ? `+${s}` : s;
  };
  const color = (v: number) => (v > 0 ? "#10b981" : v < 0 ? "#ef4444" : "#94a3b8");
  const r = row ?? { opened: 0, invested: 0, peak: 0, closedCount: 0, closedCost: 0, won: 0, lost: 0, realizedNet: 0, holdingCount: 0, holdingCost: 0, unrealized: 0 };

  const cell = (label: string, value: string, sub: React.ReactNode, valueColor = "#f8fafc") => (
    <div style={{ flex: "1 1 150px", minWidth: 0, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid #1e293b" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: valueColor, fontFamily: "monospace", marginTop: 2, whiteSpace: "nowrap" }}>{loaded ? value : "—"}</div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{loaded ? sub : " "}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      {/* Invested capital = most money in trades at once today (cash is reused
          across trades, so the sum of entries overstates what was put in). */}
      {cell("Invested capital today", fmt(r.peak), `${r.opened} trade${r.opened === 1 ? "" : "s"}${r.opened ? ` · entries total ${fmt(r.invested)}` : ""}`)}
      {cell("Holding now", fmt(r.holdingCost),
        <>
          {r.holdingCount} open
          {r.holdingCount > 0 && r.unrealized !== null && <span style={{ color: color(r.unrealized), fontWeight: 700 }}> · {fmt(r.unrealized, true)}</span>}
        </>, "#fbbf24")}
      {cell("Closed today · net P/L", r.closedCount ? fmt(r.realizedNet, true) : fmt(0),
        `${r.closedCount} closed${r.closedCount ? ` · ${r.won}W/${r.lost}L` : ""}`,
        r.closedCount ? color(r.realizedNet) : "#f8fafc")}
    </div>
  );
}
