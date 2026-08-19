/*
 * ─── Sentinel Auditor Service v9.5 (Autonomous Self-Healing Engine) ────────────
 *
 * This service runs automatically in the background and dynamically
 * audits and self-heals the trading engine's state, memory, database, and connection integrity.
 * 
 * Capabilities:
 * 1. DB-to-Memory Synchronizer (Auto-hydrates open trades from DB or purges memory ghosts)
 * 2. Duplicate Orphan Flattener (Auto-closes duplicate open trades for the same symbol)
 * 3. Wallet Capital Reconciler (Ensures Margin + Cash + PnL math holds perfectly; caps bankruptcies or math overflows)
 * 4. WebSocket Feed Guard (Detects frozen tickers and dynamically triggers WS reconnection)
 */

import { Trade } from "../models/Trade.js";
import { WalletSnapshot } from "../models/WalletSnapshot.js";
import { Alert } from "../models/Alert.js";
import * as paper from "./paperState.js";
import * as binance from "./binanceService.js";
import { getIO } from "./socketService.js";
import { log, rotateLogIfNeeded } from "../utils/logger.js";
import mongoose from "mongoose";
import fs from "node:fs";
import { ApiKeys } from "../models/ApiKeys.js";
import { decrypt } from "../lib/crypto.js";

const AUTO_FIX_LOG = "/Users/amithks/aalgolakshmi_v3/server/auto_trade.log";
const STATIC_BASELINE_USDT = 0; // Reset balance to safe $20K if corrupted

