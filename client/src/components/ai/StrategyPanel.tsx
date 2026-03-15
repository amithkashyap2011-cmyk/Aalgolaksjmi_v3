/*
 * ─── StrategyPanel ─────────────────────────────────────
 *
 * Shows all 4 core strategies (Lakshmi, Aaryan, Aayush, Gayatri)
 * with their live evaluation per selected symbol.
 * Multi-symbol aware: shows tabs for each selected symbol.
 */
import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import {
  CORE_STRATEGIES,
  SYMBOL_LABELS,
  generateMockStrategyEvals,
  type MockStrategyEval,
} from "../../mock/data";
import Card from "../../ui/Card";
import clsx from "clsx";

const SIGNAL_COLORS: Record<string, string> = {
  STRONG_BUY: "text-aalgold font-black",
  BUY: "text-aalgreen font-bold",
  HOLD: "text-amber-500 font-medium",
  SELL: "text-aalred font-bold",
  STRONG_SELL: "text-red-700 font-black",
};

function StrategyTile({ ev }: { ev: MockStrategyEval }) {
  const def = CORE_STRATEGIES.find((s) => s.id === ev.id);
  return (
    <div className={clsx("p-phi-3 rounded-phi-lg border transition-shadow hover:shadow-md", def?.bgColor || "bg-slate-50", "border-slate-100")}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{ev.emoji}</span>
          <span className={clsx("text-phi-xs font-bold", def?.color || "text-slate-700")}>{def?.name ?? ev.id}</span>
        </div>
        <span className={clsx("text-phi-xs px-2 py-0.5 rounded-full", SIGNAL_COLORS[ev.signal] || "text-slate-500",
          ev.signal.includes("BUY") ? "bg-green-50" : ev.signal.includes("SELL") ? "bg-red-50" : "bg-amber-50"
        )}>
          {ev.signal}
        </span>
      </div>
      {/* Confidence bar */}
      <div className="flex items-center gap-2 mb-2">
        <div className="gauge-track flex-1">
          <div
            className={clsx("gauge-fill", def?.barColor || "bg-slate-400")}
            style={{ width: `${ev.confidence * 100}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-slate-500">{(ev.confidence * 100).toFixed(0)}%</span>
      </div>
      {/* SL/TP */}
      <div className="flex items-center gap-3 text-[10px] mb-2">
        <span className="text-aalred">SL {ev.slPct.toFixed(1)}%</span>
        <span className="text-aalgreen">TP {ev.tpPct.toFixed(1)}%</span>
      </div>
      {/* Reasons */}
      <ul className="space-y-0.5">
        {ev.reasons.map((r, i) => (
          <li key={i} className="text-[9px] text-slate-500 leading-tight">• {r}</li>
        ))}
      </ul>
    </div>
  );
}

export default function StrategyPanel() {
  const { selectedSymbols } = useAppStore();
  const [activeTab, setActiveTab] = useState(0);
  const sym = selectedSymbols[activeTab] ?? selectedSymbols[0];
  const evals = generateMockStrategyEvals(sym);

  return (
    <Card className="p-phi-4" data-testid="strategy-panel">
      <h3 className="font-semibold text-phi-sm mb-phi-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-phi bg-aalgold/15 flex items-center justify-center text-xs">🪷</span>
        Core Strategies
      </h3>

      {/* Symbol tabs (only if multiple selected) */}
      {selectedSymbols.length > 1 && (
        <div className="flex gap-1 mb-phi-3 flex-wrap">
          {selectedSymbols.map((s, idx) => (
            <button
              key={s}
              onClick={() => setActiveTab(idx)}
              className={clsx(
                "px-2 py-1 rounded text-phi-xs font-medium transition-all",
                idx === activeTab
                  ? "bg-aalgold text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200",
              )}
            >
              {SYMBOL_LABELS[s] || s}
            </button>
          ))}
        </div>
      )}

      <div className="text-[10px] text-slate-400 mb-2">
        Evaluating: <span className="font-medium text-slate-600">{sym}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-phi-2">
        {evals.map((ev) => (
          <StrategyTile key={ev.id} ev={ev} />
        ))}
      </div>
    </Card>
  );
}
