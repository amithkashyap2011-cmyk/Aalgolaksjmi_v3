import React, { useMemo } from "react";
import { ReportData } from "./useReportData";
import { RCard, DataTable, Bar, Empty, fmtUsd, fmtPct, pnlColor, tPnl, tStrategy } from "./reportUI";

function WeightList({ weights }: { weights: Record<string, number> | null }) {
  if (!weights || Object.keys(weights).length === 0) return <Empty text="No weights available" />;
  const entries = Object.entries(weights).filter(([, v]) => typeof v === "number").sort((a, b) => Number(b[1]) - Number(a[1]));
  const max = Math.max(1, ...entries.map(([, v]) => Number(v)));
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="d-flex align-items-center gap-2">
          <span className="text-[10px] font-bold text-secondary uppercase" style={{ width: 110 }}>{k.replace(/_/g, " ")}</span>
          <div style={{ flex: 1 }}><Bar value={Number(v)} max={max} color="#8b5cf6" /></div>
          <span className="text-[10px] font-mono text-dark dark:text-white" style={{ width: 56, textAlign: "right" }}>
            {Number(v) <= 1 ? fmtPct(Number(v) * 100, 0) : Number(v).toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function StrategyReport({ d }: { d: ReportData }) {
  const byStrategy = useMemo(() => {
    const m = new Map<string, { strategy: string; pnl: number; trades: number; wins: number }>();
    for (const t of d.trades) {
      const key = tStrategy(t);
      const cur = m.get(key) || { strategy: key, pnl: 0, trades: 0, wins: 0 };
      cur.pnl += tPnl(t); cur.trades += 1; if (tPnl(t) > 0) cur.wins += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).map((r) => ({ ...r, winRate: r.trades ? (r.wins / r.trades) * 100 : 0 })).sort((a, b) => b.pnl - a.pnl);
  }, [d.trades]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <RCard title="Strategy Weights"><WeightList weights={d.strategyWeights} /></RCard>
        <RCard title="Animal Behaviour Weights"><WeightList weights={d.animalWeights} /></RCard>
      </div>

      <RCard title="Per-Strategy Attribution (closed trades)">
        <DataTable
          rows={byStrategy}
          empty="No closed trades to attribute"
          cols={[
            { key: "strategy", label: "Strategy", render: (r) => <span className="fw-bold">{r.strategy}</span> },
            { key: "trades", label: "Trades", align: "center" },
            { key: "winRate", label: "Win Rate", align: "end", render: (r) => fmtPct(r.winRate) },
            { key: "pnl", label: "Net P&L", align: "end", render: (r) => <span className={pnlColor(r.pnl)}>{fmtUsd(r.pnl)}</span> },
          ]}
        />
      </RCard>
    </div>
  );
}
