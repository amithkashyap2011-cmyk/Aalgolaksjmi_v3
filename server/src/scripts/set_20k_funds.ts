import mongoose from "mongoose";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WalletSnapshot } from "../models/WalletSnapshot.js";
import { User } from "../models/User.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", "..", ".env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function main() {
  console.log("🔄 Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected.");

  const users = await User.find({}).lean();
  console.log(`Found ${users.length} users in DB.`);

  const accountTypes = ["FUTURES", "SPOT", "INDIAN_NSE", "INDIAN_BSE", "INDIAN_EQUITY", "INDIAN_NIFTY50", "INDIAN_FNO"];

  for (const user of users) {
    const uid = user._id;
    console.log(`Setting 20,000 USDT / ₹20,00,000 INR paper wallets for user ${uid} (${user.email})...`);

    for (const accType of accountTypes) {
      await WalletSnapshot.findOneAndUpdate(
        { userId: uid, mode: "PAPER", accountType: accType },
        { balances: { USDT: 20000, INR: 2000000 }, updatedAt: new Date() },
        { upsert: true }
      );
    }
  }

  // Also handle guest/fallback user IDs
  const fallbackIds = ["6a39c0e7a5e2995ed257ca68", "69f30f4043d8906b8fac5930", "000000000000000000000000"];
  for (const fId of fallbackIds) {
    if (mongoose.Types.ObjectId.isValid(fId)) {
      const objId = new mongoose.Types.ObjectId(fId);
      for (const accType of accountTypes) {
        await WalletSnapshot.findOneAndUpdate(
          { userId: objId, mode: "PAPER", accountType: accType },
          { balances: { USDT: 20000, INR: 2000000 }, updatedAt: new Date() },
          { upsert: true }
        );
      }
    }
  }

  console.log("🎉 Successfully set all paper wallets to $20,000 USDT & ₹20,00,000 INR across SPOT, FUTURES, & INDIAN MARKET.");
  await mongoose.disconnect();
}

main().catch(console.error);
