import mongoose from "mongoose";
import { WalletSnapshot } from "./server/src/models/WalletSnapshot.js";
import { Trade } from "./server/src/models/Trade.js";
import { config } from "dotenv";
config({ path: "./.env" });

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI not defined");
  await mongoose.connect(mongoUri);
  const wallets = await WalletSnapshot.find().lean();
  console.log("Wallets:", JSON.stringify(wallets, null, 2));
  const trades = await Trade.find({ status: "OPEN" }).lean();
  console.log("Open Trades:", trades.map(t => ({ id: t._id, symbol: t.symbol, qty: t.quantity, entry: t.entryPrice })));
  process.exit(0);
}
run();
