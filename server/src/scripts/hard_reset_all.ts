import mongoose from "mongoose";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Trade } from "../models/Trade.js";
import { Alert } from "../models/Alert.js";
import { WalletTransaction } from "../models/WalletTransaction.js";
import { WalletSnapshot } from "../models/WalletSnapshot.js";
import { AIDecision } from "../models/AIDecision.js";
import { AqeaAudit } from "../models/AqeaAudit.js";
import { AqeaPerformance } from "../models/AqeaPerformance.js";
import * as paper from "../services/paperState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", "..", ".env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function hardResetAll() {
  await mongoose.connect(MONGO_URI);
  console.log("=== CONNECTED TO MONODB FOR HARD RESET ===");

  const resTrade = await Trade.deleteMany({});
  console.log(`[HARD_RESET] Deleted ${resTrade.deletedCount} Trade records.`);

  const resAlert = await Alert.deleteMany({});
  console.log(`[HARD_RESET] Deleted ${resAlert.deletedCount} Alert records.`);

  const resTx = await WalletTransaction.deleteMany({});
  console.log(`[HARD_RESET] Deleted ${resTx.deletedCount} WalletTransaction records.`);

  const resSnap = await WalletSnapshot.deleteMany({});
  console.log(`[HARD_RESET] Deleted ${resSnap.deletedCount} WalletSnapshot records.`);

  const resAI = await AIDecision.deleteMany({});
  console.log(`[HARD_RESET] Deleted ${resAI.deletedCount} AIDecision records.`);

  const resAudit = await AqeaAudit.deleteMany({});
  console.log(`[HARD_RESET] Deleted ${resAudit.deletedCount} AqeaAudit records.`);

  const resPerf = await AqeaPerformance.deleteMany({});
  console.log(`[HARD_RESET] Deleted ${resPerf.deletedCount} AqeaPerformance records.`);

  await paper.clearAllMemory();
  console.log("[HARD_RESET] Cleared paperState in-memory store.");

  // Explicitly set clean $20,000 Spot + $20,000 Futures baseline ($40,000 Total Equity)
  const defaultUserIds = ["000000000000000000000000", "guest", "default"];
  for (const uid of defaultUserIds) {
    paper.setWalletBalance(uid, "PAPER", "USDT", 20000, "FUTURES");
    paper.setWalletBalance(uid, "PAPER", "USDT", 20000, "SPOT");
    paper.setWalletBalance(uid, "PAPER", "INR", 2000000, "INDIAN_NSE");
    paper.setWalletBalance(uid, "PAPER", "INR", 2000000, "INDIAN_BSE");
    paper.setWalletBalance(uid, "PAPER", "INR", 2000000, "INDIAN_NIFTY50");
  }
  console.log("[HARD_RESET] Initialized fresh $40,000 USDT ($20k Spot + $20k Futures) paper capital baseline.");

  console.log("=== HARD RESET COMPLETE ===");
  await mongoose.disconnect();
}

hardResetAll().catch(console.error);
