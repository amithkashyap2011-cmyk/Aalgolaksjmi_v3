import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || "process.env.MONGO_URI";

const tradeSchema = new mongoose.Schema({}, { strict: false });
const Trade = mongoose.models.Trade || mongoose.model("Trade", tradeSchema);

async function main() {
  await mongoose.connect(MONGO_URI);
  const trades = await Trade.find({ status: "CLOSED" }).sort({ closedAt: -1 }).limit(20).lean();
  console.log("Recent Closed Trades:");
  trades.forEach(t => {
    console.log(`[${t.closedAt?.toISOString()}] ${t.symbol} ${t.side} Qty:${t.quantity?.toFixed(4)} Entry:${t.entryPrice} Exit:${t.exitPrice} PnL:$${t.pnl?.toFixed(4)} Reason:${t.meta?.reason || t.meta?.closeReason} Account:${t.accountType || 'FUTURES'}`);
  });
  
  const openTrades = await Trade.find({ status: "OPEN" }).lean();
  console.log("\nOpen Trades:");
  openTrades.forEach(t => {
    console.log(`[${t.openedAt?.toISOString()}] ${t.symbol} ${t.side} Qty:${t.quantity?.toFixed(4)} Entry:${t.entryPrice} SL:${t.sl} TP:${t.tp} Account:${t.accountType || 'FUTURES'}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
