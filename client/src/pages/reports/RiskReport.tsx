import React from "react";
import { ReportData } from "./useReportData";
import { RCard, StatTile, Grid, Bar, Pill, Empty, fmtPct, fmtUsd, pnlColor } from "./reportUI";

export default function RiskReport({ d }: { d: ReportData }) {
  const s = d.summary || {};
  const heat = Number(s.currentExposure) || 0;
  const dd = Number(s.maxDrawdown) || 0;
  const grossExposure = d.positions.reduce((a, p) => a + Math.abs((Number(p.qty) || 0) * (Number(p.entry) || 0)), 0);
  const risk = d.risk || {};

  return (
    <div className="space-y-3">
      <Grid cols={4}>
        <StatTile label="Portfolio Heat" value={fmtPct(heat)} color={heat > 40 ? "text-danger" : heat > 20 ? "text-warning" : "text-success"} />
        <StatTile label="Max Drawdown" value={fmtPct(dd)} color="text-danger" />
        <StatTile label="Open Positions" value={d.positions.length} />
        <StatTile label="Gross Exposure" value={fmtUsd(grossExposure)} color="text-primary" />
        <StatTile label="Open P&L" value={fmtUsd(s.openPnL)} color={pnlColor(s.openPnL)} />
        <StatTile label="Risk State" value={s.regime?.riskState || "NORMAL"} color="text-warning" />
        <StatTile label="Weather Effect" value={d.weather?.enabled === false ? "OFF" : "ON"} sub={d.weather?.enabled === false ? undefined : `α ${Number(d.weather?.effectiveAlpha ?? d.weather?.weatherAlpha ?? 0).toFixed(0)}`} />
        <StatTile label="Daily P&L" value={fmtUsd(s.dailyPnL)} color={pnlColor(s.dailyPnL)} />
      </Grid>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <RCard title="Heat & Drawdown">
          <div className="text-[10px] text-secondary font-bold uppercase mb-1">Portfolio Heat — {fmtPct(heat)}</div>
          <Bar value={heat} color={heat > 40 ? "#f43f5e" : heat > 20 ? "#f59e0b" : "#10b981"} height={8} />
          <div className="text-[10px] text-secondary font-bold uppercase mb-1 mt-3">Max Drawdown — {fmtPct(dd)}</div>
          <Bar value={dd} color="#f43f5e" height={8} />
          <div className="text-[9px] text-secondary mt-3">Heat thresholds: &lt;20% safe · 20–40% elevated · &gt;40% critical (entries tighten / block).</div>
        </RCard>

        <RCard title="Risk Orchestration">
          {risk && Object.keys(risk).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(risk).slice(0, 8).map(([k, v]) => (
                <div key={k} className="d-flex align-items-center justify-content-between border-bottom border-financial pb-1">
                  <span className="text-[10px] text-secondary font-bold uppercase">{k.replace(/_/g, " ")}</span>
                  <span className="text-xs text-dark dark:text-white font-mono fw-bold">
                    {typeof v === "boolean" ? <Pill tone={v ? "green" : "muted"}>{v ? "ON" : "OFF"}</Pill> : typeof v === "object" ? "—" : String(v)}
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty text="Risk orchestration endpoint returned no data" />}
        </RCard>
      </div>
    </div>
  );
}
