import mongoose from "mongoose";
import { Trade } from "./src/models/Trade.ts";

mongoose.connect("process.env.MONGO_URI").then(async () => {
  const t = await Trade.findOne({ symbol: "ADAUSDT", status: "OPEN" }).lean();
  console.log(`ADAUSDT SL: ${t?.sl}, TP: ${t?.tp}, Entry: ${t?.entryPrice}`);
  process.exit(0);
});
