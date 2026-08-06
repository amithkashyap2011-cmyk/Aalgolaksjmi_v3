import React, { useMemo } from "react";
import { ReportData } from "./useReportData";
import { RCard, StatTile, Grid, Sparkline, Empty, fmtUsd, fmtPct, fmtNum, pnlColor, tPnl } from "./reportUI";

export default function PerformanceReport({ d }: { d: ReportData }) {
  const stats = useMemo(() => {
    const closed = d.trades.filter((t) => Number.isFinite(tPnl(t)));
    const pnls = closed.map(tPnl);
    const wins = pnls.filter((p) => p > 0);
    const losses = pnls.filter((p) => p < 0);
    const gross = wins.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
    const total = pnls.reduce((a, b) => a + b, 0);

    // equity curve (oldest → newest)
    const ordered = [...closed].reverse();
    let eq = 0;
    const curve = ordered.map((t) => (eq += tPnl(t)));

    // streaks
    let curStreak = 0, bestWin = 0, bestLoss = 0;
    for (const p of ordered.map(tPnl)) {
      if (p > 0) { curStreak = curStreak > 0 ? curStreak + 1 : 1; bestWin = Math.max(bestWin, curStreak); }
      else if (p < 0) { curStreak = curStreak < 0 ? curStreak - 1 : -1; bestLoss = Math.min(bestLoss, curStreak); }
    }
    return {
      n: pnls.length, total, wins: wins.length, losses: losses.length,
      winRate: pnls.length ? (wins.length / pnls.length) * 100 : 0,
      pf: grossLoss > 0 ? gross / grossLoss : gross > 0 ? Infinity : 0,
      avgWin: wins.length ? gross / wins.length : 0,
      avgLoss: losses.length ? -grossLoss / losses.length : 0,
      best: pnls.length ? Math.max(...pnls) : 0,
      worst: pnls.length ? Math.min(...pnls) : 0,
      curve, bestWin, bestLoss: Math.abs(bestLoss),
    };
  }, [d.trades]);

  return (
    <div className="space-y-3">
      <Grid cols={4}>
        <StatTile label="Net P&L" value={fmtUsd(stats.total)} color={pnlColor(stats.total)} />
        <StatTile label="Trades" value={stats.n} sub={`${stats.wins}W / ${stats.losses}L`} />
        <StatTile label="Win Rate" value={fmtPct(stats.winRate)} color="text-success" />
        <StatTile label="Profit Factor" value={stats.pf === Infinity ? "∞" : fmtNum(stats.pf)} color="text-primary" />
        <StatTile label="Avg Win" value={fmtUsd(stats.avgWin)} color="text-success" />
        <StatTile label="Avg Loss" value={fmtUsd(stats.avgLoss)} color="text-danger" />
        <StatTile label="Best Trade" value={fmtUsd(stats.best)} color="text-success" />
        <StatTile label="Worst Trade" value={fmtUsd(stats.worst)} color="text-danger" />
        <StatTile label="Longest Win Streak" value={stats.bestWin} color="text-success" />
        <StatTile label="Longest Loss Streak" value={stats.bestLoss} color="text-danger" />
        <StatTile label="Expectancy / Trade" value={fmtUsd(stats.n ? stats.total / stats.n : 0)} color={pnlColor(stats.total)} />
      </Grid>

      <RCard title="Cumulative Equity Curve (realized)">
        {stats.curve.length > 1 ? <Sparkline data={stats.curve} color={stats.total >= 0 ? "#10b981" : "#f43f5e"} height={120} /> : <Empty text="Not enough closed trades to plot" />}
      </RCard>
    </div>
  );
}
