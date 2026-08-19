import mongoose from "mongoose";

async function run() {
  await mongoose.connect("mongodb://localhost:27017/aalgo_v3");
  const Trade = mongoose.connection.collection("trades");
  
  // Close all open crypto positions
  const result = await Trade.updateMany(
    { status: "OPEN" },
    { $set: { status: "CLOSED", pnl: 0, "meta.closeReason": "MANUAL_FIX" } }
  );
  console.log(`Closed ${result.modifiedCount} positions.`);
  process.exit(0);
}
run();
