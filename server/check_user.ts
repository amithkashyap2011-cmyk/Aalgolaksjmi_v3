import mongoose from "mongoose";
import { Settings } from "./src/models/Settings.js";

async function run() {
  await mongoose.connect("process.env.MONGO_URI");
  const userId = "69c2bc93c8601b4eaf3abe2f";
  const settings = await Settings.findOne({ userId: new mongoose.Types.ObjectId(userId) }).lean();
  console.log(JSON.stringify(settings, null, 2));
  process.exit(0);
}
run();
