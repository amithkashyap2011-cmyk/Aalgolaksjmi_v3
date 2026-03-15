/*
 * ─── HistoryPage ───────────────────────────────────────
 *
 * Phase 2: Trades table with pagination. Mock data only.
 * Columns: #, Symbol, Side, Qty, Entry, Exit, PnL, Time.
 * Responsive — horizontal scroll on mobile.
 */
import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import Card from "../ui/Card";
import PageShell from "../components/layout/PageShell";

const PAGE_SIZE = 10;

export default function HistoryPage() {
  const { trades } = useAppStore();
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(trades.length / PAGE_SIZE));
  const slice = trades.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <PageShell title="Trade History">
      <Card className="p-phi-4 overflow-x-auto scroll-hide" data-testid="history-table">
        <table className="w-full text-phi-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="pb-2 pr-3">#</th>
              <th className="pb-2 pr-3">Symbol</th>
              <th className="pb-2 pr-3">Strategy</th>
              <th className="pb-2 pr-3">Side</th>
              <th className="pb-2 pr-3 text-right">Qty</th>
              <th className="pb-2 pr-3 text-right">Entry</th>
              <th className="pb-2 pr-3 text-right">Exit</th>
              <th className="pb-2 pr-3 text-right">PnL</th>
              <th className="pb-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((t) => (
              <tr key={t.id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="py-2.5 pr-3 text-slate-400">{t.id}</td>
                <td className="pr-3 font-medium">{t.symbol}</td>
                <td className="pr-3 text-phi-xs text-slate-500">{t.strategy ?? "—"}</td>
                <td className={`pr-3 font-medium ${t.side === "BUY" ? "text-aalgreen" : "text-aalred"}`}>
                  {t.side}
                </td>
                <td className="pr-3 text-right tabular-nums">{t.qty}</td>
                <td className="pr-3 text-right tabular-nums">{t.entry}</td>
                <td className="pr-3 text-right tabular-nums">{t.exit}</td>
                <td className={`pr-3 text-right font-semibold tabular-nums ${t.pnl >= 0 ? "text-aalgreen" : "text-aalred"}`}>
                  {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(2)}
                </td>
                <td className="text-slate-400 whitespace-nowrap">{t.time}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="mt-phi-4 flex items-center justify-between text-phi-xs">
          <span className="text-slate-400">{trades.length} trades total</span>
          <div className="flex items-center gap-phi-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 border border-slate-200 rounded-phi disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-slate-500 tabular-nums">
              {page + 1} / {pages}
            </span>
            <button
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 border border-slate-200 rounded-phi disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
