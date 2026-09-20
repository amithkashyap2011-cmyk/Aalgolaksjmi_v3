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
import { isIndianTrade, resolveLivePriceForIndianTrade } from "./indianMarket/indianPricing.js";

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

  // Fees apply to every *crypto* account type (SPOT and FUTURES), not just
  // FUTURES — matches handleExit()'s close-time fee math (autoTradeEngine.ts).
  // Indian accounts use a separate cost model (brokerage/STT/etc.) and have no
  // Binance mark price, so applying the crypto taker fee here would fabricate a
  // negative unrealised PnL on a flat position; exclude them.
  const isCrypto = !(trade.accountType || "FUTURES").startsWith("INDIAN_");
  const entryFee = isCrypto ? entryPrice * qty * TAKER_FEE : 0;
  const exitFee = isCrypto ? markPrice * qty * TAKER_FEE : 0;
  return grossPnl - entryFee - exitFee;
}

/**
 * Attach live markPrice, pnl (net of fees) and unrealisedPnlPct to each open
 * trade, in place. Returns the same array for convenience.
 */
export async function enrichOpenTrades(trades: any[]): Promise<any[]> {
  if (!trades || trades.length === 0) return [];

  await Promise.all(
    trades.map(async (trade) => {
      try {
        if (isIndianTrade(trade)) {
          const markPrice = resolveLivePriceForIndianTrade(trade);
          const entryPrice = trade.entryPrice || trade.entry || 0;
          const qty = trade.quantity || trade.qty || 0;
          const leverage = trade.leverage ? Number(trade.leverage) : 1;
          const notional = entryPrice * qty;
          const margin = leverage > 0 ? notional / leverage : notional;
          const isLong = (trade.side || "").toUpperCase() === "BUY" || (trade.side || "").toUpperCase() === "LONG";
          const grossPnl = isLong ? (markPrice - entryPrice) * qty : (entryPrice - markPrice) * qty;
          const pnlPercent = margin > 0 ? (grossPnl / margin) * 100 : 0;

          trade.markPrice = markPrice;
          trade.leverage = leverage;
          trade.pnl = Number(grossPnl.toFixed(2));
          trade.unrealisedPnl = Number(grossPnl.toFixed(2));
          trade.margin = Number(margin.toFixed(2));
          trade.unrealisedPnlPct = Number(pnlPercent.toFixed(2));

          if (process.env.DEBUG_TRACES === "true") {
            console.log(`[POSITION_UI_TRACE] ${JSON.stringify({
              symbol: trade.symbol,
              side: trade.side,
              quantity: qty,
              entryPrice,
              markPrice,
              leverage,
              notional,
              margin,
              unrealizedPnl: trade.unrealisedPnl,
              pnlPercent: trade.unrealisedPnlPct,
              source: "BACKEND_PNL_SERVICE"
            })}`);
          }
          return;
        }

        const isFutures = (trade.accountType || "FUTURES") === "FUTURES";
        let markPrice: number = binance.getTickerPriceSync(trade.symbol, isFutures) ?? 0;
        if (!markPrice) {
          try {
            markPrice = (await binance.getTickerPrice(trade.symbol, isFutures)) ?? 0;
          } catch {
            markPrice = 0;
          }
        }
        if (!markPrice) return;

        const entryPrice = trade.entryPrice || trade.entry || 0;
        const qty = trade.quantity || trade.qty || 0;
        const leverage = trade.leverage ? Number(trade.leverage) : 1;
        const notional = entryPrice * qty;
        const margin = leverage > 0 ? notional / leverage : notional;
        const pnl = computeUnrealisedPnl(trade, markPrice);
        const pnlPercent = margin > 0 ? (pnl / margin) * 100 : 0;

        trade.markPrice = markPrice;
        trade.leverage = leverage;
        trade.pnl = pnl;
        trade.unrealisedPnl = pnl;
        trade.margin = margin;
        trade.unrealisedPnlPct = pnlPercent;

        if (isFutures) {
          try {
            trade.fundingRate = await binance.getLatestFundingRate(trade.symbol);
          } catch {
            trade.fundingRate = 0.0001; // Default 0.01% baseline
          }
        }

        if (process.env.DEBUG_TRACES === "true") {
          console.log(`[POSITION_UI_TRACE] ${JSON.stringify({
            symbol: trade.symbol,
            side: trade.side,
            quantity: qty,
            entryPrice,
            markPrice,
            leverage,
            notional,
            margin,
            unrealizedPnl: trade.unrealisedPnl,
            pnlPercent: trade.unrealisedPnlPct,
            source: "BACKEND_PNL_SERVICE"
          })}`);
        }
      } catch (err: any) {
        console.error(`[pnlService] Failed to attach live PnL for ${trade.symbol}:`, err.message);
      }
    })
  );

  return trades;
}
