import React from "react";
import clsx from "clsx";

/* ── formatters ──────────────────────────────────────── */
export const fmtNum = (n: any, d = 2) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
};
export const fmtUsd = (n: any, d = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
export const fmtPct = (n: any, d = 1) => {
  const v = Number(n);
  return Number.isFinite(v) ? `${v.toFixed(d)}%` : "—";
};
export const fmtTime = (t: any) => {
  if (!t) return "—";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? String(t) : d.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
};
export const pnlColor = (n: any) => (Number(n) > 0 ? "text-success" : Number(n) < 0 ? "text-danger" : "text-secondary");

/* ── tolerant trade accessors (store + server shapes differ) ── */
const pick = (o: any, keys: string[], dflt: any = undefined) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return dflt;
};
export const tPnl = (t: any) => Number(pick(t, ["pnl", "realizedPnl", "profit", "netPnl", "pnlUsd"], 0)) || 0;
export const tSymbol = (t: any) => String(pick(t, ["symbol", "pair", "ticker"], "—"));
export const tSide = (t: any) => String(pick(t, ["side", "direction"], "—")).toUpperCase();
export const tQty = (t: any) => Number(pick(t, ["qty", "quantity", "size", "amount"], 0)) || 0;
export const tEntry = (t: any) => Number(pick(t, ["entry", "entryPrice", "avgEntry"], 0)) || 0;
export const tExit = (t: any) => Number(pick(t, ["exit", "exitPrice", "closePrice"], 0)) || 0;
export const tTime = (t: any) => pick(t, ["time", "closedAt", "createdAt", "timestamp", "updatedAt"], null);
export const tStrategy = (t: any) => String(pick(t, ["strategy", "strategyName", "source"], "—"));
export const tStatus = (t: any) => String(pick(t, ["status", "state"], "CLOSED")).toUpperCase();

/* ── layout ──────────────────────────────────────────── */
export function RCard({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("bg-white dark:bg-[#0B1220] border border-financial rounded-financial overflow-hidden", className)}>
      {title && (
        <div className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom border-financial">
          <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{title}</span>
          {action}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

export function StatTile({ label, value, sub, color = "text-dark dark:text-white" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div className="bg-light dark:bg-slate-800 border border-financial rounded-financial p-3">
      <div className="text-[9px] font-bold text-secondary uppercase tracking-widest mb-1">{label}</div>
      <div className={clsx("text-lg font-black font-mono leading-none", color)}>{value}</div>
      {sub != null && <div className="text-[10px] text-secondary font-bold mt-1">{sub}</div>}
    </div>
  );
}

export function Grid({ cols = 4, children }: { cols?: number; children: React.ReactNode }) {
  return <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(140, Math.floor(680 / cols))}px, 1fr))` }}>{children}</div>;
}

export function Bar({ value, max = 100, color = "#3b82f6", height = 6 }: { value: number; max?: number; color?: string; height?: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div style={{ width: "100%", background: "rgba(148,163,184,0.18)", borderRadius: 999, overflow: "hidden", height }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width .4s ease" }} />
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "green" | "red" | "amber" | "blue" | "muted" }) {
  const map: Record<string, string> = {
    green: "bg-success bg-opacity-10 text-success",
    red: "bg-danger bg-opacity-10 text-danger",
    amber: "bg-warning bg-opacity-10 text-warning",
    blue: "bg-primary bg-opacity-10 text-primary",
    muted: "bg-secondary bg-opacity-10 text-secondary",
  };
  return <span className={clsx("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-pill", map[tone])}>{children}</span>;
}

export function Empty({ text = "No data available" }: { text?: string }) {
  return <div className="text-center text-secondary text-xs py-5">{text}</div>;
}

/* ── data table ──────────────────────────────────────── */
export interface Col<T> { key: string; label: string; render?: (row: T) => React.ReactNode; align?: "start" | "end" | "center"; }
export function DataTable<T>({ cols, rows, empty }: { cols: Col<T>[]; rows: T[]; empty?: string }) {
  if (!rows || rows.length === 0) return <Empty text={empty} />;
  return (
    <div className="table-responsive">
      <table className="table table-sm align-middle mb-0">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={clsx("text-[9px] text-secondary fw-bold text-uppercase border-financial", `text-${c.align || "start"}`)} style={{ letterSpacing: "0.06em" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.key} className={clsx("text-xs border-financial text-dark dark:text-white", `text-${c.align || "start"}`)}>
                  {c.render ? c.render(row) : (row as any)[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── inline SVG sparkline / equity curve ─────────────── */
export function Sparkline({ data, color = "#10b981", height = 64, fill = true }: { data: number[]; color?: string; height?: number; fill?: boolean }) {
  if (!data || data.length < 2) return <Empty text="Not enough points" />;
  const w = 600;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((d, i) => [i * step, height - ((d - min) / range) * (height - 8) - 4]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      {fill && <path d={area} fill={color} opacity={0.12} />}
      <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ── CSV / JSON export (client-side, no backend) ─────── */
export function downloadCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows || rows.length === 0) return;
  const headerSet = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) headerSet.add(k);
  const headers = Array.from(headerSet);
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  triggerDownload(filename, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
}
export function downloadJSON(filename: string, data: any) {
  triggerDownload(filename, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
}
function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
