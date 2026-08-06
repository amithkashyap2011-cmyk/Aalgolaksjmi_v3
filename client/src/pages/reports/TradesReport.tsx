import React, { useMemo, useState } from "react";
import { ReportData } from "./useReportData";
import { RCard, DataTable, Pill, fmtUsd, fmtNum, fmtTime, pnlColor, tPnl, tSymbol, tSide, tQty, tEntry, tExit, tTime, tStrategy, tStatus } from "./reportUI";

export default function TradesReport({ d }: { d: ReportData }) {
  const [filter, setFilter] = useState<"ALL" | "WIN" | "LOSS" | "OPEN">("ALL");

  const rows = useMemo(() => {
    let list = d.trades;
    if (filter === "WIN") list = list.filter((t) => tPnl(t) > 0);
    else if (filter === "LOSS") list = list.filter((t) => tPnl(t) < 0);
    else if (filter === "OPEN") list = list.filter((t) => tStatus(t) === "OPEN");
    return list;
  }, [d.trades, filter]);

  return (
    <RCard
      title={`Trade Log · ${rows.length} of ${d.trades.length}`}
      action={
        <div className="d-flex gap-1">
          {(["ALL", "WIN", "LOSS", "OPEN"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className="btn btn-sm border-0 shadow-none"
              style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase",
                background: filter === f ? "#3b82f6" : "rgba(148,163,184,0.15)", color: filter === f ? "#fff" : "#64748b" }}>
              {f}
            </button>
          ))}
        </div>
      }
    >
      <DataTable
        rows={rows}
        empty="No trades for this filter"
        cols={[
          { key: "time", label: "Time", render: (t) => <span className="text-secondary font-mono text-[10px]">{fmtTime(tTime(t))}</span> },
          { key: "symbol", label: "Symbol", render: (t) => <span className="fw-bold">{tSymbol(t)}</span> },
          { key: "side", label: "Side", render: (t) => <Pill tone={tSide(t) === "BUY" ? "green" : "red"}>{tSide(t)}</Pill> },
          { key: "qty", label: "Qty", align: "end", render: (t) => fmtNum(tQty(t), 4) },
          { key: "entry", label: "Entry", align: "end", render: (t) => fmtNum(tEntry(t), 2) },
          { key: "exit", label: "Exit", align: "end", render: (t) => (tExit(t) ? fmtNum(tExit(t), 2) : "—") },
          { key: "strategy", label: "Strategy", render: (t) => <span className="text-secondary text-[10px]">{tStrategy(t)}</span> },
          { key: "status", label: "Status", render: (t) => <Pill tone={tStatus(t) === "OPEN" ? "blue" : "muted"}>{tStatus(t)}</Pill> },
          { key: "pnl", label: "P&L", align: "end", render: (t) => <span className={`fw-bold ${pnlColor(tPnl(t))}`}>{fmtUsd(tPnl(t))}</span> },
        ]}
      />
    </RCard>
  );
}
