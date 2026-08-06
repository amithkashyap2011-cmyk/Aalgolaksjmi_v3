import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error("MONGO_URI not defined");

const settingsSchema = new mongoose.Schema({
  userId: String,
  allowedSymbols: [String],
  defaultMode: String,
}, { strict: false });

const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

async function main() {
  await mongoose.connect(MONGO_URI);
  const sett = await Settings.find();
  console.log("Settings in DB:", JSON.stringify(sett, null, 2));
  await mongoose.disconnect();
}

main().catch(console.error);
