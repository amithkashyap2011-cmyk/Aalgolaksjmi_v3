import React, { useMemo } from "react";
import { ReportData } from "./useReportData";
import { RCard, StatTile, Grid, DataTable, Pill, fmtUsd, fmtTime } from "./reportUI";

const isDeposit = (tx: any) => /deposit|credit|in\b|buy/i.test(String(tx.type || tx.kind || tx.direction || ""));

export default function CapitalReport({ d }: { d: ReportData }) {
  const tx = d.walletTx || [];

  const totals = useMemo(() => {
    let deposits = 0, withdrawals = 0;
    for (const t of tx) {
      const amt = Math.abs(Number(t.amount ?? t.usdtAmount ?? t.value) || 0);
      if (isDeposit(t)) deposits += amt; else withdrawals += amt;
    }
    return { deposits, withdrawals, net: deposits - withdrawals, count: tx.length };
  }, [tx]);

  const walletBal = Number(d.wallet?.usdt ?? d.wallet?.balance ?? d.summary?.totalEquity) || 0;

  return (
    <div className="space-y-3">
      <Grid cols={4}>
        <StatTile label="Wallet Balance" value={fmtUsd(walletBal)} color="text-primary" />
        <StatTile label="Total Deposits" value={fmtUsd(totals.deposits)} color="text-success" />
        <StatTile label="Total Withdrawals" value={fmtUsd(totals.withdrawals)} color="text-danger" />
        <StatTile label="Net Capital Flow" value={fmtUsd(totals.net)} color={totals.net >= 0 ? "text-success" : "text-danger"} />
      </Grid>

      <RCard title={`Capital Transactions · ${totals.count}`}>
        <DataTable
          rows={tx}
          empty="No wallet transactions"
          cols={[
            { key: "time", label: "Time", render: (t: any) => <span className="text-secondary font-mono text-[10px]">{fmtTime(t.createdAt || t.timestamp || t.time)}</span> },
            { key: "type", label: "Type", render: (t: any) => <Pill tone={isDeposit(t) ? "green" : "red"}>{String(t.type || t.kind || (isDeposit(t) ? "DEPOSIT" : "WITHDRAW")).toUpperCase()}</Pill> },
            { key: "currency", label: "Asset", render: (t: any) => t.currency || t.asset || t.symbol || "USDT" },
            { key: "amount", label: "Amount", align: "end", render: (t: any) => <span className={isDeposit(t) ? "text-success" : "text-danger"}>{fmtUsd(Math.abs(Number(t.amount ?? t.usdtAmount ?? t.value) || 0))}</span> },
            { key: "status", label: "Status", render: (t: any) => <span className="text-secondary text-[10px]">{String(t.status || "—").toUpperCase()}</span> },
          ]}
        />
      </RCard>
    </div>
  );
}
