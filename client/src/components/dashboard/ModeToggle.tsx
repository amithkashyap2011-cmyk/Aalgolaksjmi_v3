/*
 * ─── ModeToggle ────────────────────────────────────────
 *
 * Compact segmented control for PAPER / LIVE / BACKTEST.
 * Usable outside TopBar (mobile, widgets).
 */
import clsx from "clsx";
import { useAppStore, type Mode } from "../../store/useAppStore";

const MODES: Mode[] = ["PAPER", "LIVE", "BACKTEST"];

const MODE_ACTIVE: Record<Mode, string> = {
  PAPER: "bg-aalgreen text-white shadow-sm",
  LIVE: "bg-aalred text-white shadow-sm",
  BACKTEST: "bg-blue-500 text-white shadow-sm",
};

export default function ModeToggle() {
  const { mode, setMode } = useAppStore();

  return (
    <div className="inline-flex items-center bg-slate-100 rounded-phi p-0.5" data-testid="mode-toggle">
      {MODES.map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className={clsx(
            "px-3 py-1.5 rounded-md text-phi-xs font-medium transition-all duration-200",
            mode === m ? MODE_ACTIVE[m] : "text-slate-600 hover:text-slate-900",
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
