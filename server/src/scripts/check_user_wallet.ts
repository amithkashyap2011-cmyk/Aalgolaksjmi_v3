import mongoose from "mongoose";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WalletTransaction } from "../models/WalletTransaction.js";
import { WalletSnapshot } from "../models/WalletSnapshot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", "..", ".env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("=== CONNECTED TO DB ===");

  const txns = await WalletTransaction.find({}).lean();
  console.log("\n--- WALLET TRANSACTIONS ---");
  console.log(JSON.stringify(txns, null, 2));

  const snapshots = await WalletSnapshot.find({}).lean();
  console.log("\n--- WALLET SNAPSHOTS ---");
  console.log(JSON.stringify(snapshots, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
