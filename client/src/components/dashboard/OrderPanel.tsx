/*
 * ─── OrderPanel ────────────────────────────────────────
 *
 * Fibonacci-scaled size buttons (3%, 5%, 8%, 13%, 21% of wallet).
 * Big BUY (green) and SELL (red) buttons.
 * ModeToggle: AUTO vs MANUAL with confirmation dialog.
 */
import { useState, useCallback } from "react";
import clsx from "clsx";
import { useAppStore, type ExecMode } from "../../store/useAppStore";
import Card from "../../ui/Card";
import Button from "../../ui/Button";
import { FIB_SIZES } from "../../mock/data";

export default function OrderPanel() {
  const { wallet, selectedSymbol, submitOrder, execMode, setExecMode } = useAppStore();
  const [qty, setQty] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ExecMode | null>(null);

  const handleModeClick = useCallback(
    (target: ExecMode) => {
      if (target === execMode) return;
      setConfirmTarget(target);
    },
    [execMode],
  );

  const confirmSwitch = useCallback(() => {
    if (confirmTarget) setExecMode(confirmTarget);
    setConfirmTarget(null);
  }, [confirmTarget, setExecMode]);

  const handleOrder = useCallback(
    async (side: "BUY" | "SELL") => {
      if (qty <= 0) return;
      setLoading(true);
      setError(null);
      try {
        await submitOrder(selectedSymbol, side, qty);
        setQty(0);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [qty, selectedSymbol, submitOrder],
  );

  return (
    <Card className="p-phi-4 relative" data-testid="order-panel">
      <h3 className="font-semibold text-phi-sm mb-phi-3">Order Panel</h3>

      <p className="text-phi-xs text-slate-500 mb-phi-2">
        Symbol: <span className="font-medium text-slate-800">{selectedSymbol}</span>
      </p>

      {/* Fibonacci quantity pills */}
      <div className="flex flex-wrap gap-1.5 mb-phi-3" role="group" aria-label="Quick quantity buttons" data-testid="fib-sizes">
        {FIB_SIZES.map((p) => {
          const amount = +((wallet.balance * p) / 100).toFixed(2);
          return (
            <button
              key={p}
              onClick={() => setQty(amount)}
              className={clsx(
                "px-3 py-1.5 text-phi-xs border rounded-phi font-medium transition-all duration-200",
                qty === amount
                  ? "border-aalgold bg-aalgold/10 text-aalgold"
                  : "border-slate-200 hover:bg-slate-50 text-slate-600",
              )}
            >
              {p}%
            </button>
          );
        })}
      </div>

      {/* Quantity input */}
      <label className="sr-only" htmlFor="order-qty">Quantity</label>
      <input
        id="order-qty"
        type="number"
        value={qty || ""}
        onChange={(e) => setQty(Number(e.target.value))}
        className="w-full p-2.5 border border-slate-200 rounded-phi text-phi-sm mb-phi-3 tabular-nums"
        placeholder="Quantity (USDT)"
      />

      {/* Error */}
      {error && <p className="text-phi-xs text-aalred mb-2">{error}</p>}

      {/* BUY / SELL */}
      <div className="flex gap-phi-2 mb-phi-4" data-testid="buy-sell-buttons">
        <Button
          variant="primary"
          className="flex-1 py-3 text-phi-sm font-bold tracking-wide"
          aria-label="Buy"
          disabled={loading || qty <= 0}
          onClick={() => handleOrder("BUY")}
        >
          {loading ? "…" : "🟢 BUY"}
        </Button>
        <Button
          variant="danger"
          className="flex-1 py-3 text-phi-sm font-bold tracking-wide"
          aria-label="Sell"
          disabled={loading || qty <= 0}
          onClick={() => handleOrder("SELL")}
        >
          {loading ? "…" : "🔴 SELL"}
        </Button>
      </div>

      {/* AUTO / MANUAL toggle */}
      <div className="flex items-center gap-phi-2" role="group" aria-label="Execution mode" data-testid="exec-mode-toggle">
        <span className="text-phi-xs text-slate-500">Exec:</span>
        {(["AUTO", "MANUAL"] as const).map((m) => (
          <button
            key={m}
            onClick={() => handleModeClick(m)}
            aria-pressed={m === execMode}
            className={clsx(
              "px-3 py-1.5 rounded-phi text-phi-xs font-medium transition-all duration-200",
              m === execMode
                ? "bg-slate-800 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Confirmation dialog */}
      {confirmTarget && (
        <div
          className="absolute inset-0 z-10 bg-white/95 backdrop-blur rounded-phi-xl flex flex-col items-center justify-center gap-phi-3 p-phi-4"
          role="alertdialog"
          aria-label="Confirm mode switch"
          data-testid="confirm-dialog"
        >
          <p className="text-phi-sm text-center font-medium">
            Switch to <span className="font-bold">{confirmTarget}</span> mode?
          </p>
          <div className="flex gap-phi-2">
            <Button size="sm" onClick={confirmSwitch}>Confirm</Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmTarget(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
