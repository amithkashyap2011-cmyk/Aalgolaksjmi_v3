const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "process.env.MONGO_URI";

async function main() {
  console.log("🔄 Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected.");

  // Wipe Trades
  const trades = await mongoose.connection.collection("trades").deleteMany({});
  console.log(`🗑️ Deleted ${trades.deletedCount} trades`);

  // Wipe Alerts
  const alerts = await mongoose.connection.collection("alerts").deleteMany({});
  console.log(`🗑️ Deleted ${alerts.deletedCount} alerts`);

  // Reset Wallets
  const wallets = await mongoose.connection.collection("walletsnapshots").updateMany(
    {},
    { $set: { balances: { USDT: 0 }, updatedAt: new Date() } }
  );
  console.log(`💰 Reset ${wallets.modifiedCount} wallets to 0 USDT`);

  console.log("✅ HARD RESET COMPLETE.");
  await mongoose.disconnect();
}

main().catch(console.error);
