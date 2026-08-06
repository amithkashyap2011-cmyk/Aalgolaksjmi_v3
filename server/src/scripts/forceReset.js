import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function reset() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const Trade = mongoose.model('Trade');
    const WalletSnapshot = mongoose.model('WalletSnapshot');
    const Settings = mongoose.model('Settings');

    // 1. Close all open trades
    const resTrades = await Trade.updateMany(
      { status: "OPEN" },
      { $set: { status: "CANCELLED", closedAt: new Date(), "meta.closeReason": "SYSTEM_RESET" } }
    );
    console.log(`Cancelled ${resTrades.modifiedCount} open trades.`);

    // 2. Reset WalletSnapshots to 100 USDT
    const resWallets = await WalletSnapshot.updateMany(
      {},
      { $set: { balances: { USDT: 100 } } }
    );
    console.log(`Reset ${resWallets.modifiedCount} wallets to 100 USDT.`);

    console.log("Reset Complete!");
    process.exit(0);
  } catch (err) {
    console.error("Reset Failed:", err);
    process.exit(1);
  }
}

reset();
