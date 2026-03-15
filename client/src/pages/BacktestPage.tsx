/*
 * ─── BacktestPage ──────────────────────────────────────
 *
 * Phase 2: Form (symbol, timeframe, dates, strategy multi-select).
 * Placeholder equity curve chart + mock summary stats.
 * 100% responsive. Mock data only.
 */
import { useState, useMemo } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import SymbolSelector from "../ui/SymbolSelector";
import Button from "../ui/Button";
import Card from "../ui/Card";
import PageShell from "../components/layout/PageShell";
import { BACKTEST_STRATEGIES, MOCK_BACKTEST_STATS, TIMEFRAMES } from "../mock/data";

export default function BacktestPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set(["Lakshmi Master"]));
  const [hasRun, setHasRun] = useState(false);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  /* Mock equity curve data */
  const equityData = useMemo(() => {
    if (!hasRun) return [];
    let equity = 5000;
    const now = Date.now();
    return Array.from({ length: 200 }, (_, i) => {
      equity += (Math.random() - 0.45) * 30;
      return [now - (200 - i) * 3_600_000, +equity.toFixed(2)];
    });
  }, [hasRun]);

  const equityOpts: Highcharts.Options = {
    chart: { height: 260, backgroundColor: "transparent", style: { fontFamily: "inherit" } },
    title: { text: "" },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: { type: "datetime", lineColor: "#e2e8f0" },
    yAxis: { title: { text: "" }, gridLineColor: "#f1f5f9" },
    series: [{
      type: "area",
      name: "Equity",
      data: equityData,
      color: "#00b96b",
      fillColor: {
        linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
        stops: [[0, "rgba(0,185,107,0.2)"], [1, "rgba(0,185,107,0)"]],
      } as unknown as Highcharts.ColorType,
      lineWidth: 2,
      marker: { enabled: false },
    }],
  };

  const stats = MOCK_BACKTEST_STATS;

  return (
    <PageShell title="Backtest">
      {/* Form */}
      <Card className="p-phi-5">
        <form className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-phi-4" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="block text-phi-xs font-medium text-slate-500 mb-1">Symbol</label>
            <SymbolSelector compact />
          </div>
          <div>
            <label className="block text-phi-xs font-medium text-slate-500 mb-1">Timeframe</label>
            <select className="w-full p-2.5 border border-slate-200 rounded-phi text-phi-sm">
              {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-phi-xs font-medium text-slate-500 mb-1">Start Date</label>
            <input type="date" defaultValue="2025-01-01" className="w-full p-2.5 border border-slate-200 rounded-phi text-phi-sm" />
          </div>
          <div>
            <label className="block text-phi-xs font-medium text-slate-500 mb-1">End Date</label>
            <input type="date" defaultValue="2025-03-15" className="w-full p-2.5 border border-slate-200 rounded-phi text-phi-sm" />
          </div>

          {/* Strategy multi-select */}
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-phi-xs font-medium text-slate-500 mb-2">
              Strategies <span className="text-slate-400">({selected.size} selected)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-phi-2">
              {BACKTEST_STRATEGIES.map((s) => {
                const isOn = selected.has(s);
                return (
                  <label
                    key={s}
                    className={`flex items-center gap-2 px-phi-3 py-2 rounded-phi border cursor-pointer transition-all duration-200 ${
                      isOn
                        ? "border-aalgreen bg-aalgreen/5 text-aalgreen shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => toggle(s)}
                      className="accent-aalgreen rounded"
                    />
                    <span className="text-phi-xs font-medium">{s}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-phi-3">
            <Button type="button" onClick={() => setHasRun(true)}>
              🚀 Run Backtest
            </Button>
            <span className="text-phi-xs text-slate-400">
              {selected.size} {selected.size === 1 ? "strategy" : "strategies"} selected
            </span>
          </div>
        </form>
      </Card>

      {/* Equity curve */}
      <Card className="p-phi-4" data-testid="backtest-chart">
        {hasRun ? (
          <HighchartsReact highcharts={Highcharts} options={equityOpts} />
        ) : (
          <div className="h-64 flex items-center justify-center text-slate-400 text-phi-sm">
            Run a backtest to see the equity curve
          </div>
        )}
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-phi-3" data-testid="backtest-stats">
        {[
          { label: "Total Trades", value: hasRun ? stats.totalTrades : "--" },
          { label: "Win Rate",     value: hasRun ? stats.winRate : "--" },
          { label: "Avg PnL",      value: hasRun ? stats.avgPnl : "--" },
          { label: "Max Drawdown", value: hasRun ? stats.maxDrawdown : "--" },
          { label: "Sharpe Ratio", value: hasRun ? stats.sharpeRatio : "--" },
          { label: "Profit Factor",value: hasRun ? stats.profitFactor : "--" },
        ].map((s) => (
          <Card key={s.label} className="p-phi-4 text-center">
            <div className="text-phi-xs text-slate-500">{s.label}</div>
            <div className="text-phi-lg font-bold mt-1 tabular-nums">{s.value}</div>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
