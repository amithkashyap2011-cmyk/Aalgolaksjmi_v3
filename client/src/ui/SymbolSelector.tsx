/*
 * SymbolSelector – multi-select pill toggles for coin selection.
 * Multiple coins can be active simultaneously.
 * Reads/writes from Zustand store.
 */
import clsx from "clsx";
import { useAppStore } from "../store/useAppStore";
import { SYMBOLS, SYMBOL_LABELS } from "../mock/data";

interface Props {
  compact?: boolean;
}

export default function SymbolSelector({ compact }: Props) {
  const { selectedSymbols, toggleSymbol } = useAppStore();

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1" data-testid="symbol-selector">
        {SYMBOLS.map((s) => {
          const active = selectedSymbols.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleSymbol(s)}
              aria-pressed={active}
              className={clsx(
                "px-2 py-1 rounded text-xs font-medium transition-all",
                active
                  ? "bg-aalgold text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200",
              )}
            >
              {SYMBOL_LABELS[s] || s}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1" data-testid="symbol-selector" role="group" aria-label="Symbol selector">
      {SYMBOLS.map((s) => {
        const active = selectedSymbols.includes(s);
        return (
          <button
            key={s}
            onClick={() => toggleSymbol(s)}
            aria-pressed={active}
            className={clsx(
              "px-3 py-1.5 rounded-phi text-phi-xs font-medium transition-all duration-200",
              active
                ? "bg-aalgold text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {SYMBOL_LABELS[s] || s}
          </button>
        );
      })}
    </div>
  );
}
