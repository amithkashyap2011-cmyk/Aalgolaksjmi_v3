/*
 * ─── TopBar ────────────────────────────────────────────
 *
 * Sticky header:
 * - Logo "AALGOLAKSHMI_V2"
 * - Mode selector (PAPER / LIVE / BACKTEST)
 * - Wallet / golden pot summary
 * Golden-ratio spacing throughout.
 */
import clsx from "clsx";
import { useAppStore, type Mode } from "../../store/useAppStore";

const MODES: Mode[] = ["PAPER", "LIVE", "BACKTEST"];

const MODE_COLORS: Record<Mode, string> = {
  PAPER: "bg-aalgreen text-white shadow-sm",
  LIVE: "bg-aalred text-white shadow-sm",
  BACKTEST: "bg-blue-500 text-white shadow-sm",
};

export default function TopBar() {
  const { mode, setMode, wallet, toggleSidebar, selectedSymbol, positions } = useAppStore();
  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

  return (
    <header
      data-testid="topbar"
      className="sticky top-0 z-20 flex items-center justify-between px-phi-5 py-phi-3 bg-white/80 backdrop-blur-lg border-b border-slate-200/80"
    >
      {/* Left section */}
      <div className="flex items-center gap-phi-3">
        {/* Mobile hamburger */}
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 rounded-phi hover:bg-slate-100 text-lg leading-none"
          aria-label="Toggle sidebar"
        >
          ☰
        </button>

        {/* Logo */}
        <h1 className="text-phi-lg font-bold tracking-tight hidden sm:block bg-gradient-to-r from-aalgold to-aalgreen bg-clip-text text-transparent">
          AALGOLAKSHMI_V2
        </h1>

        {/* Mode selector */}
        <div
          className="flex items-center bg-slate-100 rounded-phi p-0.5"
          role="group"
          aria-label="Trading mode"
          data-testid="mode-selector"
        >
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={clsx(
                "px-3 py-1 rounded-md text-phi-xs font-medium transition-all duration-200",
                mode === m ? MODE_COLORS[m] : "text-slate-600 hover:text-slate-900",
              )}
            >
              {m === "LIVE" && <span className="dot-live mr-1" />}
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Center – live symbol display */}
      <div className="hidden md:flex items-center gap-2 px-phi-3 py-1 bg-slate-50 rounded-phi border border-slate-100">
        <span className="text-phi-xs text-slate-500">{selectedSymbol}</span>
        <span className="dot-paper" />
      </div>

      {/* Right section */}
      <div className="flex items-center gap-phi-3">
        <span className="text-phi-xs text-slate-500 hidden sm:block">Wallet</span>
        <div className="px-phi-3 py-1 bg-white rounded-phi shadow-sm font-semibold text-phi-sm border border-slate-100 tabular-nums">
          ${wallet.balance.toFixed(2)}
        </div>
        <div
          data-testid="golden-pot"
          className={clsx(
            "hidden md:flex items-center gap-1.5 px-phi-3 py-1 rounded-phi text-white text-phi-xs font-semibold tabular-nums",
            totalPnl >= 0 ? "bg-aalgreen/90" : "bg-aalred/90",
          )}
          title="Total unrealised P&amp;L from open positions"
        >
          🏆 {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)} USDT
        </div>
      </div>
    </header>
  );
}
