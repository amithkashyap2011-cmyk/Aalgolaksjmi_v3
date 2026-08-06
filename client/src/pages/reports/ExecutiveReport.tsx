import React from "react";
import { ReportData } from "./useReportData";
import { RCard, StatTile, Grid, Bar, Pill, fmtUsd, fmtPct, pnlColor } from "./reportUI";

export default function ExecutiveReport({ d }: { d: ReportData }) {
  const s = d.summary || {};
  const regime = s.regime || {};
  const heat = Number(s.currentExposure) || 0;
  const closed = Number(s.closedTrades) || 0;

  return (
    <div className="space-y-3">
      <Grid cols={4}>
        <StatTile label="Total Equity" value={fmtUsd(s.totalEquity)} color="text-primary" />
        <StatTile label="Daily P&L" value={fmtUsd(s.dailyPnL)} color={pnlColor(s.dailyPnL)} />
        <StatTile label="Open P&L" value={fmtUsd(s.openPnL)} color={pnlColor(s.openPnL)} />
        <StatTile label="Win Rate" value={closed > 0 ? fmtPct(s.winRate) : "—"} sub={`${closed} closed`} color="text-success" />
        <StatTile label="Profit Factor" value={s.profitFactor ?? "—"} color="text-primary" />
        <StatTile label="Max Drawdown" value={fmtPct(s.maxDrawdown)} color="text-danger" />
        <StatTile label="Portfolio Heat" value={fmtPct(heat)} color={heat > 40 ? "text-danger" : heat > 20 ? "text-warning" : "text-success"} />
        <StatTile label="Open Positions" value={s.openPositions ?? d.positions.length} />
      </Grid>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <RCard title="Market Regime">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <span className="text-lg font-black uppercase text-dark dark:text-white">{(regime.direction || "SIDEWAYS").replace(/_/g, " ")}</span>
            <Pill tone={String(regime.direction).includes("BULL") ? "green" : String(regime.direction).includes("BEAR") ? "red" : "amber"}>{regime.riskState || "NORMAL"}</Pill>
          </div>
          <div className="text-[10px] text-secondary font-bold uppercase mb-1">Trend Strength {fmtPct(regime.strength, 0)}</div>
          <Bar value={Number(regime.strength) || 0} color="#3b82f6" />
          <div className="text-[10px] text-secondary font-bold uppercase mb-1 mt-3">Consensus {fmtPct(regime.consensus, 0)}</div>
          <Bar value={Number(regime.consensus) || 0} color="#06b6d4" />
          <div className="text-[10px] text-secondary font-bold mt-3">Forecast: <span className="text-dark dark:text-white">{regime.forecast || "N/A"}</span></div>
        </RCard>

        <RCard title="System Health">
          <div className="grid gap-2 grid-collapse-sm" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))" }}>
            {[
              ["AQEA", d.summary?.aqea], ["CNN", d.summary?.cnn], ["PPO", d.summary?.ppo],
              ["Transformer", d.summary?.transformer], ["Mamba", d.summary?.mamba], ["Quant", d.summary?.python],
            ].map(([label, ok]) => (
              <div key={label as string} className="d-flex align-items-center justify-content-between bg-light dark:bg-slate-800 rounded-financial px-2 py-1 border border-financial">
                <span className="text-[10px] font-bold text-secondary uppercase">{label}</span>
                <span className={ok ? "text-success" : "text-secondary"} style={{ fontSize: 10, fontWeight: 800 }}>{ok ? "● UP" : "○ —"}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-secondary font-bold mt-3">
            Mode: <span className="text-dark dark:text-white">{d.mode}</span> · Weather:{" "}
            <span className="text-dark dark:text-white">{d.weather?.enabled === false ? "OFF" : `α ${Number(d.weather?.effectiveAlpha ?? d.weather?.weatherAlpha ?? 0).toFixed(0)}`}</span>
          </div>
        </RCard>
      </div>
    </div>
  );
}
