import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || "process.env.MONGO_URI";

const schema = new mongoose.Schema({}, { strict: false });
const Trade = mongoose.models.Trade || mongoose.model("Trade", schema);

async function main() {
  await mongoose.connect(MONGO_URI);
  const openTrades = await Trade.find({ status: "OPEN" });
  console.log("Open Trades in DB:", JSON.stringify(openTrades, null, 2));
  await mongoose.disconnect();
}

main().catch(console.error);
