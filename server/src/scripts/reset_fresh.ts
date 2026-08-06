/*
 * ─── HARD RESET SCRIPT ──────────────────────────────────
 *
 * Wipes ALL trades, positions, alerts, wallet snapshots
 * and sets paper wallet to 0 USDT for a clean start.
 *
 * Usage:  npx tsx src/scripts/reset_fresh.ts
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mongoose from "mongoose";
import { Trade } from "../models/Trade.js";
import { Alert } from "../models/Alert.js";
import { WalletSnapshot } from "../models/WalletSnapshot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", "..", ".env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function main() {
  console.log("🔄 Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  console.log("✅ Connected.");

  // 1. Delete ALL trades (both OPEN and CLOSED)
  const tradeResult = await Trade.deleteMany({});
  console.log(`🗑️  Deleted ${tradeResult.deletedCount} trades`);

  // 2. Delete ALL alerts
  const alertResult = await Alert.deleteMany({});
  console.log(`🗑️  Deleted ${alertResult.deletedCount} alerts`);

  // 3. Reset ALL wallet snapshots to 100 USDT
  const wallets = await WalletSnapshot.find({});
  for (const w of wallets) {
    w.balances = { USDT: 0 } as any;
    await w.save();
    console.log(`💰 Reset wallet for user ${w.userId} mode ${w.mode} → 0 USDT`);
  }

  if (wallets.length === 0) {
    console.log("ℹ️  No wallet snapshots found (will be created on first boot with 0 USDT).");
  }

  console.log("\n✅ HARD RESET COMPLETE. Restart the server to begin fresh with 0 USDT.");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Reset failed:", err.message);
  process.exit(1);
});
