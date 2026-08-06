import mongoose from "mongoose";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Trade } from "../models/Trade.js";
import { Alert } from "../models/Alert.js";
import { WalletTransaction } from "../models/WalletTransaction.js";
import { AIDecision } from "../models/AIDecision.js";
import { AqeaAudit } from "../models/AqeaAudit.js";
import { AqeaPerformance } from "../models/AqeaPerformance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", "..", ".env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aalgolakshmi";

async function purgeStaleTrades() {
  await mongoose.connect(MONGO_URI);
  console.log("=== CONNECTED TO MONODB FOR PURGE ===");

  const resTrade = await Trade.deleteMany({});
  console.log(`[PURGE] Deleted ${resTrade.deletedCount} Trade records.`);

  const resAlert = await Alert.deleteMany({});
  console.log(`[PURGE] Deleted ${resAlert.deletedCount} Alert records.`);

  const resTx = await WalletTransaction.deleteMany({});
  console.log(`[PURGE] Deleted ${resTx.deletedCount} WalletTransaction records.`);

  const resAI = await AIDecision.deleteMany({});
  console.log(`[PURGE] Deleted ${resAI.deletedCount} AIDecision records.`);

  const resAudit = await AqeaAudit.deleteMany({});
  console.log(`[PURGE] Deleted ${resAudit.deletedCount} AqeaAudit records.`);

  const resPerf = await AqeaPerformance.deleteMany({});
  console.log(`[PURGE] Deleted ${resPerf.deletedCount} AqeaPerformance records.`);

  console.log("=== PURGE COMPLETE ===");
  await mongoose.disconnect();
}

purgeStaleTrades().catch(console.error);