function logAutoFix(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [DYNAMIC AUTO-FIX] 🛡️ ${msg}\n`;
  try {
    rotateLogIfNeeded(AUTO_FIX_LOG);
    fs.appendFileSync(AUTO_FIX_LOG, line);
  } catch {}
  log(`[AUTO-FIX] ${msg}`);
}

export async function runSentinelAudit(userId: string, mode: "PAPER" | "LIVE", accountType: "SPOT" | "FUTURES") {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const { clearPeakPrice } = await import("./autoTradeEngine.js");

    // ── 1. DB-TO-MEMORY CONVERGENCE & ORPHAN DESTRUCTION ──
    const userObjId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : new mongoose.Types.ObjectId("000000000000000000000000");
    const openDbTrades = await Trade.find({ userId: userObjId, mode, accountType, status: "OPEN" });
    const memoryPositions = paper.getOpenPositions(userId, mode).filter(p => p.accountType === accountType);

    const dbTradeIds = new Set(openDbTrades.map(t => t._id.toString()));
    const memoryTradeIds = new Set(memoryPositions.map(p => p.tradeId));

    // A. Detect memory positions with no DB open trades (Memory Ghosts) -> Purge
    for (const pos of memoryPositions) {
      if (!dbTradeIds.has(pos.tradeId)) {
        logAutoFix(`Ghost position detected in memory for ${pos.symbol} (Trade ${pos.tradeId}). Vaporizing memory trace.`);
        paper.removePosition(userId, pos.symbol, mode, accountType);
        clearPeakPrice(userId, pos.symbol, pos.tradeId);
        
        // Notify user via sockets
        const io = getIO();
        if (io) {
          io.emit("alert", {
            level: "AMBER",
            text: `🛡️ Auto-Healed: Ghost position for ${pos.symbol} was cleared from memory.`
          });
        }
      }
    }

    // B. Detect open trades in DB but missing from memory -> Auto-Hydrate
    for (const trade of openDbTrades) {
      const isInMemory = memoryPositions.some(p => p.tradeId === trade._id.toString() && p.symbol === trade.symbol);
      if (!isInMemory) {
        logAutoFix(`Un-synced open trade found in DB for ${trade.symbol} (Trade ${trade._id}). Re-hydrating to memory.`);
        paper.setPosition(userId, trade.symbol, mode, {
          userId: userId,
          symbol: trade.symbol,
          side: trade.side as "BUY" | "SELL",
          quantity: trade.quantity,
          entryPrice: trade.entryPrice,
          leverage: trade.leverage,
          tradeId: trade._id.toString(),
          sl: trade.sl ?? undefined,
          tp: trade.tp ?? undefined,
          accountType: trade.accountType || "FUTURES",
        });

        const io = getIO();
        if (io) {
          io.emit("alert", {
            level: "GREEN",
            text: `🛡️ Auto-Healed: Hydrated open trade for ${trade.symbol} back into active memory.`
          });
        }
      }
    }

    // C. Detect and destroy duplicate open positions for the exact same symbol (Orphan Flattener)
    const symbolGroups = new Map<string, typeof openDbTrades>();
    for (const t of openDbTrades) {
      const list = symbolGroups.get(t.symbol) || [];
      list.push(t);
      symbolGroups.set(t.symbol, list);
    }

    for (const [symbol, trades] of symbolGroups.entries()) {
      if (trades.length > 1) {
        logAutoFix(`Multi-position duplication detected on ${symbol}. Keeping latest, auto-closing older orphans.`);
        // Sort by openedAt asc (oldest first)
        trades.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
        
        const latest = trades[trades.length - 1];
        // Close all older trades
        for (let i = 0; i < trades.length - 1; i++) {
          const orphan = trades[i];
          logAutoFix(`  -> Auto-Closing orphan trade: id=${orphan._id} side=${orphan.side} Qty=${orphan.quantity}`);
          
          if (mode === "LIVE") {
            try {
              const keys = await ApiKeys.findOne({ userId });
              if (keys) {
                const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
                const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });
                const exitSide = orphan.side === "BUY" ? "SELL" : "BUY";
                const formattedQty = accountType === "FUTURES"
                  ? await binance.formatFuturesQuantity(symbol, orphan.quantity)
                  : await binance.formatQuantity(symbol, orphan.quantity);
                
                logAutoFix(`  -> Placing market order to flatten orphan on exchange: Side=${exitSide} Qty=${formattedQty}`);
                if (accountType === "FUTURES") {
                  await binance.placeFuturesOrder(apiKey, apiSecret, {
                    symbol, side: exitSide, type: "MARKET", quantity: formattedQty,
                  });
                } else {
                  await binance.placeOrder(apiKey, apiSecret, {
                    symbol, side: exitSide, type: "MARKET", quantity: formattedQty,
                  });
                }
              }
            } catch (err: any) {
              logAutoFix(`  -> Failed to close orphan on Binance: ${err.message}. It might have been manually closed already.`);
            }
          }

          await Trade.updateOne(
            { _id: orphan._id },
            { $set: { status: "CLOSED", exitPrice: orphan.entryPrice, pnl: 0, closedAt: new Date(), "meta.closeReason": "SENTINEL_AUTO_PURGE" } }
          );
          clearPeakPrice(userId, symbol, orphan._id.toString());
        }

        // Re-set memory state to correspond precisely to the latest single trade
        paper.setPosition(userId, symbol, mode, {
          userId,
          symbol,
          side: latest.side as "BUY" | "SELL",
          quantity: latest.quantity,
          entryPrice: latest.entryPrice,
          leverage: latest.leverage,
          tradeId: latest._id.toString(),
          sl: latest.sl ?? undefined,
          tp: latest.tp ?? undefined,
          accountType,
        });

        const io = getIO();
        if (io) {
          io.emit("alert", {
            level: "AMBER",
            text: `🛡️ Auto-Healed: Resolved position duplication on ${symbol}. Stranded trades auto-closed.`
          });
        }
      }
    }

    // ── 2. WALLET ACCOUNTING & MATHEMATICAL SANITY AUDIT ──
    const wallet = paper.getWallet(userId, mode, accountType);
    const available = wallet.get("USDT") || 0;
    
    // Recalculate locked margins and unrealized PnLs using WS prices
    const activePositions = paper.getOpenPositions(userId, mode).filter(p => p.accountType === accountType);
    let lockedMargin = 0;
    let totalUnrealizedPnl = 0;

    // LIVE futures liquidation-proximity check — visibility only, no
    // auto-action (see checkLiquidationProximity's own doc comment for why).
    // Previously nothing anywhere tracked Binance's actual liquidation
    // price for LIVE positions; the only guard was the PAPER-only 90%-
    // margin approximation just below this block. One account-level fetch
    // per audit call, matched by symbol, rather than one call per position.
    let liveFuturesPositions: Awaited<ReturnType<typeof binance.getFuturesPositions>> = [];
    if (mode === "LIVE" && accountType === "FUTURES" && activePositions.length > 0) {
      try {
        const keys = await ApiKeys.findOne({ userId });
        if (keys) {
          const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
          const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });
          liveFuturesPositions = await binance.getFuturesPositions(apiKey, apiSecret);
        }
      } catch (err: any) {
        log(`[sentinel] liquidation-proximity check skipped: ${err.message}`);
      }
    }

    for (const p of activePositions) {
      if (mode === "LIVE" && accountType === "FUTURES") {
        const livePos = liveFuturesPositions.find(lp => lp.symbol === p.symbol);
        const liqPrice = livePos?.liquidationPrice ? parseFloat(livePos.liquidationPrice) : NaN;
        const markPrice = binance.getTickerPriceSync(p.symbol, true) || p.entryPrice;
        const proximity = binance.checkLiquidationProximity(liqPrice, markPrice);
        if (proximity?.warning) {
          logAutoFix(`⚠️ LIVE LIQUIDATION PROXIMITY: ${p.symbol} mark=${markPrice} is ${(proximity.distancePct * 100).toFixed(1)}% from Binance's actual liquidation price ${proximity.liquidationPrice} — no auto-action taken, alert only.`);
          const io = getIO();
          if (io) {
            io.emit("alert", {
              level: "RED",
              text: `⚠️ ${p.symbol} is ${(proximity.distancePct * 100).toFixed(1)}% from liquidation (${proximity.liquidationPrice}). Review manually.`,
            });
          }
          // Previously this and every other sentinel event only live-pushed
          // over the socket and wrote to the plaintext auto_trade.log — if
          // no client was connected at the moment it fired, there was no
          // way to see it later; the Alerts page/API only reads from the
          // Alert collection, which this file never wrote to.
          await Alert.create({
            userId, severity: "RED", symbol: p.symbol, title: "LIQUIDATION PROXIMITY WARNING",
            message: `${p.symbol} mark price ${proximity.currentPrice} is ${(proximity.distancePct * 100).toFixed(1)}% from Binance's liquidation price ${proximity.liquidationPrice}.`,
          }).catch(() => {});
        }
      }
      const initialMargin = (p.quantity * p.entryPrice) / (p.leverage || 1);
      lockedMargin += initialMargin;

      const currentPrice = binance.getTickerPriceSync(p.symbol, accountType === "FUTURES") || p.entryPrice;
      const pnl = p.side === "BUY"
        ? (currentPrice - p.entryPrice) * p.quantity
        : (p.entryPrice - currentPrice) * p.quantity;
      totalUnrealizedPnl += pnl;

      // Paper Liquidation Guard
      if (mode === "PAPER" && pnl <= -0.9 * initialMargin) {
        logAutoFix(`💀 PAPER LIQUIDATION: ${p.symbol} PnL ($${pnl.toFixed(4)}) exhausted 90% of margin ($${initialMargin.toFixed(4)}). Auto-liquidating.`);
        
        // Update DB
        await Trade.updateOne(
          { _id: p.tradeId },
          { $set: { status: "CLOSED", exitPrice: currentPrice, pnl: -initialMargin, closedAt: new Date(), "meta.closeReason": "SENTINEL_LIQUIDATION" } }
        );

        // Adjust wallet
        const currentUsdt = wallet.get("USDT") ?? 0;
        const newUsdt = Math.max(0, currentUsdt + initialMargin - initialMargin); // Realized loss is full margin
        paper.setWalletBalance(userId, mode, "USDT", newUsdt, accountType);
        paper.removePosition(userId, p.symbol, mode, accountType);
        clearPeakPrice(userId, p.symbol, p.tradeId);

        // Alert user
        const io = getIO();
        if (io) {
          io.emit("alert", {
            level: "RED",
            text: `💀 Liquidation Alert: ${p.symbol} position liquidated due to margin exhaustion.`
          });
        }
        await Alert.create({
          userId, severity: "RED", symbol: p.symbol, title: "PAPER LIQUIDATION",
          message: `${p.symbol} position liquidated: PnL exhausted 90% of margin ($${initialMargin.toFixed(4)}).`,
        }).catch(() => {});
      }
    }

    const totalCash = available + lockedMargin + totalUnrealizedPnl;

    // Check for "Ghost Money" inflation or negative balances
    if (mode === "PAPER") {
      // 🛡️ GUARD: Skip bankruptcy check if balance is 0 and no active positions — this is an intentional reset, not corruption.
      const isIntentionalCleanSlate = available === 0 && activePositions.length === 0;
      if (!isIntentionalCleanSlate && (available < 0 || totalCash < -0.01)) {
        logAutoFix(`User ${userId} went bankrupt or has corrupted negative wallet balance (available: $${available.toFixed(2)} | total: $${totalCash.toFixed(2)}). Dynamic self-healing triggered.`);
        // Forcefully recover the account to starting balance
        await paper.setWalletBalance(userId, mode, "USDT", STATIC_BASELINE_USDT, accountType);
        
        // Remove all active positions to free up resources
        for (const p of activePositions) {
          paper.removePosition(userId, p.symbol, mode, accountType);
          clearPeakPrice(userId, p.symbol, p.tradeId);
          await Trade.updateOne({ _id: p.tradeId }, { $set: { status: "CLOSED", exitPrice: p.entryPrice, pnl: 0, closedAt: new Date(), "meta.closeReason": "SENTINEL_BANKRUPTCY_CLEAR" } });
        }

        const io = getIO();
        if (io) {
          io.emit("alert", {
            level: "RED",
            text: `🛡️ Auto-Healed: Account bankruptcy / math corruption healed! Reset wallet to standard baseline $${STATIC_BASELINE_USDT} USDT.`
          });
        }
      } else if (totalCash > 1000000) {
        logAutoFix(`Extreme balance inflation detected ($${totalCash.toFixed(2)}). Stabilizing balance to baseline.`);
        await paper.setWalletBalance(userId, mode, "USDT", STATIC_BASELINE_USDT, accountType);
        
        // Remove all open trades to prevent recurring inflation
        for (const p of activePositions) {
          paper.removePosition(userId, p.symbol, mode, accountType);
          clearPeakPrice(userId, p.symbol, p.tradeId);
          await Trade.updateOne({ _id: p.tradeId }, { $set: { status: "CLOSED", exitPrice: p.entryPrice, pnl: 0, closedAt: new Date(), "meta.closeReason": "SENTINEL_INFLATION_CLEAR" } });
        }

        const io = getIO();
        if (io) {
          io.emit("alert", {
            level: "AMBER",
            text: `🛡️ Auto-Healed: Extreme balance inflation resolved. Stabilized to $${STATIC_BASELINE_USDT} USDT.`
          });
        }
      }
    }

    // ── 3. WEBSOCKET HEALTH GUARD ──
    // Audit active ticker streams to ensure price cache is ticking
    const activeSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "SHIBUSDT"];
    const ioInstance = getIO();
    
    if (ioInstance) {
      const isFutures = accountType === "FUTURES";
      for (const symbol of activeSymbols) {
        const lastPrice = binance.getTickerPriceSync(symbol, isFutures);
        if (!lastPrice || lastPrice <= 0) {
          logAutoFix(`Frozen price ticker detected for ${symbol} (Futures: ${isFutures}). Dynamically triggering background WebSocket reconnect.`);
          binance.unsubscribeTicker(symbol, isFutures);
          binance.subscribeTicker(symbol, ioInstance, isFutures);
        }
      }
    }

  } catch (err: any) {
    log(`[SENTINEL ERROR] Dynamic audit failed: ${err.message}`);
  }
}
