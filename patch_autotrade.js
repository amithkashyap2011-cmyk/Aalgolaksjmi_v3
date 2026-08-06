const fs = require('fs');
let code = fs.readFileSync('server/src/services/autoTradeEngine.ts', 'utf8');

// 1. Add sweep functions at the top level
const sweepFunctions = `
async function syncPendingEntries(userId: string, mode: "PAPER" | "LIVE", accountType: "SPOT" | "FUTURES") {
  if (mode !== "LIVE") return;
  const pendingTrades = await Trade.find({ userId, mode, accountType, status: { $in: ["PENDING", "PARTIALLY_FILLED"] } }).lean();
  if (!pendingTrades.length) return;

  const keys = await ApiKeys.findOne({ userId });
  if (!keys) return;
  const { decrypt } = await import("../lib/crypto.js");
  const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
  const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });

  for (const trade of pendingTrades) {
    try {
      const orderIdStr = trade.meta?.binanceOrderId?.toString();
      if (!orderIdStr) continue;

      let order;
      if (accountType === "FUTURES") {
        order = await binance.getFuturesOrder(apiKey, apiSecret, trade.symbol, orderIdStr);
      } else {
        order = await binance.getOrder(apiKey, apiSecret, trade.symbol, orderIdStr);
      }

      if (!order || !order.status) continue;

      const actualQty = parseFloat(order.executedQty || "0");

      if (order.status === "FILLED") {
        log("🔄 RECONCILIATION: " + trade.symbol + " verified FILLED on exchange. Resolving local state.");
        await Trade.findByIdAndUpdate(trade._id, { 
          status: "OPEN", 
          quantity: actualQty,
          "meta.resolvedAt": new Date() 
        });
        const pos = paper.getPosition(userId, trade.symbol, mode, accountType);
        if (pos) {
          pos.quantity = actualQty;
          paper.setPosition(userId, trade.symbol, mode, pos);
        }
      } else if (order.status === "PARTIALLY_FILLED" && trade.status !== "PARTIALLY_FILLED") {
        log("🔄 RECONCILIATION: " + trade.symbol + " verified PARTIALLY_FILLED on exchange. Updating local state.");
        await Trade.findByIdAndUpdate(trade._id, { 
          status: "PARTIALLY_FILLED", 
          quantity: actualQty,
          "meta.resolvedAt": new Date() 
        });
      } else if (order.status === "CANCELED" || order.status === "EXPIRED" || order.status === "REJECTED") {
        log("🔄 RECONCILIATION: " + trade.symbol + " " + order.status + " on exchange. Cancelling local state.");
        await Trade.findByIdAndUpdate(trade._id, { 
          status: "CANCELLED", 
          "meta.resolvedAt": new Date() 
        });
        paper.removePosition(userId, trade.symbol, mode, accountType);
      }
    } catch (err: any) {
      log("[RECONCILIATION ENTRY ERROR] " + trade.symbol + ": " + err.message);
    }
  }
}

async function sweepFailedExits(userId: string, mode: "PAPER" | "LIVE", accountType: "SPOT" | "FUTURES") {
  if (mode !== "LIVE") return;
  const stuckTrades = await Trade.find({ userId, mode, accountType, status: { $in: ["PENDING_CLOSE", "CLOSE_FAILED"] } }).lean();
  if (!stuckTrades.length) return;

  const keys = await ApiKeys.findOne({ userId });
  if (!keys) return;
  const { decrypt } = await import("../lib/crypto.js");
  const apiKey = decrypt({ ciphertext: keys.encryptedKey, iv: keys.iv, authTag: keys.authTag });
  const apiSecret = decrypt({ ciphertext: keys.encryptedSecret, iv: keys.ivSecret, authTag: keys.authTagSecret });

  for (const trade of stuckTrades) {
    try {
      let exchangePositionAmt = 1; 
      if (accountType === "FUTURES") {
        const positions = await binance.getFuturesPositions(apiKey, apiSecret);
        const pos = positions.find(p => p.symbol === trade.symbol);
        exchangePositionAmt = pos ? parseFloat(pos.positionAmt) : 0;
      } else {
        const account = await binance.getAccount(apiKey, apiSecret);
        const baseAsset = trade.symbol.replace("USDT", "");
        const bal = account.find(b => b.asset === baseAsset);
        exchangePositionAmt = bal ? parseFloat(bal.free) + parseFloat(bal.locked) : 0;
      }
      
      if (exchangePositionAmt === 0) {
        log("🔄 RECONCILIATION: " + trade.symbol + " verified closed on exchange. Resolving local state silently.");
        await Trade.findByIdAndUpdate(trade._id, { 
            status: "CLOSED", 
            "meta.closeReason": "RECONCILIATION_SYNC",
            "meta.resolvedAt": new Date() 
        });
        paper.removePosition(userId, trade.symbol, mode, accountType);
        continue;
      }

      const attempts = (trade.meta && typeof trade.meta === "object" && "exitAttempts" in trade.meta) ? trade.meta.exitAttempts : 0;
      if (attempts >= 5) {
        if (trade.status !== "MANUAL_INTERVENTION_REQUIRED") {
            log("🔴 ESCALATION: Trade " + trade._id + " for " + trade.symbol + " failed to close 5 times. Marking for MANUAL_INTERVENTION_REQUIRED.");
            await Trade.findByIdAndUpdate(trade._id, { 
              status: "MANUAL_INTERVENTION_REQUIRED", 
              "meta.resolvedAt": new Date() 
            });
            const io = getIO();
            if (io) io.emit("alert", { level: "RED", text: "CRITICAL: Trade " + trade.symbol + " stuck open on exchange. Manual intervention required." });
        }
        continue;
      }

      log("🔄 RECONCILIATION: Re-attempting exit for stuck trade " + trade.symbol + " (Attempt " + attempts + ")...");
      await executeTradeExit(userId, trade.symbol, mode, trade, trade.entryPrice, "RECONCILIATION_RETRY");
    } catch (err: any) {
      log("[RECONCILIATION EXIT ERROR] " + trade.symbol + ": " + err.message);
    }
  }
}
`;

