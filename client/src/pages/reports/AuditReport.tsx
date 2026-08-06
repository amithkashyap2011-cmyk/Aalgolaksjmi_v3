import React, { useMemo, useState } from "react";
import { ReportData } from "./useReportData";
import { RCard, DataTable, Pill, fmtTime } from "./reportUI";

const sevTone = (s: string): "green" | "red" | "amber" | "muted" => {
  const v = String(s).toUpperCase();
  if (v === "GREEN" || v === "INFO") return "green";
  if (v === "RED" || v === "CRITICAL" || v === "ERROR") return "red";
  if (v === "AMBER" || v === "WARN" || v === "WARNING") return "amber";
  return "muted";
};

export default function AuditReport({ d }: { d: ReportData }) {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    // Merge alerts + decision logs into a single audit trail
    const fromAlerts = (d.alerts || []).map((a: any) => ({
      time: a.createdAt || a.timestamp || a.time,
      source: "ALERT", severity: a.severity || "INFO", symbol: a.symbol || "—",
      message: a.title ? `${a.title}${a.message ? " — " + a.message : ""}` : a.message || "",
    }));
    const fromLogs = (d.logs || []).map((l: any) => ({
      time: l.timestamp || l.time,
      source: "DECISION", severity: (l.decision || "HOLD"), symbol: l.symbol || "—",
      message: l.message || `${l.decision || ""} ${l.score != null ? `(${l.score}%)` : ""}`.trim(),
    }));
    let merged = [...fromAlerts, ...fromLogs].sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());
    if (q.trim()) {
      const needle = q.toLowerCase();
      merged = merged.filter((r) => `${r.symbol} ${r.message} ${r.source}`.toLowerCase().includes(needle));
    }
    return merged.slice(0, 200);
  }, [d.alerts, d.logs, q]);

  return (
    <RCard
      title={`Audit Trail · ${rows.length}`}
      action={
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…"
          className="form-control form-control-sm shadow-none" style={{ width: 160, fontSize: 11 }} />
      }
    >
      <DataTable
        rows={rows}
        empty="No audit events"
        cols={[
          { key: "time", label: "Time", render: (r) => <span className="text-secondary font-mono text-[10px]">{fmtTime(r.time)}</span> },
          { key: "source", label: "Source", render: (r) => <Pill tone={r.source === "ALERT" ? "amber" : "blue"}>{r.source}</Pill> },
          { key: "severity", label: "Level", render: (r) => <Pill tone={sevTone(r.severity)}>{String(r.severity).toUpperCase()}</Pill> },
          { key: "symbol", label: "Symbol", render: (r) => <span className="fw-bold">{r.symbol}</span> },
          { key: "message", label: "Detail", render: (r) => <span className="text-secondary text-[11px]">{r.message}</span> },
        ]}
      />
    </RCard>
  );
}
