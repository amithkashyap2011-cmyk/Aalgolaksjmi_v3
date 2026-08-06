import mongoose from "mongoose";
import { Trade } from "./src/models/Trade.js";
import { AqeaAudit } from "./src/models/AqeaAudit.js";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not defined");
  await mongoose.connect(uri);

  const t = await Trade.findOne({ strategy: /AQEA/, status: "CLOSED" }).lean();
  if (t) {
    console.log("AQEA_TRADE:", JSON.stringify(t, null, 2));
    const a = await AqeaAudit.find({ symbol: t.symbol, component: "orchestrator" }).sort({ timestamp: -1 }).limit(5).lean();
    console.log("AQEA_AUDITS:", JSON.stringify(a.map(x => ({ t: x.timestamp, s: x.symbol, m: x.message })), null, 2));
  } else {
    console.log("NO_CLOSED_AQEA_TRADES");
  }

  await mongoose.disconnect();
}

run();
