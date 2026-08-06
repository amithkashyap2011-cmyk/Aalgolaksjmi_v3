import mongoose from "mongoose";
import { Trade } from "./src/models/Trade.js";
import { AqeaAudit } from "./src/models/AqeaAudit.js";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  await mongoose.connect(uri);

  const t = await Trade.findOne({ status: "CLOSED" }).lean();
  if (t) {
    console.log("TRADE:", JSON.stringify(t, null, 2));
    const a = await AqeaAudit.find({ symbol: t.symbol, component: "orchestrator" }).sort({ timestamp: -1 }).limit(5).lean();
    console.log("AUDITS:", JSON.stringify(a.map(x => ({ t: x.timestamp, s: x.symbol, m: x.message })), null, 2));
  } else {
    console.log("NO_CLOSED_TRADES");
  }

  await mongoose.disconnect();
}

run();
