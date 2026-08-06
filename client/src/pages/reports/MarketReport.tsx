import React from "react";
import { ReportData } from "./useReportData";
import { RCard, StatTile, Grid, Bar, Pill, Empty, fmtPct } from "./reportUI";
import { useDashboardStore } from "../../store/useDashboardStore";

export default function MarketReport({ d }: { d: ReportData }) {
  const regime = d.summary?.regime || {};
  const headerData = useDashboardStore((s) => s.headerData) || [];
  const spectral = d.spectral || {};

  return (
    <div className="space-y-3">
      <Grid cols={4}>
        <StatTile label="Regime" value={(regime.direction || "SIDEWAYS").replace(/_/g, " ")} color="text-primary" />
        <StatTile label="Trend Strength" value={fmtPct(regime.strength, 0)} />
        <StatTile label="Consensus" value={fmtPct(regime.consensus, 0)} />
        <StatTile label="Forecast" value={regime.forecast || "N/A"} />
      </Grid>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <RCard title="Live Tickers">
          {headerData.length === 0 ? <Empty text="No ticker data" /> : (
            <div className="space-y-2">
              {headerData.slice(0, 10).map((t: any, i: number) => {
                const chg = Number(t.changePercent ?? t.change ?? t.priceChangePercent) || 0;
                return (
                  <div key={i} className="d-flex align-items-center justify-content-between border-bottom border-financial pb-1">
                    <span className="fw-bold text-xs text-dark dark:text-white">{t.symbol}</span>
                    <div className="d-flex align-items-center gap-3">
                      <span className="text-[11px] font-mono text-secondary">{t.price ?? t.lastPrice ?? "—"}</span>
                      <span className={`text-[11px] font-mono fw-bold ${chg >= 0 ? "text-success" : "text-danger"}`} style={{ width: 64, textAlign: "right" }}>
                        {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </RCard>

        <RCard title="Spectral Regime">
          {spectral && Object.keys(spectral).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(spectral).slice(0, 8).map(([k, v]) => (
                <div key={k} className="d-flex align-items-center justify-content-between border-bottom border-financial pb-1">
                  <span className="text-[10px] text-secondary font-bold uppercase">{k.replace(/_/g, " ")}</span>
                  <span className="text-xs font-mono text-dark dark:text-white fw-bold">
                    {typeof v === "boolean" ? <Pill tone={v ? "green" : "muted"}>{v ? "YES" : "NO"}</Pill> : typeof v === "object" ? "—" : String(v)}
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty text="Spectral regime endpoint returned no data" />}
        </RCard>
      </div>

      <RCard title="Regime Strength / Consensus">
        <div className="text-[10px] text-secondary font-bold uppercase mb-1">Trend Strength</div>
        <Bar value={Number(regime.strength) || 0} color="#3b82f6" height={8} />
        <div className="text-[10px] text-secondary font-bold uppercase mb-1 mt-3">Consensus</div>
        <Bar value={Number(regime.consensus) || 0} color="#06b6d4" height={8} />
      </RCard>
    </div>
  );
}
