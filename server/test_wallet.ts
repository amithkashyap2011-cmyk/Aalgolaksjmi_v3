import mongoose from "mongoose";
import { WalletTransaction } from "./src/models/WalletTransaction.js";
import { Trade } from "./src/models/Trade.js";

async function run() {
  await mongoose.connect("process.env.MONGO_URI");
  
  const userId = "69c2bc93c8601b4eaf3abe2f"; // The current user ID from earlier logs
  const userObjId = new mongoose.Types.ObjectId(userId);
  
  const txns = await WalletTransaction.find({ userId: userObjId }).lean();
  let totalDeps = 0;
  for (const t of txns) {
    if (t.type === "DEPOSIT") totalDeps += t.amount;
  }
  
  const tradesPnl = await Trade.aggregate([
    { $match: { userId: userObjId, status: "CLOSED" } },
    { $group: { _id: null, total: { $sum: "$pnl" } } }
  ]);
  
  console.log("Total Deposits:", totalDeps);
  console.log("Total Realized PnL from trades:", tradesPnl.length ? tradesPnl[0].total : 0);
  
  process.exit(0);
}
run();
