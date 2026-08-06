import mongoose from "mongoose";
import * as paper from "./src/services/paperState.js";
import { WalletSnapshot } from "./src/models/WalletSnapshot.js";
import { User } from "./src/models/User.js";
import { Trade } from "./src/models/Trade.js";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env") });

async function diagnose() {
  await mongoose.connect(process.env.MONGO_URI || "process.env.MONGO_URI");
  console.log("--- DATABASE STATE ---");
  
  const snapshots = await WalletSnapshot.find();
  console.log("Wallet Snapshots:", snapshots.map(s => ({ userId: s.userId, mode: s.mode, balances: s.balances })));
  
  const users = await User.find();
  console.log("Users in DB:", users.map(u => ({ id: u._id, email: u.email })));

  const openTrades = await Trade.find({ status: "OPEN" });
  console.log("Open Trades:", openTrades.length);

  await paper.hydrate();
  
  for (const u of users) {
    const userId = u._id.toString();
    const paperWallet = paper.getWallet(userId, "PAPER");
    console.log(`User ${u.email} (${userId}) PAPER Balance:`, Object.fromEntries(paperWallet.entries()));
    
    // Check if it's 0 and FORCE it to 100 if so
    if ((paperWallet.get("USDT") || 0) < 0.01) {
       console.log(`!!! FORCING RECOVERY for ${u.email} !!!`);
       paper.setWalletBalance(userId, "PAPER", "USDT", 100);
       await WalletSnapshot.findOneAndUpdate(
         { userId: u._id, mode: "PAPER" },
         { balances: { USDT: 100 } },
         { upsert: true }
       );
    }
  }

  console.log("--- DIAGNOSIS COMPLETE ---");
  process.exit(0);
}

diagnose();
