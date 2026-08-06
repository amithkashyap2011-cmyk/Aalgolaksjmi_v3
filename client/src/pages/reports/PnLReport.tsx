import React, { useMemo } from "react";
import { ReportData } from "./useReportData";
import { RCard, StatTile, Grid, DataTable, Bar, fmtUsd, fmtPct, pnlColor, tPnl, tSymbol, tTime } from "./reportUI";

export default function PnLReport({ d }: { d: ReportData }) {
  const s = d.summary || {};
  const openPnl = d.positions.reduce((a, p) => a + (Number(p.pnl) || 0), 0);

  const bySymbol = useMemo(() => {
    const m = new Map<string, { symbol: string; pnl: number; trades: number }>();
    for (const t of d.trades) {
      const sym = tSymbol(t);
      const cur = m.get(sym) || { symbol: sym, pnl: 0, trades: 0 };
      cur.pnl += tPnl(t); cur.trades += 1;
      m.set(sym, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.pnl - a.pnl);
  }, [d.trades]);

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of d.trades) {
      const tm = tTime(t);
      const key = tm ? new Date(tm).toISOString().slice(0, 10) : "—";
      m.set(key, (m.get(key) || 0) + tPnl(t));
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  }, [d.trades]);

  const realized = d.trades.reduce((a, t) => a + tPnl(t), 0);
  const maxAbsDay = Math.max(1, ...byDay.map(([, v]) => Math.abs(v)));

  return (
    <div className="space-y-3">
      <Grid cols={4}>
        <StatTile label="Realized P&L" value={fmtUsd(realized)} color={pnlColor(realized)} />
        <StatTile label="Unrealized (Open)" value={fmtUsd(openPnl)} color={pnlColor(openPnl)} />
        <StatTile label="Daily P&L" value={fmtUsd(s.dailyPnL)} color={pnlColor(s.dailyPnL)} />
        <StatTile label="Total Net" value={fmtUsd(realized + openPnl)} color={pnlColor(realized + openPnl)} />
      </Grid>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <RCard title="P&L by Symbol">
          <DataTable
            rows={bySymbol}
            empty="No closed trades"
            cols={[
              { key: "symbol", label: "Symbol", render: (r) => <span className="fw-bold">{r.symbol}</span> },
              { key: "trades", label: "Trades", align: "center" },
              { key: "pnl", label: "P&L", align: "end", render: (r) => <span className={pnlColor(r.pnl)}>{fmtUsd(r.pnl)}</span> },
            ]}
          />
        </RCard>

        <RCard title="Daily P&L (last 14 days)">
          {byDay.length === 0 ? <div className="text-secondary text-xs text-center py-4">No data</div> : (
            <div className="space-y-2">
              {byDay.map(([day, v]) => (
                <div key={day} className="d-flex align-items-center gap-2">
                  <span className="text-[10px] text-secondary font-mono" style={{ width: 70 }}>{day.slice(5)}</span>
                  <div style={{ flex: 1 }}><Bar value={Math.abs(v)} max={maxAbsDay} color={v >= 0 ? "#10b981" : "#f43f5e"} /></div>
                  <span className={`text-[10px] font-mono fw-bold ${pnlColor(v)}`} style={{ width: 80, textAlign: "right" }}>{fmtUsd(v)}</span>
                </div>
              ))}
            </div>
          )}
        </RCard>
      </div>
    </div>
  );
}