if (!code.includes('async function syncPendingEntries')) {
    code = code.replace('export async function processUser', sweepFunctions + '\nexport async function processUser');
}

code = code.replace(
  'export async function processUser(userId: string) {',
  'export async function processUser(userId: string) {\n  const tempSettings = await Settings.findOne({ userId });\n  const tempMode = tempSettings?.defaultMode === "LIVE" ? "LIVE" : "PAPER";\n  const tempAuditType = tempSettings?.accountType || "FUTURES";\n  if (tempMode === "LIVE") {\n    await syncPendingEntries(userId, tempMode, tempAuditType);\n    await sweepFailedExits(userId, tempMode, tempAuditType);\n  }'
);

const dailyLossBreakerStr = `
  // ── 🛡️ HARD CIRCUIT BREAKER (Global Daily Loss Check) ──
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const pnlAggregation = await Trade.aggregate([
    { $match: { userId, status: "CLOSED", closedAt: { $gte: startOfDay } } },
    { $group: { _id: null, dailyPnl: { $sum: "$pnl" } } }
  ]);
  const realizedDailyPnl = pnlAggregation.length > 0 ? pnlAggregation[0].dailyPnl : 0;

  // 🛡️ REST Pricing & Unrealized PnL Check
  const openPositionsForLossCheck = paper.getOpenPositions(userId, mode).filter(p => p.accountType === auditType);
  let unrealizedPnl = 0;
  for (const pos of openPositionsForLossCheck) {
    if (pos.quantity <= 0) continue; // Skip pending/empty
    try {
      // Use REST price to guarantee freshness
      const livePrice = await binance.getTickerPrice(pos.symbol, auditType === "FUTURES");
      const pnl = pos.side === "BUY" 
        ? (livePrice - pos.entryPrice) * pos.quantity 
        : (pos.entryPrice - livePrice) * pos.quantity;
      unrealizedPnl += pnl;
    } catch {
      log("[CRITICAL] Daily Loss Monitor cannot verify price for " + pos.symbol + ". Assuming worst case or skipping.");
    }
  }

  const dailyPnl = realizedDailyPnl + unrealizedPnl;
  const maxDailyLoss = settings.riskConfig?.maxDailyLoss || 50; 
  let allowEntries = true;

  if (dailyPnl <= -Math.abs(maxDailyLoss)) {
    allowEntries = false;
    log("💀 EMERGENCY: Total Daily PnL ($" + dailyPnl.toFixed(2) + ") breached max loss ($" + maxDailyLoss + "). HALTING ENTRIES AND NOTIFYING USER.");
    
    // 1. Disable AutoTrade
    await Settings.updateOne({ userId }, { $set: { autoTrade: false } });
    disableUser(userId);
    
    // 2. Alert User
    const io = getIO();
    if (io) io.emit("alert", { level: "RED", text: "DAILY LOSS LIMIT REACHED ($" + dailyPnl.toFixed(2) + "). Entries blocked. Please manually review open positions." });
    
    return; // Stop processing entirely
  }
`;

