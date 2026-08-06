import mongoose from "mongoose";
import { Settings } from "./server/src/models/Settings.js";
import { config } from "dotenv";
config({ path: "./.env" });
async function run() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://GATEWAY_REQUIRED");
  const s = await Settings.find().lean();
  console.log(JSON.stringify(s, null, 2));
  process.exit(0);
}
run();
