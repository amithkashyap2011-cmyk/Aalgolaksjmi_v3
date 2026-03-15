/*
 * ─── ActivePositionsCard ───────────────────────────────
 *
 * Table of current open positions from mock data.
 * Shows strategy name, SL/TP levels. Golden-ratio card.
 */
import { useAppStore } from "../../store/useAppStore";
import Card from "../../ui/Card";

const STRATEGY_EMOJI: Record<string, string> = {
  LAKSHMI: "🪷",
  AARYAN: "⚔️",
  AAYUSH: "🌱",
  GAYATRI: "🕉️",
};

export default function ActivePositionsCard() {
  const { positions } = useAppStore();

  return (
    <Card className="p-phi-4" data-testid="active-positions">
      <h3 className="font-semibold text-phi-sm mb-phi-3">Active Positions</h3>
      {positions.length === 0 ? (
        <p className="text-phi-xs text-slate-400 py-4 text-center">No open positions</p>
      ) : (
        <div className="overflow-x-auto scroll-hide">
          <table className="w-full text-phi-xs">
            <thead>
              <tr className="text-slate-500 text-left border-b border-slate-100">
                <th className="pb-2 pr-3">Symbol</th>
                <th className="pb-2 pr-3">Strategy</th>
                <th className="pb-2 pr-3">Side</th>
                <th className="pb-2 pr-3 text-right">Qty</th>
                <th className="pb-2 pr-3 text-right">Entry</th>
                <th className="pb-2 pr-3 text-right">SL</th>
                <th className="pb-2 pr-3 text-right">TP</th>
                <th className="pb-2 text-right">PnL</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="py-2 pr-3 font-medium">{p.symbol}</td>
                  <td className="pr-3 text-phi-xs">
                    {p.strategy ? (
                      <span title={p.strategy}>
                        {STRATEGY_EMOJI[p.strategy] ?? ""} {p.strategy}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className={`pr-3 font-medium ${p.side === "BUY" ? "text-aalgreen" : "text-aalred"}`}>
                    {p.side}
                  </td>
                  <td className="pr-3 text-right tabular-nums">{p.qty}</td>
                  <td className="pr-3 text-right tabular-nums">{p.entry}</td>
                  <td className="pr-3 text-right tabular-nums text-aalred">
                    {p.sl != null ? p.sl : "—"}
                  </td>
                  <td className="pr-3 text-right tabular-nums text-aalgreen">
                    {p.tp != null ? p.tp : "—"}
                  </td>
                  <td className={`text-right font-semibold tabular-nums ${p.pnl >= 0 ? "text-aalgreen" : "text-aalred"}`}>
                    {p.pnl >= 0 ? "+" : ""}{p.pnl.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
