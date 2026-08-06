/*
 * TimeframeTabs – segmented pill selector for 1m, 5m, 15m, 1h, 4h, 1d.
 * Reads/writes `timeframe` in Zustand store.
 */
import clsx from "clsx";
import { useAppStore } from "../store/useAppStore";
import { TIMEFRAMES } from "../mock/data";

export default function TimeframeTabs() {
  const { timeframe, setTimeframe } = useAppStore();
  return (
    <div className="flex items-center gap-1" data-testid="timeframe-tabs" role="group" aria-label="Timeframe selector">
      {TIMEFRAMES.map((f) => (
        <button
          key={f}
          onClick={() => setTimeframe(f)}
          aria-pressed={f === timeframe}
          className={clsx(
            "px-3 py-1.5 rounded-phi text-phi-xs font-medium transition-all duration-200",
            f === timeframe
              ? "bg-indigo-600 text-white shadow-md border border-indigo-400/50"
              : "bg-slate-900/60 text-slate-400 border border-white/5 hover:bg-slate-800 hover:text-slate-200",
          )}
        >
          {f}
        </button>
      ))}
    </div>
  );
}
