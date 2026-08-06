import mongoose from "mongoose";
import { Settings } from "../server/dist/models/Settings.js";
import dotenv from "dotenv";

dotenv.config({ path: "../server/.env" });

async function run() {
  const uri = process.env.MONGODB_URI || "process.env.MONGO_URI";
  console.log("Connecting to", uri);
  await mongoose.connect(uri);
  try {
    const settings = await Settings.find({}).lean();
    console.log("ALL SETTINGS:");
    console.log(JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
run();