code = code.replace(/\/\/ ── 🛡️ HARD CIRCUIT BREAKER \(Global Daily Loss Check\) ──[\s\S]*?log\(`USER \$\{userId\} \| mode:\$\{mode\} \| autoTrade:\$\{settings\.autoTrade\}/, dailyLossBreakerStr + '\n  log(`USER ${userId} | mode:${mode} | autoTrade:${settings.autoTrade}');


code = code.replace(/const pnlPct = tradeDoc\.side === "BUY"[\s\S]*?: \(entryPrice - currentPrice\) \/ entryPrice;/, 
`
      if (tradeDoc.quantity <= 0) continue; // Wait for reconciliation

      const pnlPct = tradeDoc.side === "BUY"
        ? (currentPrice - entryPrice) / entryPrice
        : (entryPrice - currentPrice) / entryPrice;
`);


const executionVerifStr = `
    // 🛡️ EXECUTION VERIFICATION LAYER (PHASE 1)
    if (!result || !result.status) {
      log("🚨 CRITICAL: Binance response missing order status for " + symbol + ".");
      return false;
    }

    if (result.status === "REJECTED" || result.status === "EXPIRED" || result.status === "CANCELED") {
      log("⛔ Order rejected by exchange for " + symbol + ". Status: " + result.status);
      return false;
    }

    let tradeStatus: import("../models/Trade.js").TradeStatus = "OPEN";
    const requestedQty = parseFloat(formattedQty);
    let actualExecutedQty = parseFloat(result.executedQty || "0");

    switch (result.status) {
      case "FILLED":
        tradeStatus = "OPEN";
        if (actualExecutedQty <= 0) {
          log("🚨 CRITICAL MATH BUG: Exchange reported FILLED for " + symbol + " but executedQty is 0. Aborting local trade creation.");
          return false;
        }
        break;
      case "PARTIALLY_FILLED":
        tradeStatus = "PARTIALLY_FILLED";
        log("⚠️ PARTIAL FILL: " + symbol + " " + actualExecutedQty + " / " + requestedQty);
        if (actualExecutedQty <= 0) return false;
        break;
      case "NEW":
        tradeStatus = "PENDING";
        actualExecutedQty = 0; 
        log("⚠️ ORDER UNFILLED: " + symbol + " accepted but pending execution.");
        break;
      default:
        log("⚠️ Unknown Binance status: " + result.status);
        return false;
    }

    const entryPrice = result.avgPrice 
      ? parseFloat(result.avgPrice)
      : (result.cummulativeQuoteQty 
         ? parseFloat(result.cummulativeQuoteQty) / Math.max(parseFloat(result.executedQty || "1"), 1)
         : price);

    let trade;
    try {
      trade = await Trade.create({
        userId, mode: "LIVE", symbol, side,
        quantity: actualExecutedQty,
        origQty: requestedQty,
        entryPrice, leverage,
        sl: side === "BUY" ? entryPrice * (1 - slPct) : entryPrice * (1 + slPct),
        tp: side === "BUY" ? entryPrice * (1 + tpPct) : entryPrice * (1 - tpPct),
        strategy,
        status: tradeStatus,
        accountType,
        meta: { binanceOrderId: result.orderId, source: "auto_scalp", signal },
      });
`;

code = code.replace(/const entryPrice = result\.avgPrice[\s\S]*?meta: \{ binanceOrderId: result\.orderId, source: "auto_scalp", signal \},\n      \}\);/, executionVerifStr);

