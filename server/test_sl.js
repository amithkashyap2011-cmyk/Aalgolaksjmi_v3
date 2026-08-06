const mongoose = require('mongoose');
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error("MONGO_URI not defined");
mongoose.connect(mongoUri).then(async () => {
  const db = mongoose.connection.db;
  const trades = await db.collection('trades').find({symbol: "ADAUSDT", status: "OPEN"}).toArray();
  console.log("Trades found:", trades.length);
  for (const t of trades) {
    console.log("Trade:", t.side, "Entry:", t.entryPrice, "SL:", t.sl);
    const currentPrice = 0.1574; // Simulated current price
    const hitSL = t.sl ? (t.side === "BUY" ? currentPrice <= t.sl : currentPrice >= t.sl) : false;
    console.log("hitSL:", hitSL);
  }
  process.exit(0);
});
