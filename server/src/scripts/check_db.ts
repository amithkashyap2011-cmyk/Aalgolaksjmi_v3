import mongoose from "mongoose";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Trade } from "../models/Trade.js";
import { WalletSnapshot } from "../models/WalletSnapshot.js";
import { Settings } from "../models/Settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", "..", ".env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to DB");

  const trades = await Trade.find({}).lean();
  console.log("Trades in DB:", trades);

  const wallets = await WalletSnapshot.find({}).lean();
  console.log("Wallets in DB:", wallets);

  const settings = await Settings.find({}).lean();
  console.log("Settings in DB:", settings);

  await mongoose.disconnect();
}

main().catch(console.error);
