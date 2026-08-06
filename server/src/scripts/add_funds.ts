import mongoose from "mongoose";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WalletSnapshot } from "../models/WalletSnapshot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", "..", ".env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function main() {
  console.log("🔄 Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected.");

  const userId = "69f30f4043d8906b8fac5930";
  
  // Set paper FUTURES wallet to 1000 USDT
  const resFutures = await WalletSnapshot.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), mode: "PAPER", accountType: "FUTURES" },
    { balances: { USDT: 1000 } },
    { upsert: true, new: true }
  );
  console.log("💰 Set FUTURES paper wallet to 1000 USDT:", resFutures);

  // Set paper SPOT wallet to 1000 USDT
  const resSpot = await WalletSnapshot.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), mode: "PAPER", accountType: "SPOT" },
    { balances: { USDT: 1000 } },
    { upsert: true, new: true }
  );
  console.log("💰 Set SPOT paper wallet to 1000 USDT:", resSpot);

  await mongoose.disconnect();
  console.log("👋 Disconnected.");
}

main().catch(console.error);
