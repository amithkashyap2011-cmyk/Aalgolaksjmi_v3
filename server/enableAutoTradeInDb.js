import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error("MONGO_URI not defined");

const settingsSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  autoTrade: Boolean,
}, { strict: false });

const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

async function main() {
  await mongoose.connect(MONGO_URI);
  const result = await Settings.updateOne(
    { userId: new mongoose.Types.ObjectId("69f30f4043d8906b8fac5930") },
    { $set: { autoTrade: true } }
  );
  console.log("Database update result with ObjectId:", result);
  await mongoose.disconnect();
}

main().catch(console.error);
