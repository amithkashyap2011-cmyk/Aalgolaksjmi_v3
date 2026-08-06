import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || "process.env.MONGO_URI";

async function main() {
  await mongoose.connect(MONGO_URI);
  const trades = await mongoose.connection.db.collection("trades").find({ status: "OPEN" }).toArray();
  console.log("Open Trades Details:");
  console.log(JSON.stringify(trades, null, 2));
  
  const users = await mongoose.connection.db.collection("users").find().toArray();
  console.log("\nUsers in DB:");
  console.log(JSON.stringify(users, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
