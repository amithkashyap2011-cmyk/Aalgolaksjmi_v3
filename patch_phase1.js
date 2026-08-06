const fs = require('fs');
let code = fs.readFileSync('server/src/services/autoTradeEngine.ts', 'utf8');

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

fs.writeFileSync('server/src/services/autoTradeEngine.ts', code);