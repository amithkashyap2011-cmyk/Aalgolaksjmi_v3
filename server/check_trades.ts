import mongoose from "mongoose";
import { Trade } from "./src/models/Trade.js";

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI not defined");
  await mongoose.connect(mongoUri);
  const trades = await Trade.find({ status: "OPEN" }).lean();
  console.log("OPEN TRADES:");
  console.log(JSON.stringify(trades, null, 2));
  process.exit(0);
}
run();
