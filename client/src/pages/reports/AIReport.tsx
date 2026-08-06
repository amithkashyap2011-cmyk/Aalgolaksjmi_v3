import React from "react";
import { ReportData } from "./useReportData";
import { RCard, DataTable, Pill, Bar, Empty, fmtPct, fmtTime } from "./reportUI";

export default function AIReport({ d }: { d: ReportData }) {
  const models = d.models || [];
  const timeline = d.aiTimeline || [];

  return (
    <div className="space-y-3">
      <RCard title={`AI Model Registry · ${models.length} models`}>
        <DataTable
          rows={models}
          empty="No models registered"
          cols={[
            { key: "name", label: "Model", render: (m: any) => <span className="fw-bold">{m.name || m.id}</span> },
            { key: "category", label: "Category", render: (m: any) => <span className="text-secondary text-[10px]">{m.category}</span> },
            { key: "enabled", label: "State", render: (m: any) => <Pill tone={m.enabled ? "green" : "muted"}>{m.enabled ? "ON" : "OFF"}</Pill> },
            { key: "status", label: "Health", render: (m: any) => <Pill tone={m.status === "healthy" ? "green" : m.status === "unavailable" ? "red" : "amber"}>{m.status || "—"}</Pill> },
            { key: "weight", label: "Weight", align: "end", render: (m: any) => fmtPct((Number(m.weight) || 0) * 100, 0) },
            { key: "acc", label: "Dir. Acc", align: "end", render: (m: any) => m.metrics?.directionalAccuracy || "—" },
          ]}
        />
      </RCard>

      <RCard title="Ensemble Weight Distribution">
        {models.filter((m: any) => m.enabled).length === 0 ? <Empty text="No enabled models" /> : (
          <div className="space-y-2">
            {models.filter((m: any) => m.enabled).map((m: any) => (
              <div key={m.id} className="d-flex align-items-center gap-2">
                <span className="text-[10px] font-bold text-secondary uppercase" style={{ width: 120 }}>{m.name}</span>
                <div style={{ flex: 1 }}><Bar value={(Number(m.weight) || 0) * 100} color="#06b6d4" /></div>
                <span className="text-[10px] font-mono text-dark dark:text-white" style={{ width: 44, textAlign: "right" }}>{fmtPct((Number(m.weight) || 0) * 100, 0)}</span>
              </div>
            ))}
          </div>
        )}
      </RCard>

      <RCard title="AI Decision Timeline">
        <DataTable
          rows={timeline.slice(0, 40)}
          empty="No AI timeline events"
          cols={[
            { key: "time", label: "Time", render: (e: any) => <span className="text-secondary font-mono text-[10px]">{fmtTime(e.timestamp || e.time || e.createdAt)}</span> },
            { key: "symbol", label: "Symbol", render: (e: any) => <span className="fw-bold">{e.symbol || "—"}</span> },
            { key: "decision", label: "Decision", render: (e: any) => { const v = String(e.decision || e.action || "HOLD").toUpperCase(); return <Pill tone={v === "LONG" || v === "BUY" ? "green" : v === "SHORT" || v === "SELL" ? "red" : "blue"}>{v}</Pill>; } },
            { key: "confidence", label: "Conf", align: "end", render: (e: any) => e.confidence != null ? `${Number(e.confidence)}%` : "—" },
          ]}
        />
      </RCard>
    </div>
  );
}
