/*
 * SymbolSelector – coin selection pills for chart + strategy.
 *
 * Click a coin → it becomes the chart-focused coin (selectedSymbol)
 *   and is added to selectedSymbols if not already there.
 * All selectedSymbols run strategies, but only the focused coin
 *   drives the chart & TopBar display.
 *
 * Visual states:
 *   • Focused (chart)  → bright gold pill (primary)
 *   • Selected (strat)  → outlined with green dot (secondary)
 *   • Inactive          → grey pill
 */
import clsx from "clsx";
import { useAppStore } from "../store/useAppStore";
import { SYMBOLS, SYMBOL_LABELS } from "../mock/data";

interface Props {
  compact?: boolean;
}

export default function SymbolSelector({ compact }: Props) {
  const { selectedSymbol, selectedSymbols, setSymbol, toggleSymbol, allowedSymbols, positions, livePrices, inrRate } = useAppStore();

  const formatInr = (price: number) => {
    return price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleClick = (s: string) => {
    // 1. Ensure it's in the selectedSymbols list first
    if (!selectedSymbols.includes(s)) {
      toggleSymbol(s);
    }
    // 2. Then set as the chart-focused coin to ensure it sticks
    setSymbol(s);
  };

  const pill = (s: string) => {
    const isFocused = selectedSymbol === s;
    const isSelected = selectedSymbols.includes(s);
    const hasPosition = positions.some((p) => p.symbol === s);
    const price = livePrices[s];

    return (
      <button
        key={s}
        onClick={() => handleClick(s)}
        aria-pressed={isFocused}
        className={clsx(
          "relative transition-all duration-200 font-medium flex flex-col items-center justify-center min-w-[56px]",
          compact ? "px-2 py-1 rounded text-xs" : "px-3 py-1.5 rounded-phi text-phi-xs",
          isFocused
            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 border border-indigo-400"
            : isSelected
              ? "bg-slate-800 text-emerald-400 border border-emerald-500/30 hover:bg-slate-700"
              : "bg-slate-900/60 text-slate-400 border border-white/5 hover:bg-slate-800 hover:text-slate-200",
        )}
      >
        <span className="font-bold">{SYMBOL_LABELS[s] || s.replace("USDT", "")}</span>
        {price !== undefined && (
          <>
            <span className={clsx(
              "text-[9px] mt-0.5",
              isFocused ? "text-white/80" : "text-slate-400"
            )}>
              ${price.toFixed(s.includes("SHIB") ? 6 : s.includes("DOGE") ? 4 : 2)}
            </span>
            <span className={clsx(
              "text-[8px] mt-0.5 text-slate-500",
              isFocused ? "text-white/60" : "text-slate-500"
            )}>
              ₹{formatInr(price * (inrRate ?? 83.5))}
            </span>
          </>
        )}
        {/* Dynamic status dot: Green=Pos Open, Orange=Flat */}
        <span
          className={clsx(
            "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-white shadow-sm transition-colors",
            hasPosition ? "bg-aalgreen" : "bg-orange-400"
          )}
        />
      </button>
    );
  };

  return (
    <div
      className={clsx("flex gap-1", compact ? "flex-wrap" : "items-center")}
      data-testid="symbol-selector"
      role="group"
      aria-label="Symbol selector"
    >
      {allowedSymbols.map(pill)}
    </div>
  );
}
