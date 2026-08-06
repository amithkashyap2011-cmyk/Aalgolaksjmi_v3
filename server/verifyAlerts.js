import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || "process.env.MONGO_URI";

const alertSchema = new mongoose.Schema({
  userId: String,
  severity: String,
  symbol: String,
  title: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});

const Alert = mongoose.model("Alert", alertSchema);

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB!");
  
  const total = await Alert.countDocuments({});
  const rows = await Alert.find({}).sort({ createdAt: -1 }).limit(5).lean();
  
  console.log("Total Alerts in DB:", total);
  console.log("\nLast 5 Alerts:");
  console.log(JSON.stringify(rows, null, 2));
  
  await mongoose.disconnect();
}

main().catch(console.error);
