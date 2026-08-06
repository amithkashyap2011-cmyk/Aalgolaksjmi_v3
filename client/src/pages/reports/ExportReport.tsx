import React from "react";
import { ReportData } from "./useReportData";
import { RCard, downloadCSV, downloadJSON, tPnl, tSymbol, tSide, tQty, tEntry, tExit, tTime, tStrategy, tStatus } from "./reportUI";
import { Download, FileJson } from "lucide-react";

export default function ExportReport({ d }: { d: ReportData }) {
  const stamp = new Date().toISOString().slice(0, 10);

  const tradeRows = () => d.trades.map((t) => ({
    time: tTime(t), symbol: tSymbol(t), side: tSide(t), qty: tQty(t),
    entry: tEntry(t), exit: tExit(t), strategy: tStrategy(t), status: tStatus(t), pnl: tPnl(t),
  }));
  const positionRows = () => d.positions.map((p) => ({
    symbol: p.symbol, side: p.side, qty: p.qty, entry: p.entry, leverage: p.leverage ?? 1, sl: p.sl ?? "", tp: p.tp ?? "", pnl: p.pnl,
  }));
  const capitalRows = () => d.walletTx.map((t: any) => ({
    time: t.createdAt || t.timestamp || t.time, type: t.type || t.kind, currency: t.currency || t.asset || "USDT",
    amount: t.amount ?? t.usdtAmount ?? t.value, status: t.status,
  }));
  const auditRows = () => [
    ...d.alerts.map((a: any) => ({ time: a.createdAt || a.timestamp, source: "ALERT", severity: a.severity, symbol: a.symbol, message: a.title || a.message })),
    ...d.logs.map((l: any) => ({ time: l.timestamp, source: "DECISION", severity: l.decision, symbol: l.symbol, message: l.message })),
  ];

  const exports: { label: string; count: number; csv: () => void; json: () => void }[] = [
    { label: "Trades", count: d.trades.length, csv: () => downloadCSV(`trades-${stamp}.csv`, tradeRows()), json: () => downloadJSON(`trades-${stamp}.json`, tradeRows()) },
    { label: "Open Positions", count: d.positions.length, csv: () => downloadCSV(`positions-${stamp}.csv`, positionRows()), json: () => downloadJSON(`positions-${stamp}.json`, positionRows()) },
    { label: "Capital Transactions", count: d.walletTx.length, csv: () => downloadCSV(`capital-${stamp}.csv`, capitalRows()), json: () => downloadJSON(`capital-${stamp}.json`, capitalRows()) },
    { label: "Audit Trail", count: d.alerts.length + d.logs.length, csv: () => downloadCSV(`audit-${stamp}.csv`, auditRows()), json: () => downloadJSON(`audit-${stamp}.json`, auditRows()) },
  ];

  const fullSnapshot = () => downloadJSON(`report-snapshot-${stamp}.json`, {
    generatedAt: new Date().toISOString(), mode: d.mode, summary: d.summary,
    trades: tradeRows(), positions: positionRows(), capital: capitalRows(), audit: auditRows(),
    models: d.models, strategyWeights: d.strategyWeights, animalWeights: d.animalWeights,
  });

  return (
    <div className="space-y-3">
      <RCard title="Export Datasets">
        <p className="text-xs text-secondary mb-3">All exports are generated in your browser from data already loaded — nothing is sent anywhere.</p>
        <div className="space-y-2">
          {exports.map((e) => (
            <div key={e.label} className="d-flex align-items-center justify-content-between bg-light dark:bg-slate-800 border border-financial rounded-financial px-3 py-2">
              <div>
                <div className="text-sm font-black text-dark dark:text-white">{e.label}</div>
                <div className="text-[10px] text-secondary font-bold">{e.count} record{e.count === 1 ? "" : "s"}</div>
              </div>
              <div className="d-flex gap-2">
                <button onClick={e.csv} disabled={e.count === 0} className="btn btn-sm btn-primary d-flex align-items-center gap-1" style={{ fontSize: 11 }}>
                  <Download size={13} /> CSV
                </button>
                <button onClick={e.json} disabled={e.count === 0} className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" style={{ fontSize: 11 }}>
                  <FileJson size={13} /> JSON
                </button>
              </div>
            </div>
          ))}
        </div>
      </RCard>

      <RCard title="Full Snapshot">
        <div className="d-flex align-items-center justify-content-between">
          <p className="text-xs text-secondary m-0">One JSON file with summary, trades, positions, capital, audit, models &amp; strategy weights.</p>
          <button onClick={fullSnapshot} className="btn btn-sm btn-success d-flex align-items-center gap-1" style={{ fontSize: 11 }}>
            <Download size={13} /> Snapshot
          </button>
        </div>
      </RCard>
    </div>
  );
}
