/**
 * pnlService — single source of truth for unrealised PnL on open positions.
 *
 * Previously, live PnL was computed in two places with different math:
 *   - /trading/open-positions recomputed gross PnL (no fees)
 *   - /aqea-ui (dashboard) summed each trade's *stored* pnl (stale / 0 for open trades)
 * Meanwhile /trading/close-position books realised PnL *net of entry + exit fees*.
 *
 * Result: the unrealised number you watched never equalled the realised number
 * booked on close, and the Positions page disagreed with the Dashboard.
 *
 * This module computes unrealised PnL the same way close-position books it
 * (net of taker fees), so every screen agrees and there's no "jump" on close.
 */
import * as binance from "./binanceService.js";

/** Binance taker fee per side (0.04% futures). Matches close-position fee math. */
export const TAKER_FEE = 0.0004;

/**
 * Net unrealised PnL for one open trade at a given mark price.
 * Mirrors the realised-PnL formula in /trading/close-position:
 *   grossPnl - entryFee - exitFee
 */
export function computeUnrealisedPnl(trade: any, markPrice: number): number {
  const entryPrice = trade.entryPrice || trade.entry || 0;
  const qty = trade.quantity || trade.qty || 0;
  if (!entryPrice || !qty || !markPrice) return 0;

  const side = (trade.side || "").toUpperCase();
  const isLong = side === "BUY" || side === "LONG";
  const grossPnl = isLong
    ? (markPrice - entryPrice) * qty
    : (entryPrice - markPrice) * qty;

  if (trade.accountType === "FUTURES") {
    const entryFee = entryPrice * qty * TAKER_FEE;
    const exitFee = markPrice * qty * TAKER_FEE;
    return grossPnl - entryFee - exitFee;
  }

  return grossPnl;
}

/**
 * Attach live markPrice, pnl (net of fees) and unrealisedPnlPct to each open
 * trade, in place. Returns the same array for convenience.
 */
export async function enrichOpenTrades(trades: any[]): Promise<any[]> {
  for (const trade of trades) {
    try {
      const isFutures = (trade.accountType || "FUTURES") === "FUTURES";
      let markPrice = binance.getTickerPriceSync(trade.symbol, isFutures);
      if (!markPrice) markPrice = await binance.getTickerPrice(trade.symbol, isFutures);
      if (!markPrice) continue;

      const entryPrice = trade.entryPrice || trade.entry || 0;
      const qty = trade.quantity || trade.qty || 0;
      const pnl = computeUnrealisedPnl(trade, markPrice);
      const margin = entryPrice * qty / (trade.leverage || 1);

      trade.markPrice = markPrice;
      trade.pnl = pnl;
      trade.unrealisedPnlPct = margin > 0 ? (pnl / margin) * 100 : 0;
    } catch (err: any) {
      console.error(`[pnlService] Failed to attach live PnL for ${trade.symbol}:`, err.message);
    }
  }
  return trades;
}
