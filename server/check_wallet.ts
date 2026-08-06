import mongoose from "mongoose";
import { WalletTransaction } from "./src/models/WalletTransaction.js";

async function run() {
  await mongoose.connect("process.env.MONGO_URI");
  const txns = await WalletTransaction.find({}).lean();
  console.log("Wallet Transactions:");
  for (const t of txns) {
    console.log(`[${t.type}] ${t.amount} ${t.currency} - ${t.note}`);
  }
  process.exit(0);
}
run();
