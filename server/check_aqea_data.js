import mongoose from "mongoose";
import { AqeaTradeAnalytics } from "./dist/models/AqeaTradeAnalytics.js";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const uri = process.env.MONGO_URI || "process.env.MONGO_URI";
  console.log("Connecting to", uri);
  await mongoose.connect(uri);
  try {
    const count = await AqeaTradeAnalytics.countDocuments();
    console.log("AqeaTradeAnalytics count:", count);
    if (count > 0) {
      const sample = await AqeaTradeAnalytics.findOne().lean();
      console.log("Sample document exists.");
      // console.log("Sample document:", JSON.stringify(sample, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
run();
