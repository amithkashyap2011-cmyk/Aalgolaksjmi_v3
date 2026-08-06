import mongoose from "mongoose";
import { Trade } from "./src/models/Trade.js";

async function run() {
  await mongoose.connect("process.env.MONGO_URI");
  const res = await Trade.updateMany({ status: "OPEN", mode: "PAPER" }, { $set: { status: "CLOSED", "meta.closeReason": "MANUAL_ORPHAN_PURGE" } });
  console.log(`Closed ${res.modifiedCount} stuck open trades.`);
  process.exit(0);
}
run();
