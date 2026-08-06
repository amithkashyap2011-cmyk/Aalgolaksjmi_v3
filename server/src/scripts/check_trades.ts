import mongoose from "mongoose";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Trade } from "../models/Trade.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", "..", ".env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("=== CONNECTED TO DB ===");

  const closedTrades = await Trade.find({ status: "CLOSED" }).lean();
  console.log("\n--- CLOSED TRADES ---");
  console.log(`Count: ${closedTrades.length}`);
  closedTrades.forEach(t => {
    console.log(`ID: ${t._id}, User: ${t.userId}, Symbol: ${t.symbol}, Mode: ${t.mode}, AccountType: ${t.accountType}, PnL: ${t.pnl}`);
  });

  const openTrades = await Trade.find({ status: "OPEN" }).lean();
  console.log("\n--- OPEN TRADES ---");
  console.log(`Count: ${openTrades.length}`);
  openTrades.forEach(t => {
    console.log(`ID: ${t._id}, User: ${t.userId}, Symbol: ${t.symbol}, Mode: ${t.mode}, AccountType: ${t.accountType}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
