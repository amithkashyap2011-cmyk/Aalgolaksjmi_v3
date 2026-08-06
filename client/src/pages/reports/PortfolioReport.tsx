import React, { useMemo } from "react";
import { ReportData } from "./useReportData";
import { RCard, StatTile, Grid, DataTable, Bar, Pill, fmtUsd, fmtNum, pnlColor } from "./reportUI";

export default function PortfolioReport({ d }: { d: ReportData }) {
  const s = d.summary || {};
  const positions = d.positions;

  const alloc = useMemo(() => {
    const withVal = positions.map((p) => ({
      symbol: p.symbol, side: String(p.side || "").toUpperCase(),
      notional: Math.abs((Number(p.qty) || 0) * (Number(p.entry) || 0)),
      pnl: Number(p.pnl) || 0, leverage: Number(p.leverage) || 1,
    }));
    const total = withVal.reduce((a, p) => a + p.notional, 0) || 1;
    return withVal.map((p) => ({ ...p, weight: (p.notional / total) * 100 })).sort((a, b) => b.notional - a.notional);
  }, [positions]);

  const walletBal = Number(d.wallet?.usdt ?? d.wallet?.balance ?? s.totalEquity) || 0;
  const openPnl = positions.reduce((a, p) => a + (Number(p.pnl) || 0), 0);

  return (
    <div className="space-y-3">
      <Grid cols={4}>
        <StatTile label="Total Equity" value={fmtUsd(s.totalEquity)} color="text-primary" />
        <StatTile label="Wallet Balance" value={fmtUsd(walletBal)} />
        <StatTile label="Open Positions" value={positions.length} />
        <StatTile label="Open P&L" value={fmtUsd(openPnl)} color={pnlColor(openPnl)} />
      </Grid>

      <RCard title="Allocation by Position">
        {alloc.length === 0 ? <div className="text-secondary text-xs text-center py-4">No open positions</div> : (
          <div className="space-y-2">
            {alloc.map((p, i) => (
              <div key={i} className="d-flex align-items-center gap-2">
                <span className="fw-bold text-xs text-dark dark:text-white" style={{ width: 90 }}>{p.symbol}</span>
                <Pill tone={p.side === "BUY" ? "green" : "red"}>{p.side}</Pill>
                <div style={{ flex: 1 }}><Bar value={p.weight} color="#3b82f6" /></div>
                <span className="text-[10px] text-secondary font-mono" style={{ width: 48, textAlign: "right" }}>{p.weight.toFixed(1)}%</span>
                <span className="text-[10px] text-dark dark:text-white font-mono" style={{ width: 90, textAlign: "right" }}>{fmtUsd(p.notional)}</span>
              </div>
            ))}
          </div>
        )}
      </RCard>

      <RCard title="Position Detail">
        <DataTable
          rows={alloc}
          empty="No open positions"
          cols={[
            { key: "symbol", label: "Symbol", render: (r) => <span className="fw-bold">{r.symbol}</span> },
            { key: "side", label: "Side", render: (r) => <Pill tone={r.side === "BUY" ? "green" : "red"}>{r.side}</Pill> },
            { key: "leverage", label: "Lev", align: "center", render: (r) => `${r.leverage}x` },
            { key: "notional", label: "Notional", align: "end", render: (r) => fmtUsd(r.notional) },
            { key: "weight", label: "Weight", align: "end", render: (r) => `${r.weight.toFixed(1)}%` },
            { key: "pnl", label: "P&L", align: "end", render: (r) => <span className={pnlColor(r.pnl)}>{fmtUsd(r.pnl)}</span> },
          ]}
        />
      </RCard>
    </div>
  );
}
