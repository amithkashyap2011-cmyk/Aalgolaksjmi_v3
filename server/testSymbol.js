import mongoose from "mongoose";
import { Trade } from "./src/models/Trade.ts";

mongoose.connect("process.env.MONGO_URI").then(async () => {
  const openTrades = await Trade.find({ status: "OPEN" }).lean();
  for(const t of openTrades) {
    console.log(`Symbol: "${t.symbol}" length: ${t.symbol.length}`);
  }
  process.exit(0);
});
