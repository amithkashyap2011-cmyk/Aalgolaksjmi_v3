import mongoose from "mongoose";
import { Settings } from "./server/src/models/Settings.js";
import { config } from "dotenv";
config({ path: "./.env" });

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI not defined");
  await mongoose.connect(mongoUri);
  const users = await mongoose.connection.db.collection("users").find().toArray();
  const userId = users[0]._id;
  console.log("Updating settings for user:", userId);
  
  try {
    const res = await Settings.findOneAndUpdate(
      { userId },
      { $set: { allowedSymbols: ["DOGEUSDT", "SHIBUSDT"] } },
      { new: true, upsert: true, runValidators: true }
    );
    console.log("UPDATE SUCCESS:", res);
  } catch (err) {
    console.error("UPDATE ERROR:", err);
  }
  process.exit(0);
}
run();
