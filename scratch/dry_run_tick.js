import mongoose from "mongoose";
import dotenv from "dotenv";
import * as autoEngine from "../server/src/services/autoTradeEngine.js";
import { User } from "../server/src/models/User.js";
import { Settings } from "../server/src/models/Settings.js";
import * as paper from "../server/src/services/paperState.js";

dotenv.config({ path: "./server/.env" });

const MONGO_URI = process.env.MONGO_URI || "process.env.MONGO_URI";

async function runDryTick() {
  console.log("🚀 Initializing Dry Run Tick...");
  
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB.");

    // Hydrate memory state
    await paper.hydrate();
    console.log("✅ Memory hydrated.");

    const users = await User.find({}).lean();
    console.log(`👤 Found ${users.length} users.`);

    for (const u of users) {
      const settings = await Settings.findOne({ userId: u._id });
      if (settings && settings.autoTrade) {
        console.log(`🤖 Processing Auto-Trade for ${u.email}...`);
        await autoEngine.processUser(u._id.toString());
      } else {
        console.log(`⏭️ Skipping ${u.email} (Auto-Trade disabled)`);
      }
    }

    console.log("🏁 Dry Run Tick Complete.");
  } catch (err) {
    console.error("❌ Dry Run Failed:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

runDryTick();