code = code.replace(/quantity: parseFloat\(result\.executedQty\),/g, 'quantity: actualExecutedQty,');

const exitVerifStr = `
    } catch (err: any) {
      const errMsg = err.message || "";
      const currentAttempts = ((tradeObj.meta as any)?.exitAttempts || 0) + 1;

      if (errMsg.includes("-2022") || errMsg.includes("ReduceOnly")) {
        log("⚠️ Position " + symbol + " already closed on exchange. Resolving local state.");
      } else if (currentAttempts >= 5) {
        log("🔴 ESCALATION: Trade " + tradeId + " for " + symbol + " failed to close 5 times. Marking for MANUAL_INTERVENTION_REQUIRED.");
        await Trade.findByIdAndUpdate(tradeId, { 
          status: "MANUAL_INTERVENTION_REQUIRED", 
          "meta.exitError": errMsg, 
          "meta.lastAttempt": new Date(),
          "meta.exitAttempts": currentAttempts 
        });
        const io = getIO();
        if (io) io.emit("alert", { level: "RED", text: "CRITICAL: Trade " + symbol + " stuck open on exchange. Manual intervention required." });
        return;
      } else if (errMsg.includes("ETIMEDOUT") || errMsg.includes("ECONNRESET") || errMsg.includes("timeout")) {
        log("🚨 NETWORK TIMEOUT during exit for " + symbol + " (Attempt " + currentAttempts + "). Marking PENDING_CLOSE.");
        await Trade.findByIdAndUpdate(tradeId, { status: "PENDING_CLOSE", "meta.exitError": errMsg, "meta.lastAttempt": new Date(), "meta.exitAttempts": currentAttempts });
        return;
      } else {
        log("🚨 EXCHANGE REJECTION during exit for " + symbol + " (Attempt " + currentAttempts + "): " + errMsg + ". Marking CLOSE_FAILED.");
        await Trade.findByIdAndUpdate(tradeId, { status: "CLOSE_FAILED", "meta.exitError": errMsg, "meta.lastAttempt": new Date(), "meta.exitAttempts": currentAttempts });
        return;
      }
    }
`;

code = code.replace(/\} catch \(err: any\) \{[\s\S]*?\/\/ We proceed to close the DB\/Memory position anyway to resync state\.\n    \}/, exitVerifStr);

code = code.replace(/const initialMargin = \(pos\.quantity \* pos\.entryPrice\) \/ \(pos\.leverage \|\| 1\);/g,
`const initialMargin = pos.quantity > 0 ? (pos.quantity * pos.entryPrice) / (pos.leverage || 1) : 0;`);

code = code.replace(/const pnl = pos\.side === "BUY"[\s\S]*?: \(pos\.entryPrice - price\) \* pos\.quantity;/g,
`const pnl = pos.quantity > 0 ? (pos.side === "BUY" 
        ? (price - pos.entryPrice) * pos.quantity 
        : (pos.entryPrice - price) * pos.quantity) : 0;`);

code = code.replace(/totalMarketValue \+= \(pos\.quantity \* pos\.entryPrice\) \/ \(pos\.leverage \|\| 1\);/g,
`totalMarketValue += pos.quantity > 0 ? (pos.quantity * pos.entryPrice) / (pos.leverage || 1) : 0;`);

fs.writeFileSync('/tmp/autoTradeEngine.ts.new', code);